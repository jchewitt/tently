import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { matchesRepositoryGlob } from './glob.js';

export function inWorkingScope(path: string, patterns: readonly string[]): boolean {
  const normalize = (value: string) => value.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').replace(/\/$/, '') || '.';
  const normalizedPath = normalize(path);
  if (normalizedPath === '..' || normalizedPath.startsWith('../')) return false;
  return patterns.map(normalize).some((pattern) => pattern === '.' || matchesRepositoryGlob(normalizedPath, pattern) ||
    (!/[*?]/.test(pattern) && normalizedPath.startsWith(`${pattern}/`)));
}

/** The same bounded bytes are used when capturing drafts and checking their freshness. */
export async function readWorkingContent(root: string, path: string): Promise<Buffer | null> {
  const absolute = resolve(root, path);
  const outside = (value: string) => value === '..' || /^\.\.[\\/]/.test(value) || isAbsolute(value);
  if (outside(relative(root, absolute)) || /(?:^|\/)\.env(?:\.|$)/.test(path)) {
    throw new Error(`Unsafe overlay path: ${path}`);
  }
  try {
    const info = await lstat(absolute);
    if (outside(relative(await realpath(root), await realpath(absolute)))) throw new Error('Overlay path escapes checkout');
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Overlay requires a regular file: ${path}`);
    if (info.size > 1024 * 1024) throw new Error(`Overlay source exceeds 1 MiB: ${path}`);
    return await readFile(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return null;
  }
}
