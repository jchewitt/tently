import { describe, expect, it } from 'vitest';

import { sha256, slug, stableJson } from './util.js';

describe('public core utilities', () => {
  it('keeps hashes and serialized keys deterministic', () => {
    expect(stableJson({ second: 2, first: 1 })).toBe('{"first":1,"second":2}');
    expect(sha256('context-graph')).toHaveLength(64);
    expect(slug(' Product / Intent ')).toBe('product-intent');
  });
});
