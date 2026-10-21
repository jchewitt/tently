// Evaluation control: exercise document linking without synthesizing semantic assertions.
// This is not a language model or an implementation of prose comprehension.
export function createSemanticExtractor() {
  return {
    identity: 'weftlet-document-only-v1',
    async extract() {
      return {
        parsed: { assertions: [], oml: '', diagnostics: [] },
        rawModelOutput: 'No semantic assertions: deterministic document-link control.',
      };
    },
  };
}
