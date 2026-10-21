// Modified for standalone extraction; see docs/extraction-manifest.json.
import { execFile } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function unbuiltCheckout() {
  const original = resolve(import.meta.dirname, "..");
  const root = await mkdtemp(join(tmpdir(), 'context-graph-mcp-start-'));
  temporaryRoots.push(root);
  const toolkit = join(root, 'tools', 'context-graph');
  for (const project of ['', 'packages/core']) {
    const source = join(original, project);
    const target = join(toolkit, project);
    await mkdir(join(target, 'node_modules'), { recursive: true });
    for (const file of ['src', 'package.json', 'tsconfig.json']) {
      await cp(join(source, file), join(target, file), { recursive: true });
    }
    // Reuse installed third-party dependencies, but wire workspace packages to the unbuilt
    // fixture. The launcher must build these outputs rather than borrowing the real checkout's.
    for (const entry of await readdir(join(source, 'node_modules'))) {
      if (entry === '@weftlet' || entry === '.bin') continue;
      const dependency = join(source, 'node_modules', entry);
      const directory = (await stat(dependency)).isDirectory();
      const destination = join(target, 'node_modules', entry);
      if (directory) {
        await symlink(dependency, destination, process.platform === 'win32' ? 'junction' : 'dir');
      } else {
        // File symlinks require elevated privileges or Developer Mode on Windows.
        // Package-manager metadata can be copied; dependencies remain shared directories.
        await cp(dependency, destination);
      }
    }
    await mkdir(join(target, 'node_modules', '@weftlet'), { recursive: true });
    for (const name of ['core']) {
      await symlink(
        join(toolkit, 'packages', name),
        join(target, 'node_modules', '@weftlet', name),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    }
  }
  for (const file of ['mcp-launcher.mjs', 'context-graph.config.json', 'runtime-check.mjs', 'runtime-check.d.mts']) {
    await cp(join(original, file), join(toolkit, file));
  }
  return { root, toolkit, launcher: join(toolkit, 'mcp-launcher.mjs') };
}

describe('required MCP startup', () => {
  it.each(['missing', 'stale'])(
    'rebuilds %s workspace outputs and initializes clean JSON-RPC from another cwd',
    async (state) => {
      const fixture = await unbuiltCheckout();
      const outputs = [
        'packages/core/dist/index.js',
        'dist/mcp.js',
      ];
      if (state === 'stale') {
        for (const output of outputs) {
          const path = join(fixture.toolkit, output);
          await mkdir(resolve(path, '..'), { recursive: true });
          await writeFile(path, 'throw new Error("stale workspace output");');
        }
      }
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [fixture.launcher],
        cwd: tmpdir(),
        env: {
          ...process.env,
          CONTEXT_GRAPH_CONFIG: join(fixture.toolkit, 'context-graph.config.json'),
        },
        stderr: 'pipe',
      });
      let diagnostics = '';
      transport.stderr?.on('data', (chunk: Buffer) => {
        diagnostics += chunk.toString();
      });
      const client = new Client({ name: 'cold-start-test', version: '1.0.0' });
      try {
        await client.connect(transport);
        expect(client.getServerVersion()?.name).toBe('context-graph');
        expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(['impact.scan']);
        for (const output of outputs) {
          expect((await stat(join(fixture.toolkit, output))).isFile()).toBe(true);
          expect(await readFile(join(fixture.toolkit, output), 'utf8')).not.toContain(
            'stale workspace output',
          );
        }
        expect(diagnostics).toContain('Building current context graph MCP outputs');
      } finally {
        await client.close();
      }
    },
    60_000,
  );

  it('fails clearly on a compiler error without sending diagnostics on protocol stdout', async () => {
    const fixture = await unbuiltCheckout();
    await writeFile(
      join(fixture.toolkit, 'packages/core/src/broken.ts'),
      'export const broken = ;',
    );
    const error = await execute(process.execPath, [fixture.launcher], {
      cwd: tmpdir(),
      timeout: 55_000,
      windowsHide: true,
    }).then(
      () => {
        throw new Error('Expected the cold build to fail');
      },
      (failure: unknown) => failure,
    );
    expect(error).toMatchObject({ code: 1, stdout: '' });
    expect((error as { stderr: string }).stderr).toContain('Unable to start context graph MCP');
    expect((error as { stderr: string }).stderr).toContain('broken.ts');
  }, 60_000);
});
