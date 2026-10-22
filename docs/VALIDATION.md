# Validation evidence

Environment: Linux cloud, Node 24.19.0, pnpm 10.18.2. Source imported from
`fda97e0146099543aeaa6b338ef2b0e9fab0d1d6`. No source application was built or changed.

The milestone entries below record the original cloud checks. Subsequent
[HDesk validation](#hdesk-validation-of-6710e9391a6a01345dab5f5be4ae0656e1c9d1ae)
establishes live Codex success on Windows and the full deterministic checks on WSL,
while identifying remaining native Windows issues.

## Relative module request identities, 2026-10-22

[ADR 013](ADR-013-relative-module-requests.md) scopes generic relative imports to the
importing directory. Implementation `26c47d5b55f9390fe38b4928d1a8274eaf893583` was measured
against the frozen dispatch input and the existing Weftlet document-link input. Cases,
configuration, budgets, evaluator and ranking bytes are unchanged. The public-safe record
is `evaluations/dispatch/relative-imports-baseline.json`.

Linux cloud, Node 24.19.0, pnpm 10.18.2:

- Dispatch retains **15/16 expected candidates** on page one and within three pages.
  Three-page labeled distractions fall from **7/7 to 0/7**; page one remains 0/7.
  The reachable component shrinks from 214 to 183 facts. Full continuation returns all
  183 unique facts (60/60/60/3), with no refund/audit distraction or archival consumer.
  The archival file still has six local facts but no extracted operational route.
- The Weftlet input retains **24/24 first-page and three-page candidates**, with 0/4
  first-page and 1/4 three-page distractions. All scans still reach 3,648 facts and stop
  at 180; telemetry remains a later-page distraction for atomic publication. These results
  do not establish exhaustive precision or broader semantic quality.
- Real SCIP/document/RDF/SHACL hydration retains 227 dispatch and 3,648 Weftlet facts.
  SCIP and document facts match their prior versions in every field except containing
  snapshot ID. Dispatch reused three semantic control artifacts and Weftlet reused six,
  extracting zero. A repeated dispatch refresh preserves identity/content and reuses all
  three again. No model calls, approved sources or runtime observations were added.
- Snapshot assembly v4 and file extractor v2 coexist with old saved evidence. Draft
  overlay publication identity also binds the extractor version, while capture-v2 digests
  remain compatible. Tests cover old/new overlay coexistence, immutable committed heads,
  repeated draft identity, rename/delete behavior and manifest versions.
- The full publication gate passed **208 deterministic tests** (1 core + 207 toolkit),
  one optional OML skip, build, 12 advisory architecture findings, inventory, licenses and
  fresh packed-consumer installation. The installed smoke exercises the new relative-request
  module alongside actual SCIP, RDF/SHACL, continuation, visualization and MCP checks.
  Actionlint passed without shellcheck.
- Independent review verified all 27 frozen dispatch input hashes, six evaluator hashes,
  three legacy saved-snapshot byte hashes and their original scores/reachability. All 79
  imported source paths/source hashes are preserved. Code review found no blockers; its
  control-character coverage observation was corrected before the final full gate.

Hosted Ubuntu/Windows results are attached to the implementation PR. Corrected extraction
requires an explicit refresh; saved queries keep their original facts and do not rebuild.
Browser interaction, live authentication and broader semantic quality remain separate.
No npm publication is part of this increment.

## Prospective dispatch evaluation, 2026-10-22

Inputs, labels and protocol were committed at `fa902165a1f212a6d3245c847e1ab9b64a69715b`
before any queries. Production ranking remains byte-identical to `proximity-diversity-v1`.
The [evaluation protocol](IMPACT-EVALUATION.md#prospective-dispatch-evaluation) and
`evaluations/dispatch/baseline.json` record the public-safe measurements and provenance.

Linux cloud, Node 24.19.0, pnpm 10.18.2:

- Real SCIP/document/RDF/SHACL hydration produced **227 facts**, with zero model assertions,
  approved intent sources or runtime references. Repeat hydration extracted zero and reused
  three control artifacts, retaining snapshot identity/content digest. Fixture TypeScript
  checking and four exported behavior checks passed separately.
- All three cases use the existing 60-fact/three-page/depth-32 budget. Candidate recall is
  **15/16 on page one and within three pages**. No labeled distraction appears on page one;
  **7/7 case-specific distraction labels** appear within three pages. These are synthetic
  candidate-file measurements, not a quality gate or exhaustive precision result.
- Supplemental full continuation returned 214 unique facts across four pages, with no
  archival-file fact. Its local relationships exist but the expected operational route is
  disconnected. SCIP distinguishes the two domain policy functions; cited generic import
  witnesses show the cross-domain `./policy.js` connection. The intentionally unresolved
  Markdown reference has a diagnostic and no guessed target.
- Original Weftlet snapshots, suite, reachable counts, recall and distraction scores remain
  unchanged. Both saved snapshot files match their recorded SHA-256 digests. All 79 original
  imported source paths and source hashes are preserved.
- Focused evaluator checks pass with a real independent Git repository and an unrelated cwd:
  selected suite/config, separate evaluator/evidence commits, real indexing/document links,
  saved-only scoring, immutable snapshot content, failed-report preservation, missing-snapshot
  refusal and live-provider refresh refusal. Boundary tests also reject impostor modules and
  repository/suite/configuration/draft mismatches. Fixture result scores are not CI thresholds.
- The full publication gate passed **203 deterministic tests** (1 core + 202 toolkit),
  one optional OML skip, build, 12 advisory architecture findings, inventory, licenses and
  fresh packed-consumer installation/indexing/RDF/SHACL/MCP checks. Actionlint passed without
  shellcheck; strict TypeScript checking of the evaluator also passed.

Hosted Ubuntu/Windows outcomes are recorded with the implementation PR.
No ranking/source-extraction change, live model call, browser result, authentication result
or npm publication is part of this increment. Broader real-project and semantic-quality
validation remain separate.

## Impact ranking, 2026-10-22

[ADR 012](ADR-012-impact-ranking.md) describes query ordering by weighted proximity and
source diversity. Implementation `2e4a3bbc55bd3a15cf619f56827963a699a5b56b` was measured
against two existing immutable snapshots, with no hydration or model calls. The public-safe
record is `evaluations/weftlet/ranking-baseline.json`; cases, labels, budgets, configuration,
snapshot bytes and reachable fact counts are unchanged.

Linux cloud, Node 24.19.0, pnpm 10.18.2:

- On the document-link snapshot, first-page candidate retrieval improved from **22/24 to
  24/24**, retaining 24/24 within three pages. Labeled distractions fell from 1/4 to 0/4
  on page one and from 3/4 to 1/4 within three pages. The query test and setup doctor now
  appear on page one. Telemetry is a new later-page distraction for atomic publication;
  the aggregate improvement does not mean that every case has less noise.
- On the older source-project control, first-page retrieval improved from 15/24 to 19/24
  and three-page retrieval from 18/24 to 19/24. The five missing document relationships
  remain absent. Labeled distractions worsened from 0/4 to 1/4 within three pages, again
  telemetry. These four cases from one repository do not establish generalization or
  exhaustive precision. Every scan remains truncated after 180 facts with continuation.
- The full publication gate passed: **197 deterministic tests** (1 core + 196 toolkit),
  one optional OML skip, build, 12 advisory architecture findings, inventory, licenses
  and fresh packed-consumer installation. The installed smoke now exhausts ranked
  continuation over actual extracted facts, checking for duplicate or missing results.
- Focused coverage includes large-source consumer diversity, deep asynchronous flows,
  generic shared imports, citation-only anchors, stable ties across commit-derived IDs,
  complete pagination, versioned continuation rejection and evaluator version drift.
  The real TypeScript/RDF pipeline retains field-for-field projection equivalence.
- The first full run omitted the cloud's writable cache/store settings, causing four
  installation-fixture failures. Correcting the command environment produced the passing
  full rerun above; no source workaround was needed. Actionlint passed without shellcheck.
  All 79 original import paths and source hashes remain unchanged.

Hosted Ubuntu/Windows outcomes are attached to the implementation PR. Ranking changes
ordering only, preserving evidence authority, confidence, scope and current-diff eligibility.
Saved snapshots need no refresh; old continuation tokens require restarting the scan.
Browser interaction, live-provider/authentication checks and broader semantic quality remain
deferred. No new source approval, runtime observation or npm publication is claimed.

## Explicit document linkage, 2026-10-22

[ADR 011](ADR-011-explicit-document-links.md) describes committed Markdown references,
precise citations, authority boundaries, and the new snapshot assembly identity. Implementation
`90726be3751cf23de7f1cdd595d1e9ddb151b139` is measured separately from the evidence inputs.
The six documents' source mappings were committed at
`dcef64001d8d47cd1aeb4c1434992612158a104a`, before the linker implementation.

Linux cloud, Node 24.19.0, pnpm 10.18.2:

- Full publication gate: **192 deterministic tests** (1 core + 191 toolkit), one optional
  OML skip, build, 12 advisory architecture findings, inventory, licenses and fresh packed
  consumer. The installed smoke now parses committed Markdown and combines its references
  with real SCIP facts before RDF/SHACL validation. Actionlint passed without shellcheck.
- Focused cases cover relative/root/reference-style/encoded Markdown destinations, CRLF
  source citations, duplicate basenames without guessing, missing/deleted/renamed paths,
  directories, URLs, code examples, and distinct source approval/assertion review. Real
  pipeline hydration links a test using SCIP's Evidence identity, passes SHACL and retains
  field-for-field RDF projection equivalence. Cached prose is rechecked against target
  deletion, while the preceding immutable snapshot stays readable.
- The original saved v2 evidence was queried without hydration: its digest and 15/24
  first-page, 18/24 three-page scores remain unchanged. Fresh assembly uses a different
  identity, binds the linker version, and reuses the existing semantic artifacts.
- The fixed old-source control still returns 15/24 first-page and 18/24 three-page candidates.
  With the new explicit source mappings, the measurement returns **22/24 first-page and
  24/24 three-page candidates**. All five expected intent-document paths are retrieved.
  This new input also contains the intervening source-indexing implementation; it is not
  an isolated model-quality or ranking experiment. The original case labels and budgets
  are unchanged. `evaluations/weftlet/document-links-baseline.json` records the evidence
  identities, provenance witnesses, scores, noise and limitations.
- Three of four labeled distractions appear within three pages, including one on the first
  page. All scans remain truncated at 180 facts. Better candidate recall does not establish
  precision, complete product understanding, or a safe change. Ranking is measured separately
  in the subsequent increment above.
- An initial real-document run caught false missing-file diagnostics for slash-separated
  prose and package names. The final linker diagnoses unresolved explicit Markdown links;
  unresolved literal mentions are ignored. Regression cases include the observed examples.
  All 79 original import paths and source hashes remain unchanged.

Hosted Ubuntu/Windows outcomes are attached to the implementation PR. No live model call,
new source approval, browser interaction, runtime behavior or authentication result is claimed.
The control provider returns no assertions. Browser and live-provider validation remain deferred.

## Committed source-project indexing, 2026-10-22

[ADR 010](ADR-010-committed-source-indexing.md) records the opt-in profile and its limits.
Toolkit implementation `1c2c699` was evaluated against the same evidence commit
`eeaaa342d62c11eeef44bfdf81fa8dedcfeb205d`, unchanged case labels and query budgets.
`evaluations/weftlet/source-project-baseline.json` records the full implementation SHA,
snapshot/configuration/index digests, scores, remaining misses and source coverage.

Linux cloud, Node 24.19.0, pnpm 10.18.2:

- First-page candidate retrieval improved from 13/24 to 15/24; three-page retrieval
  improved from 16/24 to 18/24. Typed SCIP relationships now cover 33 test files, including
  the lifecycle test, and link the shared core contract. Five expected intent documents
  remain unlinked and the MCP file remains outside the query budget.
- The new graph has 3,490 facts (2,970 SCIP and 520 repository-file facts). Repeated
  hydration reused all six document-control artifacts with identical snapshot identity
  and content digest `6f30f62900e37a6d2d266bcd3bba54941b1cab3997602eefef3320b0d0e66fc3`.
  Rerunning the original profile preserved its prior snapshot, digest and scores.
- Real SCIP regression fixtures prove committed contract/test linkage through a workspace
  re-export, ignored/dirty-source isolation, repeat digest stability, rename/delete
  replacement, and capture of draft changes outside ordinary code/evidence roots.
  Invalid scopes/aliases fail before SCIP. Missing alias-definition selection was caught
  during development; both entry points and definition files must be explicitly selected.
- The full publication gate passed: 187 deterministic tests (1 core + 186 toolkit),
  one optional OML skip, builds, 12 advisory architecture findings, inventory and licenses.
  Fresh packed-consumer checks now also exercise a source alias and a test excluded by
  its build config, along with the existing npx/RDF/SHACL/viewer-output/MCP checks.
- Workflow syntax passed actionlint. All 79 original source import paths/hashes remain
  unchanged. The Windows workflow includes the new real-indexing and overlay regressions;
  hosted outcomes are attached to the implementation PR.

No dependency installation in evidence archives, live model run, runtime observation,
owner approval, browser interaction or new authentication result is claimed. This mode
does not inherit build compiler settings or establish complete external dependency resolution.

## Self-repository impact evaluation, 2026-10-21

The [evaluation protocol](IMPACT-EVALUATION.md) and public-safe
`evaluations/weftlet/baseline.json` record a deterministic control against committed
Weftlet `eeaaa342d62c11eeef44bfdf81fa8dedcfeb205d`. The active checkout contained
the new evaluator; its source/suite/configuration digests are recorded separately.
No current working source bytes were substituted for that evidence commit.

On Linux, Node 24.19.0 and pnpm 10.18.2:

- Real SCIP, RDF/SHACL and publication produced 1,369 facts. Four fixed scenarios
  retrieved 13/24 expected candidate files on the first page and 16/24 in three pages.
  These are measurements, not a quality pass. Intent documents, workspace contracts,
  test coverage and query ranking have the gaps described in the protocol.
- Repeated hydration extracted zero and reused six document-control artifacts, retaining
  snapshot identity and content digest
  `5b4003c527b0f797d45814679326c59da995bc677d0706768a9d9b1b21aedb4f`.
- Saved-snapshot scoring succeeded with the semantic-artifact directory temporarily
  unavailable and returned identical recall. No hydration phases ran; artifacts were
  restored afterward. Missing-snapshot and live-provider-refresh probes both failed
  clearly without starting an indexer or model.
- Five evaluator tests passed, covering first/later-page scores, extraction versus
  bounded-retrieval misses, non-relationship exclusions, duplicate/drifting pages,
  stale case paths and invalid budgets. Strict TypeScript checking of the evaluator passed.
- The full publication gate passed: 183 deterministic tests (1 core + 182 toolkit),
  one optional OML integration skipped, builds, 12 advisory architecture findings,
  inventory, licenses and fresh packed-consumer installation/indexing/RDF/MCP smoke.
  All 79 original import paths and source hashes remain unchanged.

Hosted [checks for the initial evaluation commit
8e82453d92357451e832f3bf16666a6bef89b6de](https://github.com/jchewitt/weftlet/actions/runs/39687986720)
also passed on Ubuntu (full publication gate) and Windows (34 selected reliability tests,
inventory and licenses). The full self-repository control run above was performed in Linux
cloud; these hosted checks do not imply a Windows evaluation run or browser validation.

No live semantic assertions, runtime traces, owner approvals, browser interactions or
new authentication results are claimed. The control sends no model requests. Broader
semantic quality still needs a separately bounded live run and human citation review.

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

GitHub-hosted Ubuntu [run 39492039168](https://github.com/jchewitt/weftlet/actions/runs/39492039168)
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

## Weftlet migration and trusted-publishing preparation

2026-10-21: the maintainer created `@weftlet` and authorized migration from Tently. Current source
uses `@weftlet/core@0.1.0`, `@weftlet/toolkit@0.1.0`, `weftlet` and `weftlet-mcp`. The compatible
context-graph aliases, config/storage paths, neutral-core boundary and all 79 original imported
source paths/SHA-256 hashes are preserved. GitHub remains `jchewitt/tently`.

Linux, Node 24.19.0, pnpm 10.18.2 and npm 11.9.0: frozen installation, build and the full
publication gate passed **147 deterministic tests** (1 core + 146 toolkit/example/script),
with one optional Docker/OML test skipped. Architecture checks passed with 12 advisory findings;
extraction inventory and licenses passed. A fresh packed consumer installed the new toolkit
and automatically resolved the new core name, exercised npm exec setup/config, real TypeScript
SCIP indexing, RDF/SPARQL/SHACL, visualization output and MCP. Cold/stale/compiler-error MCP
startup tests passed with workspace fixtures wired to `@weftlet/core`.

The previously deferred deterministic Codex-auth/config regression cases now pass. Live ChatGPT
and API-key authentication validation remains tentative and non-blocking; no model was invoked.
Public runtime export counts remain 35 toolkit, 3 core and 2 telemetry. After final help-text and
documentation edits, compilation and extraction inventory were checked again.

`publish.yml` was checked with actionlint 1.7.7 (shellcheck integration disabled). It defaults to
preparation only; publication is explicitly selected and uses a separately permissioned,
environment-gated GitHub-hosted job. Synthetic tests cover OIDC prerequisites, minimum npm version,
rejection of ambient tokens and cleanup of isolated npm configurations. Manual login and legacy
cloud-token references remain supported. The workflow pins npm 11.21.1; local checks used npm
11.9.0, which also exceeds npm's 11.5.1 minimum for trusted publishing.

No new npm packages have been published or old packages deprecated by this change. Package-level
npm trust settings, GitHub environment reviewer rules, a live OIDC release/provenance check and
fresh public-registry installation remain external validation steps. The new release workflow
has not yet been run on GitHub; a successful local gate or actionlint run is not evidence of OIDC
permissions. Native Windows fixes, fresh-task restoration and actual browser interaction remain
separate work. See [release instructions](RELEASING.md) for the maintainer's exact setup steps.


## GitHub repository rename — 2026-10-21

The maintainer renamed the destination to `jchewitt/weftlet`. The origin, both npm repository
URLs, current instructions and OIDC repository guard now use that identity. Historical export
records remain unchanged. The architecture config retains its stable graph repository ID;
this remote rename does not rewrite existing evidence. The cloud mount remains `/workspace/tently`.

Seven focused npm-auth tests passed, including acceptance of the new repository and rejection
of the previous identity. Fresh packed-consumer validation passed: npm exec setup/config,
transitive core installation, runtime assets, real TypeScript indexing, SCIP, RDF/SPARQL/SHACL,
HTML/DOT/SVG and MCP. Extraction inventory and diff checks passed. The full deterministic suite
was not repeated for these metadata/documentation and release-guard changes; its prior result
remains recorded above. No npm publication, live OIDC release or fresh-task restoration is
claimed. Both new 0.1.0 package versions returned public-registry 404 during this check.

Use `weftlet` as the npm trusted-publisher Repository field. Archives prepared before this rename
contain the previous repository URL; prepare from the updated commit before initial publication.


## Native Windows release-preparation fixes — 2026-10-21

The maintainer reported five failures during native Windows release preparation: three MCP
startup fixtures failed creating a file symlink for pnpm metadata, concurrent snapshot-head
replacement failed with EPERM, and isolated archive content used CRLF instead of committed LF.
The supplied output was still running, so no final native-suite totals are inferred.

Changes:
- MCP fixtures copy dependency metadata files and retain directory junctions on Windows. All
  three original startup tests remain enabled, including protocol-stdout isolation on compiler errors.
- Committed materialization runs `git -c core.autocrlf=false archive`. This command-local override
  preserves the user's repository configuration. The regression enables `core.autocrlf=true`
  even on Linux: it reproduced the reported CRLF failure before the fix and passes afterward.
- Snapshot-head replacement retries only Windows EPERM/EACCES/EBUSY errors, with 50 retries and
  4.55 seconds of total backoff. Each attempt remains an atomic rename; the destination is never
  unlinked or truncated. Persistent failures propagate, preserve the prior head and clean up the
  unpublished temporary file. Immutable snapshot publication still uses exclusive hard links.
- A real multiprocess test publishes three valid snapshots, replaces a shared head 60 times and
  checks concurrent reads always return a complete known snapshot. Existing conflicting immutable
  snapshot tests remain enabled. Fault injection covers transient and persistent Windows errors,
  nonretryable errors, previous-head availability and temporary-file cleanup.

Linux, Node 24.19.0, pnpm 10.18.2: the full publication check passed **155 deterministic tests**
(1 core + 154 toolkit/example/script); one optional Docker/OML test was skipped. Build, architecture
(12 advisory findings), extraction inventory, licenses and fresh packed-consumer smoke passed.
The smoke includes setup/config, transitive core installation, real TypeScript SCIP indexing,
RDF/SPARQL/SHACL, HTML/DOT/SVG output and MCP. After improving child-process cleanup in the
contention test, its three-test lifecycle suite passed again.

A separate `windows-latest` CI job now builds and runs the storage, Git and original MCP startup
regressions. Actionlint 1.7.7 passed for both workflows (shellcheck integration disabled).
The Windows job does not replace the full Linux release gate. Native Windows execution of these
fixes remains pending; simulated Windows errors on Linux are not a native pass. CRLF checkout
inventory checking and npm Codex executable discovery remain separate follow-ups. No live model
call or npm publication was performed. Use WSL for the validated full release-preparation route.


## Weftlet publication and native Windows CI — 2026-10-21

The maintainer reported successful publication. Public npm metadata independently confirms
`@weftlet/core@0.1.0` and `@weftlet/toolkit@0.1.0`, both with `latest` pointing to 0.1.0 and
repository metadata pointing to `jchewitt/weftlet`. Downloaded archives match their registry
SHA-512 integrity values. The toolkit archive contains the Windows atomic-rename helper.
This check verifies registry availability and archive integrity, not a fresh public consumer install.

[Hosted run 39656137105](https://github.com/jchewitt/weftlet/actions/runs/39656137105) succeeded
at `4cdc4e5bc8b53bde3b23ce0be550146ac6ae817c`. Both the full Ubuntu deterministic job and the
focused `windows-storage-and-startup` job passed. The Windows job completed frozen installation,
build, Git archive-byte checks, snapshot contention/failure checks and all three original MCP
startup cases. This establishes a native hosted-Windows regression pass; full Windows release
preparation, HDesk reruns, CRLF inventory checking and npm Codex discovery remain separate.

Current source prepares 0.1.1 for both packages to update public descriptions and documentation.
The project overview and core README describe Weftlet independently; original attribution,
licenses and extraction provenance remain intact. npm trusted publishing still needs package-level
configuration and a successful OIDC release. A manual publication does not validate OIDC.


For the 0.1.1 documentation/metadata patch, frozen install and the full Linux publication gate
passed again: 155 deterministic tests (one optional Docker/OML test skipped), build, architecture
with 12 advisory findings, inventory, licenses and fresh packed-consumer smoke. No runtime code
changed from 4cdc4e5. GitHub's About description was blank; an attempted metadata update returned
HTTP 403, so no GitHub description change is claimed. No npm upload was made by the agent.


## First trusted-release preparation attempt — 2026-10-21

[Run 39660995763](https://github.com/jchewitt/weftlet/actions/runs/39660995763) on d82ebee
passed the full release gate but stopped before uploading any package. npm 11.21.1 returns
`publish --dry-run --json` results keyed by package name; the release script expected the
flat record returned by npm 11.9.0. The preparation check now supports both observed formats
and verifies name, version and archive integrity. Ambiguous/multiple records and mismatches
remain errors. Two npm-command tests pass, including negative response-shape/identity/integrity
cases, and both package archives pass real dry runs with npm 11.9.0 and 11.21.1. No live npm
publication was attempted by this failed run.

## Trusted 0.1.1 publication and release automation — 2026-10-21

[Release run 39661957651](https://github.com/jchewitt/weftlet/actions/runs/39661957651) succeeded
at `720a5f964fe3cb6c438be6d22b4aa8b4ad44de17`: credential-free preparation, both npm OIDC
uploads, registry visibility and archive integrity checks. Public metadata confirms both packages
at 0.1.1 with provenance. A fresh public installation passed CLI init and config validation.
No npm token was supplied. The `npm-release` GitHub environment exists without reviewer/branch
rules; the workflow main-branch guard remains active. Saving trust alone was not counted as a pass.

Package-specific 0.1.1 Git tags and GitHub Releases were subsequently added at that exact commit,
after rechecking both registry hashes against the original run's archive manifest. No 0.1.0 tag
was guessed. npm versions or artifacts were not changed by this record backfill.

For the Changesets automation increment, Linux Node 24.19.0 / pnpm 10.18.2 frozen install and the
full publication gate passed: **165 deterministic tests** (1 core + 164 toolkit/example/script),
with one optional Docker/OML test skipped. Build, architecture (12 advisory findings), extraction
inventory, licenses and fresh packed-consumer smoke passed. The smoke covered setup/config,
transitive core installation, runtime assets, real TypeScript SCIP, RDF/SPARQL/SHACL, HTML/DOT/SVG
and MCP. Actionlint 1.7.7 passed all three workflows with shellcheck integration disabled.

New deterministic tests run the actual Changesets CLI in disposable root/core workspaces, verify
patch/minor fixed-group bumps, changelogs, plan/lockfile/inventory updates and consumed changesets,
and reject stale or non-advancing plans. Release-record tests reject missing/mismatched registry
archives and conflicting tags, and resume interrupted creation without duplicates. Recovery-state
tests select earlier attempts and reject expired or ambiguous artifacts. No paid model call or
new npm version was published by these tests. Hosted version-PR operation is checked separately;
a future merged release remains the integration test of automatic publish and record creation.

## Automatic 0.1.2 release and Windows reliability — 2026-10-21

[Release run 39672652013](https://github.com/jchewitt/weftlet/actions/runs/39672652013) completed
preparation, npm trusted publication and release records at
`3d8d1f38a9e70b38178921cdabf5e8714c417c1c`. Both registry `latest` tags now identify 0.1.2.
Both package-specific Git tags resolve to that exact commit, and GitHub Releases were created.
Versions were committed on main before publication. This validates the first merged Changesets
release through the automatic push trigger; no post-publication version commit was required.

The next Windows reliability increment adds common discovery for native Codex executables and
standard global/project-local npm launchers. Tests use actual npm-created launchers with a
synthetic public CLI to exercise diagnostics, login status and source-isolated extraction. They
also cover PATH precedence, spaces/metacharacters, rejected/broken shims, secret filtering,
discovery timeout/cancellation, and termination of a launcher with an active child. They make no
live Codex request and do not validate real account authentication or model quality.

Inventory tests use actual Git checkouts with core.autocrlf=true and explicit eol=crlf attributes.
They check unchanged source hashes, checkout bytes, Git configuration and index; genuine edits
still fail. Binary and -text imports retain exact bytes. Custom filters are rejected without
execution. License checks accept CRLF formatting while still comparing complete notice text.
All 79 original source paths/hashes remain unchanged.

The full local publication gate passed on Linux, Node 24.19.0 / pnpm 10.18.2: **177 deterministic
tests** (1 core + 176 toolkit/example/script), one optional OML test skipped, build, architecture
(12 advisory findings), inventory, licenses and fresh packed-consumer smoke. Actionlint passed
with shellcheck integration disabled. The Windows CI job now runs the added launcher, process,
inventory and license checks; its native result is recorded separately after execution. Browser
interaction and live authentication testing remain explicitly deferred by the maintainer.


The first hosted Windows run at `6f2f83f` passed all **33** selected tests and the repository
inventory check, including real npm launchers and process-tree cancellation. Its newly enabled
license check caught CRLF conversion of a pinned reviewed notice. That check now shares the
Git-aware content reader; the reviewed notice and its approved SHA-256 remain unchanged.
Discovery time is included in existing probe/extraction timeout budgets. Updated hosted checks
are required before merging this increment.


PASS: [hosted run 39676848049](https://github.com/jchewitt/weftlet/actions/runs/39676848049)
at `ef2f8e31cbcae402ca08979e90aff4f00fb91c77`. Ubuntu passed the full publication gate with **178 deterministic tests**
(1 core + 177 toolkit/example/script), one optional OML test skipped, 12 advisory architecture
findings, build, inventory, licenses and packed-consumer smoke. Native Windows passed **34**
selected tests, including global/local npm launcher installation, discovery, login/extraction
plumbing, process-tree cancellation, CRLF inventories, storage/Git and all original MCP startup
cases. The repository inventory and complete license checks also passed natively. This is focused
Windows coverage, not a full native Windows publication gate or a live Codex account/model test.
