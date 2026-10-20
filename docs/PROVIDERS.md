# Semantic provider contract

Codex CLI is the shipped model adapter. The module extension contract is tested with deterministic
providers; no additional CLI or API integration is advertised as working. An arbitrary executable
is not compatible merely because it accepts stdin.

`SemanticExtractor` has a stable `identity` and
`extract(source, context, {signal, timeoutMs}) -> {parsed, rawModelOutput}`.
The exported `SemanticOutput`, `semanticOutputSchema` and `assertSemanticOutput` define structured
assertions, node kinds, predicates, inclusive source citations, finite confidence and diagnostics.
Every provider passes the same runtime checks before artifacts are saved. Deterministic OML is
rendered from accepted assertions; model-proposed OML never becomes executable ontology.
Evidence authority is assigned by source approval policy, never by the provider.

Codex receives a single numbered public or explicitly selected local document in an isolated
temporary directory. Shell tooling, user config and rules are disabled; authentication remains
managed by the installed CLI. The child inherits only the explicit environment allowlist.
Prompts, provider stderr and credentials are never printed by progress/error handling.
Artifact storage contains model output and must remain private with the source repository.

Defaults are at most 8 documents per hydration, 64 KiB per source, a 120-second timeout per
request, no retries, and the configured concurrency (validated at 1–4). Source budgets are checked
before any model call. `maxDocuments`, `maxSourceBytes`, `timeoutMs`, and `retries` may be configured
within validated limits. Review scope and cost before raising them; these byte/document limits
are not dollar or token estimates. Ask the operator before substantial paid runs.
Only explicit transient exit status 75 is retryable, at most twice; authentication, invalid
output, cancellation and ambiguous failures are not retried. Ctrl-C cancels live CLI extraction.
Indexing cancellation is checked between phases, not inside the indexer process.

Cache identity includes provider/model/reasoning effort, prompt and contract versions, source
digest/stable ID, extractor/adapter/ontology versions, confidence threshold and unresolved policy.
Unchanged artifacts are reused; forced revisions are separate. Failures never replace a valid
snapshot. Progress shows phase and counts on stderr, with no document text or paths.

For a trusted local provider module, set `provider: "module"`, `providerModule` to a local path
(relative to the repository root) or installed package, and `providerIdentity` to its exact
declared version. Packages resolve from the consumer repository using ESM import conditions.
Export `createSemanticExtractor(config, {signal, timeoutMs})`; the optional second argument passes
cancellation through asynchronous initialization. One deadline covers module import, factory
initialization and extraction. Cancelled initialization cannot populate the extractor cache or
start extraction later. All semantic configuration contributes
to this adapter's cache identity. Loading happens only during extraction, so a missing module does
not disable queries. Implement cancellation and cleanup when the supplied signal aborts; the
wrapper limits waiting but cannot forcibly terminate arbitrary in-process code. Use subprocesses
with bounded execution when strong process termination is necessary.

`context-graph doctor --config context-graph.config.json` reads configuration, Git availability,
Codex presence/login status, optional Docker readiness and saved default evidence. A login status
is not proof that extraction can run. In this cloud environment, Codex 0.163.0 reported logged in
but its tiny public-example invocation exited immediately with a read-only filesystem error.
Live extraction is therefore unverified here; deterministic adapter, timeout, retry, citation,
budget and cache tests pass. No private source was submitted in that check.

HDesk subsequently reported a live end-to-end pass at commit
`6710e9391a6a01345dab5f5be4ae0656e1c9d1ae` on Windows, Node 24.2.0, Codex 0.153.4,
`gpt-6-astra`/`medium`, using the unchanged adapter and public example. Citation/schema
validation, real SCIP, RDF/SHACL, snapshot publication/querying and repeat artifact reuse passed.
See [validation](VALIDATION.md#hdesk-validation-of-6710e9391a6a01345dab5f5be4ae0656e1c9d1ae)
for counts and scope. Native Windows npm Codex executable discovery still needs improvement;
this public-example pass does not establish broader semantic quality.

Provider-dependent tests must remain opt-in, use tiny public fixtures, avoid credentials in
untrusted CI, and record model/version/date separately from deterministic test results.
