# Validation evidence

Environment: Linux cloud, Node 24.19.0, pnpm 10.18.2. Source imported from
`fda97e0146099543aeaa6b338ef2b0e9fab0d1d6`. No source application was built or changed.

## Milestone 1: standalone baseline

Passed `pnpm context-graph:publication-check`:

- Core and toolkit TypeScript builds.
- 98 deterministic tests (1 core + 97 toolkit/example).
- Generated third-party dependency/license inventories.
- Packed core/toolkit installed in a separate temporary Git consumer.
- Real TypeScript SCIP indexing and extraction, runtime asset inventory,
  HTML/DOT/SVG rendering and installed MCP initialization/tool discovery.
- Missing snapshots produce an explicit MCP error.
- Development MCP tests cover missing/stale output rebuild and clean protocol error reporting.

One opt-in Docker/openCAESAR integration test was skipped. Real Codex extraction, Windows,
macOS and hosted CI were not run. Existing source validation records are not copied as evidence.
Synthetic semantic runner tests validate orchestration/citations/cache behavior, not model quality.

The initial pnpm 11 installation exposed a build-script policy mismatch; installing with the
pinned pnpm 10.18.2 resolved it. Four fixture adaptation failures (paths, sort order and query
labels) were corrected and the complete gate rerun successfully.

## Milestone 2a: saved evidence lifecycle

Passed TypeScript build, 15 affected tests across hydration, scope selection, lifecycle, final
checks and real SCIP indexing, followed by the independent package smoke test.
New checks exercise same-process concurrent publication, immutable conflict rejection, atomic
head updates, failed refresh preservation, dirty/untracked file reporting and two concurrent
committed materializations without changing Git status or registered worktrees.

The full baseline suite also passed after the main lifecycle change. Draft overlays and later
milestones require separate validation. Symlink/submodule materialization and archives over
128 MiB are explicitly unsupported; Windows/macOS remain untested.
