import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { GraphSnapshot } from "@launch-echo/tently-core";
import { FileSnapshotStore } from "../src/storage/storage.js";
import { GitRepository } from "../src/repository/git.js";
import { withCommittedTree } from "../src/repository/committed-tree.js";
import { SnapshotImpactQueryService } from "../src/graph/query.js";
import { SavedEvidenceQueryService } from "../src/application/saved-evidence.js";
import { SnapshotChecks } from "../src/application/snapshot-checks.js";

const execute = promisify(execFile);
function snapshot(id = 'saved', digest = 'digest'): GraphSnapshot {
  return {
    manifest: {
      schemaVersion: 1, repositoryId: 'example', ref: 'HEAD', commitSha: 'a'.repeat(40),
      snapshotId: id, configurationDigest: 'config', scope: ['docs'],
      ontologyVersion: '1', extractorVersions: {}, semanticModel: 'test',
      semanticPromptVersion: '1', generatedAt: '2026-01-01T00:00:00Z',
      contentDigest: digest, semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '',
    },
    facts: [], invariants: [], runtimeEvidence: [], unresolved: [],
  };
}

describe('saved evidence lifecycle', () => {
  it('publishes concurrent immutable snapshots atomically, including in one process', async () => {
    const root = await mkdtemp(join(tmpdir(), 'graph-store-'));
    const store = new FileSnapshotStore(root);
    const results = await Promise.allSettled([
      store.write(snapshot('same', 'first')), store.write(snapshot('same', 'second')),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const saved = (await store.read('same'))!;
    await Promise.all(Array.from({ length: 10 }, () => store.write(saved)));
    await Promise.all(Array.from({ length: 10 }, () => store.updateHead('default', 'same')));
    expect(await store.readHead('default')).toEqual(saved);
    await expect(store.updateHead('default', 'missing')).rejects.toThrow('absent');
    expect(await store.readHead('default')).toEqual(saved);
    await expect(store.readHead('../escape')).rejects.toThrow('Unsafe');
    const module = new URL("../src/storage/storage.ts", import.meta.url).href;
    const concurrent = await Promise.allSettled([1, 2, 3].map((index) =>
      execute(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', `
        import { FileSnapshotStore } from ${JSON.stringify(module)};
        const store = new FileSnapshotStore(${JSON.stringify(root)});
        await store.write(${JSON.stringify(snapshot('cross-process', `process-${index}`))});
        await store.updateHead('processes', 'cross-process');
      `], { cwd: process.cwd() })));
    expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(concurrent.filter((result) => result.status === 'rejected')).toHaveLength(2);
    expect((await store.readHead('processes'))?.manifest.snapshotId).toBe('cross-process');
  });

  it('queries historical saved evidence while dirty and isolates committed materialization', async () => {
    const root = await mkdtemp(join(tmpdir(), 'graph-active-'));
    const git = (...args: string[]) => execute('git', args, { cwd: root });
    await git('init', '--quiet');
    await writeFile(join(root, '.gitignore'), '.context-graph/\n');
    await writeFile(join(root, 'source.ts'), 'export const answer = 1;\n');
    await git('add', '.');
    await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture');
    const repository = new GitRepository(root);
    const sha = await repository.resolveRef('HEAD');
    const state = snapshot();
    const store = new FileSnapshotStore(join(root, '.context-graph'));
    await store.write(state);
    await store.updateHead('default', state.manifest.snapshotId);
    await writeFile(join(root, 'source.ts'), 'export const answer = 2;\n');
    await writeFile(join(root, 'untracked.ts'), 'export const draft = true;\n');
    const before = await git('status', '--porcelain=v1');
    const worktreesBefore = await git('worktree', 'list', '--porcelain');
    await Promise.all(Array.from({ length: 2 }, () => withCommittedTree(root, sha, async (isolated) => {
      expect(isolated).not.toBe(root);
      expect(await readFile(join(isolated, 'source.ts'), 'utf8')).toContain('answer = 1');
      await expect(readFile(join(isolated, 'untracked.ts'))).rejects.toThrow();
    })));
    const service = new SavedEvidenceQueryService(
      new SnapshotImpactQueryService(store, 'default'), repository, 'config',
    );
    const result = await service.scan({});
    expect(result.evidenceState).toMatchObject({
      stale: true, configurationMatches: true,
      excludedWorkingChanges: ['source.ts', 'untracked.ts'],
      eligibleForCurrentDiffValidation: false,
    });
    expect(result.snapshot.scope).toEqual(['docs']);
    expect(result.markdown).toContain('Excluded working changes: source.ts, untracked.ts');
    const checks = new SnapshotChecks(store, repository, { compareClean: async () => { throw Error('must not run'); } });
    await expect(checks.read({})).rejects.toThrow('excluded working changes');
    expect((await git('status', '--porcelain=v1')).stdout).toBe(before.stdout);
    expect((await git('worktree', 'list', '--porcelain')).stdout).toBe(worktreesBefore.stdout);
    expect(await readFile(join(root, 'source.ts'), 'utf8')).toContain('answer = 2');
  });
});
