import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { initializeProject } from './init.js';
import { loadConfig } from './config.js';

const execute = promisify(execFile);

it('creates valid project-specific defaults with no automatic document selection or approval', async () => {
  const root = await mkdtemp(join(tmpdir(), 'graph-init-'));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'tests'));
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, 'package.json'), '{"name":"@example/new-project"}');
  await writeFile(join(root, '.gitignore'), 'node_modules/\r\n');
  const result = await initializeProject({ directory: root });
  const loaded = await loadConfig(result.configPath);
  expect(loaded.repositoryRoot).toBe(root);
  expect(loaded.config).toMatchObject({
    repositoryId: '@example/new-project', codeRoots: ['src'], evidenceRoots: ['tests'],
    semanticSources: [], approvedIntentSources: [], ontology: { backend: 'rdf' },
  });
  expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe('node_modules/\r\n.context-graph/\r\n');
  const original = await readFile(result.configPath, 'utf8');
  await expect(initializeProject({ directory: root, model: 'changed' })).rejects.toThrow('already exists');
  expect(await readFile(result.configPath, 'utf8')).toBe(original);
});

it('supports nested config locations, selected sources and preservation of an existing ignore entry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'graph-init-selected-'));
  await writeFile(join(root, '.gitignore'), '/.context-graph/\n');
  const result = await initializeProject({
    directory: root, configPath: '.config/graph.json', repositoryId: 'example/project',
    codeRoots: ['packages/api', 'packages/web'], semanticSources: ['docs/product'], evidenceRoots: ['spec'],
    model: 'configured-model',
  });
  const loaded = await loadConfig(result.configPath);
  expect(loaded.repositoryRoot).toBe(root);
  expect(loaded.config.semanticSources).toEqual(['docs/product']);
  expect(loaded.config.approvedIntentSources).toEqual([]);
  expect(loaded.config.semantic.model).toBe('configured-model');
  expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe('/.context-graph/\n');
  await expect(initializeProject({ directory: root, semanticSources: ['../outside'] })).rejects.toThrow('within the repository');
});

it('runs setup and config commands in a consumer without Git, providers or preexisting configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'graph-init-cli-'));
  const cli = resolve('src/cli.ts');
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
  const run = (...args: string[]) => execute(process.execPath, ['--import', tsx, cli, ...args], { cwd: root });
  await expect(run('init')).rejects.toThrow('requires --yes');
  await expect(run('init', '--yes', '--semantic-source')).rejects.toThrow('requires a value');
  await expect(run('init', '--yes', '--unknown')).rejects.toThrow('Unknown init option');
  await expect(readFile(join(root, 'context-graph.config.json'))).rejects.toThrow();
  const setup = await run('init', '--yes', '--repository-id', 'test/new', '--semantic-source', 'docs/intent',
    '--semantic-source', 'docs/contracts', '--no-gitignore');
  expect(setup.stdout).toContain('Setup made no model requests');
  const config = JSON.parse((await run('config', 'show')).stdout);
  expect(config.semanticSources).toEqual(['docs/intent', 'docs/contracts']);
  expect(JSON.parse((await run('config', 'validate')).stdout).valid).toBe(true);
  await expect(readFile(join(root, '.gitignore'))).rejects.toThrow();
  await expect(run('init', '--yes')).rejects.toThrow('already exists');
});
