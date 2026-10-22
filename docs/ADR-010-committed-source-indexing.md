# ADR 010: explicit committed source projects for TypeScript indexing

Status: implemented as an opt-in indexing mode. No product-policy approval or new hard
architecture rule is implied.

Weftlet's self-evaluation found no SCIP test relationships and no linked shared core
contract. The build tsconfig excludes tests, and a disposable Git archive has no installed
workspace links or compiled package outputs. Merely listing `evidenceRoots` does not make
the TypeScript indexer include those files or resolve their package imports.

Keep ordinary SCIP invocation unchanged. Add `scip.sourceProject` for explicitly selecting
committed TypeScript files and mapping exact local module names to committed source entry
points. Generate a separate compiler configuration only in the disposable archive. This
allows indexing an older SHA without adding a new tsconfig to that commit, installing
dependencies, running package scripts, rebuilding the consumer, or borrowing dirty files
or workspace links from its active checkout.

## Configuration

```json
{
  "scip": {
    "version": "0.4.0",
    "command": "bundled-scip-typescript",
    "args": ["index", "--no-global-caches"],
    "sourceProject": {
      "include": ["src/**/*.ts", "tests/**/*.ts", "packages/core/src/**/*.ts"],
      "aliases": { "@weftlet/core": "packages/core/src/index.ts" }
    }
  }
}
```

Paths and globs are relative to the configured repository root, using `/`. Globs support
`*`, `**` and `?`; list files directly when appropriate. `.ts`, `.tsx`, `.mts` and `.cts`
files are supported by this selector. Add separate globs for each extension needed.
Aliases are exact module names, including explicit package subpaths, rather than wildcards.
Alias targets must exist in the selected commit and match `include`.

Select the files that **define** the contracts as well as their consumers. The pinned SCIP
indexer emits documents for explicitly selected files; resolving an import does not
automatically index every file behind it. For example, if an entry point re-exports a type
from another file, include that definition file too. There is no inferred mapping from
package `dist` exports to source; the configuration author supplies the source entry point.

This separate program uses ES2022, NodeNext module resolution, preserved JSX, no emit,
no ambient `types` packages, and the supplied aliases. It does not inherit build tsconfig
settings. Missing external dependencies and custom build/compiler behavior remain limits;
this is local symbol analysis, **not** a successful type check or proof of complete dependency
resolution. Use the existing `scip.args` path with a committed dedicated tsconfig when that
configuration is more appropriate. Do not combine `sourceProject` with custom commands,
workspace discovery, inferred configs or additional CLI arguments: this first mode requires
exactly the command and args above and rejects conflicting choices.

Bounds: 1–100 include patterns, at most 100 aliases and 1–5,000 selected committed files.
Paths cannot be absolute or escape the repository. Empty selections, missing/unselected
alias targets and the reserved `.weftlet-scip-source-project.json` path fail before SCIP
starts. Existing archive protections against symlinks, submodules and oversized archives
remain in force. The generated project is removed with its disposable tree.

Configuration participates in snapshot/cache identity. Existing immutable snapshots remain
queryable. Source-project patterns also participate in change tracking and overlay capture,
including files outside `codeRoots`/`evidenceRoots`. Changed code stays draft; rename/delete
reindexing replaces relationships. Neither test-file inclusion nor a typed test reference
establishes that a test ran or passed.

## Evidence and remaining work

Real SCIP regressions cover a workspace entry point, re-exported contract, a test excluded
by the build config, dirty and ignored files, repeat digest stability, committed renames
and deletions, and draft capture outside ordinary code roots. A fresh packed consumer
checks the new runtime assets and an excluded test resolved through a source alias.

The [fixed self-repository evaluation](IMPACT-EVALUATION.md) adds this profile without
changing its source SHA, expected files, query budgets or ranking. It improves candidate
retrieval and supplies typed test/core-contract relationships. It does not resolve prose
intent linkage, external dependency installation, live model quality or query-ranking gaps.
