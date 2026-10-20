---
name: context-graph-development
description: Use commit-keyed context graph evidence for nontrivial repository changes that may affect multiple components, contracts, invariants, or validation surfaces.
---

# Context Graph Development

Context Packs classify diagnostics as missing/ambiguous intent, implementation gaps, runtime gaps,
or drift. Verify their cited sources; no query match does not prove absence from the repository.
Normal queries cap each category and disclose omissions. Use `diagnostics show --snapshot <id>`
only for graph maintenance; omitted and legacy diagnostics do not expand an implementation task.

1. Identify the task, base/head SHA, governing document, checklist items, and initial files or
   symbols.
2. Call MCP `impact.scan` before implementation with the owner document, task, and checklist text;
   let the repository integration prepare the exact-commit snapshot when supported.
3. Inspect product intent, contracts/invariants, implementation/consumers, validation evidence,
   runtime evidence, confidence, unknowns, and source locations. Treat an empty coverage lane or
   relevant runtime gap as unresolved context.
4. Keep declared intent (docs), implemented behavior (code/contracts/tests), and observed behavior
   (exact-deployment traces) distinct. Never promote current behavior into product intent.
5. Query progressively for relationships that need detail; do not dump the entire graph.
6. Give subagents the bounded Context Pack, snapshot SHA, and unresolved assumptions.
7. Refresh the scan after material diff changes.
8. Run invariant and evidence checks before local review and on the final diff.
9. Treat graph warnings as evidence to verify in source. Never fabricate results.
10. If MCP is unavailable, use the repository's context-graph CLI. If both fail, report the failure
    and proceed only when direct repository evidence makes the scope safe.

Configure source roots, adapters, telemetry mappings, and storage in the repository's context graph
configuration. Keep product vocabulary in an adapter rather than this generic workflow.
