# Weftlet npm releases

`@weftlet/core@0.1.1` and `@weftlet/toolkit@0.1.1` are published. Their first trusted
publication passed in [run 39661957651](https://github.com/jchewitt/weftlet/actions/runs/39661957651)
from commit `720a5f964fe3cb6c438be6d22b4aa8b4ad44de17`, with matching registry archive integrity,
npm provenance and a fresh public CLI installation. Earlier Weftlet and `@launch-echo` releases
remain available and undeprecated. GitHub and npm owner names need not match.

Live Codex authentication follow-up remains tentative and non-blocking, as accepted by the
maintainer. Deterministic release checks still apply. Linux/WSL is the validated full release
preparation route; native Windows has focused CI coverage. See [validation](VALIDATION.md).

## Normal development and release

1. For a change that should ship, run `pnpm changeset`, choose patch/minor/major and write a short
   user-facing description. Commit the generated Markdown with the change. The bump type is a
   contributor decision, not inferred from commit messages. Documentation-only work that does not
   need an npm release can omit a changeset.
2. On main pushes, **Release version PR** opens or updates a bot PR. Core and toolkit are a fixed
   release group: a release of either advances both to the same version. The PR contains package
   versions, dependency/lockfile updates, changelogs, a generated `.changeset/release-plan.json`,
   and an updated extraction inventory. Original source hashes remain unchanged.
3. Review the version PR and its checks, then merge it. This commits the versions to `main`
   **before** npm publication. Do not manually bump manifests or edit the generated plan.
4. The plan change triggers **Weftlet release**. It validates and prepares both archives, publishes
   core followed by toolkit using npm trusted publishing, then verifies registry integrity.
5. After both versions are verified, a separate job creates tags such as `@weftlet/core@0.1.2`
   and `@weftlet/toolkit@0.1.2`, plus corresponding GitHub Releases, at that exact source commit.
   Existing tags are never moved. The publication job does not commit back to main.

The bot uses GitHub's built-in token, not a personal access token. GitHub may require Settings →
Actions → General → Workflow permissions → **Allow GitHub Actions to create and approve pull
requests**. The workflow grants its own explicit permissions; the repository default need not
be changed to write. The bot creates PRs; it does not approve or merge them. Since commits made
with `GITHUB_TOKEN` do not trigger ordinary PR workflows, it explicitly dispatches `check.yml`
on the release PR branch. Inspect the checks for the current PR commit before merging.

Versioning is automatic once changesets are supplied; publication remains dependent on passing
checks and configured environment rules. A failed publish can temporarily leave main ahead of
npm. Retry that release at the same commit/version instead of generating another bump.

## npm trust and GitHub environment

Trust is configured separately for both [core](https://www.npmjs.com/package/@weftlet/core) and
[toolkit](https://www.npmjs.com/package/@weftlet/toolkit), with these settings:

| npm setting | Value |
| --- | --- |
| Organization or user | `jchewitt` |
| Repository | `weftlet` |
| Workflow filename | `publish.yml` |
| Environment name | `npm-release` |
| Allowed action | Direct `npm publish` enabled |

The automation retains this identity, so existing npm trust needs no change. Keep npm account
2FA enabled. No npm token secret is required. If configuring a new trust relationship, consult
[npm's current requirements](https://docs.npmjs.com/trusted-publishers/), including its initial-use deadline.

`npm-release` is a GitHub deployment environment, not a machine or npm account. Its existing
configuration has no required reviewer or branch rules. The workflow itself requires main.
To add an approval pause, configure a required reviewer and main-only deployment branches under
Settings → Environments → npm-release. A sole maintainer approving their own releases must leave
**Prevent self-review** unchecked. The workflow honors those rules if configured; its YAML name
alone does not create review protection.

## Validation and manual preparation

Use Node 24 and pnpm 10.18.2. The full gate can run during ordinary development without a release plan:

```sh
pnpm install --frozen-lockfile
pnpm context-graph:publication-check
```

It runs build, deterministic tests, architecture, inventory, licenses and a fresh packed-consumer
smoke. The smoke exercises setup/config, automatic core installation, real TypeScript SCIP,
RDF/SHACL, visualization and MCP. No live model or public npm upload is invoked.

After the generated release PR is committed, `pnpm release:prepare` also packs both packages,
resolves workspace ranges, dry-runs unpublished versions and records source commit, versions and
SHA-512 integrity in `.release/manifest.json`. Review the manifest, tarball file lists and extraction
inventory. Preparation refuses pending changesets and stale release plans. It requires a clean
checkout. An existing npm version must match exactly; different bytes stop the release.

Actions → **Weftlet release** → **Run workflow** remains available on main. Leave **publish**
unchecked for preparation only, or select it for an intentional release of the committed plan.
The preparation job has read-only repository permissions and no OIDC permission. Its uploaded
`weftlet-release-N` artifact (`N` is the run attempt) is the exact publication input. The publish
job installs no project dependencies and performs no build. It alone has `id-token: write`;
the separate release-record job has `contents: write` and no npm publishing permission.

Actions and npm are pinned; npm 11.21.1 is used for OIDC. OIDC preconditions require the expected
repository, main, a push/manual trigger, hosted runner and OIDC request variables. Ambient npm
tokens are rejected and npm configuration is isolated. `npm whoami` is skipped because it cannot
validate trusted publishing. npm verifies the identity and creates provenance. There is no token
fallback. JavaScript pnpm and standalone `@pnpm/exe` are supported for local tooling.

## Delayed visibility and failed releases

Publication is sequential, not atomic across packages. Registry visibility and integrity of core
are checked before toolkit is uploaded. An identical existing release is skipped. Only HTTP 404
is treated as pending; authentication, network and integrity failures stop publication.

After npm accepts an upload, the publisher writes a package/integrity-specific `.accepted.json`
receipt and polls public metadata up to 21 times, 15 seconds apart. It never intentionally uploads
an accepted version again. A process interruption between acceptance and receipt writing still
requires inspection of npm state.

For a failed GitHub run, use **Re-run failed jobs** on the original run. Each attempt saves
`weftlet-publication-state-N` with exact archives and receipts, even on failure. The next attempt
restores the latest earlier receipt artifact from that same run before publishing. Artifact lookup
errors, expired latest receipts or ambiguous state fail instead of silently discarding evidence.
Artifacts are retained for 30 days. Release-record creation is also idempotent: a retry completes
missing records without moving tags or duplicating releases.

Do not start a new workflow run while an accepted package is still processing: different runs do
not share receipts. If artifacts expired, inspect npm and recover the original archives/receipts
before proceeding. Do not bump versions to hide a partially published release. Once both versions
are visible, exact integrity checks make retries safe. A newly prepared archive that differs from
the original is an error, even if its package version is the same.

For authorized local recovery, restore the original `.release/` at its manifest's commit, then:

```sh
npm login --registry=https://registry.npmjs.org
pnpm release:publish
```

Use an interactive terminal for npm browser/2FA challenges. Local publication uses normal login
and disables CI provenance. `WEFTLET_NPM_TOKEN` (legacy `TENTLY_NPM_TOKEN`) remains available for
an explicitly authorized token environment; never commit tokens or pass them to the OIDC workflow.
Local publication does not create GitHub tags/releases automatically; the verified workflow's
record job is the normal route.

## Inspecting and consuming releases

Package-specific tags identify the exact published source, for example:

```sh
git fetch --tags
git switch --detach '@weftlet/toolkit@0.1.2'
```

Tags support inspection and reproduction, not mutation of npm history. To roll a consumer back,
install an earlier published version; fixes to a release need a new changeset/version.

Verify a new public release in a fresh disposable project, substituting its version:

```sh
npm init -y
npx --yes @weftlet/toolkit@0.1.1 init --yes
npx --yes @weftlet/toolkit@0.1.1 config validate
```

Check registry hashes, transitive core resolution and provenance. Deprecating the previous
`@launch-echo` names is a separate action after replacement verification; never unpublish them.
