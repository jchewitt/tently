# ADR 009: Committed release versions and verified publication records

Status: accepted by the maintainer, 2026-10-21.

Contributors use Changesets to declare release intent. A bot opens a release PR containing
versions, changelogs, lockfile updates and extraction inventory. Core and toolkit form a fixed
release group while the publication process handles both together. This is a release policy;
it does not merge their source or interface boundaries. Independent versioning would require
an explicit change to publication selection and recovery.

The toolkit lives at repository root. Include `.` explicitly in the pnpm workspace so Changesets
sees both packages. The custom version command wraps the real Changesets CLI, records the
previous/new versions in `.changeset/release-plan.json` and updates inventory after changeset
consumption. Original extraction hashes are never regenerated from destination files.

Merge the version PR before publishing. Main therefore records the intended npm version without
a post-publication bot commit. The generated plan triggers the existing `publish.yml`, retaining
npm's configured trusted-publisher identity and optional environment protection. Pending changesets
or mismatched/non-advancing plans block publication. Failed releases may leave main ahead of npm;
recover the same version rather than issuing another bump. No cross-system transaction is claimed.

The version bot has contents, PR and workflow-dispatch permissions. It explicitly dispatches checks
on its PR branch because GitHub suppresses ordinary workflow events from GITHUB_TOKEN writes.
It never merges or approves PRs. Publication uses read-only source permissions plus OIDC; a separate
job receives contents-write permission only after both public archive integrities match. That job
creates package/version tags and GitHub Releases at the published commit. Existing tags are never
retargeted and retries complete missing records idempotently.

Retain per-attempt archives and acceptance receipts. A retry of the same run restores its latest
earlier state before uploading; unreadable/expired/ambiguous recovery evidence fails explicitly.
A new run does not inherit receipts. This preserves delayed-registry handling without treating
authentication/network errors as absence. Publishing both packages and creating records are not
atomic operations; the documented recovery route retains their exact source and archive identity.

Deterministic fixtures exercise the actual CLI with root/core packages, patch/minor changes,
changelogs, generated plan, lockfile and inventory. Record tests cover npm integrity failures,
existing-tag conflicts, interrupted creation and repeated calls. Artifact-selection tests cover
attempt ordering and expired/ambiguous state. Hosted bot operation and live publication evidence
are recorded separately in [validation](VALIDATION.md); tests alone do not establish npm authorization.
