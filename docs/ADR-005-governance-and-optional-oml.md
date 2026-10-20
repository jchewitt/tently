# ADR 005: direct RDF by default; formal OML remains optional

Status: implemented for the standalone core.

The source used openCAESAR to compile deterministic OML, but impact queries operated on separate
JSON facts and invariant checks were TypeScript. No active OWL reasoner supplied the baseline's
query answers or CI decisions. Requiring Docker/JDK/Gradle on every hydration imposed a substantial
startup and maintenance cost without providing active reasoning to that workflow.

The default compiler now writes the asserted semantic relationships directly as RDF. It preserves
validated assertions, citations in the unified record dataset, deterministic OML artifacts and
cache identities. A parity test checks the same cited assertion in deterministic OML and asserted
RDF, and the public pipeline hydrates/reuses evidence using the real direct-RDF compiler.
This is assertion-level parity, not a claim of equivalent OWL entailments.

The explicit `ontology.backend: "opencaesar"` path and generic OML assets remain available.
`examples/generic-typescript/context-graph.oml.config.json` retains the pinned compiler image.
Formal compilation is optional and not required for core tests, query access or installation.
Live OML/OWL parity remains unverified in this environment. An active OWL reasoner is not shipped.

## Governance experiment

The canonical policy maps real source paths into domains, modules, layers, adapters and contract
owners. dependency-cruiser extracts imports and detects dependency/cycle violations; those facts
also become the RDF graph. A SPARQL `consumes+` query derives a transitive domain → adapter → UI
dependency and detects a forbidden indirect dependency in the negative fixture. Approved contract
ownership checks also reject contradictory owners.

This is a useful explicit formal inference over actual dependency facts. Direct RDF, SHACL and
deterministic policy checks provide it without an OWL runtime. Formal OML may still be useful for
external ontology interchange or richer class reasoning, but neither is needed to justify a
mandatory compiler here.

ESLint provides size/complexity signals; jscpd provides textual duplication signals. They are
advisory and require semantic review. Only approved rules with approval references become gates.
Reports separate rule violations, extraction gaps, infrastructure failures and advisory findings.
Baselines and expiring scoped exceptions require explicit entries and never advance automatically.
