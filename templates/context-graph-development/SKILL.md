---
name: context-graph-development
description: Use commit-keyed context graph evidence for nontrivial repository changes that may affect multiple components, contracts, invariants, or validation surfaces.
---
<!-- Modified for standalone extraction; see docs/extraction-manifest.json. -->

# Context Graph Development

Context Packs classify diagnostics as missing/ambiguous intent, implementation gaps, runtime gaps,
or drift. Verify their cited sources; no query match does not prove absence from the repository.
Normal queries cap each category and disclose omissions. Use `diagnostics show --snapshot <id>`
only for graph maintenance; omitted and legacy diagnostics do not expand an implementation task.

1. Identify the task, base/head SHA, governing document, checklist items, and initial files or
   symbols.
2. Call MCP `impact.scan` before implementation with the owner document, task, and checklist text.
   Queries only read saved evidence. Run the CLI `hydrate` explicitly when refresh is needed.
   Check the reported commit, configuration, scope and excluded working changes.
3. Inspect product intent, contracts/invariants, implementation/consumers, validation evidence,
   runtime evidence, confidence, unknowns, and source locations. Treat an empty coverage lane or
   relevant runtime gap as unresolved context.
4. Keep source approval, assertion review, implementation, test coverage and observed runtime
   behavior distinct. An inferred/unreviewed assertion citing an approved owner document still
   requires checking the citation. Never promote current behavior or model output into intent.
5. Query progressively for relationships that need detail. Follow continuation tokens and
   check depth truncation; rerun with a larger maxDepth when needed. Missing pages are not proof
   of missing dependencies.
6. Give subagents the bounded Context Pack, snapshot SHA, and unresolved assumptions.
7. Query again after material diff changes. Historical saved evidence remains useful context but
   cannot satisfy current-diff validation or merge gates.
8. Run invariant and evidence checks before local review and on the final diff.
9. Treat graph warnings as evidence to verify in source. Never fabricate results.
10. If MCP is unavailable, use the repository's context-graph CLI. If both fail, report the failure
    and proceed only when direct repository evidence makes the scope safe.

Configure source roots, adapters, telemetry mappings, and storage in the repository's context graph
configuration. Keep product vocabulary in an adapter rather than this generic workflow.
