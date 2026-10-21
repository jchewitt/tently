# ADR 008: Weftlet package identity and publishing

Status: accepted by the maintainer, 2026-10-21. Publication and trusted-publisher validation are pending.

Use `@weftlet/core` for neutral contracts and `@weftlet/toolkit` for the implementation, CLI and
MCP server. Both new package names start at 0.1.0; npm versions belong to each package name, so
this does not replace or reuse the published Tently archives. The primary executable is `weftlet`.
Keep `context-graph` and `context-graph-mcp` aliases, configuration paths, graph identities and
public library exports compatible. Provide `toolkit` as the npm executable-inference alias and
`weftlet-mcp` as the branded MCP command. The source repository remains `jchewitt/tently`.

New package scope ownership was confirmed by the maintainer. Previous release evidence remains
recorded under its actual package names and commits. Preserve the extraction inventory, licenses
and LaunchEcho attribution; no source repository work is part of this change.

Release through an explicitly dispatched GitHub workflow. A preparation job with read-only
repository permissions installs, validates and packs the source; an environment-gated publication
job receives those exact artifacts and OIDC permission without installing project dependencies.
Archive integrity and source commit are verified before publication. Main-branch restriction,
serialized runs and configured environment reviewers constrain release initiation and approval.
The workflow defaults to preparation only. npm configuration must authorize the exact repository,
workflow and environment separately for each package.

Retain a normal npm login path for the initial publication and local recovery. OIDC mode is
explicit, requires a supported npm version and GitHub-hosted context, rejects ambient token
variables, isolates npm user/global configuration and skips `npm whoami`, which does not validate
OIDC publication rights. The registry verifies the identity; local preconditions are not proof of
trusted publishing. Publication is sequential and resumable, not atomic across the two packages.

Do not deprecate or unpublish old packages during preparation. Verify public replacement installs
first. Follow [release instructions](RELEASING.md) and [consumer migration](MIGRATING-TO-WEFTLET.md).
