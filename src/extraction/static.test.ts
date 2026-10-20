// Modified for standalone extraction; see docs/extraction-manifest.json.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { ExtractionContext, GraphSnapshot, SnapshotStore } from "@launch-echo/tently-core";
import type { GitRepository } from "../repository/git.js";
import { SnapshotImpactQueryService } from "../graph/query.js";
import {
  RepositoryContractExtractor,
  ScipSymbolExtractor,
  ScipTypeScriptIndexer,
  normalizeScipCheckout,
} from "./static.js";

const execFileAsync = promisify(execFile);

interface ScipMessage {
  serializeBinary(): Uint8Array;
}

interface ScipConstructors {
  readonly scip: {
    readonly Index: (new (input: object) => ScipMessage) & {
      deserializeBinary(bytes: Uint8Array): { documents: readonly { relative_path: string }[] };
    };
    readonly Document: new (input: object) => object;
    readonly Occurrence: new (input: object) => object;
    readonly Metadata: new (input: object) => object;
    readonly SymbolInformation: new (input: object) => object;
  };
}

describe('SCIP symbol extraction', () => {
  it('normalizes scratch paths without hiding actual symbol or lookalike-path changes', () => {
    const require = createRequire(import.meta.url);
    const runtime = require(
      join(dirname(require.resolve('@sourcegraph/scip-typescript')), 'scip.js'),
    ) as ScipConstructors;
    const a = join(tmpdir(), 'scip-one', 'checkout');
    const b = join(tmpdir(), 'scip-two', 'checkout');
    const make = (root: string, symbol = 'local 1', extra = 'unchanged') =>
      new runtime.scip.Index({
        metadata: new runtime.scip.Metadata({ project_root: pathToFileURL(root).href }),
        documents: [
          new runtime.scip.Document({
            relative_path: 'routes.ts',
            symbols: [
              new runtime.scip.SymbolInformation({
                symbol,
                documentation: [`typeof import("${root.replace(/\\/g, '/')}/page")`, extra],
              }),
            ],
          }),
        ],
      }).serializeBinary();
    const first = normalizeScipCheckout(make(a), a);
    expect(normalizeScipCheckout(make(b), b)).toEqual(first);
    expect(normalizeScipCheckout(make(b, 'local 2'), b)).not.toEqual(first);
    expect(normalizeScipCheckout(make(a, 'local 1', `${a}-other/page`), a)).not.toEqual(
      normalizeScipCheckout(make(b, 'local 1', `${b}-other/page`), b),
    );
    expect(normalizeScipCheckout(first, a)).toEqual(first);
  });
  it('indexes only the exact commit even when an ignored TypeScript source is present', async () => {
    const require = createRequire(import.meta.url);
    const scipMain = require.resolve('@sourcegraph/scip-typescript');
    const runtime = require(join(dirname(scipMain), 'scip.js')) as ScipConstructors;
    const root = await mkdtemp(join(tmpdir(), 'context-graph-scip-exact-'));
    await mkdir(join(root, 'src'), { recursive: true });
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['config', 'user.email', 'context-graph@example.test'], {
      cwd: root,
    });
    await execFileAsync('git', ['config', 'user.name', 'Context Graph Test'], { cwd: root });
    await writeFile(join(root, '.gitignore'), '.context-graph/\nsrc/ignored.ts\n', 'utf8');
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: '@fixture/exact-commit', version: '1.0.0' }),
      'utf8',
    );
    await writeFile(
      join(root, 'tsconfig.json'),
      `${JSON.stringify({ compilerOptions: { target: 'ES2022' }, include: ['src/**/*.ts'] })}\n`,
      'utf8',
    );
    await writeFile(join(root, 'src', 'tracked.ts'), 'export const tracked = true;\n', 'utf8');
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'fixture'], { cwd: root });
    const commitSha = (
      await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
    ).stdout.trim();
    await writeFile(join(root, 'src', 'ignored.ts'), 'export const ignored = true;\n', 'utf8');

    const indexer = new ScipTypeScriptIndexer(
      {
        version: '0.4.0',
        command: 'bundled-scip-typescript',
        args: ['index', '--no-global-caches', 'tsconfig.json'],
      },
      join(root, '.context-graph'),
    );
    const context = {
      repositoryRoot: root,
      repositoryId: 'example/exact-commit',
      ref: 'HEAD',
      commitSha,
      snapshotId: commitSha,
      changedPaths: [],
      deletedPaths: [],
      renamedPaths: {},
    };
    const result = await indexer.index(context);
    const rebuilt = await indexer.index({ ...context, snapshotId: `${commitSha}-clean` });
    expect(rebuilt.digest).toEqual(result.digest);
    const parsed = runtime.scip.Index.deserializeBinary(await readFile(result.path));
    const indexedPaths = parsed.documents.map((document) =>
      document.relative_path.replace(/\\/g, '/'),
    );
    expect(indexedPaths).toContain('src/tracked.ts');
    expect(indexedPaths).not.toContain('src/ignored.ts');
    expect(
      (
        await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
          cwd: root,
          encoding: 'utf8',
        })
      ).stdout,
    ).not.toContain('.context-graph/worktrees');
  });

  it('adds definition and downstream-reference relationships to symbol impact scans', async () => {
    const require = createRequire(import.meta.url);
    const scipMain = require.resolve('@sourcegraph/scip-typescript');
    const runtime = require(join(dirname(scipMain), 'scip.js')) as ScipConstructors;
    const symbol = 'scip-typescript npm example 1.0.0 src/search`SearchService#';
    const fileLocal = 'scip-typescript npm example 1.0.0 src/search`SearchService#helper.';
    const index = new runtime.scip.Index({
      documents: [
        new runtime.scip.Document({
          relative_path: 'src/search.ts',
          occurrences: [
            new runtime.scip.Occurrence({ range: [0, 13, 26], symbol, symbol_roles: 1 }),
            new runtime.scip.Occurrence({ range: [0, 27, 33], symbol: fileLocal, symbol_roles: 1 }),
            new runtime.scip.Occurrence({ range: [0, 34, 40], symbol: fileLocal, symbol_roles: 8 }),
          ],
        }),
        new runtime.scip.Document({
          relative_path: 'src/consumer.ts',
          occurrences: [
            new runtime.scip.Occurrence({ range: [1, 5, 18], symbol, symbol_roles: 8 }),
          ],
        }),
      ],
    });
    const root = await mkdtemp(join(tmpdir(), 'context-graph-scip-'));
    const indexPath = join(root, 'index.scip');
    await writeFile(indexPath, index.serializeBinary());
    const files: Readonly<Record<string, string>> = {
      'src/search.ts': 'export class SearchService {}\n',
      'src/consumer.ts': "import { SearchService } from './search.js';\nnew SearchService();\n",
    };
    const repository = {
      async readFileAt(_sha: string, path: string) {
        const content = files[path];
        if (!content) throw new Error(`Missing fixture ${path}`);
        return content;
      },
    } as GitRepository;
    const context: ExtractionContext = {
      repositoryRoot: root,
      repositoryId: 'example/generic',
      ref: 'HEAD',
      commitSha: 'a'.repeat(40),
      snapshotId: 'a'.repeat(40),
      changedPaths: [],
      deletedPaths: [],
      renamedPaths: {},
    };
    const facts = await new ScipSymbolExtractor(repository, {
      path: indexPath,
      digest: 'scip-digest',
      mode: 'full',
      version: '0.4.0',
    }).extract(context);
    expect(facts.map((fact) => [fact.predicate, fact.provenance.path])).toEqual([
      ['contains', 'src/search.ts'],
      ['consumes', 'src/consumer.ts'],
    ]);

    const snapshot: GraphSnapshot = {
      manifest: {
        schemaVersion: 1,
        repositoryId: context.repositoryId,
        ref: 'HEAD',
        commitSha: context.commitSha,
        snapshotId: context.snapshotId,
        ontologyVersion: '1',
        extractorVersions: {},
        semanticModel: 'test',
        semanticPromptVersion: 'test',
        generatedAt: '2026-01-01T00:00:00Z',
        contentDigest: 'digest',
        semanticArtifactKeys: [],
        scipIndexDigest: 'scip-digest',
        rdfDigest: 'rdf-digest',
      },
      facts,
      invariants: [],
      runtimeEvidence: [],
      unresolved: [],
    };
    const store = {
      async read() {
        return snapshot;
      },
      async readHead() {
        return snapshot;
      },
      async write() {},
      async updateHead() {},
    } satisfies SnapshotStore;
    const pack = await new SnapshotImpactQueryService(store, 'default').scan({
      symbols: ['SearchService'],
    });
    expect(pack.suggestedFiles).toEqual(['src/search.ts', 'src/consumer.ts']);
  });
});

describe('repository contract extraction', () => {
  it('indexes glob-matched contracts outside code roots and surfaces them in impact scans', async () => {
    const sha = 'b'.repeat(40);
    const files: Readonly<Record<string, string>> = {
      'contracts/public/openapi.json': '{"openapi":"3.1.0"}\n',
      'openapi.json': '{"openapi":"3.1.0"}\n',
      'prisma/schema.prisma': 'model Order { id String @id }\n',
      'scripts/generate-client.ts': "const input = 'contracts/public/openapi.json';\n",
      'src/db.ts': "import { PrismaClient } from '@prisma/client';\n",
      'notes/ignored.txt': 'not a configured contract\n',
    };
    const repository = {
      async listAllFilesAt() {
        return Object.keys(files).sort();
      },
      async readFileAt(_commitSha: string, path: string) {
        const content = files[path];
        if (!content) throw new Error(`Missing fixture ${path}`);
        return content;
      },
      async findTextAt(_commitSha: string, needles: readonly string[]) {
        return [
          ...(needles.includes('contracts/public/openapi.json')
            ? [{ path: 'scripts/generate-client.ts', line: 1 }]
            : []),
          ...(needles.includes('@prisma/client') ? [{ path: 'src/db.ts', line: 1 }] : []),
        ];
      },
    } as GitRepository;
    const context: ExtractionContext = {
      repositoryRoot: 'fixture',
      repositoryId: 'example/contracts',
      ref: 'HEAD',
      commitSha: sha,
      snapshotId: sha,
      changedPaths: ['contracts/public/openapi.json'],
      deletedPaths: [],
      renamedPaths: {},
    };
    const facts = await new RepositoryContractExtractor(
      repository,
      ['**/openapi.json', 'prisma/schema.prisma'],
      ['scripts', 'src'],
      { 'prisma/schema.prisma': ['@prisma/client'] },
    ).extract(context);
    expect(
      facts.filter((fact) => fact.predicate === 'contains').map((fact) => fact.provenance.path),
    ).toEqual(['contracts/public/openapi.json', 'openapi.json', 'prisma/schema.prisma']);
    const snapshot: GraphSnapshot = {
      manifest: {
        schemaVersion: 1,
        repositoryId: context.repositoryId,
        ref: context.ref,
        commitSha: sha,
        snapshotId: sha,
        ontologyVersion: '1',
        extractorVersions: {},
        semanticModel: 'test',
        semanticPromptVersion: 'test',
        generatedAt: '2026-01-01T00:00:00Z',
        contentDigest: 'digest',
        semanticArtifactKeys: [],
        scipIndexDigest: 'scip',
        rdfDigest: 'rdf',
      },
      facts,
      invariants: [],
      runtimeEvidence: [],
      unresolved: [],
    };
    const store = {
      async read() {
        return snapshot;
      },
      async readHead() {
        return snapshot;
      },
      async write() {},
      async updateHead() {},
    } satisfies SnapshotStore;
    const pack = await new SnapshotImpactQueryService(store, 'default').scan({
      changedFiles: ['contracts/public/openapi.json'],
    });
    expect(pack.suggestedFiles).toContain('contracts/public/openapi.json');
    expect(pack.suggestedFiles).toContain('scripts/generate-client.ts');
    expect(pack.facts[0]?.object.kind).toBe('Contract');
  });
});
