import { execFile } from 'node:child_process';
import { access, cp, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';
import { GitRepository } from './git.js';
import { ScipTypeScriptIndexer } from './static.js';

const execFileAsync = promisify(execFile);

describe('portable generic fixture', () => {
  it('loads and reads committed sources from an independent git repository', async () => {
    const fixture = resolve(import.meta.dirname, '..', 'examples', 'generic-typescript');
    const root = await mkdtemp(join(tmpdir(), 'context-graph-portable-'));
    await cp(fixture, root, { recursive: true });
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['config', 'user.email', 'context-graph@example.test'], {
      cwd: root,
    });
    await execFileAsync('git', ['config', 'user.name', 'Context Graph Fixture'], { cwd: root });
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'fixture'], { cwd: root });

    const loaded = await loadConfig(join(root, 'context-graph.config.json'));
    const repository = new GitRepository(loaded.repositoryRoot);
    const commitSha = await repository.resolveRef('HEAD');
    const context = {
      repositoryRoot: loaded.repositoryRoot,
      repositoryId: loaded.config.repositoryId,
      ref: 'HEAD',
      commitSha,
      snapshotId: commitSha,
      changedPaths: [],
      deletedPaths: [],
      renamedPaths: {},
    };
    const sources = await repository.semanticSources(context, loaded.config.semanticSources);
    const scip = await new ScipTypeScriptIndexer(
      loaded.config.scip,
      join(root, loaded.config.storagePath),
    ).index(context);

    expect(loaded.repositoryRoot).toBe(root);
    expect(sources.map((source) => source.path)).toEqual(['docs/search-capability.md']);
    expect(await repository.listFilesAt(commitSha, loaded.config.codeRoots)).toContain(
      'src/search.ts',
    );
    expect(scip.path).toContain(join(root, '.context-graph', 'scip'));
    await expect(access(join(root, 'index.scip'))).rejects.toThrow();
    expect(
      await readFile(
        resolve(loaded.repositoryRoot, loaded.config.ontology.projectPath, 'build.gradle'),
        'utf8',
      ),
    ).toContain('oml2owl-gradle:2.13.1');
  });
});
