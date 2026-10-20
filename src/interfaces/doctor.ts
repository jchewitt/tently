import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from "../configuration/config.js";
import { resolveStorageRoot } from "../configuration/cache.js";
import { FileSnapshotStore } from "../storage/storage.js";

/** Reads readiness only. It never installs tools, prints credentials, or starts a model. */
export async function diagnoseSetup(configPath: string) {
  const { config, repositoryRoot } = await loadConfig(configPath);
  const execute = promisify(execFile);
  const probe = async (name: string, args: string[]) => {
    try {
      const result = await execute(name, args, { cwd: repositoryRoot, timeout: 5000, maxBuffer: 8192 });
      return { available: true, output: `${result.stdout}${result.stderr}` };
    } catch { return { available: false, output: '' }; }
  };
  const git = await probe('git', ['--version']);
  const codex = await probe(process.platform === 'win32' ? 'codex.exe' : 'codex', ['--version']);
  const authentication = codex.available
    ? await probe(process.platform === 'win32' ? 'codex.exe' : 'codex', ['login', 'status']) : undefined;
  const docker = config.ontology.backend === 'opencaesar' ? await probe('docker', ['info']) : undefined;
  const saved = await new FileSnapshotStore(resolveStorageRoot(repositoryRoot, config)).readHead('default');
  return {
    node: process.version, repositoryRoot, gitAvailable: git.available,
    savedSnapshot: saved?.manifest.snapshotId ?? null,
    semanticProvider: config.semantic.provider,
    codexAvailable: codex.available,
    codexAuthenticated: Boolean(authentication?.available && /logged in/i.test(authentication.output)),
    moduleProvider: config.semantic.provider === 'module' ? 'loaded only during extraction; trusted local code' : undefined,
    ontologyBackend: config.ontology.backend ?? 'rdf', dockerReady: docker?.available,
    limits: { maxDocuments: config.semantic.maxDocuments ?? 8, maxSourceBytes: config.semantic.maxSourceBytes ?? 65_536,
      timeoutMs: config.semantic.timeoutMs ?? 120_000, retries: config.semantic.retries ?? 0 },
    note: 'Saved evidence remains queryable without model or Docker readiness. No model request was made.',
  };
}
