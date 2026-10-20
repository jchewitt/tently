import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, relative, resolve, sep } from 'node:path';

import type { ContextGraphConfig } from './config.js';
import type { SemanticArtifact } from './core.js';
import type { GitRepository } from './git.js';
import { runProcess } from './process.js';
import { sha256, stableJson } from './util.js';

export interface OntologyCompileResult {
  readonly root: string;
  readonly rdfFiles: readonly string[];
  readonly digest: string;
}

export interface OntologyCompiler {
  checkReady?(): Promise<void>;
  compile(
    snapshotId: string,
    artifacts: readonly SemanticArtifact[],
  ): Promise<OntologyCompileResult>;
}

type DockerProbe = (cwd: string) => Promise<string>;
const probeDocker: DockerProbe = async (cwd) => {
  const { stdout } = await promisify(execFile)('docker', ['info', '--format', '{{.OSType}}'], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
  return stdout;
};

export async function requireLinuxDocker(
  cwd: string,
  probe: DockerProbe = probeDocker,
): Promise<void> {
  try {
    if ((await probe(cwd)).trim() !== 'linux') throw new Error('Linux engine required');
  } catch (cause) {
    throw new Error(
      'Context graph Docker preflight failed: a responsive Linux Docker engine is required for openCAESAR. Start Docker Desktop (Linux containers) or repair the selected Docker context, then retry.',
      { cause },
    );
  }
}

export function dockerHostUserArguments(): readonly string[] {
  if (process.platform === 'win32' || !process.getuid || !process.getgid) return [];
  return [
    '--user',
    `${process.getuid()}:${process.getgid()}`,
    '--env',
    'GRADLE_USER_HOME=/workspace/.gradle',
  ];
}

export async function compileOntologyAtExactCheckout(
  repository: GitRepository,
  compiler: OntologyCompiler,
  ref: string,
): Promise<OntologyCompileResult> {
  const commitSha = await repository.resolveRef(ref);
  await repository.requireExactCleanCommit(commitSha);
  return compiler.compile(commitSha, []);
}

export function renderGeneratedOntologyRoot(
  artifacts: readonly SemanticArtifact[],
  usedVocabularyIris: readonly string[] = [],
  includedDescriptionIris: readonly string[] = [],
): string {
  const generatedImports = artifacts
    .filter((artifact) => artifact.oml.trim())
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((artifact) => `  includes <https://context-graph.dev/generated/${artifact.key}#>`);
  const vocabularyImports = ['https://context-graph.dev/core#', ...usedVocabularyIris]
    .filter((iri, index, values) => values.indexOf(iri) === index)
    .map((iri) => `  uses <${iri}>`);
  const staticImports = [...includedDescriptionIris].sort().map((iri) => `  includes <${iri}>`);
  return [
    'description bundle <https://context-graph.dev/generated/snapshot#> as snapshot {',
    ...vocabularyImports,
    ...staticImports,
    ...generatedImports,
    '}',
  ].join('\n');
}

async function listRdfFiles(root: string): Promise<readonly string[]> {
  const files: string[] = [];
  async function visit(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (/\.(ttl|nt|rdf|owl)$/i.test(entry.name)) files.push(child);
    }
  }
  await visit(root);
  return files.sort();
}

export class OpenCaesarOntologyCompiler implements OntologyCompiler {
  constructor(
    private readonly config: ContextGraphConfig['ontology'],
    private readonly repositoryRoot: string,
    private readonly storageRoot: string,
  ) {}

  checkReady(): Promise<void> {
    return requireLinuxDocker(this.repositoryRoot);
  }

  async compile(
    snapshotId: string,
    artifacts: readonly SemanticArtifact[],
  ): Promise<OntologyCompileResult> {
    await this.checkReady();
    const source = resolve(this.repositoryRoot, this.config.projectPath);
    const work = join(this.storageRoot, 'work', `ontology-${snapshotId}`);
    await rm(work, { recursive: true, force: true });
    await mkdir(dirname(work), { recursive: true });
    const sourceBuild = join(source, 'build');
    await cp(source, work, {
      recursive: true,
      filter: (path) => path !== sourceBuild && !path.startsWith(`${sourceBuild}${sep}`),
    });
    const generatedRoot = join(work, 'src', 'oml', 'context-graph.dev', 'generated');
    await mkdir(generatedRoot, { recursive: true });
    for (const artifact of artifacts) {
      if (!artifact.oml.trim()) continue;
      await writeFile(
        join(generatedRoot, `${artifact.key}.oml`),
        `${artifact.oml.trim()}\n`,
        'utf8',
      );
    }
    await writeFile(
      join(generatedRoot, 'snapshot.oml'),
      `${renderGeneratedOntologyRoot(
        artifacts,
        this.config.usedVocabularyIris,
        this.config.includedDescriptionIris,
      )}\n`,
      'utf8',
    );
    const dockerPath = work.replace(/\\/g, '/');
    await runProcess(
      'docker',
      [
        'run',
        '--rm',
        ...dockerHostUserArguments(),
        '-v',
        `${dockerPath}:/workspace`,
        '-w',
        '/workspace',
        this.config.containerImage,
        'gradle',
        '--no-daemon',
        'clean',
        'oml2owl',
      ],
      this.repositoryRoot,
    );
    const rdfRoot = join(work, 'build', 'rdf');
    const rdfFiles = await listRdfFiles(rdfRoot);
    if (rdfFiles.length === 0) throw new Error('openCAESAR produced no RDF files');
    const digestParts = await Promise.all(
      rdfFiles.map(async (path) => ({
        path: relative(rdfRoot, path),
        content: await readFile(path, 'utf8'),
      })),
    );
    return { root: rdfRoot, rdfFiles, digest: sha256(stableJson(digestParts)) };
  }
}
