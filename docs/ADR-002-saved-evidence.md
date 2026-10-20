# ADR 002: reads and refresh are separate operations

Status: implemented, with bounded validation.

`impact.scan` reads immutable snapshots and never starts a model, compiler or indexer.
Explicit hydration produces committed evidence in disposable archive directories, without
registering worktrees or requiring the active checkout to be clean. Symlinks/submodules and
archives larger than 128 MiB are currently rejected; they are not silently partially indexed.
The archive path requires `git` and `tar`; only Linux is validated.

Snapshot IDs bind configuration and semantic scope in addition to commit and runtime revisions.
User-scope cache heads are isolated by checkout identity. Snapshots publish via an atomic
create-if-absent operation; head pointers replace atomically only after a complete snapshot
exists. Concurrent conflicting content fails instead of replacing a winner.

Queries identify source commit, scope, configuration match and excluded working changes.
Final checks reject dirty working trees, old commits, configuration mismatch and draft overlays.
Historical evidence remains useful context; it never silently validates a current diff.

Draft overlays are a separate milestone. No inference about unchanged runtime behavior is
authorized merely because a committed snapshot is available.
