import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { analyzeArchitecture, type ArchitecturePolicy } from '../src/governance/governance.js';

it('checks permitted and forbidden module directions using the canonical policy and real imports', async () => {
  const policy: ArchitecturePolicy = JSON.parse(await readFile(new URL('../architecture.policy.json', import.meta.url), 'utf8'));
  const root = await mkdtemp(join(tmpdir(), 'tently-module-boundaries-'));
  const put = async (path: string, content: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  };
  try {
    await put('architecture.policy.json', JSON.stringify(policy));
    await put('packages/core/src/core.ts', 'export interface Contract { id: string }\n');
    for (const module of ['infrastructure', 'application', 'interfaces', 'storage', 'graph']) {
      await put(`src/${module}/leaf.ts`, 'export const value = 1;\n');
    }
    // Evidence reads infrastructure; application composes graph, storage and extraction.
    await put('src/repository/read.ts', "export { value } from '../infrastructure/leaf.js';\n");
    await put('src/extraction/read.ts', "export { value } from '../repository/read.js';\n");
    await put('src/application/compose.ts',
      "export { value as graph } from '../graph/leaf.js';\n" +
      "export { value as store } from '../storage/leaf.js';\n" +
      "export { value as extraction } from '../extraction/read.js';\n");
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '-qm', 'public module fixture'], { cwd: root });
    const valid = await analyzeArchitecture(root, policy);
    expect(valid.passed).toBe(true);
    expect(valid.findings).toEqual([]);

    await put('src/extraction/upstream.ts', "export { value } from '../application/leaf.js';\n");
    await put('src/graph/persistence.ts', "export { value } from '../storage/leaf.js';\n");
    await put('src/storage/query.ts', "export { value } from '../graph/leaf.js';\n");
    await put('src/repository/evidence.ts', "export { value } from '../graph/leaf.js';\n");
    await put('src/application/transport.ts', "export { value } from '../interfaces/leaf.js';\n");
    const invalid = await analyzeArchitecture(root, policy);
    for (const ruleId of ['evidence-no-orchestration', 'graph-no-extraction-or-persistence',
      'storage-no-higher-modules', 'repository-no-evidence-modules', 'implementation-no-entrypoints']) {
      expect(invalid.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ ruleId, category: 'advisory', disposition: 'new' }),
      ]));
    }
    expect(invalid.findings.some((finding) => ['infrastructure-failure', 'extraction-gap'].includes(finding.category))).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
