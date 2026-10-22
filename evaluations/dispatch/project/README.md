# Parcel Desk evaluation fixture

This is a new, public-safe fictional project for prospective evaluation of Weftlet's
unchanged impact ranking. It is separate from Weftlet implementation code and the existing
six-stage pipeline example. It is not an externally maintained production repository.

The TypeScript project has no package dependencies. Exported verification functions in
`test/` can be invoked by the host's deterministic integration test. They exercise real
in-memory asynchronous publication, dispatch policy, retry decisions, receipt projection,
archival validation and unrelated refund/audit behavior. The transport does not model
broker persistence, retries, delivery guarantees or cross-process runtime execution.

The three predeclared cases outside this project cover an upstream request contract,
an asynchronous submission API and a same-named policy. Expected candidates and distractions
are reviewable hypotheses, not approved product intent or hard quality gates. Draft documents
link justified implementation paths without creating a whole-project source index.

Known limitations are intentional inputs, fixed before querying:

- `src/archive/consumer.ts` subscribes to the executor's topic by string. It imports no
  shared typed contract and has no direct call edge from the dispatch service. Its separate
  test validates accepted payloads but does not connect it to deployment routing. Static
  extraction can therefore miss a real intended downstream consumer.
- Dispatch and refund have distinct `policy.ts` and `planner.ts` files. Both planners
  import `./policy.js`, and both policies export `evaluatePolicy`. Shared spelling is not
  shared symbol identity or evidence of a product dependency.
- Archive and audit have distinct `consumer.ts` files and export `subscribedTopic` for
  different topics. Neither basename nor export spelling identifies a shared consumer.
- The explicit `policy.md` reference in the policy document is unresolved on purpose.
  There is no canonical target to guess. The proper domain links remain explicit.
- Typed symbol references can establish candidate relationships across asynchronous
  stages. They cannot prove queue routing, operational behavior or fulfilled product intent.

Code describes implementation, tests describe checks, and prose describes draft intent; a
retrieved test path does not establish that the test ran. All intent documents remain draft. Fixture
scores assess candidate retrieval in this bounded synthetic project, not universal quality.
