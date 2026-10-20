// Modified for standalone extraction; see docs/extraction-manifest.json.
import { execFile } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { loadConfig } from "../src/configuration/config.js";
import { GitRepository } from "../src/repository/git.js";
import { ScipTypeScriptIndexer } from "../src/extraction/static.js";
import { createContextGraphApplication } from "../src/application/application.js";

const execFileAsync = promisify(execFile);

describe('portable generic fixture', () => {
  it('hydrates the configured nested example from committed bytes while its checkout is dirty', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-nested-hydrate-'));
    const nested = join(root, 'examples', 'generic-typescript');
    await mkdir(nested, { recursive: true });
    await cp(resolve(import.meta.dirname, "../examples/generic-typescript"), nested, { recursive: true });
    const config = JSON.parse(await readFile(join(nested, 'context-graph.config.json'), 'utf8'));
    config.semantic = { ...config.semantic, provider: 'module', providerModule: './provider.mjs', providerIdentity: 'fixture:1' };
    await writeFile(join(nested, 'context-graph.config.json'), JSON.stringify(config));
    await writeFile(join(nested, 'provider.mjs'), `
      export const createSemanticExtractor = () => ({
        identity:'fixture:1', extract:async(source)=>{
          if (source.content === 'dirty') throw Error('Read uncommitted source');
          return {parsed:{assertions:[],oml:''},rawModelOutput:'{}'};
        }
      });
    `);
    const git = (...args: string[]) => execFileAsync('git', args, { cwd: root });
    await git('init', '--quiet'); await git('add', '.');
    await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture');
    await writeFile(join(nested, 'docs', 'search-capability.md'), 'dirty');
    const application = await createContextGraphApplication(join(nested, 'context-graph.config.json'));
    const result = await application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(result.snapshot.facts.some(fact => fact.provenance.path === 'src/search.ts')).toBe(true);
    expect(await readFile(join(nested, 'docs', 'search-capability.md'), 'utf8')).toBe('dirty');
  }, 30_000);
  it('loads and reads committed sources from an independent git repository', async () => {
    const fixture = resolve(import.meta.dirname, "../examples/generic-typescript");
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
        resolve(loaded.repositoryRoot, 'ontology', 'build.gradle'),
        'utf8',
      ),
    ).toContain('oml2owl-gradle:2.13.1');
  });
});
