# Cloud development environment

Destination: `/workspace/tently`, `github.com/jchewitt/tently`.
Tested: Linux, Node 24.19.0 and pnpm 10.18.2. `scripts/cloud-install.sh` installs the pinned
package manager into a writable workspace tool directory, sets writable caches, installs the
frozen lockfile and builds the neutral core/toolkit.

Start each shell session with:

```sh
export PATH=/workspace/context-graph-tools/node_modules/.bin:$PATH
export npm_config_store_dir=/workspace/.pnpm-store
export XDG_CACHE_HOME=/workspace/.cache
cd /workspace/tently
```

Use `pnpm context-graph:publication-check` for the deterministic build/test/governance/license/
inventory/installed-package gate. It does not publish. Use `node dist/cli.js doctor` to inspect
readiness. No background web server is required. MCP is a stdio process launched by its client;
use `node mcp-launcher.mjs` for development, with `CONTEXT_GRAPH_CONFIG` pointing at the consumer
configuration. Installed clients run `context-graph-mcp` directly.

Saved snapshot queries require no model or Docker. Refresh is explicit and operates on committed
inputs without changing the active checkout. Draft overlays are a separate explicit command.
The configured default ontology backend is RDF. Live Codex extraction is blocked here by an
immediate read-only filesystem error; authenticated login alone did not establish readiness.
Do not copy credentials or alter the managed CLI home to work around it.

The source was inspected read-only at the recorded SHA in temporary storage. It is not an
environment project checkout or an application dependency. No source installation, build, service
restart, branch change or remote write occurred.

All destination commits are local and unpushed. Fresh-task restoration of local-only commits is
not independently verified and is not reliably supported by the environment configuration
service. Retain this workspace; do not reset or push merely to make restoration appear verified.
Saving an environment draft does not apply/publish it. Review and activate it through environment
settings separately from any repository/package publication decision.
