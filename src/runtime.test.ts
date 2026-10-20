import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { assertSupportedNode, minimumNodeMajor } from '../runtime-check.mjs';

it('keeps toolkit engine metadata and version guidance consistent', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  expect(manifest.engines.node).toBe(`>=${minimumNodeMajor}.0.0`);
  expect((await readFile(new URL('../.nvmrc', import.meta.url), 'utf8')).trim()).toBe(String(minimumNodeMajor));
  for (const version of ['20.11.0', '22.14.0', '22.19.0', '23.11.0']) {
    expect(() => assertSupportedNode(version)).toThrow(`Tently requires Node.js 24 or newer; found ${version}`);
  }
  for (const version of ['24.0.0', '24.6.0', '24.19.0', '25.0.0']) {
    expect(() => assertSupportedNode(version)).not.toThrow();
  }
});

it.each(['cli.ts', 'mcp.ts', 'index.ts', '../mcp-launcher.mjs'])(
  'rejects unsupported Node before loading dependent runtime code: %s',
  async (entry) => {
    const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
    const target = new URL(entry, import.meta.url).href;
    const result = await promisify(execFile)(process.execPath, ['--import', tsx, '--input-type=module', '--eval', `
      import { createRequire } from 'node:module';
      Object.defineProperty(process.versions, 'node', { value: '22.14.0' });
      Object.defineProperty(createRequire(import.meta.url)('node:zlib'), 'createZstdDecompress', { value: undefined });
      await import(${JSON.stringify(target)});
    `]).then(() => { throw new Error('Unsupported runtime unexpectedly succeeded'); }, error => error);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Tently requires Node.js 24 or newer; found 22.14.0');
    expect(result.stderr).not.toContain('decompress.js');
    expect(result.stderr).not.toContain('Building current context graph');
  },
);
