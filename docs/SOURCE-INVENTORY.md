# Source inspection and export boundary

Inspected commit: `fda97e0146099543aeaa6b338ef2b0e9fab0d1d6`.
The requested commit was fetched for read-only inspection into temporary storage outside this
destination. The source checkout, branches, configuration and services were not changed.
The destination was verified as `/workspace/tently`, origin `github.com/jchewitt/tently`.

`extraction-manifest.json` enumerates every imported committed file with its original SHA-256.
Only `tools/context-graph` tooling is imported. Private product documents are reference-only;
the adapter, product ontology, configuration profiles and trace harness are excluded.
Tests using synthetic product names are adapted to public examples. Source-integration tests
that read the application are replaced with standalone boundary checks, not claimed as executed.
Apache-2.0 licenses and LaunchEcho copyright/attribution are retained.

## Findings verified in source

| Area | Evidence and consequence |
| --- | --- |
| Neutral boundary | `packages/core` holds records/interfaces; composition loads adapters dynamically. |
| Semantic extraction | `semantic.ts` invokes Codex, validates structured citations, then renders OML deterministically. |
| Ontology | `ontology.ts` invokes openCAESAR in Docker. The compiled RDF is digest-bound but not the query backend. |
| Graph assembly | `hydrator.ts` separately combines semantic, document, SCIP, adapter and runtime facts into JSON. |
| Queries | `query.ts` uses bounded traversal, with a three-hop search and fact limits; no SPARQL execution. |
| Rules | Adapter invariant evaluators are TypeScript; no active OWL reasoner is wired into hydration. |
| Indexing | `static.ts` bundles SCIP TypeScript; no universal language support is established. |
| Editing | `agent-context.ts` may hydrate during a read; `hydrator.ts` requires an exact clean checkout. |
| Viewer | HTML/DOT/SVG render Context Packs; this is a bounded viewer, not a complete explorer. |
| Packaging | Published files omit examples/agent templates; the root launcher builds the product adapter and changes cwd. |
| Root dependencies | Build/test/license/publication commands depend on monorepo scripts and pnpm workspace membership. |

Root package/workspace/TypeScript configuration and tooling ADR, owner and validation documents
were read as reference. Their historical validation claims are not destination validation.
Minimal destination equivalents replace root automation; no monorepo lockfile is imported.

## Export status

On 2026-10-20 the user authorized pushing the reviewed destination to `jchewitt/tently` after
fixing the secondary review findings, so it can be cloned and tested locally. This authorization
initially covered the destination Git repository only. A subsequent request authorizes npm
publication using the maintainer-selected `@launch-echo` scope. That release used
`@launch-echo/tently` and `@launch-echo/tently-core`; original notices and source hashes remain
unchanged. Registry authentication is still pending. No repository visibility change is authorized.
`extraction-manifest.json` records both authorization scopes.

On 2026-10-21 the maintainer selected and created the `@weftlet` scope and authorized migration
to `@weftlet/core` and `@weftlet/toolkit`. This changes destination package names only; the original
source SHA, imported-path inventory, copyright and attribution remain intact. The maintainer subsequently renamed GitHub to
`jchewitt/weftlet` on the same date; the checkout remains `/workspace/tently`. See [migration](MIGRATING-TO-WEFTLET.md) and [release status](RELEASING.md).

## Checkout line endings

Destination inventory hashes use Git's CRLF-to-LF conversion only when Git would apply it to that
path. Checks use `hash-object` without writing objects or staging; they do not change the index,
Git configuration or checkout bytes. Binary and `-text` files retain their exact bytes. Real
content edits still invalidate the inventory. Original imported source hashes are never normalized
or recalculated. Custom clean filters/working-tree encodings on CRLF inputs are rejected instead
of executed by the checker. Updates preserve CRLF in existing checkout files and the manifest.
Generated license-notice checks also tolerate CRLF formatting while comparing the complete text.
