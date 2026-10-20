import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolve as resolveImport } from 'import-meta-resolve';

/** Match Node's import conditions, anchored at the consumer rather than toolkit dist/. */
export function resolveConsumerModule(specifier: string, repositoryRoot: string): string {
  if (isAbsolute(specifier)) return pathToFileURL(specifier).href;
  const parent = pathToFileURL(resolve(repositoryRoot, 'package.json')).href;
  return resolveImport(specifier, parent);
}
