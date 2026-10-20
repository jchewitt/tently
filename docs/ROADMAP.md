# Delivery roadmap

Destination: `jchewitt/tently`. Read-only source:
`launchecho/tradepilot@fda97e0146099543aeaa6b338ef2b0e9fab0d1d6`.

| Milestone | Delivered and checked | Remaining limits |
| --- | --- | --- |
| 1. Standalone | Explicit committed inventory, core/toolkit boundary, public examples, build/tests, packed independent consumer and real TypeScript indexing | GitHub exported; both @launch-echo packages published at 0.1.0 and public installation verified |
| 2a. Saved evidence | Read/refresh separation, commit/config/scope metadata, dirty querying, isolated archives, atomic snapshots validated on Linux/WSL, failed-refresh preservation | Native Windows archive LF conversion and concurrent head-rename EPERM need fixes; archives reject symlinks/submodules and sizes above 128 MiB |
| 2b. Draft overlays | Base/content identity, reindexed replacement, delete/rename handling, separate checkout/agent heads | Full implementation reindex; changed prose invalidated pending re-extraction |
| 3. Unified graph | RDF/SPARQL, SHACL, lossless projection, bounded continuation, six-stage async cross-source fixture, negative extraction/linkage cases | Local SELECT only; 100,000-fact projection bound; no universal language support |
| 4. Governance | Canonical approved rules, dependency-cruiser/ESLint/jscpd, scoped debt/expiry, transitive inference, optional OML ADR/parity | No active OWL reasoner; live formal compilation unverified; heuristics remain advisory |
| 5. Providers/DX | Codex adapter, HDesk live Windows public-example pass and cache reuse, CLI init/config and npx setup, tested module contract, validation/budgets/timeouts/cancellation/retries/cache identity, diagnostics/progress | Cloud live run remains filesystem-blocked; native Windows npm executable discovery needs improvement; other real providers planned |
| 6. Viewer | Same facts as agents, clustering, drill-down, bounded path highlighting, optional commit source links, authority/coverage/staleness | No real-browser automation; bounded pages, not a complete interactive explorer |

HDesk results for `6710e9391a6a01345dab5f5be4ae0656e1c9d1ae` are recorded in
[validation](VALIDATION.md#hdesk-validation-of-6710e9391a6a01345dab5f5be4ae0656e1c9d1ae):
WSL passed 114 deterministic tests and all three original MCP startup tests; the native Windows
subset still has two failures and three fixture exclusions.

Next work should be separate, reviewed increments: fix native Windows exact-byte archive handling,
concurrent atomic snapshot-head replacement, CRLF integrity checks and symlink fixtures;
run bounded semantic-quality evaluations; exercise macOS and hosted CI; validate fresh-cloud
restoration; resolve the cloud-specific live provider block; add browser
interaction/accessibility tests; benchmark larger RDF graphs; evaluate a second real provider.
Figma and source-application reintegration are future adapter work.

Validation evidence and decisions are in `VALIDATION.md` and the ADR files. Source approval and
model assertion review are distinct. On 2026-10-20 the user authorized pushing the reviewed
destination to `jchewitt/tently` for local testing. The subsequent npm request authorizes release
preparation/publication under `@launch-echo`; the maintainer completed the 0.1.0 release from WSL. Visibility changes and
TradePilot reintegration remain outside the authorized scope. See [release instructions](RELEASING.md).
