# ADR 012: order impact evidence by proximity and source diversity

Status: implemented as a query-only heuristic; not product policy or an evidence gate.

The self-repository evaluation found distractions connected through common imports such as
`node:fs/promises`. The previous ordering prioritized keyword counts, then Codex/document-link
extractor names, before hop distance. Global lane balancing could also bring a distant fact
forward ahead of close evidence. A large file could contribute many symbol facts before a
useful downstream consumer appeared.

Keep snapshot extraction, RDF projection, anchor matching, the reachable set, max-depth rules
and continuation coverage unchanged. Rank the existing bounded set in `graph/ranking.ts`:

- Direct matches start at zero. Other facts use shortest weighted paths from matching anchor
  nodes. Adapters that identify an anchor only through citations retain endpoint fallback.
- Ordinary relationships cost one. Following a Component/Evidence `consumes` edge upstream
  to a typed Contract costs four; following it towards a consumer costs one. This favors
  downstream consumers while retaining shared contracts and their definitions.
- Edges touching a generic `contract:module:` import node cost eight in both directions.
  Sharing a module specifier is weaker impact context than a resolved typed consumer or
  explicit product relationship. No module name or evaluation target is special-cased.
- Each additional fact from one provenance path adds one to its ranking score. This trades
  some repeated detail for earlier evidence from other sources. It is not a per-file cap.
- Within equal scores, task terms break ties and evidence lanes are balanced. Remaining
  ties use structural/citation fields with code-point ordering, not commit-derived IDs or
  runtime locale. Fact IDs only disambiguate otherwise indistinguishable records.

These ordinal weights are reviewable heuristics, not calibrated dependency probabilities.
They neither change confidence/authority nor claim that proximity proves a product dependency.
There is no special preference for a model provider, automatic promotion of approved intent,
new traversal cutoff, or removal of a weak fact. Page through to inspect lower-ranked evidence;
existing depth exhaustion remains explicit. Snapshot facts, provenance and identities are
unchanged, so saved evidence can be rescored without an indexer, compiler, provider or refresh.

Responses include `exploration.rankingVersion: proximity-diversity-v1`; the Markdown renderer
also identifies it. Continuations bind this version as well as snapshot identity/content and
request. Old or different ranking tokens fail with an instruction to restart the scan, rather
than reusing an offset against a changed order. Changing this policy requires a version bump.
The evaluator records the version and rejects changes between pages.

Tests cover many typed consumers of a large source, deep asynchronous relationships, common
imports with attractive keywords, citation-only adapters, stable order across input shuffles
and changed commit-derived IDs, full pagination, and old-token rejection. Real TypeScript/RDF
pipeline integration and packed-consumer queries exercise the same ordering path.

Compare against the exact saved document-link snapshot and unchanged four cases, 60 facts per
page, three pages, depth 32. Record candidate retrieval and labeled distractions together.
Even a successful comparison cannot establish exhaustive precision, prove a safe change, or
replace a broader semantic-quality evaluation. Large-graph performance and interactive browser
validation remain separate work.
