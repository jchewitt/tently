import type { GraphFact } from "@weftlet/core";

export function contextPackEvidenceAuthority(
  fact: GraphFact,
): 'declared' | 'implemented' | 'observed' | 'validated' | 'inferred' | 'draft' {
  if (fact.authority) return fact.authority;
  if (fact.extractor.id === 'otlp-runtime-evidence') return 'observed';
  if (fact.extractor.id.startsWith('codex-cli:')) return 'inferred';
  if (fact.subject.kind === 'Evidence' || fact.object.kind === 'Evidence' ||
      /(?:^|\/)(?:test|tests|testing|validation|evidence)(?:\/|$)/.test(fact.provenance.path) ||
      /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(fact.provenance.path)) return 'validated';
  return 'implemented';
}
