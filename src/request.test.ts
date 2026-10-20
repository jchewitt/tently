// Modified for standalone extraction; see docs/extraction-manifest.json.
import { describe, expect, it } from 'vitest';

import { parseImpactScanRequest } from './request.js';

describe('impact.scan request validation', () => {
  it('accepts the documented request and rejects unchecked casts', () => {
    expect(
      parseImpactScanRequest({ ownerDocument: 'docs/intent/exit.md', maxFacts: 40 }),
    ).toEqual(expect.objectContaining({ ownerDocument: 'docs/intent/exit.md', maxFacts: 40 }));
    expect(() => parseImpactScanRequest({ maxFacts: '40' })).toThrow('maxFacts');
    expect(() => parseImpactScanRequest({ surprise: true })).toThrow('Unknown impact.scan fields');
    expect(() => parseImpactScanRequest({ changedFiles: [42] })).toThrow('changedFiles');
  });
});
