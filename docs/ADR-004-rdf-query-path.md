# ADR 004: a lossless RDF dataset shared by queries and validation

Status: implemented.

Immutable JSON snapshots remain the storage envelope. Each cited fact projects losslessly into
an RDF named graph, with reified provenance, authority, confidence, source digest, scope and
configuration metadata. A structured record preserves compatibility fields. The traversal
projection is read through SPARQL and has field-for-field equivalence tests, including order.
The viewer consumes the resulting Context Pack, not an independently extracted graph.

Comunica executes local SELECT queries. Parsed queries reject remote SERVICE/dataset access
and updates. `rdf-validate-shacl` checks structural integrity and identity-kind consistency.
Validation failures are extraction gaps, not proof of product-policy violations.
The direct command is `context-graph sparql --query-file query.rq --snapshot <id>`.
`context-graph validate --snapshot <id>` emits the SHACL report.

`impact.scan` defaults to 32 traversal hops, allows 1–128, and reports the reached scope,
depth exhaustion, result truncation and snapshot/query-bound continuation tokens. Page through
results using `--continuation`. Depth exhaustion requires an explicit larger `--max-depth`;
the result never represents that partial traversal as complete.
The graph projection itself has a fail-closed 100,000-fact bound.

Only paths explicitly listed in `approvedIntentSources` can produce declared intent.
Other model-derived assertions, including legacy Codex records without authority, remain inferred.
Approval is configuration controlled by the owner, never decided by a model.

The public pipeline example has six asynchronous stages, shared message types and a runtime
test. Deterministic tests parse the example prose through a test provider, run real SCIP,
hydrate/link the sources, and retrieve downstream implementations/contracts/tests. This proves
the extraction and linkage plumbing, not live model comprehension.

RDF validation does not activate OWL reasoning or make compiled OML the query backend.
That compiler decision is a separate milestone. SPARQLJS 3.7.4 is pinned for syntax inspection
and is also a Comunica transitive dependency; upstream marks it deprecated, so replacement
should be evaluated on the next query-engine upgrade.
