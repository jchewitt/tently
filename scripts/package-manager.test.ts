import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { pnpmInvocation } from "./package-manager.mjs";

it('executes a native npm_execpath directly instead of asking Node to parse its binary', () => {
  const invocation = pnpmInvocation(['-p', 'process.versions.node'], process.execPath);
  expect(invocation.args).toEqual(['-p', 'process.versions.node']);
  expect(execFileSync(invocation.command, invocation.args, { encoding: 'utf8' }).trim())
    .toBe(process.versions.node);
});

it('executes JavaScript and extensionless node-shebang entry points with Node, preserving arguments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pnpm launcher '));
  try {
    for (const name of ['pnpm.cjs', 'pnpm']) {
      const path = join(root, name);
      await writeFile(path, '#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)));\n');
      const args = ['pack', 'path with spaces', 'literal$(text)'];
      const invocation = pnpmInvocation(args, path);
      expect(invocation.command).toBe(process.execPath);
      expect(JSON.parse(execFileSync(invocation.command, invocation.args, { encoding: 'utf8' }))).toEqual(args);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
