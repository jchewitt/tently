import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from "../configuration/config.js";
import { resolveStorageRoot } from "../configuration/cache.js";
import { FileSnapshotStore } from "../storage/storage.js";
import { resolveCodexInvocation } from '../extraction/codex-command.js';
import { readCodexLoginMode, semanticCommandEnvironment } from '../extraction/codex-auth.js';

/** Reads readiness only. It never installs tools, prints credentials, or starts a model. */
export async function diagnoseSetup(configPath: string) {
  const { config, repositoryRoot } = await loadConfig(configPath);
  const execute = promisify(execFile);
  const environment = semanticCommandEnvironment(process.env);
  const probe = async (name: string, args: string[]) => {
    try {
      const invocation = name === 'codex' ? await resolveCodexInvocation(name, environment) : { command: name, prefixArgs: [] };
      const result = await execute(invocation.command, [...invocation.prefixArgs, ...args], {
        cwd: repositoryRoot, timeout: 5000, maxBuffer: 8192, windowsHide: true, env: name === 'codex' ? environment : process.env,
      });
      return { available: true, output: `${result.stdout}${result.stderr}` };
    } catch { return { available: false, output: '' }; }
  };
  const git = await probe('git', ['--version']);
  const codex = await probe('codex', ['--version']);
  const auth = config.semantic.auth;
  const authMode = config.semantic.provider === 'codex-cli' ? auth?.mode ?? 'chatgpt' : undefined;
  const apiKeyEnv = auth?.mode === 'api-key' ? auth.apiKeyEnv ?? 'CODEX_API_KEY' : undefined;
  const apiKeyPresent = apiKeyEnv ? Boolean(process.env[apiKeyEnv]?.trim()) : undefined;
  const loginMode = codex.available && authMode === 'chatgpt'
    ? await readCodexLoginMode('codex', environment)
    : undefined;
  const docker = config.ontology.backend === 'opencaesar' ? await probe('docker', ['info']) : undefined;
  const saved = await new FileSnapshotStore(resolveStorageRoot(repositoryRoot, config)).readHead('default');
  return {
    node: process.version, repositoryRoot, gitAvailable: git.available,
    savedSnapshot: saved?.manifest.snapshotId ?? null,
    semanticProvider: config.semantic.provider,
    codexAvailable: codex.available,
    codexAuthMode: authMode,
    codexLoginMode: loginMode,
    codexApiKeyEnv: apiKeyEnv,
    codexApiKeyPresent: apiKeyPresent,
    codexAuthenticated: authMode === 'chatgpt' ? loginMode === 'chatgpt' : null,
    codexAuthStatus: authMode === 'api-key' ? (apiKeyPresent ? 'key-present-unverified' : 'missing-key')
      : authMode === 'chatgpt' ? (loginMode === 'chatgpt' ? 'chatgpt-login-present' : 'chatgpt-login-required') : 'not-applicable',
    moduleProvider: config.semantic.provider === 'module' ? 'loaded only during extraction; trusted local code' : undefined,
    ontologyBackend: config.ontology.backend ?? 'rdf', dockerReady: docker?.available,
    limits: { maxDocuments: config.semantic.maxDocuments ?? 8, maxSourceBytes: config.semantic.maxSourceBytes ?? 65_536,
      timeoutMs: config.semantic.timeoutMs ?? 120_000, retries: config.semantic.retries ?? 0 },
    note: 'Saved evidence remains queryable without model or Docker readiness. No model request was made.',
  };
}
