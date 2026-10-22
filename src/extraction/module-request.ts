import { posix } from 'node:path';
import type { GraphNode } from '@weftlet/core';
import { sha256, stableJson } from '../infrastructure/util.js';

/** Identity of a literal module request, not a resolved implementation or an existence check. */
export function moduleRequestNode(importer: string, specifier: string): GraphNode {
  const relative = specifier === '.' || specifier === '..' ||
    specifier.startsWith('./') || specifier.startsWith('../');
  if (!relative) return { id: `contract:module:${specifier}`, kind: 'Contract', label: specifier };

  // Git paths use POSIX separators on every host. Do not interpret loader suffixes, escapes,
  // encoded paths or requests outside this repository as canonical local destinations.
  const location = posix.normalize(posix.join(posix.dirname(importer), specifier));
  const opaque = /[\\%?#\x00-\x1f\x7f-\x9f]/.test(specifier) || importer.includes('\\') ||
    location === '..' || location.startsWith('../') || posix.isAbsolute(location);
  if (opaque) return {
    id: `contract:module:./?${sha256(stableJson({ importer, specifier }))}`,
    kind: 'Contract', label: `${specifier} (from ${importer})`,
    attributes: { identityScope: 'importer-local-request', resolution: 'unresolved' },
  };
  // The ./ prefix cannot collide with a bare import; ? is reserved for opaque identities.
  // Encode the location so distinct literal path characters cannot act as ID delimiters.
  return { id: `contract:module:./${encodeURIComponent(location)}`, kind: 'Contract',
    label: `./${location}`,
    attributes: { identityScope: 'repository-relative-request', resolution: 'unresolved' } };
}
