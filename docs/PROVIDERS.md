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
managed by the installed CLI, with the explicit authentication selection below. The child
inherits only the explicit environment allowlist and, in API mode, the selected API key.
Prompts, provider stderr and credentials are never printed by progress/error handling.
Artifact storage contains model output and must remain private with the source repository.

## Codex authentication

Status: implemented in unreleased source; live validation is **tentative and non-blocking for
release**, as accepted by the maintainer. Follow-up is planned after publication and adoption into
Banditrade using the maintainer's existing ChatGPT login; API-key testing may remain deferred.
Published 0.1.0 does not contain this option. Both modes still use Codex CLI;
this is not a direct OpenAI API provider or a fix for the managed-cloud filesystem issue.

Merge one of these fragments into your existing `context-graph.config.json`:

```json
{ "semantic": { "provider": "codex-cli", "auth": { "mode": "chatgpt" } } }
```

Omitting `auth` also selects `chatgpt`; `init` writes it explicitly. Sign in using `codex login`
and select ChatGPT. Tently checks `codex login status` before an uncached extraction and requires
it to report ChatGPT login. A missing, unrecognized or API-key login fails before model execution.
There is no automatic API fallback. Existing saved API logins are not changed or logged out by
Tently. The status probe has a maximum five-second timeout in addition to the extraction timeout.
This mode uses your plan's Codex allowance and limits.

```json
{
  "semantic": {
    "provider": "codex-cli",
    "auth": { "mode": "api-key", "apiKeyEnv": "TENTLY_CODEX_API_KEY" }
  }
}
```

API mode uses separately billed API access. Supply the named variable through your local secret
manager or trusted automation environment. `apiKeyEnv` defaults to `CODEX_API_KEY` when omitted.
Tently passes only the selected key as `CODEX_API_KEY` to `codex exec`, which supports per-invocation
API authentication without an interactive login. Missing or blank keys fail without falling back
to saved authentication. A key's presence does not establish validity, model access or available
quota. Authentication failures do not trigger a switch to the other mode.

Never put a key value in JSON. Unknown `auth` fields are rejected, and this option is only valid
for `codex-cli`. Ambient `OPENAI_API_KEY`, `CODEX_API_KEY` and `OPENAI_BASE_URL` are not inherited
implicitly. To use `OPENAI_API_KEY`, explicitly name it in `apiKeyEnv` in API mode. Custom API
endpoints are not part of this change. Proxy and CA settings remain supported.

`doctor` reports the selected mode, ChatGPT login status, or API key presence. API mode reports
`key-present-unverified` and `codexAuthenticated: null`; it never makes a paid authentication probe.
Status output and credential values are not logged. Authentication does not change built-in
semantic artifact identity, so selecting another mode or rotating a key does not force extraction
of unchanged documents. Querying saved snapshots does not require authentication.

Ordinary deterministic CI needs neither mode. Keep live semantic CI opt-in and restricted to
trusted inputs, with narrowly scoped secret exposure and small document budgets. OpenAI's
[automation documentation](https://developers.openai.com/codex/noninteractive/) describes
`CODEX_API_KEY` and recommends its Codex GitHub Action for protected API authentication in Actions.
Compatibility with that action's proxy is not validated here. Trusted persistent runners can
continue using their ChatGPT login; this change does not provision or copy account sessions.

## Limits and reuse

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
