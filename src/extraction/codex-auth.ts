// Environment allowlist adapted from the extracted semantic.ts; see docs/extraction-manifest.json.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ContextGraphConfig } from '../configuration/config.js';
import { SemanticProviderError, type SemanticRunOptions } from './semantic-process.js';

export type SemanticCommandEnvironment = Record<string, string | undefined>;

const semanticEnvironmentAllowlist = [
  'APPDATA',
  'CODEX_HOME',
  'COMSPEC',
  'HOME',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'LANG',
  'LC_ALL',
  'LOCALAPPDATA',
  'NODE_EXTRA_CA_CERTS',
  'NO_PROXY',
  'PATH',
  'PATHEXT',
  'SSL_CERT_FILE',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'WINDIR',
] as const;

export function semanticCommandEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): SemanticCommandEnvironment {
  const result: SemanticCommandEnvironment = {};
  for (const allowed of semanticEnvironmentAllowlist) {
    const match = Object.keys(source).find((key) => key.toUpperCase() === allowed);
    if (match && source[match] !== undefined) result[allowed] = source[match];
  }
  return result;
}

export type CodexLoginMode = 'chatgpt' | 'api-key' | 'unknown' | 'unavailable';
export type CodexLoginProbe = (
  command: string, environment: SemanticCommandEnvironment, options?: SemanticRunOptions,
) => Promise<CodexLoginMode>;

/** Read-only status check. Never expose output: API login status may contain key fragments. */
export const readCodexLoginMode: CodexLoginProbe = async (command, environment, options = {}) => {
  try {
    const result = await promisify(execFile)(command, ['login', 'status'], {
      env: environment, timeout: Math.min(options.timeoutMs ?? 5000, 5000),
      signal: options.signal, maxBuffer: 8192, windowsHide: true,
    });
    const output = `${result.stdout}\n${result.stderr}`;
    if (/logged in using chatgpt/i.test(output)) return 'chatgpt';
    if (/logged in using an? api key/i.test(output)) return 'api-key';
    return 'unknown';
  } catch {
    if (options.signal?.aborted) throw new SemanticProviderError('cancelled', 'Semantic extraction cancelled');
    return 'unavailable';
  }
};

type CodexAuth = ContextGraphConfig['semantic']['auth'];

/** No auth mutation or fallback. A missing key must not fall back to a saved account. */
export async function prepareCodexAuthentication(
  auth: CodexAuth, source: Readonly<Record<string, string | undefined>>,
  command: string, options: SemanticRunOptions = {}, probe: CodexLoginProbe = readCodexLoginMode,
): Promise<SemanticCommandEnvironment> {
  options.signal?.throwIfAborted();
  const environment = semanticCommandEnvironment(source);
  if (auth?.mode === 'api-key') {
    const keyName = auth.apiKeyEnv ?? 'CODEX_API_KEY';
    const key = source[keyName];
    if (!key?.trim()) throw new SemanticProviderError('unavailable',
      `Codex API-key authentication requires the ${keyName} environment variable; no login fallback was attempted`);
    environment.CODEX_API_KEY = key;
    return environment;
  }
  if (auth !== undefined && auth.mode !== 'chatgpt') {
    throw new SemanticProviderError('unavailable', 'Unsupported Codex authentication mode');
  }
  const mode = await probe(command, environment, options);
  if (mode !== 'chatgpt') throw new SemanticProviderError('unavailable',
    'ChatGPT authentication requires Codex signed in with ChatGPT (codex login). Status could not confirm that login type; no API fallback was attempted');
  return environment;
}
