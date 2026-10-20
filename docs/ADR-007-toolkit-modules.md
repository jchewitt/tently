# ADR 007: organize the toolkit by responsibility

Status: implemented as a behavior-preserving refactor after public release 0.1.0.
The user requested internal module organization after publication. Additional internal
dependency rules are proposed/advisory; the existing approved neutral-core gates remain hard.

The extraction baseline retained a flat toolkit source tree. With extraction, graph queries,
snapshot handling, providers, presentation and governance now present, that layout hid useful
boundaries. Keep the two-package distribution and give each responsibility an internal module.
Do not turn directory organization into a new backend migration or public API redesign.

| Module | Responsibility and interfaces |
| --- | --- |
| `configuration` | Load/validate portable configuration and resolve cache locations. |
| `repository` | Read Git evidence, materialize committed trees, select files and identify working content. |
| `infrastructure` | Process execution, consumer module resolution and shared neutral utilities. |
| `storage` | Read/write graph snapshots and extraction artifacts; no application orchestration. |
| `graph` | Evidence authority, RDF representation, queries and diagnostics over supplied evidence. |
| `extraction` | Prose/providers/citations, TypeScript SCIP, runtime evidence and ontology compilation. |
| `application` | Assemble adapters and services; orchestrate hydration, saved evidence, overlays and freshness checks. |
| `interfaces` | CLI/MCP transport, request parsing, setup and diagnostics commands. |
| `governance` | Translate the canonical policy into dependency analysis and evidence-backed reports. |
| `visualization` | Render the same queried evidence and viewer interactions. |

The toolkit's internal modules consume the neutral `@launch-echo/tently-core` contracts
directly. Internal callers import the specific module they need; there are no new blanket
module barrels or additional npm packages. The small root files preserve the supported
library, core and telemetry exports and executable locations. Imports into private `dist/`
implementation paths are not public package exports; the installed-consumer test uses the
new internal SCIP path explicitly. Public entry points and exported names remain unchanged.

Unit/module tests remain beside the implementation. Cross-module, installation/startup and
portability tests live in `tests/`; release-helper tests live beside the scripts. The product
independence test scans nested runtime files recursively. Moving tests must not reduce the
suite's coverage. A clean build removes obsolete compiled files before compiling either
package, preventing old flat modules from being shipped beside the new layout.

`architecture.policy.json` now maps individual modules and proposes executable restrictions:
evidence/infrastructure modules must not depend on application or presentation; graph queries
must not reach into extraction or persistence; storage and repository must not depend on higher
evidence modules; implementation must not import the public/CLI entry points. These rules
exclude test files as import origins so integration tests can exercise several modules.
Rules are advisory until the owner explicitly approves them. No new approval, baseline or
exception is inferred from a file move. Historical debt fingerprints and source inventory
hashes remain intact; inventory destination paths follow moved files.

This does not split large functions, remove complexity findings, change graph semantics,
change snapshot identities/formats, fix the outstanding native Windows issues or publish
another npm release. The published 0.1.0 archives remain immutable; this development change
needs a new version before future publication.
