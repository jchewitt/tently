import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { assertSemanticOutput, CodexCliSemanticExtractor, SemanticProviderError } from './semantic.js';
import { runSemanticProcess } from './semantic-process.js';
import { createSemanticExtractor } from './providers.js';
import type { ExtractionContext, SemanticSource } from './core.js';

const config = { provider: 'codex-cli' as const, model: 'test', reasoningEffort: 'low',
  promptVersion: '1', extractorVersion: '1', adapterVersion: '1', ontologyVersion: '1',
  minimumConfidence: 0.7, failOnUnresolved: true, concurrency: 1, retries: 1 };
const source: SemanticSource = { path: 'docs/public.md', content: 'Public example.\n', digest: 'digest', stableSemanticId: 'public' };
const context: ExtractionContext = { repositoryId: 'example/public', repositoryRoot: '/tmp', ref: 'HEAD',
  commitSha: 'a'.repeat(40), snapshotId: 'test', changedPaths: [], deletedPaths: [], renamedPaths: {} };

it('bounds actual processes, cancels them, and never exposes provider stderr', async () => {
  const run = (script: string, options = {}) => runSemanticProcess(process.execPath, ['-e', script],
    tmpdir(), 'PRIVATE PROMPT', {}, options);
  await expect(run('setInterval(()=>{},1000)', { timeoutMs: 50 })).rejects.toMatchObject({ code: 'timeout' });
  const controller = new AbortController();
  const pending = run('setInterval(()=>{},1000)', { signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  await expect(run('process.stderr.write("PRIVATE SECRET"); process.exit(1)')).rejects.toThrow('status 1');
  await expect(run('process.stderr.write("PRIVATE SECRET"); process.exit(1)')).rejects.not.toThrow('PRIVATE');
});

it('retries only explicit transient failures and includes reasoning settings in cache identity', async () => {
  let calls = 0;
  const extractor = new CodexCliSemanticExtractor(config, { async run(_command, args, _cwd, _prompt, _env, options) {
    expect(options?.timeoutMs).toBe(120_000);
    if (++calls === 1) throw new SemanticProviderError('exit', 'Temporary failure', true);
    await writeFile(args[args.indexOf('--output-last-message') + 1]!, '{"assertions":[],"diagnostics":[],"oml":""}');
  } });
  await extractor.extract(source, context);
  expect(calls).toBe(2);
  expect(extractor.identity).not.toBe(new CodexCliSemanticExtractor({ ...config, reasoningEffort: 'high' }).identity);
  const failing = new CodexCliSemanticExtractor(config, { async run() {
    calls++; throw new SemanticProviderError('exit', 'Not transient');
  } });
  await expect(failing.extract(source, context)).rejects.toThrow('Not transient');
  expect(calls).toBe(3);
});

it('rejects malformed provider data independent of the model schema', () => {
  const assertion = { subject: { id: 'workflow:x', kind: 'Workflow', label: 'X' }, predicate: 'realizes',
    object: { id: 'capability:y', kind: 'Capability', label: 'Y' }, confidence: 1,
    citation: { startLine: 1, endLine: 1 } };
  expect(() => assertSemanticOutput({ assertions: [assertion], oml: '' }, source)).not.toThrow();
  for (const invalid of [{ ...assertion, confidence: NaN }, { ...assertion, predicate: 'invented' },
    { ...assertion, subject: { ...assertion.subject, kind: 'invented' } }, { ...assertion, citation: null }]) {
    expect(() => assertSemanticOutput({ assertions: [invalid], oml: '' }, source)).toThrow('Invalid semantic');
  }
});

it('loads a tested provider module lazily and enforces identity and timeout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'provider-contract-'));
  const moduleConfig = { ...config, provider: 'module' as const, providerModule: './provider.mjs', providerIdentity: 'fixture:1' };
  const lazy = createSemanticExtractor(moduleConfig, root);
  expect(lazy.identity).toContain('fixture:1'); // Query setup does not try to load the missing module.
  await writeFile(join(root, 'provider.mjs'), `export const createSemanticExtractor = () => ({
    identity:'fixture:1', extract:async()=>({parsed:{assertions:[],oml:''},rawModelOutput:'{}'})
  });`);
  expect((await lazy.extract(source, context)).parsed.assertions).toEqual([]);
  await expect(createSemanticExtractor({ ...moduleConfig, providerIdentity: 'wrong' }, root).extract(source, context))
    .rejects.toThrow('identity/contract');
  await writeFile(join(root, 'slow.mjs'), `export const createSemanticExtractor = () => ({
    identity:'fixture:1',extract:async()=>new Promise(()=>{})
  });`);
  await expect(createSemanticExtractor({ ...moduleConfig, providerModule: './slow.mjs', timeoutMs: 20 }, root)
    .extract(source, context)).rejects.toThrow('timed out');
});
