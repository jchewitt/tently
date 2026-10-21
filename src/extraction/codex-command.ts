import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { SemanticProviderError, type SemanticRunOptions } from './semantic-process.js';

interface CodexInvocation {
  readonly command: string;
  readonly prefixArgs: readonly string[];
}

async function isFile(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile(); }
  catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false;
    throw new SemanticProviderError('unavailable', 'Cannot inspect the Codex installation on PATH');
  }
}

async function npmEntry(directory: string, shim: string): Promise<string | undefined> {
  const packageRoot = basename(directory).toLowerCase() === '.bin'
    ? join(dirname(directory), '@openai', 'codex')
    : join(directory, 'node_modules', '@openai', 'codex');
  try {
    const pkg = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.codex;
    if (pkg.name !== '@openai/codex' || typeof bin !== 'string' || !/\.(?:c|m)?js$/i.test(bin)) return;
    const entry = resolve(packageRoot, bin);
    const within = relative(packageRoot, entry);
    if (within.startsWith('..') || isAbsolute(within) || !await isFile(entry)) return;
    // Recognize standard npm cmd-shim targets; never execute or evaluate the batch file.
    const target = relative(directory, entry).replaceAll('\\', '/').toLowerCase();
    const launcher = (await readFile(shim, 'utf8')).replaceAll('\\', '/').toLowerCase();
    if (launcher.includes(`%dp0%/${target}"`) || launcher.includes(`%~dp0${target}"`)) return entry;
  } catch { /* Missing/invalid metadata or an unsupported launcher is reported without its contents. */ }
}

/** Native binaries and standard npm installations; no cmd.exe, PowerShell, or implicit cwd lookup. */
async function findWindowsCodex(environment: Readonly<Record<string, string | undefined>>): Promise<CodexInvocation> {
  const pathKey = Object.keys(environment).find(key => key.toUpperCase() === 'PATH');
  for (const item of (pathKey ? environment[pathKey] ?? '' : '').split(';')) {
    const path = item.replace(/^"(.*)"$/, '$1');
    if (!path) continue;
    const directory = resolve(path);
    const native = join(directory, 'codex.exe');
    if (await isFile(native)) return { command: native, prefixArgs: [] };
    const shim = join(directory, 'codex.cmd');
    if (!await isFile(shim)) continue;
    const entry = await npmEntry(directory, shim);
    if (entry) return { command: process.execPath, prefixArgs: [entry] };
    throw new SemanticProviderError('unavailable',
      'Unsupported Codex launcher on PATH. Use a standard npm @openai/codex installation or a native codex.exe; batch wrappers are not executed');
  }
  throw new SemanticProviderError('unavailable', 'Codex CLI was not found on PATH; install @openai/codex with npm or add a native codex.exe');
}

/** Bound discovery too: a disconnected drive in PATH must not leave a provider call waiting indefinitely. */
export async function resolveCodexInvocation(
  command: string, environment: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform, options: SemanticRunOptions = {},
): Promise<CodexInvocation> {
  if (options.signal?.aborted) throw new SemanticProviderError('cancelled', 'Codex executable discovery cancelled');
  if (platform !== 'win32' || command !== 'codex') return { command, prefixArgs: [] };
  let timer: NodeJS.Timeout | undefined;
  let cancel = () => {};
  try {
    return await Promise.race([
      findWindowsCodex(environment),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new SemanticProviderError('timeout', 'Codex executable discovery timed out')),
          Math.min(options.timeoutMs ?? 5000, 5000));
        cancel = () => reject(new SemanticProviderError('cancelled', 'Codex executable discovery cancelled'));
        options.signal?.addEventListener('abort', cancel, { once: true });
        if (options.signal?.aborted) cancel();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
