import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import type { ContextGraphConfig } from './config.js';
import type { ExtractionContext, SemanticSource } from './core.js';
import { CodexCliSemanticExtractor, type SemanticExtractor, type SemanticRunOptions } from './semantic.js';
import { sha256, stableJson } from './util.js';

export interface SemanticProviderModule {
  /** Trusted local code. Providers must honor abort signals and never log private inputs. */
  createSemanticExtractor(config: ContextGraphConfig['semantic']): SemanticExtractor | Promise<SemanticExtractor>;
}

/** Lazy loading ensures a missing provider cannot disable saved-evidence queries. */
export function createSemanticExtractor(config: ContextGraphConfig['semantic'], repositoryRoot: string): SemanticExtractor {
  if (config.provider === 'codex-cli') return new CodexCliSemanticExtractor(config);
  const modulePath = config.providerModule!;
  const identity = `${config.providerIdentity}:${sha256(stableJson(config))}:contract-v2`;
  let extractor: SemanticExtractor | undefined;
  return {
    identity,
    async extract(source: SemanticSource, context: ExtractionContext, options: SemanticRunOptions = {}) {
      options.signal?.throwIfAborted();
      if (!extractor) {
        const require = createRequire(pathToFileURL(resolve(repositoryRoot, 'package.json')));
        const url = pathToFileURL(modulePath.startsWith('.') || modulePath.startsWith('/')
          ? resolve(repositoryRoot, modulePath) : require.resolve(modulePath)).href;
        const module = await import(url) as Partial<SemanticProviderModule>;
        if (typeof module.createSemanticExtractor !== 'function') throw new Error('Provider module must export createSemanticExtractor(config)');
        extractor = await module.createSemanticExtractor(config);
        if (extractor.identity !== config.providerIdentity || typeof extractor.extract !== 'function') {
          extractor = undefined;
          throw new Error('Provider identity/contract does not match configuration');
        }
      }
      const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? config.timeoutMs ?? 120_000),
        ...(options.signal ? [options.signal] : [])]);
      let onAbort: () => void = () => {};
      try {
        return await Promise.race([
          extractor.extract(source, context, { ...options, signal }),
          new Promise<never>((_resolve, reject) => {
            onAbort = () => reject(new Error('Semantic module execution cancelled or timed out'));
            signal.addEventListener('abort', onAbort, { once: true });
            if (signal.aborted) onAbort();
          }),
        ]);
      } finally { signal.removeEventListener('abort', onAbort); }
    },
  };
}
