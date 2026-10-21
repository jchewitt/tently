# Cloud development environment

Destination: `/workspace/tently`, `github.com/jchewitt/weftlet`.
The checkout mount retains its original name; the GitHub repository was renamed on 2026-10-21.
Tested: Linux, Node 24.19.0 and pnpm 10.18.2. `scripts/cloud-install.sh` installs the pinned
package manager into a writable workspace tool directory, sets writable caches, installs the
frozen lockfile and builds the neutral core/toolkit.

Start each shell session with:

```sh
export PATH=/workspace/context-graph-tools/node_modules/.bin:$PATH
export npm_config_store_dir=/workspace/.pnpm-store
export npm_config_cache=/workspace/.npm-cache
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

The user authorized pushing reviewed destination commits to `jchewitt/tently` on 2026-10-20.
A fresh Git clone is the portable route for local testing. Cloud environment publication alone
does not publish repository commits or prove fresh-task restoration; those are separate checks.
Saving an environment draft does not apply/publish it. Review and activate it through environment
settings separately from any repository/package publication decision.

Optional npm publication uses the secure `WEFTLET_NPM_TOKEN` environment binding, scoped to
`registry.npmjs.org`. The older draft may still list `TENTLY_NPM_TOKEN`, which remains supported
as a compatibility alias. Neither secret is needed for development, validation, local npm login
or GitHub OIDC publication; no new cloud token requirement was added for the rename. See `RELEASING.md` for the publisher's temporary npm
configuration and archive verification. No credential value belongs in this repository.

See [environment validation](ENVIRONMENT-VALIDATION.md) for the hosted CI evidence, fresh-task
restoration procedure and browser-MCP checklist. These checks do not require live Codex.

Current package identity is Weftlet (`@weftlet/core`, `@weftlet/toolkit`). The checkout stays at
`/workspace/tently`; GitHub is now `jchewitt/weftlet`. GitHub OIDC publishing is configured separately through
`publish.yml` and the `npm-release` environment; no cloud npm token is required for that path.
See [releasing](RELEASING.md). Live auth validation remains tentative and non-blocking.

The architecture configuration retains `jchewitt/tently` as its stable graph repository ID.
This is an evidence identity, not a Git remote; renaming GitHub does not invalidate saved graphs.
