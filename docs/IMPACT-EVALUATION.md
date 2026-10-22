# Impact retrieval on Weftlet itself

This is an advisory, reproducible evaluation of candidate-file retrieval on the real
repository. It is not a quality gate, a live model benchmark, or an assertion that a
proposed change is safe. The four scenarios and their expected findings were written
before the first run in `evaluations/weftlet/cases.json`. They are reviewable hypotheses;
they do not approve product intent or architecture policy.

## Reproduce the control

From a source checkout with the frozen dependencies installed:

```sh
pnpm build
pnpm evaluate:impact --ref eeaaa342d62c11eeef44bfdf81fa8dedcfeb205d
```

That exact commit must exist in local Git history. Omit `--ref` to measure the current
HEAD with the same cases. The runner rejects cases whose paths no longer exist; review
the expectations when the product changes instead of silently shrinking the denominator.
Keep the evidence SHA fixed for controlled comparisons: query tie-breaking uses fact IDs
that include provenance, so even an unrelated commit can change equally ranked results.

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
and commit-dependent tie-breaking can change ordering. The cases, query budget and ranking
implementation stay fixed, but the scores are not a controlled claim about semantic model
quality or ranking. Document links prove explicit references, not fulfillment of intent or
passing tests. There are still zero approved intent sources, model assertions, live model
calls and runtime observations. The new refresh reused six unchanged control artifacts.

## Next bounded increments

1. Inspect query witnesses and common contract/import nodes for overly broad reachability;
   measure ranking changes with first-page recall and distraction controls unchanged.
2. Review the explicit mappings with a consumer owner, then compare a bounded Codex extraction
   against the control when ready. Preserve inferred/unreviewed assertion labels.

The six-stage public fixture continues testing extraction/linkage, queues, missing links,
ambiguous intent and inconsistent identities. The evaluator's unit tests separately check
measurement correctness, including truncation, duplicate results and stale expectation paths.
Neither set substitutes for a real semantic-quality evaluation. Browser interaction, live
authentication, fresh-cloud restoration and larger-graph performance remain separate work.
