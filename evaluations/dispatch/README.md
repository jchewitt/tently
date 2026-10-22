# Prospective dispatch evaluation

Parcel Desk is a fictional, dependency-free TypeScript project authored for evaluation.
It is separate from Weftlet's implementation and the existing pipeline fixture. Its three
cases test an upstream contract, an asynchronous producer, and duplicate policy names.
This is a synthetic evaluation declared after ranking v1 was implemented, not an independent
external benchmark or a live semantic-quality result.

Before the first query, commit the project, configuration and `cases.json`. Freeze
`proximity-diversity-v1`, case labels, distractions and the existing budget of 60 facts per
page, three pages, depth 32. Do not add links, change labels or tune ordering in response
to these results. Keep the original Weftlet cases and saved-snapshot scores as regressions.

The configuration indexes committed source and tests using real TypeScript SCIP. Cited
Markdown references go through the ordinary document linker, RDF projection and SHACL.
The shared no-assertion control provider makes no model requests. No sources are configured
as approved intent, and no runtime traces are imported. Running the fixture's behavior
checks is separate validation; their success is not inserted into the evidence graph.

The topic-string consumer is a deliberate static-link gap. Shared typed symbols can identify
candidate producers and consumers; they do not establish queue routing, delivery guarantees
or actual runtime execution. The same-name policies and unresolved Markdown reference check
whether distinct source identities stay distinct and missing references are reported rather
than guessed. Broad generic import relationships may still connect unrelated candidates.

From the toolkit checkout, after the input commit exists:

```sh
pnpm evaluate:impact --suite evaluations/dispatch/cases.json --config evaluations/dispatch/context-graph.config.json --ref <input-sha> --output .context-graph/evaluation/dispatch/report.json
```

Use the resulting `--snapshot <snapshot-id>` instead of `--ref` to rescore saved evidence.
The graph/artifacts live in `project/.context-graph/` and full reports stay outside Git.
The evaluator's `--suite` and `--config` paths are relative to the toolkit checkout (absolute
paths also work); evidence paths are relative to the configured project root. The control
module is development tooling shared from `evaluations/weftlet`, not a published adapter.
This directory is not included in npm packages.

Record first-page and three-page candidate retrieval, labeled distractions, reachable and
returned counts, snapshot/content/configuration/suite identities, missing relationships,
diagnostics and representative citations. A candidate counts under the existing file-level
metric; it need not be a proven causal dependency. In particular, a file with unrelated
definitions may be present in the snapshot yet disconnected from the changed source.
Inspect that distinction before interpreting `not-retrieved-within-budget` as a ranking miss.
If 180 facts exhausts a small connected component, report that rather than claiming a
large-project recall result. Successful evaluation measures results; it does not gate CI on
retrieval quality or approve a change.
