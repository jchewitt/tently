import { lstat, mkdir, readFile, appendFile, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import type { ContextGraphConfig } from './config.js';

export interface InitOptions {
  directory?: string;
  configPath?: string;
  repositoryId?: string;
  codeRoots?: string[];
  semanticSources?: string[];
  evidenceRoots?: string[];
  model?: string;
  gitignore?: boolean;
}

const toPosix = (path: string) => path.replace(/\\/g, '/');

async function present(path: string): Promise<boolean> {
  try { await lstat(path); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Creates local configuration only; no provider, indexer, Git mutation or install is invoked. */
export async function prepareProjectConfig(options: InitOptions = {}) {
  const root = resolve(options.directory ?? '.');
  const configPath = resolve(root, options.configPath ?? 'context-graph.config.json');
  let packageName: string | undefined;
  if (await present(resolve(root, 'package.json'))) {
    const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
    if (typeof manifest.name === 'string' && manifest.name.trim()) packageName = manifest.name;
  }
  const repositoryId = options.repositoryId ?? packageName ?? basename(root);
  if (!repositoryId.trim()) throw new Error('Repository ID must not be empty');
  const paths = (values: string[]) => values.map((path) => {
    const normalized = toPosix(path).replace(/^\.\//, '');
    if (!normalized || normalized.startsWith('/') || isAbsolute(path) || /^[A-Za-z]:/.test(normalized) ||
        normalized.split('/').includes('..')) throw new Error(`Source paths must stay within the repository: ${path}`);
    return normalized;
  });
  const detectedEvidence = [];
  for (const candidate of ['test', 'tests', '__tests__']) {
    if (await present(resolve(root, candidate))) detectedEvidence.push(candidate);
  }
  const config: ContextGraphConfig = {
    schemaVersion: 1,
    repositoryRoot: toPosix(relative(dirname(configPath), root)) || '.',
    repositoryId,
    namespace: `https://example.test/context/${encodeURIComponent(repositoryId)}/`,
    semanticSources: paths(options.semanticSources ?? []),
    approvedIntentSources: [],
    codeRoots: paths(options.codeRoots ?? [await present(resolve(root, 'src')) ? 'src' : '.']),
    contractPatterns: [],
    evidenceRoots: paths(options.evidenceRoots ?? detectedEvidence),
    semantic: {
      provider: 'codex-cli', model: options.model ?? 'gpt-6-astra', reasoningEffort: 'medium',
      promptVersion: 'generic-semantic-v3', extractorVersion: '1.1.0', adapterVersion: '1.1.0',
      ontologyVersion: '1.1.0', minimumConfidence: 0.7, failOnUnresolved: true, concurrency: 1,
      maxDocuments: 8, maxSourceBytes: 65_536, timeoutMs: 120_000, retries: 0,
    },
    scip: { version: '0.4.0', command: 'bundled-scip-typescript',
      args: ['index', '--no-global-caches', '--infer-tsconfig'] },
    ontology: { backend: 'rdf', toolVersion: 'rdf-record-v1' },
    runtimeEvidence: [], storagePath: '.context-graph',
  };
  if (!config.semantic.model.trim()) throw new Error('Model must not be empty');
  return { root, configPath, config };
}

export async function initializeProject(options: InitOptions = {}) {
  const prepared = await prepareProjectConfig(options);
  const { root, configPath, config } = prepared;
  if (await present(configPath)) throw new Error(`Configuration already exists: ${configPath}. Edit it or choose another --config path.`);
  const ignorePath = resolve(root, '.gitignore');
  if (configPath === ignorePath) throw new Error('Configuration cannot replace .gitignore');
  let ignoreContent = '';
  if (options.gitignore !== false && await present(ignorePath)) {
    if (!(await lstat(ignorePath)).isFile()) throw new Error('.gitignore must be a regular file');
    ignoreContent = await readFile(ignorePath, 'utf8');
  }
  await mkdir(dirname(configPath), { recursive: true });
  // Exclusive creation prevents a second initializer from overwriting a concurrent writer.
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' });
  const ignoresStorage = ignoreContent.split(/\r?\n/).some((line) =>
    ['.context-graph', '.context-graph/', '/.context-graph', '/.context-graph/'].includes(line.trim()));
  if (options.gitignore !== false && !ignoresStorage) {
    const newline = ignoreContent.includes('\r\n') ? '\r\n' : '\n';
    await appendFile(ignorePath, `${ignoreContent && !ignoreContent.endsWith('\n') ? newline : ''}.context-graph/${newline}`);
  }
  return prepared;
}

/** TTY prompts are optional; automation uses --yes and explicit source flags. */
export async function runInit(args: readonly string[]): Promise<void> {
  const values = new Map<string, string[]>();
  const flags = new Set(['--yes', '--no-gitignore']);
  const valued = new Set(['--directory', '--config', '--repository-id', '--code-root', '--semantic-source', '--evidence-root', '--model']);
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (flags.has(key)) continue;
    if (!valued.has(key)) throw new Error(`Unknown init option: ${key}`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`);
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const one = (key: string) => {
    const entries = values.get(key);
    if (entries && entries.length > 1) throw new Error(`${key} may only be supplied once`);
    return entries?.[0];
  };
  const options: InitOptions = {
    directory: one('--directory'), configPath: one('--config'), repositoryId: one('--repository-id'),
    model: one('--model'), codeRoots: values.get('--code-root'), semanticSources: values.get('--semantic-source'),
    evidenceRoots: values.get('--evidence-root'), gitignore: !args.includes('--no-gitignore'),
  };
  if (!args.includes('--yes')) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Non-interactive setup requires --yes. Use --semantic-source <path> to select documents explicitly.');
    const defaults = await prepareProjectConfig(options);
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      process.stdout.write('Set up a TypeScript context graph. Documents are opt-in; source approval is configured separately.\n');
      if (!options.repositoryId) options.repositoryId = (await prompt.question(`Repository ID [${defaults.config.repositoryId}]: `)).trim() || defaults.config.repositoryId;
      if (!options.codeRoots) {
        const answer = (await prompt.question(`Code roots, comma-separated [${defaults.config.codeRoots.join(', ')}]: `)).trim();
        if (answer) options.codeRoots = answer.split(',').map((path) => path.trim()).filter(Boolean);
      }
      if (!options.semanticSources) {
        const answer = (await prompt.question('Document paths, comma-separated [none]: ')).trim();
        options.semanticSources = answer ? answer.split(',').map((path) => path.trim()).filter(Boolean) : [];
      }
      if (!options.model) options.model = (await prompt.question(`Codex model [${defaults.config.semantic.model}]: `)).trim() || defaults.config.semantic.model;
      const confirm = (await prompt.question(`Write ${defaults.configPath}${options.gitignore ? ' and update .gitignore' : ''}? [Y/n]: `)).trim();
      if (confirm && !/^y(?:es)?$/i.test(confirm)) {
        process.stdout.write('Setup cancelled; no files written.\n');
        return;
      }
    } finally { prompt.close(); }
  }
  const result = await initializeProject(options);
  process.stdout.write(`Created ${result.configPath}\n`);
  process.stdout.write(`Selected ${result.config.semanticSources.length} document paths; approved intent sources: none.\n`);
  process.stdout.write('Review the configuration, select any contracts and owner-approved documents, and commit the inputs you want indexed.\n');
  const configArg = JSON.stringify(result.configPath);
  process.stdout.write(`Next: npx @launch-echo/tently doctor --config ${configArg}\nThen: npx @launch-echo/tently hydrate --config ${configArg} --ref HEAD\n`);
  process.stdout.write('Hydration with selected documents uses Codex and may incur model charges. Setup made no model requests.\n');
}
