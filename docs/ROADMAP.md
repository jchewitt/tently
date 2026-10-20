# Delivery roadmap

The destination is `jchewitt/tently`. Source is read-only at
`launchecho/tradepilot@fda97e0146099543aeaa6b338ef2b0e9fab0d1d6`.
This roadmap records planned work, not completed capability.

1. **Standalone baseline (in progress).** Explicit export inventory, neutral core plus toolkit,
   public examples, portable launcher/configuration, build/tests, package-content checks and
   an independent installed consumer exercising real TypeScript SCIP indexing.
2. **Saved evidence availability.** Separate reads from refresh; identify scope/configuration,
   coverage and excluded changes; isolate committed hydration; atomic concurrent publication;
   failed refresh preserves the last valid evidence. Draft overlays are a separate submilestone:
   base SHA/content digest, replacement/invalidation, rename/delete and agent isolation tests.
3. **Unified graph.** RDF/SPARQL and SHACL over the same facts used by agents and visualization,
   with projection equivalence, bounded continuation, and a public multi-stage asynchronous flow
   extracted from documents and code. Test missing links, ambiguity and contradictions.
4. **Architecture governance.** Compare optional OML/OWL against RDF/SHACL and deterministic
   checks. Preserve useful semantic behavior and record parity before changing the default.
   Approved policy alone creates hard gates; gaps, violations and infrastructure failures differ.
   Integrate established dependency/complexity/duplication tools, scoped exceptions and debt deltas.
5. **Provider contract and DX.** Preserve Codex first, then test timeouts/cancellation/retries,
   model/cache identities, citation checks, bounded reuse and private-safe progress. Additional
   providers remain planned until tested. Substantial paid runs require authorization.
6. **Viewer.** Clustering, drill-down, paths, source navigation and authority/staleness filters
   on the same graph; extension seams for future adapters, without unrelated integrations.

Each milestone needs its own validation entry and decision record before being called complete.
No package publication, public push or source reintegration is authorized.
