import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GraphSnapshot } from '@weftlet/core';
import type { ContextGraphConfig } from '../../src/configuration/config.js';
import { resolveConsumerModule } from '../../src/infrastructure/module-resolution.js';
import { sha256, stableJson } from '../../src/infrastructure/util.js';
import type { EvaluationSuite } from './score.js';

/** Recognize the bundled no-assertion control, not just a provider's self-reported name. */
export function isDocumentControl(config: ContextGraphConfig, repositoryRoot: string, toolkitRoot: string): boolean {
  if (config.semantic.provider !== 'module' ||
      config.semantic.providerIdentity !== 'weftlet-document-only-v1') return false;
  try {
    return resolveConsumerModule(config.semantic.providerModule!, repositoryRoot) ===
      pathToFileURL(resolve(toolkitRoot, 'evaluations/weftlet/document-only.mjs')).href;
  } catch { return false; }
}

export function assertEvaluationRefreshAllowed(
  config: ContextGraphConfig, repositoryRoot: string, toolkitRoot: string,
): void {
  if (!isDocumentControl(config, repositoryRoot, toolkitRoot)) {
    throw new Error('Only the document-only control may refresh here; use --snapshot for provider evaluations');
  }
}

export function assertEvaluationSnapshot(
  snapshot: GraphSnapshot, config: ContextGraphConfig, suite: EvaluationSuite,
): void {
  if (snapshot.manifest.repositoryId !== config.repositoryId ||
      (suite.repositoryId && suite.repositoryId !== config.repositoryId) ||
      snapshot.manifest.overlayDigest ||
      snapshot.manifest.configurationDigest !== sha256(stableJson(config))) {
    throw new Error('Evaluation requires committed evidence with a matching repository, suite and configuration');
  }
}
