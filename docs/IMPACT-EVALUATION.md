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

## Next bounded increments

1. Improve test and workspace-contract indexing in an isolated committed tree, then repeat
   these same cases. Keep dependency resolution explicit; do not borrow dirty checkout code.
2. Add and review explicit intent-to-implementation mappings, then compare a bounded Codex
   extraction against the control. Preserve inferred/unreviewed assertion labels.
3. Inspect query witnesses and common contract/import nodes for overly broad reachability;
   measure ranking changes with first-page recall and distraction controls unchanged.

The six-stage public fixture continues testing extraction/linkage, queues, missing links,
ambiguous intent and inconsistent identities. The evaluator's unit tests separately check
measurement correctness, including truncation, duplicate results and stale expectation paths.
Neither set substitutes for a real semantic-quality evaluation. Browser interaction, live
authentication, fresh-cloud restoration and larger-graph performance remain separate work.
