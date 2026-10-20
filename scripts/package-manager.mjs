import { closeSync, openSync, readSync, realpathSync } from 'node:fs';

/** npm_execpath can be either a JS entry point or pnpm's standalone native executable. */
export function pnpmInvocation(args, executable = process.env.npm_execpath) {
  if (!executable) {
    if (process.platform === 'win32') throw new Error('Run this script through pnpm so its executable can be resolved without a shell');
    return { command: 'pnpm', args: [...args] };
  }
  const target = realpathSync(executable);
  if (/\.(?:cmd|bat)$/i.test(target)) {
    throw new Error('Run through pnpm using its JavaScript entry point or standalone executable, not a batch shim');
  }
  const header = Buffer.alloc(256);
  const descriptor = openSync(target, 'r');
  let length;
  try { length = readSync(descriptor, header, 0, header.length, 0); }
  finally { closeSync(descriptor); }
  const firstLine = header.subarray(0, length).toString('utf8').split(/\r?\n/, 1)[0];
  const javascript = /\.(?:cjs|mjs|js)$/i.test(target) ||
    /^#![^\r\n]*\bnode(?:\s|$)/.test(firstLine);
  return javascript
    ? { command: process.execPath, args: [target, ...args] }
    : { command: target, args: [...args] };
}
