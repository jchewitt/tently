# Canonical architecture policy

`architecture.policy.json` is the canonical executable definition. The graph, dependency rules
and reports derive from it; skills do not define additional conflicting architecture policy.

## Neutral core

Approval source: the extraction request explicitly requires preserving the neutral core/toolkit
boundary and keeping repository-specific behavior behind adapters. The core owns the shared graph
contracts and must not import toolkit implementation. These are deterministic hard gates.

Cycle, file-size, complexity and duplication findings are advisory until an owner approves a
specific policy. Size does not prove modularity; textual clones do not prove equivalent logic.
The tools provide candidates for semantic review.

Toolkit responsibilities and public entry points are described in
[ADR 007](ADR-007-toolkit-modules.md). The policy maps the internal directories separately;
the proposed internal import restrictions are executable advisory checks, not newly approved
CI gates. They check production import directions while allowing tests to assemble modules.
Directory moves change finding fingerprints; the historical baseline is retained unchanged
and no new finding is automatically waived.

Baseline entries must name an exact finding fingerprint, a reason and an approval reference.
Scoped exceptions additionally require rule/from/to and an expiry. The analyzer never writes or
advances baselines. New rule violations remain new even when other debt is baselined.
Missing source mappings, unresolved required imports and tool failures are separate report
categories and prevent a clean result.

Run `pnpm build` then `pnpm exec tsx src/cli.ts govern --policy architecture.policy.json`.
Analysis tools are development dependencies; installed consumers must install the documented
pinned tools to use governance. Missing tools produce infrastructure failures, not passing reports.

The initial extraction commit's advisory debt is recorded in `architecture-baseline.json`,
obtained by analyzing its isolated committed tree with the current tools. It is an informational
inventory, not permission to waive later findings. The policy starts with no hard-rule waivers.
Compare exact fingerprints; changed or new findings need review rather than an automatic baseline.

Governance snapshots can be queried and rendered using `--config architecture.context-graph.config.json`
and the `--snapshot` ID returned by `govern`. They contain the same dependency and policy facts used
by the checks. Install development tools at the pinned versions in `package.json` for governance;
Node 24 is the tested development runtime. Querying existing snapshots requires none of these tools.
