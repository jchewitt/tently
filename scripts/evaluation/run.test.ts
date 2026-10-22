import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { FileSnapshotStore } from '../../src/storage/storage.js';
import { verifyDispatch } from '../../evaluations/dispatch/project/test/dispatch.test.js';
import { verifyPolicy } from '../../evaluations/dispatch/project/test/policy.test.js';
import { verifyArchive } from '../../evaluations/dispatch/project/test/archive.test.js';
import { verifyUnrelatedDomains } from '../../evaluations/dispatch/project/test/refund.test.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const execute = promisify(execFile);
const tsx = createRequire(import.meta.url).resolve('tsx/cli');

describe('separate-project evaluation', () => {
  it('checks the fixture behavior without treating test execution as graph evidence', async () => {
    await verifyDispatch();
    await verifyPolicy();
    verifyArchive();
    verifyUnrelatedDomains();
  });

  it('extracts a committed independent project and rescores saved evidence with the selected suite', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'weftlet evaluation '));
    try {
      const project = join(temporary, 'project');
      await cp(resolve(root, 'evaluations/dispatch/project'), project, {
        recursive: true, filter: (path) => basename(path) !== '.context-graph',
      });
      const git = (...args: string[]) => execute('git', args, { cwd: project });
      await git('init', '--quiet');
      await git('add', '.');
      await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public dispatch input');
      const evidenceCommit = (await git('rev-parse', 'HEAD')).stdout.trim();
      const toolkitCommit = (await execute('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
      const config = JSON.parse(await readFile(resolve(root, 'evaluations/dispatch/context-graph.config.json'), 'utf8'));
      config.repositoryRoot = './project';
      config.semantic.providerModule = resolve(root, 'evaluations/weftlet/document-only.mjs');
      const configPath = join(temporary, 'config.json');
      await writeFile(configPath, JSON.stringify(config));
      const reportPath = join(temporary, 'report.json');
      const run = (...args: string[]) => execute(process.execPath, [tsx,
        resolve(root, 'scripts/evaluation/run.ts'), '--suite', resolve(root, 'evaluations/dispatch/cases.json'),
        '--config', configPath, '--output', reportPath, ...args],
      { cwd: temporary, maxBuffer: 8 * 1024 * 1024, timeout: 60_000 });
      await run('--ref', evidenceCommit);
      const first = JSON.parse(await readFile(reportPath, 'utf8'));
      expect(first.evaluatorCommit).toBe(toolkitCommit);
      expect(first.snapshot.commitSha).toBe(evidenceCommit);
      expect(first.evaluatorCommit).not.toBe(first.snapshot.commitSha);
      expect(first.snapshot.repositoryId).toBe('example/dispatch-evaluation');
      expect(first.results.map((item: { id: string }) => item.id)).toEqual([
        'upstream-request-contract', 'async-submission-consumers', 'same-name-policy',
      ]);
      expect(first.coverage.extractorCounts['scip-symbol-extractor']).toBeGreaterThan(0);
      expect(first.coverage.extractorCounts['document-linker']).toBeGreaterThan(0);
      expect(first.coverage.semanticAssertions).toBe(0);
      expect(first.coverage.approvedIntentSources).toEqual([]);
      expect(first.coverage.runtimeReferences).toBe(0);
      const store = new FileSnapshotStore(join(project, '.context-graph'));
      const snapshot = await store.read(first.snapshot.snapshotId);
      expect(snapshot?.facts.every((fact) => fact.provenance.commitSha === evidenceCommit)).toBe(true);
      expect(snapshot?.diagnostics?.some((item) => item.kind === 'implementationGaps' &&
        item.reason.includes('policy.md'))).toBe(true);
      expect(snapshot?.facts.some((fact) => fact.object.id === 'document:docs/policy.md')).toBe(false);
      const before = JSON.stringify(snapshot);
      await run('--snapshot', first.snapshot.snapshotId);
      const savedBytes = await readFile(reportPath, 'utf8');
      const saved = JSON.parse(savedBytes);
      expect(saved.hydration).toBe('saved-evidence-only');
      expect(saved.results).toEqual(first.results);
      expect(JSON.stringify(await store.read(first.snapshot.snapshotId))).toBe(before);

      await expect(run('--snapshot', 'absent-snapshot')).rejects.toMatchObject({
        stderr: expect.stringContaining('no refresh was attempted'),
      });
      await writeFile(configPath, JSON.stringify({ ...config, semantic: { ...config.semantic, provider: 'codex-cli' } }));
      await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining('use --snapshot') });
      // Failed attempts must preserve the last successful report.
      expect(await readFile(reportPath, 'utf8')).toBe(savedBytes);
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }, 90_000);
});
