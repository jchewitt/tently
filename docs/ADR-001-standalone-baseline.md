# ADR 001: preserve the baseline before changing the graph

Status: accepted for the extraction milestone.

Keep the neutral core as a separate workspace package and the toolkit at repository root.
Retain the tested Codex, SCIP, semantic citation and ontology code initially. The source's
product adapter is design evidence only; an independent consumer needs no product dependency.
Use an explicit manifest rather than importing source history or the monorepo workspace.

The first gate is deterministic build/test plus installation of packed artifacts into an
independent Git repository with real TypeScript indexing and MCP initialization. Real model
and openCAESAR integration are distinct checks and must not be reported as passing when unrun.

Graph migration, snapshot lifecycle and governance changes have separate acceptance criteria.
No model-generated statement becomes approved intent by virtue of extraction or compilation.
An evidence record describes what its source supports, not a universal product truth.
