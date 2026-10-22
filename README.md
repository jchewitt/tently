# Weftlet — Context Graph Toolkit

Weftlet is an open-source context-graph toolkit that helps AI development agents understand
how a local change affects the broader product. It connects approved product intent, shared
contracts, implementing code, downstream consumers, tests and observed runtime evidence.

Agents can query cited evidence and explore dependencies across module and asynchronous
boundaries. See the [roadmap](docs/ROADMAP.md) and [validation](docs/VALIDATION.md) for
supported capabilities and limitations.

## Set up a project

Weftlet uses `@weftlet/toolkit`; its neutral `@weftlet/core` dependency is installed
automatically. Both packages are available on npm at `0.1.2`.
See [release status](docs/RELEASING.md). Existing Tently users should follow
the [migration guide](docs/MIGRATING-TO-WEFTLET.md).

From your TypeScript project's directory (Node 24+):

```sh
npx @weftlet/toolkit init
npx @weftlet/toolkit config validate
npx @weftlet/toolkit doctor
```

`init` asks for the repository ID, code roots, selected document paths and model, then writes
`context-graph.config.json` and adds `.context-graph/` to `.gitignore`. It fills in the internal
version fields, requires no Git commit or Codex login to run, and refuses to overwrite existing
configuration. Setup makes no model requests. For automation:

```sh
npx @weftlet/toolkit init --yes --repository-id your-org/your-project --code-root src --semantic-source docs/product --evidence-root tests
```

Source flags may be repeated. Without `--semantic-source`, non-interactive setup selects no
documents. Owner-approved sources always start empty; explicitly review and set
`approvedIntentSources` in the JSON file. Select contracts using `contractPatterns`.
Use `--config .config/context-graph.json` for another configuration location,
`--directory /path/to/project` to initialize another project, or `--no-gitignore` to leave
ignore rules alone. Configuration remains JSON; `config show` displays the validated settings.

Review the selected sources, configure Codex authentication when using semantic documents,
and commit the inputs you want indexed before hydrating:

In Weftlet, `semantic.auth.mode` defaults to `chatgpt`, using your existing Codex
ChatGPT login. API billing requires explicitly selecting `api-key`; credentials stay in an
environment variable. See [authentication configuration](docs/PROVIDERS.md#codex-authentication)
for both modes and their tentative validation status. The earlier `@launch-echo/tently@0.1.0` release predates this option.

```sh
npx @weftlet/toolkit hydrate --ref HEAD
npx @weftlet/toolkit impact scan --changed-file src/search.ts --json
```

Hydration with selected documents may incur model charges. Saved queries do not call a model.
Docker is optional for openCAESAR; the default RDF backend needs no Docker.
For a project-local dependency, install `npm install --save-dev @weftlet/toolkit` and use
`npx weftlet` or the compatible `npx context-graph` alias. MCP clients can launch
`npx --yes --package @weftlet/toolkit weftlet-mcp` with `CONTEXT_GRAPH_CONFIG` set to
the project's absolute configuration path. Pin a reviewed version for reproducible agent setup.

Linux/WSL is the validated full-suite path. Native Windows has a recorded live Codex pass;
the archive-byte, snapshot replacement and MCP startup regression suite also passes hosted
Windows CI. Full native Windows release preparation remains separately unvalidated.
See the [validation record](docs/VALIDATION.md).

## Development

The development source is organized by responsibility; see
[toolkit modules and boundaries](docs/ADR-007-toolkit-modules.md). The two npm packages and
their public library entry points retain the same API under the new package names.
The module refactor was not part of the earlier Tently 0.1.0 release.

The toolkit requires Node.js 24 or newer; Node 24 is the validated runtime.
Use pnpm 10.18.2 for development. The neutral core package has no toolkit runtime dependencies
and retains its separate Node.js 20.11+ declaration.

```sh
git clone https://github.com/jchewitt/weftlet.git
cd weftlet
nvm install
nvm use
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm context-graph:publication-check
```

The `.nvmrc` selects Node 24. If you do not use nvm, install Node 24 through your usual
version manager. The project rejects unsupported Node versions during installation, and
CLI/MCP startup reports a version error before loading runtime dependencies.

The publication check packs and installs into a disposable consumer, indexes actual TypeScript
and exercises the installed toolkit. It does not publish. Core and toolkit retain separate
package boundaries; no product adapter is required.

## Independent repository

Copy `examples/generic-typescript` into a separate repository, or adapt its
`context-graph.config.json` beside your own sources. Paths resolve relative to that configuration.
Configure semantic source selection, TypeScript roots/indexer arguments, contract aliases,
evidence roots, runtime evidence, storage and optional adapter explicitly.
For tests excluded by the build config or workspace packages whose outputs are absent from
committed archives, configure an [explicit TypeScript source project](docs/ADR-010-committed-source-indexing.md)
with selected files and local package aliases.

Install the locally packed core and toolkit tarballs together. The installed commands are
`weftlet`, `weftlet-mcp`, and the compatible `context-graph` / `context-graph-mcp` aliases. For example, after preparing a release:

```sh
npm install --save-dev /path/to/weftlet/.release/weftlet-core-0.1.1.tgz /path/to/weftlet/.release/weftlet-toolkit-0.1.1.tgz
npx weftlet init
```

Pass `--config /absolute/path/context-graph.config.json`
to the CLI or set `CONTEXT_GRAPH_CONFIG` for MCP. No launcher rebuild is required for installed
packages. `node mcp-launcher.mjs` is for development in this repository.

```sh
context-graph hydrate --config context-graph.config.json --ref HEAD
context-graph impact scan --config context-graph.config.json --capability search --json
context-graph visualize --config context-graph.config.json --capability search --output graph.html
```

Semantic hydration requires a working configured provider. Direct RDF is the default;
Docker/openCAESAR is an optional explicit backend. Run `context-graph doctor` for setup diagnostics.
Committed indexing and ontology input use disposable archives, preserving the active checkout.
Saved-snapshot queries do not invoke either dependency or refresh automatically. Responses report
commit, configuration, source scope and excluded working changes. Use `hydrate` explicitly to
refresh evidence; `--snapshot` selects historical evidence. Working-change overlays are a separate
operation. `context-graph overlay --base-snapshot <id> --agent <name>` captures a bounded draft
implementation overlay; query its returned ID with `--snapshot`. Changed prose is invalidated
pending re-extraction. Queries compare captured file digests with current working bytes and
report subsequent edits separately from captured and excluded changes. Older overlays without
capture metadata have unknown freshness. Historical or draft evidence cannot validate a current diff.

## Evidence limits

Approved owner documents govern intent. Code describes implementation; tests describe what
was checked; traces describe observed behavior for their deployment. Model assertions require
valid citations and remain inferred/unreviewed even when their source is explicitly approved.
Source approval is recorded separately from assertion review. Missing coverage is not a pass.

The current implementation supports TypeScript SCIP indexing, immutable JSON snapshot envelopes,
a lossless RDF/SPARQL query path, SHACL integrity checks, paginated `impact.scan` traversal and
HTML/DOT/SVG output. Active OWL reasoning and a complete interactive explorer are not claimed.
See `examples/pipeline` for a six-stage asynchronous flow and `docs/ADR-004-rdf-query-path.md`
for query bounds and authority configuration.

Never submit credentials, account data or private runtime payloads as semantic sources.
Live provider tests are separate from deterministic CI. The maintainer authorized the GitHub
export and migration from the published `@launch-echo` names to `@weftlet`. Registry publication requires
an authorized npm identity. Repository visibility changes require separate authorization.

For changes that should ship, run `pnpm changeset` and commit the generated release note.
The bot prepares a version PR; merging it publishes those committed versions and records release
tags. See [npm release instructions](docs/RELEASING.md) for checks, trust settings and recovery.

See [provider contract](docs/PROVIDERS.md) for bounded extraction and adapters, and
[architecture policy](docs/architecture-policy.md) for deterministic governance.

See the [bounded viewer guide](docs/VIEWER.md) and [cloud setup](docs/CLOUD-ENVIRONMENT.md).

For development, `pnpm evaluate:impact` measures bounded candidate-file retrieval on Weftlet's
own committed source without model calls. See the [evaluation protocol and baseline](docs/IMPACT-EVALUATION.md)
for observed gaps and the distinction between retrieval measurements and live semantic quality.

## License and provenance

Apache-2.0. See [LICENSE](LICENSE), [NOTICE](NOTICE), and the
[source inventory](docs/SOURCE-INVENTORY.md) for attribution and extraction history.
