# ADR 014: explicit routing declarations

Status: implemented as an opt-in source of candidate dependencies. No query ranking change.

The frozen dispatch evaluation has an archival consumer with no shared TypeScript symbol
or extracted route from its producer. Matching topic strings cannot establish a subscription,
particularly across environments, filters and consumer groups. A source change can therefore
have an operational consumer that static imports alone do not retrieve.

This increment accepts a small, explicit Weftlet mapping format. It does not parse a broker's
deployment configuration or verify a running subscription. The configuration selects exact
committed files through `routingSources`; no directory expansion, glob, network request or
working-checkout read occurs during committed hydration. Future deployment-format adapters
can supply stronger evidence separately without changing this declaration's meaning.

## Configuration and source format

Add the optional field to `context-graph.config.json`:

```json
{ "routingSources": ["routing/events.json"] }
```

Commit a source such as `routing/events.json`:

```json
{
  "schemaVersion": 1,
  "routes": [
    {
      "id": "archive-completion",
      "scope": "example/dispatch",
      "channel": "dispatch.completed.v1",
      "producer": "src/dispatch/executor.ts",
      "consumer": "src/archive/consumer.ts"
    }
  ]
}
```

Paths are exact, case-sensitive repository-relative names of regular committed files. No
suffix substitution, basename guessing, symbol resolution or endpoint behavior check occurs.
IDs, scopes and channel labels are literal, case-sensitive strings. Scope distinguishes the
context in which the mapping was written; it is not proof that an environment is deployed.
There are at most 16 source files, 64 KiB per file and 500 declarations in total. Unknown
fields and duplicate JSON keys are rejected. Filters, wildcards and consumer-group semantics
are unsupported; write only the explicit endpoint mapping this format can represent.

Run `weftlet config validate`, commit the source, then explicitly `weftlet hydrate --ref HEAD`.
Configuration validation checks source selection; hydration validates the selected committed
content. With `semanticSources: []`, this routing extraction makes no model requests.

## Identity, citations and authority

Each `(repositoryId, scope, id)` identifies one binding Workflow node. The channel is an
attribute, not a shared join key. The producer `emits` that binding and the binding
`routesThrough` its consumer. Separate records do not imply every producer delivers to every
consumer with the same topic name. Shared endpoint files can still connect bindings because
an implementation change may affect more than one declared relationship.

Both facts cite the entire committed JSON source with path, line span, content digest and
commit SHA. Binding attributes identify the record. The citation proves what the mapping
declares; file existence does not prove that code publishes, subscribes or delivers an event.
`routing-declaration-extractor@1.0.0` emits `authority: inferred`,
`sourceAuthority: inferred`, and `extractionReview: deterministic`. Confidence 1 describes
faithful parsing of an explicit declaration, not delivery confidence. Even matching
`approvedIntentSources` does not promote these mappings into approved product intent.
No runtime observation or successful test result is synthesized.

The same facts flow through RDF/SPARQL, SHACL, impact queries and visualization. Facts do
not require a separate query projection or routing-specific ranking preference. A matching
file returned through these facts is a candidate dependency with declaration provenance.

## Failure and editing behavior

Malformed, absent or non-regular configured source files fail committed refresh before model
extraction or indexing, preserving the last valid snapshot. Missing/non-regular endpoint
files suppress both relationships for that binding and produce a cited extraction-gap
diagnostic. Duplicate `(scope, id)` declarations across all selected files suppress every
record with that identity, including identical duplicates. No winner is chosen. These are
evidence gaps, not automatic architecture violations; diagnostics do not certify completeness.

Opted-in snapshots include the routing extractor version in their identity and manifest.
Snapshots without routing retain the existing graph-v4 identity construction. Saved queries
never refresh implicitly, and semantic artifact keys are unchanged.

Draft overlays capture the selected declarations and previously referenced endpoints alongside
normal source scope, then rebuild all routing relationships from the isolated draft. The
isolated archive preserves committed inputs even when `.gitignore` matches them. Deleted
declarations invalidate their bindings and produce a gap diagnostic. Renamed/deleted endpoints
invalidate a binding until its declaration names a present file. Draft facts and source authority
are labeled `draft`; citations retain the base SHA and the captured content digest. A new
endpoint outside captured source scope fails capture even if currently clean, so later edits
cannot evade freshness checks. Configure its source scope before rebuilding. Malformed draft sources preserve the previous
overlay head. Publication IDs bind the routing extractor version, and RDF/SHACL validation
runs before a routing overlay is published. Historical snapshots and committed heads remain
unchanged.

## Validation boundary

Tests use real temporary Git repositories and actual TypeScript indexing. They cover exact
bindings, same-topic isolation, ambiguity, missing inputs, rename/delete, dirty saved querying,
artifact reuse, RDF/projection equivalence, draft authority and failed-refresh preservation.
An independent packed-consumer smoke checks the runtime asset and queries a declared consumer.
The frozen dispatch control remains intact; a separately committed declaration/configuration
is compared against a no-routing control at the same new input SHA. This tests extraction of
explicit source mappings and linkage to code, not discovery of undeclared routes or broker
delivery. Live semantic quality, browser interaction and provider authentication remain separate.
