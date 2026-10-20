# Contributing

Keep changes within one roadmap milestone and record validation in `docs/VALIDATION.md`.
Run the build, deterministic tests and packaging smoke check for runtime changes.
Keep neutral contracts free of repository dependencies. Add product conventions through an
adapter rather than hard-coding paths or deployment assumptions into the toolkit.

Preserve evidence authority and source citations. Tests must distinguish missing evidence,
uncertainty, infrastructure failure and proven rule violations. Do not add paid provider
calls to ordinary or untrusted CI.

Preserve the Apache-2.0 notices and extraction manifest. Update modified-file notices when
adapting imported source. Never include secrets, private documents or graph snapshots in a PR.
No release/publish workflow is enabled.
