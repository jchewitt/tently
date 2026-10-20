/** Display line numbers without changing the source bytes used for provenance. */
export function numberedSemanticSource(content: string): string {
  return content
    .split('\n')
    .map((line, index) => `${index + 1}|${line.replace(/\r$/, '')}`)
    .join('\n');
}

export function semanticCitationSchema(lineCount: number): object {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['startLine', 'endLine'],
    properties: {
      startLine: { type: 'integer', minimum: 1, maximum: lineCount },
      endLine: { type: 'integer', minimum: 1, maximum: lineCount },
    },
  };
}

export function assertSemanticCitation(
  citation: { readonly startLine: number; readonly endLine: number },
  path: string,
  lineCount: number,
  location: string,
): void {
  if (
    !Number.isInteger(citation.startLine) ||
    !Number.isInteger(citation.endLine) ||
    citation.startLine < 1 ||
    citation.endLine < citation.startLine ||
    citation.endLine > lineCount
  ) {
    throw new Error(
      `Invalid source citation for ${path}: ${location} cites ${citation.startLine}-${citation.endLine}; expected integer lines 1-${lineCount} with startLine <= endLine`,
    );
  }
}
