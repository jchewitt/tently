// Modified for standalone extraction; see docs/extraction-manifest.json.
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadContextGraphAdapterModule } from "./application.js";
import type { ContextGraphRepository } from "@launch-echo/tently-core";

const repository: ContextGraphRepository = {
  async readFileAt() {
    return '';
  },
  async listFilesAt() {
    return [];
  },
};

describe('configured adapter loading', () => {
  it('keeps the generic toolkit adapter-free when no module is configured', async () => {
    await expect(loadContextGraphAdapterModule(undefined, repository)).resolves.toEqual({
      factExtractors: [],
      invariantEvaluators: [],
    });
  });

  it('loads an adapter factory through its public module contract', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-adapter-'));
    const modulePath = join(root, 'adapter.mjs');
    await writeFile(
      modulePath,
      'export function createContextGraphAdapter() { return { factExtractors: [], invariantEvaluators: [] }; }',
      'utf8',
    );

    await expect(
      loadContextGraphAdapterModule(pathToFileURL(modulePath).href, repository),
    ).resolves.toEqual({ factExtractors: [], invariantEvaluators: [] });
    for (const specifier of ['./adapter.mjs', modulePath]) {
      await expect(loadContextGraphAdapterModule(specifier, repository, root))
        .resolves.toEqual({ factExtractors: [], invariantEvaluators: [] });
    }
    const packageRoot = join(root, 'node_modules', '@fixture', 'adapter');
    await mkdir(packageRoot, { recursive: true });
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
      name: '@fixture/adapter', type: 'module', exports: { import: './adapter.mjs' },
    }));
    await writeFile(join(packageRoot, 'adapter.mjs'),
      'export function createContextGraphAdapter() { return { factExtractors: [], invariantEvaluators: [] }; }');
    await expect(loadContextGraphAdapterModule('@fixture/adapter', repository, root))
      .resolves.toEqual({ factExtractors: [], invariantEvaluators: [] });
  });

  it('fails clearly when a configured module does not implement the adapter contract', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-adapter-invalid-'));
    const modulePath = join(root, 'adapter.mjs');
    await writeFile(modulePath, 'export const unsupported = true;', 'utf8');

    await expect(
      loadContextGraphAdapterModule(pathToFileURL(modulePath).href, repository),
    ).rejects.toThrow('must export createContextGraphAdapter(repository)');
  });
});
