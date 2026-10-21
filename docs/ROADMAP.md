# Delivery roadmap

Project: `jchewitt/weftlet`. Extraction provenance is recorded in the
[source inventory](SOURCE-INVENTORY.md).

| Milestone | Delivered and checked | Remaining limits |
| --- | --- | --- |
| 1. Standalone | Explicit committed inventory, core/toolkit boundary, public examples, build/tests, packed independent consumer and real TypeScript indexing | GitHub exported; both @launch-echo packages published at 0.1.0 and public installation verified |
| 2a. Saved evidence | Read/refresh separation, commit/config/scope metadata, dirty querying, isolated archives, atomic snapshots validated on Linux/WSL, failed-refresh preservation | Archive LF conversion and atomic head-replacement regressions pass Linux and hosted Windows CI; archives reject symlinks/submodules and sizes above 128 MiB |
| 2b. Draft overlays | Base/content identity, reindexed replacement, delete/rename handling, separate checkout/agent heads | Full implementation reindex; changed prose invalidated pending re-extraction |
| 3. Unified graph | RDF/SPARQL, SHACL, lossless projection, bounded continuation, six-stage async cross-source fixture, negative extraction/linkage cases | Local SELECT only; 100,000-fact projection bound; no universal language support |
| 4. Governance | Canonical approved rules, dependency-cruiser/ESLint/jscpd, scoped debt/expiry, transitive inference, optional OML ADR/parity | No active OWL reasoner; live formal compilation unverified; heuristics remain advisory |
| 5. Providers/DX | Codex adapter, HDesk live Windows public-example pass and cache reuse, CLI init/config and npx setup, tested module contract, validation/budgets/timeouts/cancellation/retries/cache identity, diagnostics/progress | Cloud live run remains filesystem-blocked; native npm launcher discovery and CRLF integrity validated in hosted Windows; live auth follow-up and other real providers remain |
| 6. Viewer | Same facts as agents, clustering, drill-down, bounded path highlighting, optional commit source links, authority/coverage/staleness | No real-browser automation; bounded pages, not a complete interactive explorer |

HDesk results for `6710e9391a6a01345dab5f5be4ae0656e1c9d1ae` are recorded in
[validation](VALIDATION.md#hdesk-validation-of-6710e9391a6a01345dab5f5be4ae0656e1c9d1ae):
WSL passed 114 deterministic tests and all three original MCP startup tests; the native Windows
subset still has two failures and three fixture exclusions.

The post-release module-organization increment is described in
[ADR 007](ADR-007-toolkit-modules.md): internal responsibilities have separate directories,
public entry points remain stable, and proposed internal dependency restrictions are advisory
pending explicit owner approval. It does not publish a replacement for npm 0.1.0.

Weftlet 0.1.0 includes explicit Codex authentication configuration: ChatGPT
login by default, API-key mode by opt-in, and presence-only API diagnostics. Validation is
tentative and explicitly non-blocking for release. The maintainer plans follow-up after publication
and adoption into a consumer project; API-key testing remains optional. No new live model results are claimed.
See [provider configuration](PROVIDERS.md#codex-authentication) and the validation record.

Native Windows archive conversion, concurrent head-replacement and MCP file-symlink fixes are
implemented with regression tests and pass focused hosted Windows CI. HDesk confirmation and
full native Windows release preparation remain separate checks.
The Windows reliability increment adds native/npm Codex discovery, process-tree cancellation
and Git-aware CRLF inventory/license checks. Hosted Windows passed 34 selected tests plus
repository inventory and licenses; hosted Ubuntu passed the full 178-test publication gate.
Browser and live authentication checks remain deferred. An advisory [self-repository impact
evaluation](IMPACT-EVALUATION.md) now measures four realistic changes with real SCIP/RDF/SHACL
and zero model assertions: 13/24 expected candidate files on the first page, 16/24 within
three pages. Test/workspace indexing, prose linkage and broad query reachability remain gaps;
live semantic quality is not established by this control. Next work should be separate, reviewed increments:
improve test/workspace evidence and repeat the fixed cases; run a bounded live semantic comparison;
retain the passing hosted Ubuntu CI gate; validate fresh-cloud
restoration; resolve the cloud-specific live provider block; add browser
interaction/accessibility tests; benchmark larger RDF graphs; evaluate a second real provider.
Figma and source-application reintegration are future adapter work.

macOS is outside the maintainer's current scope. Hosted Ubuntu CI passed at `92ae118`;
[environment validation](ENVIRONMENT-VALIDATION.md) separates the remaining fresh-task and
browser-MCP checks from the unresolved live Codex cloud issue.

Validation evidence and decisions are in `VALIDATION.md` and the ADR files. Source approval and
model assertion review are distinct. On 2026-10-20 the user authorized pushing the reviewed
destination to `jchewitt/tently` for local testing. The subsequent npm request authorizes release
preparation/publication under `@launch-echo`; the maintainer completed the 0.1.0 release from WSL. Visibility changes and
source-application reintegration remain outside the authorized scope. See [release instructions](RELEASING.md).

The maintainer authorized the Weftlet migration on 2026-10-21. Both `@weftlet/core` and
`@weftlet/toolkit` are published at 0.1.2 through GitHub OIDC, with provenance and a fresh public
installation verified. Changesets now prepares reviewed version PRs for the fixed package group;
merging a release plan triggers publication and package-specific tags/GitHub Releases.
See [ADR 009](ADR-009-release-automation.md) and [release instructions](RELEASING.md).
Earlier Tently packages remain available and undeprecated.
