# Validation evidence

Environment: Linux cloud, Node 24.19.0, pnpm 10.18.2. Source imported from
`fda97e0146099543aeaa6b338ef2b0e9fab0d1d6`. No source application was built or changed.

The milestone entries below record the original cloud checks. Subsequent
[HDesk validation](#hdesk-validation-of-6710e9391a6a01345dab5f5be4ae0656e1c9d1ae)
establishes live Codex success on Windows and the full deterministic checks on WSL,
while identifying remaining native Windows issues.

## Milestone 1: standalone baseline

Passed `pnpm context-graph:publication-check`:

- Core and toolkit TypeScript builds.
- 98 deterministic tests (1 core + 97 toolkit/example).
- Generated third-party dependency/license inventories.
- Packed core/toolkit installed in a separate temporary Git consumer.
- Real TypeScript SCIP indexing and extraction, runtime asset inventory,
  HTML/DOT/SVG rendering and installed MCP initialization/tool discovery.
- Missing snapshots produce an explicit MCP error.
- Development MCP tests cover missing/stale output rebuild and clean protocol error reporting.

One opt-in Docker/openCAESAR integration test was skipped. Real Codex extraction, Windows,
macOS and hosted CI were not run. Existing source validation records are not copied as evidence.
Synthetic semantic runner tests validate orchestration/citations/cache behavior, not model quality.

The initial pnpm 11 installation exposed a build-script policy mismatch; installing with the
pinned pnpm 10.18.2 resolved it. Four fixture adaptation failures (paths, sort order and query
labels) were corrected and the complete gate rerun successfully.

## Milestone 2a: saved evidence lifecycle

Passed TypeScript build, 15 affected tests across hydration, scope selection, lifecycle, final
checks and real SCIP indexing, followed by the independent package smoke test.
New checks exercise same-process concurrent publication, immutable conflict rejection, atomic
head updates, failed refresh preservation, dirty/untracked file reporting and two concurrent
committed materializations without changing Git status or registered worktrees.

The full baseline suite also passed after the main lifecycle change. Draft overlays and later
milestones require separate validation. Symlink/submodule materialization and archives over
128 MiB are explicitly unsupported; Windows/macOS were untested at this milestone.

## Milestone 2b: draft overlays

Passed build and five overlay/viewer tests. The overlay test indexes real TypeScript in the
base and draft, renames a shared interface and updates its consumer, repeats capture to verify
stable identity, then deletes the consumer and proves the old relationships disappear.
Committed HEAD and the default snapshot remain unchanged. No live model or runtime is involved.

A first repeatability check caught synthetic-commit timestamps leaking into fact identities.
Overlay IDs now derive from normalized draft facts and captured bytes; the repeated real-index
test passes.

## Milestone 3: RDF, SHACL and cross-source queries

Passed real pipeline execution, real SCIP indexing, deterministic prose-provider hydration,
RDF/traversal field equivalence, six declared asynchronous routes, downstream implementation/test
retrieval, pagination without duplicate facts, missing-query gaps, identity-kind conflict and
invalid-citation/confidence SHACL negatives, and remote SPARQL rejection.
Installed-consumer smoke passes with the new RDF runtime dependencies.

The larger suite exposed a suggested-file ordering regression; preserving explicit RDF ordinals
fixed it, and the affected static/RDF tests passed. Live model comprehension is a separate check.
License inventories include exact-version reviewed notices for three newly encountered expressions.

Milestone 3 final rerun: 102 deterministic tests passed (1 core + 101 toolkit/example); one optional OML integration test skipped.

## Milestone 4: architecture and optional OML

Passed build and 34 focused tests. The governance integration uses dependency-cruiser, ESLint and
jscpd, checks positive and negative imports, a transitive SPARQL inference, cycles, conflicting
owners, missing imports, baseline scope, and valid/expired exceptions. The initial extraction
commit was separately analyzed in an isolated tree to record five existing advisory findings.
The current repository passed approved rules with eight advisory size/complexity findings.

Direct-RDF/OML assertion parity and real pipeline incremental reuse passed. Actual openCAESAR
compilation and OWL reasoning remain unverified; no active OWL reasoner is claimed.

## Milestone 5: providers and diagnostics

Passed build and 41 focused deterministic tests, including actual subprocess timeout/cancellation,
safe error reporting, transient-only retry limits, malformed output rejection, module identity and
timeout enforcement, cache reuse, and model reasoning identity. The pipeline test additionally
checks that a source-budget failure makes zero provider calls.

`doctor` reports Git and Codex available, authenticated Codex login, and the RDF backend. A tiny
public live test using Codex 0.163.0 / gpt-6-astra exited with status 1 before extraction. A bounded,
redacted diagnostic identified a read-only filesystem error. Live semantic extraction is blocked
and unverified in this environment; no credentials or private source were copied to work around it.

## Milestone 6 and final integrated gate

On 2026-10-20, `pnpm context-graph:publication-check` passed end to end:

- Frozen installation and TypeScript builds; 110 deterministic tests passed (1 core + 109 toolkit/example).
- One optional Docker/openCAESAR integration test skipped.
- Canonical architecture gate passed; 10 advisory size/complexity findings remain for review.
- Extraction inventory and production license checks passed.
- Fresh packed consumer exercised actual TypeScript SCIP extraction, RDF/SPARQL/SHACL projection,
  HTML/DOT/SVG rendering, installed MCP initialization and missing-snapshot reporting.

The final pipeline test extracts missing implementation paths, explicit ambiguous ownership and
contradictory node kinds from additional public prose, reports/rejects them, and preserves the last
valid head. Source approval and unreviewed model assertions remain separately labeled in RDF,
agent output and the viewer. Snapshot publication also passed concurrent independent-process tests.
Viewer tests check exact fact/edge identity, safe source links, script syntax, six-edge directed paths,
cycle termination, bounds and coverage/staleness labels. Browser UI automation was not performed.

All 79 imported original file hashes were rechecked against the recorded source SHA, and destination
hashes matched the inventory. Export paths contain no Git metadata, credentials, environment files,
node_modules, generated graph storage or package archives. The inventory was reviewed separately from publication authorization; the user subsequently
authorized the GitHub export documented below.

`scripts/cloud-install.sh` was executed successfully in the managed environment. The installed
consumer is a fresh-install smoke test; restoration into a fresh cloud task is a separate check. Live Codex extraction remains blocked as recorded above.
Windows, macOS, hosted CI and optional formal compiler execution were untested in that cloud run.

## Secondary review fixes and authorized GitHub export

On 2026-10-20, secondary review identified five issues. Regression coverage now verifies:

- Architecture entry roots retain local transitive dependencies, and unmapped intermediate
  modules produce extraction gaps instead of a false pass.
- Nested repository roots use consistent committed reads, deltas, dirty paths and archives.
  Actual nested hydration succeeds with real TypeScript indexing while prose remains dirty.
- Consumer-relative, absolute, file-URL and import-only ESM package adapters resolve correctly;
  the installed-consumer smoke also loads a relative adapter.
- Draft queries compare captured content digests, distinguish included/excluded/subsequent changes,
  detect reversion to committed bytes and new in-scope files, and mark legacy freshness unknown.
- Module import and asynchronous factory initialization share extraction's timeout/cancellation;
  cancelled initialization neither caches its late result nor starts extraction.

Follow-up review found an additional equivalent-root normalization issue (`./src`, `./`). It was
fixed and independently rechecked; no blocking findings remained. Scope tests include directory
prefix boundaries, outside paths, Windows separators and contract globs. These separator tests
are deterministic checks on Linux, not a Windows environment validation.

The final `pnpm context-graph:publication-check` passed: builds, 114 deterministic tests
(1 core + 113 toolkit/example), approved architecture rules (10 advisory findings), extraction
inventory, licenses and a fresh tarball consumer exercising SCIP, RDF/SPARQL/SHACL, visualization
and MCP. One opt-in Docker/OML integration test remains skipped. All 79 original file hashes were
rechecked against the recorded source SHA, and the destination history scan found no private-key
or common credential-token signatures. This bounded scan supplements the reviewed file inventory. The user authorized pushing the reviewed destination commits to
`https://github.com/jchewitt/tently` for local testing. Package registry releases and visibility
changes are excluded. Source remains read-only; no source history is included in this repository.

## HDesk validation of 6710e9391a6a01345dab5f5be4ae0656e1c9d1ae

Tested destination commit: `6710e9391a6a01345dab5f5be4ae0656e1c9d1ae`.
Evidence source: HDesk results supplied by the maintainer, recorded here without rerunning
the Windows or WSL checks in the cloud. HDesk reported no source changes or pushes.
These results apply to this commit and the environments specified below.

### PASS: live Codex end-to-end on Windows

Environment: Windows, Node 24.2.0, Codex 0.153.4, `gpt-6-astra` with `medium` reasoning.
The unchanged adapter extracted the public example, validated citations and schema, ran real
SCIP indexing and RDF/SHACL, published and queried the snapshot, and reused its semantic artifact
on a second hydration.

| Observation | Result |
| --- | --- |
| Semantic facts | 4 |
| Total snapshot facts | 12 |
| Query facts | 11 |
| Second hydration: extracted / reused artifacts | 0 / 1 |
| Second hydration: snapshot identity / content digest | Both unchanged |

This establishes a live adapter pass for the public example. The earlier cloud filesystem failure
remains specific to that environment; broader semantic-quality evaluation is still separate.

### PASS: WSL deterministic and installed-consumer checks

Environment: WSL Ubuntu-22.04, Node 24.6.0, pnpm 10.18.2. Passed frozen installation, build,
114 deterministic tests, architecture checks with 10 advisory findings, inventory, licenses
and the fresh packed-consumer smoke test.

The aggregate command initially stopped at a harness pnpm-store mismatch. After correcting
that configuration, licenses and packaging passed independently. These are passing component
results, not a claim that the initial aggregate invocation completed successfully.

All three **original** `src/mcp-startup.test.ts` tests passed in WSL:

- `rebuilds missing workspace outputs and initializes clean JSON-RPC from another cwd`
- `rebuilds stale workspace outputs and initializes clean JSON-RPC from another cwd`
- `fails clearly on a compiler error without sending diagnostics on protocol stdout`

These tests were excluded only from the later native Windows subset because fixture creation
attempted a file symlink for `.modules.yaml` and received `EPERM`. They are validated in WSL,
not generally unvalidated. Separate native Windows launcher/MCP initialization, `impact.scan`
discovery and missing-snapshot reporting also passed.

### Native Windows follow-up

The native Windows subset reported **108 passed, 2 failed, 1 optional skipped**, with the
three fixture tests above excluded. This is not a full native Windows suite pass.

- `git archive` inherits `core.autocrlf=true` and changes committed LF bytes. A focused probe
  confirms `git -c core.autocrlf=false archive ...` preserves exact bytes. The implementation
  fix and regression coverage remain follow-up work.
- Concurrent snapshot-head replacement fails with rename `EPERM` at `src/storage.ts:22`
  in the tested commit. Sequential publication passes. A fix must preserve atomic replacement
  and cross-process guarantees; sequential success does not validate concurrency.
- Improve CRLF checkout integrity checks and discovery of npm-installed Codex executables.
- Address the native Windows `.modules.yaml` symlink fixture limitation before claiming
  those three tests pass natively.

Docker is optional for openCAESAR and is not required by the default RDF backend. Optional
formal compiler execution, browser interaction, macOS, hosted CI, fresh-cloud restoration
and broader semantic-quality evaluation remain separate validation work.

## CLI setup and npm release preparation

The maintainer selected the `@launch-echo` npm scope. The toolkit is now
`@launch-echo/tently`, with `@launch-echo/tently-core` as a transitive dependency.
Original source inventory hashes and attribution are retained.

The Linux cloud publication gate passed with 117 deterministic tests (1 core + 116
toolkit/example), one optional Docker/OML test skipped, and 11 advisory architecture findings.
The additional advisory is `runInit` complexity (21 against the configured threshold of 20);
it remains flagged as new, with no automatic baseline or exception. Approved rules pass.
Inventory and license checks pass.

New tests cover project defaults, explicit source selection without source-approval promotion,
nested configuration paths, CRLF ignore-file preservation, overwrite refusal, non-interactive
flags, and `config show`/`config validate` without Git or a configured provider. A separate PTY
check exercised interactive cancellation and confirmation on Linux.

The packed-package smoke serves the two local archives from a disposable scoped registry.
An npm exec invocation requests only `@launch-echo/tently`, resolves core transitively, infers
the `tently` executable, initializes a fresh project, and validates/displays its configuration.
The separate installed consumer passes real SCIP, RDF/SPARQL/SHACL, visualization and MCP.
This verifies npx installation mechanics without claiming public npm publication.

`npm whoami` returned `ENEEDAUTH`; public registry reads found neither selected package.
Registry authentication and public-registry installation remain pending. No npm publication
has occurred. The HDesk Windows/WSL results above still refer to their original tested SHA;
the new setup/release commands have not been tested on native Windows.

## Release portability follow-up

The maintainer's WSL release-preparation run initially used Node 22.14.0. The locked Undici
dependency could not load because `zlib.createZstdDecompress` was unavailable. The previous
toolkit Node 20.11+ declaration was incorrect. Toolkit metadata, `.nvmrc` and early startup
checks now require Node 24+; the independent core package retains its own Node requirement.

After updating to Node 24.14.1, the maintainer reported 116 toolkit/example tests passing,
one optional test skipped, a passing architecture report with 11 advisory findings, and a
passing inventory check. That aggregate invocation then stopped at license generation:
the standalone pnpm 10.18.2 executable was passed to Node as JavaScript, producing an `ELF`
syntax error. This is a script launcher defect, not a license finding. These user-reported
results do not establish a completed WSL release-preparation pass.

The shared launcher now executes standalone pnpm directly and JavaScript entry points
through Node. Regression tests cover both forms, paths with spaces and literal arguments.
A Linux reproduction uses the actual standalone `@pnpm/exe@10.18.2` distribution.
Separate probes using real Node 22.14.0 confirm that the built CLI, MCP, library entry point
and development launcher reject the unsupported runtime before loading Undici.

The full Linux publication gate passed on Node 24.19.0 with standalone pnpm 10.18.2:
126 deterministic tests (1 core + 125 toolkit/example), one optional Docker/OML test skipped,
architecture approval with the same 11 advisory findings, inventory and license checks, and
the fresh packed-consumer smoke. That smoke covers npm exec setup/config, runtime assets,
real TypeScript indexing, SCIP, RDF/SPARQL/SHACL, visualization output and MCP.

Secure cloud publication support is tested for temporary npm configuration permissions,
literal environment-variable references, cleanup and preservation of ordinary npm login
when no cloud token is configured. No credential value is stored in that configuration.
The environment requirement has been saved; an applied credential and public npm publication
remain pending. These checks do not establish new native Windows or macOS results.

### Interactive npm 2FA follow-up

The maintainer subsequently reported `EOTP` during a real WSL publish attempt after enabling
2FA. Inspection of npm's authentication code confirms that it declines interactive challenges
when either stdin or stdout is not a terminal. Our publisher captured stdout, disabling that
flow. Real publication now inherits all terminal streams; dry-run JSON and registry reads
remain captured for validation. A subprocess regression test verifies those output behaviors,
and a Linux pseudo-terminal probe confirms both stdin and stdout reach the publication child
as terminals. Neither test contacts npm for publication or completes a real browser/OTP
challenge; that authenticated WSL retry remains operator validation.

### npm processing delay and partial release

The maintainer's next WSL attempt successfully completed npm's publish authentication and
received acceptance for `@launch-echo/tently-core@0.1.0`. Immediate integrity verification
returned 404 while npm processed the package. A subsequent public registry read confirmed
core's SHA-512 integrity matches the prepared archive; toolkit still returned 404. This is
a partial release, not failure of the accepted core upload or evidence of toolkit publication.

The npm website initially displayed `0.0.0-stage`, a temporary holding version awaiting
staged review, with no license. Later public checks confirmed `latest: 0.1.0` and
`Apache-2.0` for core. Downloaded tarball bytes match the prepared SHA-512 digest, and a fresh
temporary consumer successfully installed core from public npm and imported its ESM exports.
The placeholder's license field does not describe our submitted package.

The publisher now saves acceptance before polling visibility and waits for matching integrity
before advancing to dependent packages. Seven deterministic tests cover delayed visibility,
matching existing archives, mismatches, bounded timeout and resume without another upload,
blocking dependents, registry errors, and publish failure. These tests use controlled registry
responses; they do not measure npm's processing-time guarantees.

The updated publication gate passed 134 deterministic tests (1 core + 133 toolkit/example),
with one optional Docker/OML test skipped and the same 11 advisory architecture findings.
Inventory, licenses and packed-consumer checks passed. The subsequent preparation step
exposed npm's refusal to dry-run an already published version. Preparation now compares
existing registry integrity instead, while retaining dry runs for unpublished versions.

## Public npm release 0.1.0

Both packages published by the maintainer from WSL are now visible at `latest: 0.1.0`, with
Apache-2.0 metadata. Public tarball downloads match both SHA-512 hashes in the release manifest
prepared at `02fb65c987154d925fc523c91ccedbdca96fff9d`. The toolkit, like core, initially appeared
as a `0.0.0-stage` holding version while npm processed it; subsequent checks confirmed the
operational release. An independent temporary project ran `npm exec -- @launch-echo/tently@0.1.0`
with `init --yes`, `config validate` and `config show`, using public npm and resolving core
transitively. Generated configuration identified that project and did not approve intent sources
automatically. No model requests or cloud-side npm uploads were made.

## Post-release module organization

The development tree now groups implementation by responsibility while preserving the five
root public entry points. Tests were relocated without dropping existing cases; cross-module
and startup checks live in `tests/`, and release-helper tests live beside their scripts.
The 79 extraction source paths and source hashes are unchanged; destination paths and required
modification notices follow the moved files. Historical validation paths above refer to their
recorded commits and have not been rewritten to imply newer environment results.

Linux, Node 24.19.0, standalone pnpm 10.18.2: the full publication gate passed **135 deterministic
tests** (1 core + 134 toolkit/example/script), one optional Docker/OML test skipped, build,
inventory, licenses and fresh packed-consumer installation. The installed consumer passed
npm exec setup/config, real TypeScript/SCIP indexing, RDF/SPARQL/SHACL, visualization output and
MCP. All three original cold/stale/error MCP startup cases passed at their new test location.

The canonical policy maps internal modules separately. A public-safe fixture uses the actual
policy and analysis tools to verify allowed imports and detect all five proposed forbidden
directions. Actual toolkit analysis reports no violations of those rules, no infrastructure
failures or extraction gaps, and the same 11 heuristic advisories. Internal restrictions remain
advisory pending explicit owner approval; existing approved core rules remain hard gates.
Historical debt and approval records were not advanced or waived because of the moves.

Before/after checks found identical runtime export names for the library (35), core (3) and
telemetry (2) entry points. A source comparison confirmed all 38 moved runtime files differ
only in import/export module paths and required attribution notices. Clean builds remove
obsolete compiled modules. Public package names, CLI commands, configuration, graph behavior
and snapshot formats are unchanged. This is an unreleased source refactor, not a replacement
for published 0.1.0. Native Windows and macOS were not rerun for this change. Hosted CI was
subsequently verified as recorded below.

## Hosted CI and restoration preparation

GitHub-hosted Ubuntu [run 39492039168](https://github.com/jchewitt/tently/actions/runs/39492039168)
completed successfully at `92ae118ccb22f59aaa150b1c8f3a009bdacc788a`. The Actions API reports
the deterministic job and repository composite action succeeded. The workflow selects Node 24
and pnpm 10.18.2, installs the frozen lockfile and runs the full deterministic publication gate.
This verifies hosted CI independently of the managed cloud's live Codex filesystem failure.
Earlier notes that hosted CI was unverified describe the evidence available at that time.

The reusable cloud install/start instructions were saved as an updated environment draft with
the writable npm cache and current GitHub/npm/CI state. The updated install script completed
frozen installation and build in this instance. `scripts/check-restoration.mjs` records an ignored public
snapshot checkpoint and verifies its retained content and query behavior with an intentionally
unavailable semantic provider. Current-instance rehearsal is separate from restoring a genuinely
new cloud task. Follow [environment validation](ENVIRONMENT-VALIDATION.md) for the final user-driven
environment publication/new-task step and the browser-MCP checklist. macOS is out of current scope.

Current-instance checkpoint verification returned 10 query facts from the retained snapshot with
an intentionally unavailable module provider and `eligibleForCurrentDiffValidation: false`.
Changing the checkpoint digest caused verification to fail; restoring the original proof passed
again. Governance passed with the same 11 advisories, and inventory validation passed. This is
a rehearsal, not a claim that environment publication or a new-task restoration occurred.

## Explicit Codex authentication modes — tentative

2026-10-20: implemented in `083fbdd`. Unreleased source
defaults to ChatGPT login and offers explicit API-key authentication through a named environment
variable. Existing npm 0.1.0 is unchanged. `init` emits the default; `doctor` distinguishes a
ChatGPT login from an unverified API key. Saved-query access and built-in artifact identity do
not depend on the selected authentication mode.

Build/type compilation passed on the current Linux cloud (Node 24.19.0). Regression cases were
added for mode selection, credential filtering, missing-key/no-fallback behavior and configuration
validation; existing fake-runner tests now inject the login-status probe. These tests and the full
publication gate were **not run locally for this change**, per the maintainer's request to defer
testing. No model calls, paid API requests or npm publication occurred. Earlier live Codex and
deterministic passes do not validate this increment.

Independent validation remains tentative: run the deterministic suite, then verify ChatGPT login
with ambient API variables present, API mode with a valid and invalid/missing selected key,
doctor's presence-only reporting, and a bounded public-example hydration with artifact reuse.
Record CLI/model versions and actual results separately. Hosted API authentication, native Windows
behavior and any Codex GitHub Action proxy integration are not established by compilation.

Maintainer disposition (2026-10-20): live authentication validation is **tentative, deferred and
non-blocking for release**. The maintainer plans to exercise their existing ChatGPT-backed Codex
workflow after publication and adoption into Banditrade, and report any issues. API-key validation
may remain tentative; obtaining API credentials or making paid requests is not required for that
follow-up. This records acceptance of deferred validation, not a passing result. Ordinary
deterministic release checks remain applicable. No source-application reintegration was performed.
