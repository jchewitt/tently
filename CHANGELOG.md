# @weftlet/toolkit

## 0.2.0

### Minor Changes

- 991f93b: Resolve explicit Markdown document links against committed files, preserving precise citations and evidence authority. Report missing targets without guessing or expanding directory mentions, and align test-file identities with SCIP. New graph-v3 snapshots preserve older saved evidence. Add implementation references to the project docs and package the Markdown parser for independent consumers.
- 1c2c699: Add opt-in committed TypeScript source projects with explicit test-file selection and local package aliases. Keep source-project changes and indexed workspace imports in draft overlay scope, and document the measured impact-retrieval improvement on Weftlet.
- 5b8d496: Add opt-in committed routing declarations for explicitly mapped producer/consumer dependencies.
  Preserve declaration citations and inferred authority, report missing/ambiguous mappings, and
  rebuild draft routing evidence across edits, renames and deletions without replacing saved snapshots.

### Patch Changes

- 8e82453: Document a reproducible impact-retrieval baseline on Weftlet's own source, with bounded recall, extraction gaps and explicit limits on semantic-quality claims.
- 2e4a3bb: Prioritize nearby consumers and varied evidence sources in impact.scan while preserving the same reachable facts and continuation coverage. De-emphasize shared unresolved imports and keep keyword matches within proximity tiers. Responses identify the ranking version; continuation tokens from older orderings require restarting the scan. Saved snapshots remain unchanged and can be queried without refresh.
- e54ad71: Scope relative module requests to their importing directory so identical import spellings
  do not connect unrelated domains. Refreshes and draft overlays receive versioned identities;
  existing snapshots remain queryable and unchanged semantic artifacts remain reusable.
- 6f2f83f: Support standard global and local npm Codex launchers on Windows consistently across diagnostics,
  login checks and extraction, without a command shell. Bound executable discovery and terminate
  launcher child processes on cancellation. Preserve inventory integrity across Git CRLF checkouts
  and accept CRLF formatting in generated license notices while still rejecting substantive edits.
- Updated dependencies [2e4a3bb]
  - @weftlet/core@0.2.0

## 0.1.2

### Patch Changes

- 7969bc5: Add reviewed release PR automation, synchronized package versions and changelogs, and
  verified package tags and GitHub Releases after trusted npm publication.
- Updated dependencies [7969bc5]
  - @weftlet/core@0.1.2
