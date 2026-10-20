import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContextGraphAdapterModule } from "../src/application/application.js";
import { GitRepository } from "../src/repository/git.js";

describe('standalone architecture boundary', () => {
  it('keeps product integrations out of runtime modules and dependencies', async () => {
    const sourceRoot = resolve(import.meta.dirname, "../src");
    for (const file of (await readdir(sourceRoot, { recursive: true })).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
    )) {
      expect(await readFile(join(sourceRoot, file), 'utf8'), file).not.toMatch(
        /tradepilot|banditrade|tools\/context-graph|apps\/api|homelab/i,
      );
    }
    const manifest = JSON.parse(await readFile(join(sourceRoot, '..', 'package.json'), 'utf8'));
    expect(manifest.dependencies['@launch-echo/tently-core']).toBe('workspace:^');
    expect(manifest.dependencies['@sourcegraph/scip-typescript']).toBe('0.4.0');
    expect(JSON.stringify(manifest.dependencies)).not.toMatch(/tradepilot/i);
    expect(JSON.stringify(manifest.devDependencies)).not.toMatch(/tradepilot/i);
  });

  it('needs no product adapter and rejects invalid extension modules', async () => {
    const repository = new GitRepository('/unused');
    expect(await loadContextGraphAdapterModule(undefined, repository)).toEqual({
      factExtractors: [], invariantEvaluators: [],
    });
    await expect(loadContextGraphAdapterModule('node:path', repository)).rejects.toThrow(
      'must export createContextGraphAdapter',
    );
  });

  it('keeps the neutral core free of toolkit and product dependencies', async () => {
    const core = resolve(import.meta.dirname, "../packages/core");
    const manifest = JSON.parse(await readFile(join(core, 'package.json'), 'utf8'));
    expect(manifest.dependencies ?? {}).toEqual({});
    for (const file of (await readdir(join(core, 'src'), { recursive: true })).filter((f) => f.endsWith('.ts'))) {
      expect(await readFile(join(core, 'src', file), 'utf8')).not.toMatch(
        /from ['"](?:@launch-echo\/tently|\.\.\/\.\.\/\.\.\/src)/,
      );
    }
  });
});
