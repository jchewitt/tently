import { execFile } from 'node:child_process';
import * as filesystem from 'node:fs/promises';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { afterEach, expect, it, vi } from 'vitest';
import { resolveCodexInvocation } from './codex-command.js';
import { CodexCliSemanticExtractor } from './semantic.js';
import { prepareProjectConfig, initializeProject } from '../interfaces/init.js';
import { diagnoseSetup } from '../interfaces/doctor.js';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, stat: vi.fn(actual.stat) };
});

const execute = promisify(execFile);
const roots: string[] = [];
const environment = (path: string) => ({ Path: path });
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-codex-'));
  roots.push(root);
  return root;
}
async function npmFixture(directory: string, local = false) {
  const packageRoot = local ? join(dirname(directory), '@openai/codex') : join(directory, 'node_modules/@openai/codex');
  await mkdir(join(packageRoot, 'bin'), { recursive: true });
  await mkdir(directory, { recursive: true });
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: '@openai/codex', bin: { codex: 'bin/codex.js' } }));
  const entry = join(packageRoot, 'bin/codex.js');
  await writeFile(entry, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
  await writeFile(join(directory, 'codex.cmd'), `@echo off\r\n"%dp0%\\node.exe" "%dp0%\\${local ? '..' : 'node_modules'}\\@openai\\codex\\bin\\codex.js" %*\r\n`);
  return entry;
}

it.each([false, true])('resolves Windows npm launchers without a shell (local=%s), including spaces and metacharacters', async local => {
  const root = await temporaryRoot();
  const directory = local ? join(root, 'npm tools & 100% (fixture)', 'node_modules/.bin') : join(root, 'npm tools & 100% (fixture)');
  const entry = await npmFixture(directory, local);
  const invocation = await resolveCodexInvocation('codex', environment(`"${directory}"`), 'win32');
  expect(invocation).toEqual({ command: process.execPath, prefixArgs: [entry] });
  const args = ['a b', '& echo never', '%PRIVATE_TOKEN%', '"quoted"'];
  const result = await execute(invocation.command, [...invocation.prefixArgs, ...args]);
  expect(JSON.parse(result.stdout)).toEqual(args);
});

it('respects PATH directory order, prefers a native executable in the same directory, and ignores implicit cwd', async () => {
  const root = await temporaryRoot();
  const first = join(root, 'first'), second = join(root, 'second');
  const entry = await npmFixture(first);
  await mkdir(second);
  await writeFile(join(second, 'codex.exe'), 'native fixture');
  expect((await resolveCodexInvocation('codex', environment(`${first};${second}`), 'win32')).prefixArgs).toEqual([entry]);
  expect((await resolveCodexInvocation('codex', environment(`${second};${first}`), 'win32')).command).toBe(join(second, 'codex.exe'));
  await writeFile(join(first, 'codex.exe'), 'native fixture');
  expect((await resolveCodexInvocation('codex', environment(first), 'win32')).command).toBe(join(first, 'codex.exe'));
  await expect(resolveCodexInvocation('codex', environment(';;'), 'win32')).rejects.toMatchObject({ code: 'unavailable' });
});

it('rejects unsupported or broken npm wrappers without falling through to a different installation', async () => {
  const root = await temporaryRoot();
  const first = join(root, 'first'), second = join(root, 'second');
  await npmFixture(first);
  await mkdir(second);
  await writeFile(join(second, 'codex.exe'), 'native fixture');
  await writeFile(join(first, 'codex.cmd'), '@echo off\r\necho PRIVATE_CONTENT\r\n');
  await expect(resolveCodexInvocation('codex', environment(`${first};${second}`), 'win32')).rejects.toThrow('Unsupported Codex launcher');
  await expect(resolveCodexInvocation('codex', environment(first), 'win32')).rejects.not.toThrow('PRIVATE_CONTENT');
  const entry = await npmFixture(first);
  await rm(entry);
  await expect(resolveCodexInvocation('codex', environment(first), 'win32')).rejects.toMatchObject({ code: 'unavailable' });
});

async function npmCli() {
  for (const candidate of [join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')]) {
    try { await access(candidate); return candidate; } catch {}
  }
  throw new Error('These launcher tests require npm installed beside Node');
}

it.each([false, true])('uses a real npm-created launcher for doctor, login and isolated extraction (local=%s)', async local => {
  const root = await temporaryRoot();
  const fixture = join(root, 'fixture'), prefix = join(root, 'npm tools & 100% (fixture)'), consumer = join(root, 'consumer');
  await mkdir(join(fixture, 'bin'), { recursive: true });
  await mkdir(consumer);
  const trace = join(root, 'invocations.jsonl');
  await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: '@openai/codex', version: '0.0.0-test', type: 'module', bin: { codex: 'bin/codex.js' } }));
  await writeFile(join(fixture, 'bin/codex.js'), `#!/usr/bin/env node
import { appendFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(trace)}, JSON.stringify({ args, cwd: process.cwd(), apiKeyInherited: Boolean(process.env.OPENAI_API_KEY) }) + '\\n');
if (args[0] === '--version') console.log('codex-cli public-test-fixture');
else if (args.join(' ') === 'login status') console.log('Logged in using ChatGPT');
else if (args[0] === 'exec') {
  for await (const _ of process.stdin) {}
  writeFileSync(args[args.indexOf('--output-last-message') + 1], JSON.stringify({assertions: [], oml: '', diagnostics: []}));
} else process.exit(2);
`);
  await execute(process.execPath, [await npmCli(), 'install', ...(local ? [] : ['--global']), '--prefix', prefix,
    '--install-links', '--ignore-scripts', '--no-audit', '--no-fund', '--update-notifier=false', fixture], { timeout: 60_000 });
  const bin = local ? join(prefix, 'node_modules/.bin') : process.platform === 'win32' ? prefix : join(prefix, 'bin');
  vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH ?? ''}`);
  vi.stubEnv('OPENAI_API_KEY', 'must-not-inherit');
  const initialized = await initializeProject({ directory: consumer });
  const config = (await prepareProjectConfig({ directory: consumer })).config;
  const doctor = await diagnoseSetup(initialized.configPath);
  expect(doctor).toMatchObject({ codexAvailable: true, codexLoginMode: 'chatgpt', codexAuthenticated: true });
  const result = await new CodexCliSemanticExtractor(config.semantic).extract({
    path: 'docs/public.md', content: 'Public fixture.\n', digest: 'fixture', stableSemanticId: 'fixture',
  }, { repositoryRoot: consumer, repositoryId: 'public/fixture', ref: 'HEAD', commitSha: 'a'.repeat(40),
    snapshotId: 'fixture', changedPaths: [], deletedPaths: [], renamedPaths: {} });
  expect(result.parsed.assertions).toEqual([]);
  const calls = (await readFile(trace, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  expect(calls.map(c => c.args[0])).toEqual(['--version', 'login', 'login', 'exec']);
  expect(calls.every(c => !c.apiKeyInherited)).toBe(true);
  expect(calls[3].cwd).not.toBe(consumer);
  expect(calls[3].args).toContain('--ignore-user-config');
  expect(calls[3].args).toContain('--output-schema');
}, 90_000);

it('bounds discovery and honors cancellation when a PATH lookup stalls', async () => {
  vi.mocked(filesystem.stat).mockImplementationOnce(() => new Promise(() => {}))
    .mockImplementationOnce(() => new Promise(() => {}));
  await expect(resolveCodexInvocation('codex', environment('/unavailable-drive'), 'win32', { timeoutMs: 20 }))
    .rejects.toMatchObject({ code: 'timeout' });
  const controller = new AbortController();
  const pending = resolveCodexInvocation('codex', environment('/unavailable-drive'), 'win32', { signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
});
