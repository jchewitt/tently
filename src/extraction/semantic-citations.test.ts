// Modified for standalone extraction; see docs/extraction-manifest.json.
import { describe, expect, it } from 'vitest';

import { assertSemanticCitation, numberedSemanticSource } from "./semantic-citations.js";

describe('semantic source citations', () => {
  it.each(['\n', '\r\n'])('numbers physical lines, including blanks, for %j', (newline) => {
    const content = ['# Owner', '', 'One very long logical line | not a second line.', ''].join(
      newline,
    );
    expect(numberedSemanticSource(content)).toBe(
      '1|# Owner\n2|\n3|One very long logical line | not a second line.\n4|',
    );
  });

  it('accepts exact first/last inclusive boundaries without changing them', () => {
    const citation = { startLine: 1, endLine: 737 };
    expect(() =>
      assertSemanticCitation(citation, 'docs/owner.md', 737, 'assertion[0]'),
    ).not.toThrow();
    expect(citation).toEqual({ startLine: 1, endLine: 737 });
  });

  it.each([
    { startLine: 0, endLine: 1 },
    { startLine: 2, endLine: 1 },
    { startLine: 1, endLine: 738 },
    { startLine: 1.5, endLine: 2 },
    { startLine: 1, endLine: 2.5 },
    { startLine: NaN, endLine: 2 },
    { startLine: 1, endLine: Infinity },
  ])('rejects rather than repairs invalid range %j', (citation) => {
    expect(() => assertSemanticCitation(citation, 'docs/owner.md', 737, 'assertion[4]')).toThrow(
      `Invalid source citation for docs/owner.md: assertion[4] cites ${citation.startLine}-${citation.endLine}; expected integer lines 1-737 with startLine <= endLine`,
    );
  });
});
