import type { ContextGraphConfig } from './config.js';
import type { ExtractionContext, SemanticSource } from './core.js';
import { CodexCliSemanticExtractor, SemanticProviderError, type SemanticExtractor, type SemanticRunOptions } from './semantic.js';
import { sha256, stableJson } from './util.js';
import { resolveConsumerModule } from './module-resolution.js';

export interface SemanticProviderModule {
  /** Trusted local code. Providers must honor abort signals and never log private inputs. */
  createSemanticExtractor(config: ContextGraphConfig['semantic'], options?: SemanticRunOptions): SemanticExtractor | Promise<SemanticExtractor>;
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
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(new SemanticProviderError('timeout', 'Semantic module execution timed out')),
        options.timeoutMs ?? config.timeoutMs ?? 120_000);
      const signal = AbortSignal.any([deadline.signal,
        ...(options.signal ? [options.signal] : [])]);
      const abortError = () => deadline.signal.aborted ? deadline.signal.reason :
        new SemanticProviderError('cancelled', 'Semantic module execution cancelled');
      const checkpoint = () => { if (signal.aborted) throw abortError(); };
      let onAbort: () => void = () => {};
      try {
        return await Promise.race([
          new Promise<never>((_resolve, reject) => {
            onAbort = () => reject(abortError());
            signal.addEventListener('abort', onAbort, { once: true });
            if (signal.aborted) onAbort();
          }),
          Promise.resolve().then(async () => {
            checkpoint();
            if (!extractor) {
              const module = await import(resolveConsumerModule(modulePath, repositoryRoot)) as Partial<SemanticProviderModule>;
              checkpoint();
              if (typeof module.createSemanticExtractor !== 'function') throw new Error('Provider module must export createSemanticExtractor(config)');
              const candidate = await module.createSemanticExtractor(config, { ...options, signal });
              checkpoint();
              if (candidate?.identity !== config.providerIdentity || typeof candidate.extract !== 'function') {
                throw new Error('Provider identity/contract does not match configuration');
              }
              extractor = candidate;
            }
            checkpoint();
            const result = await extractor.extract(source, context, { ...options, signal });
            checkpoint();
            return result;
          }),
        ]);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
      }
    },
  };
}
