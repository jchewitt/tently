# Explicit routing comparison

Keep the original dispatch inputs, cases, labels, configuration and baseline records frozen.
The new `project/routing/dispatch.json` is a deliberately authored Weftlet mapping from the
executor to the archival consumer. It is inferred source evidence, not an executable broker
configuration, reviewed owner policy, independent discovery or an observed delivery.
The original draft prose describes the original source snapshot and remains unchanged.

Commit this mapping and `routing.config.json` before measurement. At that input SHA, hydrate
both the original `context-graph.config.json` (no routing) and the new configuration (routing).
Use the unchanged cases, `proximity-diversity-v1`, 60 facts per page, three pages and depth 32.
Do not change expectations, add more links or tune ranking after seeing the results. Report
both configurations and snapshot identities; the configuration change is intentional.

The sole declaration identifies `src/dispatch/executor.ts` as producer and
`src/archive/consumer.ts` as consumer of `dispatch.completed.v1` in `example/dispatch` scope.
It does not assert schema compatibility, deployed subscription state, delivery guarantees,
execution, or that a test passed. Existing real SCIP/document extraction links the producer
to upstream changes. The extractor validates the declaration and exact committed endpoint
files, then adds cited binding facts. The baseline's missing operational route remains a
known limitation when no declaration is supplied.

Run from the toolkit checkout, substituting the recorded new input commit:

```sh
pnpm evaluate:impact --suite evaluations/dispatch/cases.json --config evaluations/dispatch/context-graph.config.json --ref <input-sha> --output .context-graph/evaluation/dispatch/routing-control.json
pnpm evaluate:impact --suite evaluations/dispatch/cases.json --config evaluations/dispatch/routing.config.json --ref <input-sha> --output .context-graph/evaluation/dispatch/routing-enabled.json
```

The bundled no-assertion provider makes no model calls. Record recall, distractions, reachability,
missing targets, diagnostic/authority differences and direct declaration witnesses. Repeat
the enabled hydration to check identity/content/cache reuse; exhaust continuation separately
to check whether archival implementation and test facts are reachable. Preserve the prior
saved snapshots and scores. Compare all non-routing facts between same-SHA control/enabled
snapshots after removing only their containing snapshot IDs.

Do not call an authored map a semantic-quality improvement or proven runtime dependency.
Retrieval of the archival file measures successful use of the extra declaration. Broader
consumer review and actual deployment/trace adapters remain future work.
