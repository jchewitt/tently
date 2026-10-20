# Bounded evidence viewer

`context-graph visualize --changed-file src/discovery.ts --snapshot <id> --output graph.html`
renders the same Context Pack returned by `impact.scan`. HTML is self-contained; DOT and SVG
remain available. No CDN, service, model or alternative graph extraction is involved.

Nodes are grouped by evidence lane, then module/layer metadata or node kind. Filter by cluster,
authority or source text. Select a node (click or Enter) to inspect its relationships, confidence,
extractor, source approval, extraction review state and commit-bound citations. The neighbor
filter narrows the view. Select a target to highlight one shortest directed path within the
displayed page and enabled authority filters; edge direction follows the recorded predicate.

The status panel exposes commit/configuration/scope, excluded changes, draft/staleness, counts,
depth exhaustion and continuation. A missing path is not proof of no dependency. Retrieve another
page with `--continuation`, or rerun with a larger `--max-depth` when the depth bound was reached.
The viewer accepts at most 200 facts and 500 runtime references. References are shown separately;
only runtime facts present in the query become edges.

Source navigation displays exact paths, lines and commits. To link to a trusted code host, use:

```sh
context-graph visualize --snapshot <id> --output graph.html \
  --source-url-template 'https://github.com/OWNER/REPO/blob/{commit}/{path}#L{line}'
```

Templates must use HTTPS without credentials and include `{commit}` and `{path}`. No source URL is
invented by default. The artifact itself contains evidence labels and citations, so review it
before sharing it outside the repository.

Tests cover graph/fact equivalence, escaping, script syntax, source URL validation, path bounds,
cycles and coverage indicators. No real-browser automation or visual accessibility audit has run
in this cloud environment. This is a bounded inspection tool, not a whole-repository canvas.

Future sources such as Figma should enter through `ContextGraphAdapter` / `FactExtractor`,
preserving stable IDs, source citations, approval boundaries and extraction identity. They must
produce the same graph records and pass SHACL/projection tests. No Figma adapter is implemented.
