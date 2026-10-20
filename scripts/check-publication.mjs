// Modified for standalone extraction; see docs/extraction-manifest.json.
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const toolkitRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packages = [
  ['@launchecho/context-graph-core', resolve(toolkitRoot, 'packages', 'core')],
  ['@launchecho/context-graph-toolkit', toolkitRoot],
];

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() || result.stdout.trim() || `${command} exited ${result.status}`,
    );
  }
  return result.stdout;
}

function runPnpm(args, cwd) {
  const npmExecutable = process.env.npm_execpath;
  const command = npmExecutable
    ? process.execPath
    : process.platform === 'win32'
      ? 'pnpm.cmd'
      : 'pnpm';
  const commandArgs = npmExecutable ? [npmExecutable, ...args] : args;
  return run(command, commandArgs, cwd);
}

const destination = await mkdtemp(join(tmpdir(), 'context-graph-pack-'));
try {
  const archives = new Map();
  for (const [expectedName, directory] of packages) {
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    if (manifest.name !== expectedName || manifest.private === true) {
      throw new Error(`${directory} is not configured as publishable ${expectedName}`);
    }
    if (manifest.license !== 'Apache-2.0' || manifest.publishConfig?.access !== 'public') {
      throw new Error(`${expectedName} must publish as public Apache-2.0 software`);
    }
    const before = new Set(await readdir(destination));
    runPnpm(['pack', '--pack-destination', destination], directory);
    const archiveName = (await readdir(destination)).find((entry) => !before.has(entry));
    if (!archiveName) throw new Error(`${expectedName} did not produce a package archive`);
    const archivePath = join(destination, archiveName);
    archives.set(expectedName, archivePath);
    const entries = run('tar', ['-tf', archivePath], directory).split(/\r?\n/);
    for (const required of [
      'package/package.json',
      'package/LICENSE',
      'package/NOTICE',
      'package/README.md',
      'package/THIRD_PARTY_NOTICES.md',
      'package/dist/index.js',
      'package/dist/index.d.ts',
    ]) {
      if (!entries.includes(required))
        throw new Error(`${expectedName} archive is missing ${required}`);
    }
    if (expectedName.endsWith('-toolkit')) {
      for (const asset of [
        'dist/cli.js', 'dist/mcp.js',
        'examples/generic-typescript/context-graph.config.json',
        'examples/generic-typescript/ontology/build.gradle',
        'examples/generic-typescript/ontology/src/oml/context-graph.dev/core.oml',
        'templates/context-graph-development/SKILL.md',
      ]) {
        if (!entries.includes(`package/${asset}`)) throw new Error(`Missing runtime asset: ${asset}`);
      }
    }
    if (entries.some((entry) => /(?:^|\/)(?:\.git|\.env|\.context-graph|node_modules)(?:\/|$)/.test(entry))) {
      throw new Error('Archive contains forbidden local state');
    }
    const packedManifest = JSON.parse(
      run('tar', ['-xOf', archivePath, 'package/package.json'], directory),
    );
    const ranges = [
      ...Object.values(packedManifest.dependencies ?? {}),
      ...Object.values(packedManifest.devDependencies ?? {}),
    ];
    if (ranges.some((range) => String(range).startsWith('workspace:'))) {
      throw new Error(`${expectedName} archive retains an unpublished workspace dependency range`);
    }
  }

  const coreArchive = archives.get('@launchecho/context-graph-core');
  const toolkitArchive = archives.get('@launchecho/context-graph-toolkit');
  if (!coreArchive || !toolkitArchive) throw new Error('Publication smoke archives are incomplete');
  const consumer = join(destination, 'consumer');
  await mkdir(join(consumer, 'src'), { recursive: true });
  const fileDependency = (path) => `file:${path.replaceAll('\\', '/')}`;
  await Promise.all([
    writeFile(join(consumer, '.gitignore'), 'node_modules/\n.context-graph/\n'),
    writeFile(
      join(consumer, 'package.json'),
      `${JSON.stringify(
        {
          name: 'context-graph-publication-smoke',
          private: true,
          type: 'module',
          dependencies: {
            '@launchecho/context-graph-core': fileDependency(coreArchive),
            '@launchecho/context-graph-toolkit': fileDependency(toolkitArchive),
          },
          pnpm: {
            overrides: {
              '@launchecho/context-graph-core': fileDependency(coreArchive),
            },
          },
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      join(consumer, 'tsconfig.json'),
      `${JSON.stringify(
        {
          compilerOptions: {
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            target: 'ES2022',
            strict: true,
          },
          include: ['src/**/*.ts'],
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(join(consumer, 'src', 'contract.ts'), 'export interface Greeting { text: string }\n'),
    writeFile(
      join(consumer, 'src', 'consumer.ts'),
      "import type { Greeting } from './contract.js';\nexport const greeting: Greeting = { text: 'hello' };\n",
    ),
  ]);
  runPnpm(['install', '--prefer-offline', '--ignore-scripts', '--no-frozen-lockfile'], consumer);
  const staticModule = pathToFileURL(
    join(consumer, 'node_modules', '@launchecho', 'context-graph-toolkit', 'dist', 'static.js'),
  ).href;
  const toolkitModule = pathToFileURL(
    join(consumer, 'node_modules', '@launchecho', 'context-graph-toolkit', 'dist', 'index.js'),
  ).href;
  await writeFile(
    join(consumer, 'smoke.mjs'),
    `import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ScipSymbolExtractor, ScipTypeScriptIndexer } from ${JSON.stringify(staticModule)};
import { renderContextPackVisualization, RdfEvidenceGraph, CG } from ${JSON.stringify(toolkitModule)};

const root = process.cwd();
const context = {
  repositoryRoot: root,
  repositoryId: 'publication-smoke',
  ref: 'HEAD',
  commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  snapshotId: 'publication-smoke',
  changedPaths: [],
  deletedPaths: [],
  renamedPaths: {},
};
const index = await new ScipTypeScriptIndexer(
  {
    version: '0.4.0',
    command: 'bundled-scip-typescript',
    args: ['index', '--no-global-caches', 'tsconfig.json'],
  },
  join(root, '.context-graph'),
).index(context);
const repository = {
  readFileAt: async (_commitSha, path) => readFile(join(root, path), 'utf8'),
  listFilesAt: async () => [],
};
const facts = await new ScipSymbolExtractor(repository, index).extract(context);
if (!index.digest || facts.length < 2) {
  throw new Error('Installed toolkit did not index and parse the SCIP fixture');
}
const graph = new RdfEvidenceGraph({ manifest: { schemaVersion:1, repositoryId:'publication-smoke',ref:'HEAD',commitSha:context.commitSha,snapshotId:context.snapshotId,contentDigest:index.digest,generatedAt:'2026-01-01',ontologyVersion:'rdf-v1',extractorVersions:{},semanticModel:'none',semanticPromptVersion:'none',semanticArtifactKeys:[],scipIndexDigest:index.digest,rdfDigest:'' }, facts, invariants:[],runtimeEvidence:[],unresolved:[] });
if (!(await graph.validate()).conforms) throw new Error('Installed SHACL validation failed');
const selected = await graph.select('SELECT ?record WHERE { ?record <' + CG + 'authority> ?authority }');
if (selected.rows.length !== facts.length || (await graph.facts()).length !== facts.length) throw new Error('Installed RDF projection/query mismatch');
const pack = {
  snapshot: { snapshotId: context.snapshotId, commitSha: context.commitSha, contentDigest: index.digest },
  capabilities: [],
  facts,
  invariants: [],
  runtimeEvidence: [],
  suggestedFiles: ['src/contract.ts', 'src/consumer.ts'],
  coverage: {
    counts: {
      productIntent: 0,
      contractsAndInvariants: 0,
      implementationAndConsumers: facts.length,
      validationEvidence: 0,
    },
    gaps: ['No product intent is expected in this implementation-only smoke fixture.'],
  },
  diagnostics: {
    ...Object.fromEntries(['missingIntent', 'ambiguousIntent', 'implementationGaps', 'runtimeGaps', 'drift']
      .map((kind) => [kind, { items: [], omittedRelevant: 0, omittedUnrelated: 0 }])),
    unclassifiedLegacyCount: 0,
  },
  markdown: '# Context Pack',
};
for (const [format, marker] of [['html', '<!doctype html>'], ['dot', 'digraph ContextPack'], ['svg', '<svg']]) {
  if (!renderContextPackVisualization(pack, format).includes(marker)) {
    throw new Error('Installed toolkit did not render the ' + format + ' Context Pack visualization');
  }
}
`,
  );
  run('git', ['init', '--quiet'], consumer);
  run('git', ['add', '.'], consumer);
  run(
    'git',
    [
      '-c',
      'user.name=Publication Smoke',
      '-c',
      'user.email=smoke@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'Create exact-commit smoke fixture',
    ],
    consumer,
  );
  run(process.execPath, ['smoke.mjs'], consumer);
  const installedRoot = join(consumer, 'node_modules', '@launchecho', 'context-graph-toolkit');
  const config = JSON.parse(await readFile(
    join(installedRoot, 'examples/generic-typescript/context-graph.config.json'), 'utf8',
  ));
  await writeFile(join(consumer, 'context-graph.config.json'), JSON.stringify(config));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(installedRoot, 'dist/mcp.js')],
    cwd: consumer,
    env: { ...process.env, CONTEXT_GRAPH_CONFIG: join(consumer, 'context-graph.config.json') },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'installed-smoke', version: '1.0.0' });
  try {
    await client.connect(transport);
    if (client.getServerVersion()?.name !== 'context-graph') throw new Error('MCP initialization failed');
    const tools = await client.listTools();
    if (!tools.tools.some((tool) => tool.name === 'impact.scan')) throw new Error('Missing impact.scan');
    const result = await client.callTool({ name: 'impact.scan', arguments: { capabilities: ['search'] } });
    if (!result.isError || !JSON.stringify(result).includes('snapshot')) {
      throw new Error('Empty installed consumer must report missing snapshot honestly');
    }
  } finally {
    await client.close();
  }
  console.log('Installed consumer: runtime assets, TypeScript indexing, SCIP facts, RDF/SPARQL/SHACL, HTML/DOT/SVG and MCP passed.');
} finally {
  await rm(destination, { recursive: true, force: true });
}
