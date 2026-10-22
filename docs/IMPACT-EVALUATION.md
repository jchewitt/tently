# Impact retrieval evaluations

This is an advisory, reproducible evaluation of candidate-file retrieval on the real
repository. It is not a quality gate, a live model benchmark, or an assertion that a
proposed change is safe. The four scenarios and their expected findings were written
before the first run in `evaluations/weftlet/cases.json`. They are reviewable hypotheses;
they do not approve product intent or architecture policy.
The later dispatch evaluation below adds a separate synthetic project with new cases
declared before measurement, while keeping the implemented ranking fixed.

## Reproduce the control

From a source checkout with the frozen dependencies installed:

```sh
pnpm build
pnpm evaluate:impact --ref eeaaa342d62c11eeef44bfdf81fa8dedcfeb205d
```

That exact commit must exist in local Git history. Omit `--ref` to measure the current
HEAD with the same cases. The runner rejects cases whose paths no longer exist; review
the expectations when the product changes instead of silently shrinking the denominator.
Keep the evidence SHA fixed for controlled comparisons. The earlier ordering used
commit-dependent fact IDs for ties; current ranking uses structural/citation fields first.
Freezing evidence still prevents changes in extracted facts from confounding the comparison.

The configuration uses real committed source bytes, bundled TypeScript SCIP, document
linking, RDF projection, SHACL, immutable publication and the normal saved-evidence query
service. The control provider returns **zero semantic assertions**. It permits measuring
literal document links without pretending to understand prose. No Codex login, API key,
Docker container or model call is required. The source checkout is not cleaned or modified.

Each scenario asks for 60 facts per page, up to three pages at depth 32. Reports distinguish
first-page recall, recall over the examined pages, relationships absent from the snapshot,
and relationships present but not retrieved within budget. A target counts only when a
returned fact names its exact file/document identity and is more than project membership.
Its provenance and extraction method accompany the score. This is still a generous
candidate-file metric: an import reference is weaker evidence than a typed symbol link,
and neither alone proves an end-to-end product dependency or that a test passed.

Unjudged results are not counted as false positives. Explicit distraction controls measure
noise in these tasks; their presence does not establish that the underlying graph assertion
is false. There is no claimed precision score without exhaustive human judgments.

The full local report is `.context-graph/evaluation/weftlet/report.json`. It records the
evidence commit, snapshot/content/configuration digests, exact configuration, suite and
runner-source digests, runtime, excluded working changes, coverage, witnesses and
continuations. Reports stay outside Git by default; review before sharing consumer results.
A failed refresh or scan exits nonzero and leaves the preceding report intact. Missing
coverage appears in a completed report; it is never converted into a passing quality gate.

To rescore saved evidence without rebuilding, installing a provider or reading its cache:

```sh
pnpm evaluate:impact --snapshot <snapshot-id> --output .context-graph/evaluation/weftlet/rescored.json
```

An absent snapshot is an error, with no refresh fallback. For a separately prepared provider
configuration, pass `--config <configuration.json> --snapshot <snapshot-id>`. Configuration
identity must match the snapshot. The runner refuses to refresh with a live provider.
Provider extraction is a separate, explicitly budgeted hydration operation; keep the same
six-document scope and review costs/authentication before running it. Source approval and
assertion review remain separate; the control configuration approves no intent sources.

## Initial findings

The baseline uses Weftlet `eeaaa342d62c11eeef44bfdf81fa8dedcfeb205d`, before any
evaluation-specific links or indexing changes. The compact, public-safe measurement record
is [baseline.json](https://github.com/jchewitt/weftlet/blob/main/evaluations/weftlet/baseline.json);
full snapshots remain local. The evaluator is development tooling in the source repository,
not an installed `weftlet` CLI subcommand.

| Change scenario | Expected targets | First page | Three pages |
| --- | ---: | ---: | ---: |
| Atomic snapshot publication | 6 | 3 | 4 |
| Impact-query result/continuation | 6 | 2 | 3 |
| Codex executable discovery | 6 | 3 | 4 |
| Working-file capture and freshness | 6 | 5 | 5 |
| Total | 24 | 13 (54.2%) | 16 (66.7%) |

All four scans reached 1,368 of 1,369 snapshot facts; each stopped at 180 returned facts
with continuation available. The query scenario missed the MCP implementation within that
budget despite its presence in the graph. One of four distraction controls appeared within
three pages (telemetry for the atomic-publication task). These observations justify examining
ranking and overly broad relationships before treating eventual traversal recall as usefulness.

There were 849 SCIP facts from 45 paths, and 520 repository-file facts from 75 paths.
SCIP contributed **no test-file relationships**. Colocated tests appeared only through basic
import extraction; `tests/snapshot-lifecycle.test.ts` had no extracted relationship.
The core contract file had only project membership, without a useful consumer relationship.
`evidenceRoots` selects change scope; it does not itself add tests to the TypeScript project
or the repository-file extractor's roots. The committed archive also has no installed
workspace dependencies. These are configuration/indexing limitations to investigate, not
evidence that tests or core contracts are missing from the repository.

None of the six existing prose documents produced a document-link fact, and the five
distinct expected intent documents were absent from every result. The sources describe
behavior but lack explicit resolved implementation paths. This control cannot recover
conceptual prose-to-code mappings. A live provider comparison and human citation review
are needed before drawing any conclusion about semantic comprehension. Zero runtime
references and zero approved intent sources were configured intentionally.

## Committed source-project comparison

The opt-in [source-project profile](ADR-010-committed-source-indexing.md) selects tests and
core source files explicitly and resolves `@weftlet/core` to its committed source entry.
It leaves the original profile and baseline intact. Run the comparison with:

```sh
pnpm evaluate:impact --config evaluations/weftlet/source-project.config.json --ref eeaaa342d62c11eeef44bfdf81fa8dedcfeb205d --output .context-graph/evaluation/weftlet-source-project/report.json
```

The commit, four cases, six documents, query budget and ranking are unchanged. The new
snapshot has 3,490 facts, including 2,970 SCIP facts and typed relationships from 33 test
files. The shared core contract and lifecycle test now appear in the results. The new
measurement is recorded in `evaluations/weftlet/source-project-baseline.json`.

| Change scenario | Original first / three pages | Source project first / three pages |
| --- | ---: | ---: |
| Atomic snapshot publication | 3 / 4 | 3 / 5 |
| Impact-query result/continuation | 2 / 3 | 4 / 4 |
| Codex executable discovery | 3 / 4 | 3 / 4 |
| Working-file capture and freshness | 5 / 5 | 5 / 5 |
| Total, out of 24 targets | 13 / 16 | 15 / 18 |

The original six test targets now have SCIP relationships as well as any simple import
facts. All four scans still reach the same broad component (3,490 facts) and stop at 180
returned facts; the MCP implementation remains outside the query budget. No labeled
distraction control appears within the examined pages in this run, which is not an
exhaustive precision result. The five expected intent documents are still unlinked.
There are still zero model assertions, approved intent sources and runtime references.

## Explicit document-link measurement

[ADR 011](ADR-011-explicit-document-links.md) replaces loose path matching with cited committed
Markdown references. The original v2 snapshot remains queryable and unchanged. Under the new
linker, refreshing the same frozen old input adds two document references but preserves the
15/24 first-page and 18/24 three-page scores. It cannot infer missing conceptual mappings.

The six documents now explicitly link descriptions of responsibilities to implementation and
test sources. Their evidence revision is `dcef64001d8d47cd1aeb4c1434992612158a104a`;
implementation and measurement identities are recorded in
`evaluations/weftlet/document-links-baseline.json`. Reproduce with:

```sh
pnpm evaluate:impact --config evaluations/weftlet/source-project.config.json --ref dcef64001d8d47cd1aeb4c1434992612158a104a --output .context-graph/evaluation/weftlet-source-project/linked-documents.json
```

| Change scenario | First page | Three pages | Labeled distraction within three pages |
| --- | ---: | ---: | --- |
| Atomic snapshot publication | 6 / 6 | 6 / 6 | None |
| Impact-query result/continuation | 5 / 6 | 6 / 6 | Codex command discovery |
| Codex executable discovery | 5 / 6 | 6 / 6 | Viewer interaction |
| Working-file capture and freshness | 6 / 6 | 6 / 6 | Codex command discovery (also on first page) |
| Total | 22 / 24 | 24 / 24 | 3 / 4 controls |

The graph contains 3,648 facts: 3,065 SCIP, 550 repository-file and 33 document-link facts.
All five expected intent-document paths now have cited links to actual file identities.
Every case still reaches the broad graph and stops at 180 returned facts with continuation.
The higher recall comes with additional noise; it is not a precision or completeness pass.

This changes the evidence input, including the preceding source-indexing implementation,
and the earlier commit-dependent tie-breaking could change ordering. The cases, query budget and ranking
implementation stay fixed, but the scores are not a controlled claim about semantic model
quality or ranking. Document links prove explicit references, not fulfillment of intent or
passing tests. There are still zero approved intent sources, model assertions, live model
calls and runtime observations. The new refresh reused six unchanged control artifacts.

## Fixed-snapshot ranking comparison

[ADR 012](ADR-012-impact-ranking.md) changes ordering without changing extraction, reachability
or evidence authority. The version is `proximity-diversity-v1`; the measurement record is
`evaluations/weftlet/ranking-baseline.json`. Both existing snapshots were queried directly
and remained byte-for-byte unchanged. No indexer or model ran. The four cases, expected
paths, distraction labels, 60-fact page size, three-page budget and depth 32 stayed fixed.

| Saved evidence | Previous first / three pages | Ranked first / three pages | Distractions, previous / ranked within three pages |
| --- | ---: | ---: | ---: |
| Document links (3,648 facts) | 22 / 24 | 24 / 24 | 3 / 1 |
| Older source project (3,490 facts) | 15 / 18 | 19 / 19 | 0 / 1 |

Recall is out of 24 expected candidate files; distractions are out of four labeled controls.
On the document-link input all six targets in each case now appear on page one, including
the query test and setup doctor previously found later. No labeled distraction appears on
page one, down from one. On the older input, all 19 targets with extracted relationships now
appear on page one, including the MCP implementation previously outside the budget. The
five expected document links remain missing; ranking cannot supply absent evidence.

Telemetry now appears on a later page for atomic publication in both inputs. That case
previously had no labeled distraction, and the older control's noise score therefore worsens.
This is a tradeoff, not uniformly better relevance. The same broad graph remains reachable;
every scan stops at 180 facts with continuation. Four cases in one repository do not
establish generalization, precision, complete dependency discovery or change safety.

Reproduce against the saved document-link input:

```sh
pnpm evaluate:impact --config evaluations/weftlet/source-project.config.json --snapshot dcef64001d8d47cd1aeb4c1434992612158a104a-graph-v3-links-2.0.0-42f885befb5ce881-4f68cb388720 --output .context-graph/evaluation/weftlet-source-project/ranking.json
```

For the older control, substitute snapshot
`eeaaa342d62c11eeef44bfdf81fa8dedcfeb205d-graph-v2-42f885befb5ce881-4f68cb388720`.
These snapshots must already exist locally; the command does not rebuild missing evidence.
The report records the ranking version and query-source digests. After an ordering upgrade,
restart scans with old continuation tokens; they fail explicitly instead of silently
applying their offset to a different order.

## Prospective dispatch evaluation

The dependency-free fictional Parcel Desk project, three cases and configuration were
committed at `fa902165a1f212a6d3245c847e1ab9b64a69715b` **before the first query**. It is
separate from Weftlet internals and the earlier pipeline fixture, but was authored after
ranking v1 existed. It is a prospective synthetic evaluation, not an independent external
benchmark. Production query/ranking bytes and both original case inputs remain unchanged.
Protocol and public-safe evidence are in `evaluations/dispatch/README.md` and
`evaluations/dispatch/baseline.json`.

Real committed TypeScript indexing, document links and RDF/SHACL produced 227 facts:
164 SCIP, 50 repository-file and 13 document-link facts. The three draft documents generated
zero semantic assertions; no sources were approved and no runtime traces were imported.
Repeated hydration extracted zero and reused all three artifacts, with identical snapshot
identity/content. Fixture behavior checks passed separately; their execution is not a graph fact.

| Scenario | First page | Three pages | Distractions within three pages |
| --- | ---: | ---: | ---: |
| Upstream request contract | 6 / 6 | 6 / 6 | 2 / 2 |
| Asynchronous submission consumers | 5 / 6 | 5 / 6 | 2 / 2 |
| Same-name domain policy | 4 / 4 | 4 / 4 | 3 / 3 |
| Total | 15 / 16 | 15 / 16 | 7 / 7 |

No labeled distraction appears on page one. The seven labels are case-specific judgments
over three distinct files, not seven different files or exhaustive precision labels. Each
scan reaches the same 214 facts and stops at the unchanged three-page budget of 180 facts.
The source and labels were not adjusted after seeing these scores.

Two findings need separate treatment:

- The expected archival consumer has local definitions/test relationships but no extracted
  route from dispatch. A supplemental scan exhausts all four pages (60/60/60/34) without
  retrieving any of its facts. The generic scorer calls this `not-retrieved-within-budget`
  because the file has relationships somewhere in the snapshot; here the diagnosis is a
  disconnected operational route, not a lower-ranked reachable result. Matching topic text
  does not establish delivery or a typed dependency.
- SCIP gives dispatch and refund `evaluatePolicy` functions distinct identities. The simpler
  repository-file extractor nevertheless joins their planners through the shared literal
  `contract:module:./policy.js`, even though those relative imports name different files.
  A test importing both refund and audit sources extends that graph connection. This explains
  a path to irrelevant candidates; it does not establish product causality. The missing
  `docs/policy.md` Markdown reference produces a cited diagnostic and no guessed target.

Reproduce the frozen input from the toolkit checkout:

```sh
pnpm evaluate:impact --suite evaluations/dispatch/cases.json --config evaluations/dispatch/context-graph.config.json --ref fa902165a1f212a6d3245c847e1ab9b64a69715b --output .context-graph/evaluation/dispatch/report.json
```

`--suite` defaults to the original Weftlet cases. Both suite/config paths resolve from the
toolkit checkout; case paths resolve from the configured evidence root. Evaluator and evidence
commits are recorded separately, including when evidence is an independent Git repository.
Only the resolved bundled no-assertion control can refresh; other provider configurations
must use already-built evidence. Selecting a suite does not authorize a live model run.

Both prior saved snapshots were rescored: document-link retrieval remains 24/24 on page
one with one three-page distraction, and the older control remains 19/24 with one distraction.
Their cases, reachable counts and snapshot bytes are unchanged. The new measurement adds
evidence of limits; it does not claim a ranking improvement or broad semantic comprehension.

## Next bounded increments

1. Correct generic relative-import identity so identical spellings in separate directories
   do not join unrelated modules. Compare on the frozen dispatch input without tuning ranking
   or removing the archival expectation; preserve existing snapshot readability.
2. Review the explicit mappings with a consumer owner, then compare a bounded Codex extraction
   against the control when ready. Preserve inferred/unreviewed assertion labels.
3. Evaluate an explicit source for operational routing separately from ranking. The known
   topic-string gap must not be silently treated as complete static dependency coverage.

The six-stage public fixture continues testing extraction/linkage, queues, missing links,
ambiguous intent and inconsistent identities. The evaluator's unit tests separately check
measurement correctness, including truncation, duplicate results and stale expectation paths.
Neither set substitutes for a real semantic-quality evaluation. Browser interaction, live
authentication, fresh-cloud restoration and larger-graph performance remain separate work.
