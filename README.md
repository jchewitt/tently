# Context Graph Toolkit

An extracted Apache-2.0 toolkit for connecting product intent, contracts, implementation,
tests and observed runtime evidence. Derived from LaunchEcho Context Graph; see
[NOTICE](NOTICE) and the [source inventory](docs/SOURCE-INVENTORY.md).

This is a standalone baseline under development. See [roadmap](docs/ROADMAP.md) and
[validation](docs/VALIDATION.md) for completed checks and limitations.

## Development

Requires Node.js 20.11+ and pnpm 10.18.2.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm context-graph:publication-check
```

The publication check packs and installs into a disposable consumer, indexes actual TypeScript
and exercises the installed toolkit. It does not publish. Core and toolkit retain separate
package boundaries; no product adapter is required.

## Independent repository

Copy `examples/generic-typescript` into a separate repository, or adapt its
`context-graph.config.json` beside your own sources. Paths resolve relative to that configuration.
Configure semantic source selection, TypeScript roots/indexer arguments, contract aliases,
evidence roots, runtime evidence, storage and optional adapter explicitly.

Install the locally packed core and toolkit tarballs together. The installed commands are
`context-graph` and `context-graph-mcp`. Pass `--config /absolute/path/context-graph.config.json`
to the CLI or set `CONTEXT_GRAPH_CONFIG` for MCP. No launcher rebuild is required for installed
packages. `node mcp-launcher.mjs` is for development in this repository.

```sh
context-graph hydrate --config context-graph.config.json --ref HEAD
context-graph impact scan --config context-graph.config.json --capability search --json
context-graph visualize --config context-graph.config.json --capability search --output graph.html
```

Full semantic hydration currently requires configured Codex CLI access and Docker/openCAESAR.
Committed indexing and ontology input use disposable archives, preserving the active checkout.
Saved-snapshot queries do not invoke either dependency or refresh automatically. Responses report
commit, configuration, source scope and excluded working changes. Use `hydrate` explicitly to
refresh evidence; `--snapshot` selects historical evidence. Working-change overlays are a separate
milestone. Historical evidence cannot validate a current diff.

## Evidence limits

Approved owner documents govern intent. Code describes implementation; tests describe what
was checked; traces describe observed behavior for their deployment. Model assertions require
valid citations and remain derived evidence. Missing coverage is not a pass.

The current implementation supports TypeScript SCIP indexing, JSON snapshots, bounded
`impact.scan` traversal and HTML/DOT/SVG output. SPARQL, SHACL, active OWL reasoning, draft
overlays and a complete interactive explorer are not part of the initial baseline.

Never submit credentials, account data or private runtime payloads as semantic sources.
Live provider tests are separate from deterministic CI. Public publication, registry naming
and the final export inventory require explicit maintainer authorization.
