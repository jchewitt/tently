# Migrating from Tently to Weftlet

The project is now Weftlet. LaunchEcho remains the maintainer; the GitHub repository remains
[jchewitt/tently](https://github.com/jchewitt/tently). Check [release status](RELEASING.md) before
installing the new names: source preparation is not proof of public npm availability.

| Previous package / command | Replacement |
| --- | --- |
| `@launch-echo/tently` | `@weftlet/toolkit` |
| `@launch-echo/tently-core` | `@weftlet/core` |
| `tently` | `weftlet` |
| `context-graph` | Still supported; `weftlet` is the primary CLI |
| `context-graph-mcp` | Still supported; `weftlet-mcp` is the primary MCP binary |

After the new release is public, replace the old dependency using your package manager. For
an npm project that installed the toolkit as a development dependency:

```sh
npm uninstall @launch-echo/tently
npm install --save-dev @weftlet/toolkit
npx weftlet config validate
npx weftlet doctor
```

If core was a direct dependency, replace it with `@weftlet/core` using the same dependency type
as before. If it was transitive, the toolkit brings it in automatically. Update library imports:

```ts
import { ContextGraphHydrator } from '@weftlet/toolkit';
// Existing /core and /telemetry toolkit subpaths remain available under @weftlet/toolkit.
```

Change `@launch-echo/tently-core` imports to `@weftlet/core`. Public export names are retained.
Update scripts and MCP client commands. A fresh npx invocation uses:

```sh
npx @weftlet/toolkit init
npx --yes --package @weftlet/toolkit weftlet-mcp
```

Keep `CONTEXT_GRAPH_CONFIG` pointing to your existing configuration. Do not rerun `init` over
an existing project. `context-graph.config.json`, `.context-graph/`, schema versions, ontology
identities and saved evidence formats do not change for this rename. Existing semantic artifacts
are not invalidated just because the npm package names changed. CLI `toolkit` is also shipped
so npm can infer an executable from the scoped package basename; use `weftlet` in your own scripts.

Weftlet includes the post-Tently module organization and explicit Codex authentication selection.
ChatGPT login is the default, while API authentication is opt-in. Live authentication validation
is tentative and non-blocking, as accepted by the maintainer; see [providers](PROVIDERS.md).
Native Windows limitations remain documented in [validation](VALIDATION.md).

The old `@launch-echo` releases remain immutable and usable. Do not unpublish them. Deprecation
is a later registry action, only after both replacements and a fresh public installation are
verified. This migration does not modify or reintegrate the original TradePilot repository.
