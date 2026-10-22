import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { moduleRequestNode } from './module-request.js';
import { RepositoryFileExtractor } from './static.js';
import { GitRepository } from '../repository/git.js';

describe('relative module request identities', () => {
  it('separates same-spelled requests in different directories and unifies the same requested location', () => {
    const dispatch = moduleRequestNode('src/dispatch/planner.ts', './policy.js');
    const refund = moduleRequestNode('src/refund/planner.ts', './policy.js');
    expect(dispatch.id).not.toBe(refund.id);
    expect(dispatch).toEqual(moduleRequestNode('test/policy.test.ts', '../src/dispatch/policy.js'));
    expect(dispatch).toEqual(moduleRequestNode('src/dispatch/retry.ts', './nested/../policy.js'));
    expect(dispatch).toMatchObject({ label: './src/dispatch/policy.js',
      attributes: { identityScope: 'repository-relative-request', resolution: 'unresolved' } });
    expect(moduleRequestNode('src/Dispatch/planner.ts', './policy.js').id).not.toBe(dispatch.id);
  });

  it('retains bare identities without colliding with the relative namespace', () => {
    for (const specifier of ['node:fs/promises', '@example/contracts', 'package/subpath', 'relative:src/policy.js']) {
      expect(moduleRequestNode('src/a.ts', specifier)).toEqual({
        id: `contract:module:${specifier}`, kind: 'Contract', label: specifier,
      });
      expect(moduleRequestNode('src/a.ts', specifier)).toEqual(moduleRequestNode('test/b.ts', specifier));
    }
    expect(moduleRequestNode('src/a.ts', './policy.js').id)
      .not.toBe(moduleRequestNode('src/a.ts', 'relative:src/policy.js').id);
  });

  it('keeps out-of-root and opaque requests importer-local rather than guessing loader behavior', () => {
    for (const specifier of ['../../../outside.js', './policy.js?raw', './policy.js#x',
      './policy%2Ejs', './nested\\policy.js', './policy\u0000.js', './policy\u007f.js', './policy\u0085.js']) {
      const a = moduleRequestNode('src/a.ts', specifier);
      const b = moduleRequestNode('src/b.ts', specifier);
      expect(a.id).not.toBe(b.id);
      expect(a).toEqual(moduleRequestNode('src/a.ts', specifier));
      expect(a.attributes).toEqual({ identityScope: 'importer-local-request', resolution: 'unresolved' });
    }
    expect(moduleRequestNode('src/a.ts', './%3Fopaque').id)
      .not.toBe(moduleRequestNode('src/a.ts', './?opaque').id);
  });

  it('does not guess TypeScript suffixes, directory indexes or target existence', () => {
    const requests = ['./policy', './policy.js', './policy.ts', './policy/index.js'];
    expect(new Set(requests.map((specifier) => moduleRequestNode('src/a.ts', specifier).id)).size).toBe(4);
    expect(moduleRequestNode('src/a.ts', './missing.js').attributes?.resolution).toBe('unresolved');
    expect(moduleRequestNode('src/a.ts', '.')).toEqual(moduleRequestNode('src/nested/b.ts', '..'));
  });

  it('extracts committed requests and replaces importer renames/deletes without inventing target links', async () => {
    const root = await mkdtemp(join(tmpdir(), 'module-requests-'));
    try {
      const execute = promisify(execFile);
      const git = (...args: string[]) => execute('git', args, { cwd: root });
      await mkdir(join(root, 'src/one'), { recursive: true });
      await mkdir(join(root, 'src/two'), { recursive: true });
      const source = "import { policy } from './policy.js';\nexport const value = policy;\n";
      for (const path of ['src/one/start.ts', 'src/one/remaining.ts', 'src/two/start.ts']) {
        await writeFile(join(root, path), source);
      }
      await writeFile(join(root, 'src/one/peer.ts'), source.replace('./policy.js', '../one/policy.js'));
      for (const path of ['src/one/policy.ts', 'src/two/policy.ts']) {
        await writeFile(join(root, path), 'export const policy = 1;\n');
      }
      await git('init', '--quiet'); await git('add', '.');
      const commit = () => git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public module requests');
      await commit();
      const repository = new GitRepository(root);
      const firstSha = await repository.resolveRef('HEAD');
      const context = (commitSha: string) => ({ repositoryRoot: root, repositoryId: 'example/requests',
        ref: commitSha, commitSha, snapshotId: commitSha, changedPaths: [], deletedPaths: [], renamedPaths: {} });
      const extractor = new RepositoryFileExtractor(repository, ['src'], 'fixture-scip');
      await writeFile(join(root, 'src/one/start.ts'), source.replace('./policy.js', '../two/policy.js'));
      const first = await extractor.extract(context(firstSha));
      const request = (facts: typeof first, path: string) => facts.find((fact) =>
        fact.provenance.path === path && fact.predicate === 'consumes')!;
      const one = request(first, 'src/one/start.ts');
      expect(one.object).toEqual(request(first, 'src/one/peer.ts').object);
      expect(one.object.id).not.toBe(request(first, 'src/two/start.ts').object.id);
      expect(one).toMatchObject({ extractor: { id: 'repository-file-extractor', version: '2.0.0' },
        provenance: { path: 'src/one/start.ts', startLine: 1, endLine: 1, commitSha: firstSha } });
      await writeFile(join(root, 'src/one/start.ts'), source);
      await git('mv', 'src/one/start.ts', 'src/two/moved.ts');
      await git('rm', 'src/one/peer.ts', 'src/one/policy.ts');
      await commit();
      const second = await extractor.extract(context(await repository.resolveRef('HEAD')));
      expect(request(second, 'src/two/moved.ts').object).toEqual(request(second, 'src/two/start.ts').object);
      expect(second.some((fact) => ['src/one/start.ts', 'src/one/peer.ts', 'src/one/policy.ts']
        .includes(fact.provenance.path))).toBe(false);
      // The remaining literal request is still evidence; it does not assert that its target exists.
      expect(request(second, 'src/one/remaining.ts').object).toEqual(one.object);
      expect(second.some((fact) => fact.object.id === 'component:file:src/one/policy.ts')).toBe(false);
      expect(await extractor.extract(context(firstSha))).toEqual(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
