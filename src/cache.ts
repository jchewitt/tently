import { homedir } from 'node:os';
import { resolve } from 'node:path';

import type { ContextGraphConfig } from './config.js';
import { sha256, stableJson } from './util.js';

export function resolveStorageRoot(
  repositoryRoot: string,
  config: ContextGraphConfig,
  userCacheRoot = resolve(homedir(), '.cache', 'context-graph'),
): string {
  if (config.storageScope !== 'user') return resolve(repositoryRoot, config.storagePath);
  const profile = sha256(stableJson({ config, checkout: resolve(repositoryRoot) })).slice(0, 20);
  return resolve(userCacheRoot, profile);
}
