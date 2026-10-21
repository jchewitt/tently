# Weftlet npm releases

The maintainer published `@weftlet/core@0.1.0` and `@weftlet/toolkit@0.1.0`; both versions
and their archive integrity are verified against the public registry. Current source prepares
`0.1.1` for both packages, with independent-project descriptions and updated documentation.
The earlier `@launch-echo/tently-core@0.1.0` and `@launch-echo/tently@0.1.0`
releases remain available and undeprecated; their public installation evidence is in
[validation](VALIDATION.md). GitHub is now `jchewitt/weftlet`; npm and GitHub owner names need not match.

Live Codex authentication validation is tentative and non-blocking for release, as accepted by
the maintainer. Deterministic release checks still apply. Native Windows limitations remain
recorded; use Linux or WSL for the full release gate. See [consumer migration](MIGRATING-TO-WEFTLET.md).

## Trusted-publisher setup

The initial manual publication is complete. Sign in to npm with package administration permission
and configure **both** [core](https://www.npmjs.com/package/@weftlet/core) and
[toolkit](https://www.npmjs.com/package/@weftlet/toolkit): Settings → Trusted Publisher →
GitHub Actions, using the following identity:

| npm setting | Value |
| --- | --- |
| Organization or user | `jchewitt` |
| Repository | `weftlet` |
| Workflow filename | `publish.yml` (filename only) |
| Environment name | `npm-release` |
| Allowed action | Enable direct `npm publish` |

On GitHub, create repository Settings → Environments → `npm-release`. Restrict deployment branches
to `main` and configure a required reviewer. A sole maintainer must be allowed to approve their own
release: leave **Prevent self-review** unchecked when approving your own runs. Do not rely on the YAML environment
name alone: an automatically created environment has
no review protection until you configure it. No npm token secret is required for OIDC publication.
Keep npm account 2FA enabled. The package's repository metadata already identifies `jchewitt/weftlet`.

npm trusted-publisher setup is not validated merely by saving these settings. Test with a later,
intentional versioned publication. Current npm documentation says a new trust configuration must
be used within two days or it expires; configure it close to the intended release, and reconfirm
that behavior in [npm's documentation](https://docs.npmjs.com/trusted-publishers/).

## Prepare reviewed archives

Use Node 24 and pnpm 10.18.2 in a clean, committed checkout. The new namespace starts at 0.1.0;
subsequent content changes require a new version for the affected packages. Update the lockfile
when changing workspace dependency versions. Never overwrite or republish an existing version.

```sh
nvm install
nvm use
pnpm install --frozen-lockfile
pnpm release:prepare
```

This runs build, deterministic tests, architecture checks, extraction inventory, license checks
and a fresh packed-consumer smoke. The smoke uses a disposable registry for the two local packages,
exercises npx inference and automatic core installation, and checks SCIP, RDF/SHACL, visualization
and MCP. No live model or public npm upload is invoked.

Preparation packs with pnpm, resolves workspace dependency ranges and records commit, names,
versions and SHA-512 integrity in `.release/manifest.json`. Review it, the tarball file lists and
`docs/extraction-manifest.json`. Existing versions must match the prepared archive exactly;
unpublished versions receive an npm dry run. A dry run does not establish OIDC authorization.

Both JavaScript pnpm and standalone `@pnpm/exe` are supported. The publisher must find npm's
JavaScript entry point beside Node. The workflow pins npm 11.21.1; trusted publishing requires
at least npm 11.5.1. Use the workflow's pinned tools when reproducing CI release preparation.

## Initial or local publication with npm login

From the same clean checkout and reviewed archives, in an interactive terminal:

```sh
npm login --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org
pnpm release:publish
```

Complete npm's browser/2FA challenge when requested. Do not pipe or redirect the publication
command: npm needs terminal input and output for the interactive flow. The default `login` mode
retains npm's normal credentials and uses `whoami`; it does not silently select OIDC.

For an authorized token environment, `WEFTLET_NPM_TOKEN` is supported through a temporary,
restricted-permission npm configuration containing only the literal variable reference. Legacy
`TENTLY_NPM_TOKEN` remains accepted if the new variable is absent. Never paste tokens in chat,
commit them, or provide either token to the trusted-publishing workflow. No cloud secret is needed
when publication happens from the maintainer's authenticated WSL session.

## GitHub trusted publication

The workflow `.github/workflows/publish.yml` is manually dispatched, main-branch only, and serialized.
It does not run on pushes or pull requests. From GitHub Actions → **Weftlet release** → **Run workflow**:

1. Select `main`. Leave **publish** unchecked for preparation only. Review the uploaded
   `weftlet-release` artifact and manifest in the run summary.
2. For an intentional release, select **publish**. The preparation job runs again on that exact
   commit, without publishing credentials. Inspect that run's artifact before approving its
   `npm-release` deployment; a different run's archive is not the approval target.
3. After configured environment approval, the publish job checks out the same source, downloads
   those artifacts and runs `node scripts/release.mjs --publish --auth=oidc`. It does not install
   project dependencies or rebuild the packages. Only this job has `id-token: write`.

Actions are pinned to commits. Neither job restores a dependency cache. OIDC mode requires a
GitHub-hosted runner, the expected repository/ref/manual trigger and OIDC request variables;
it rejects ambient npm token variables and isolates user/global npm configuration. npm performs
actual identity validation against each package's trust settings. `npm whoami` is deliberately
skipped in OIDC mode because it is not a trusted-publisher authorization check. Unsupported npm,
missing trust or rejected identity must fail; there is no token fallback configured by this workflow.

npm creates provenance for public packages published from this public repository through OIDC.
Local publication explicitly disables CI provenance. Prepared artifacts and synthetic OIDC tests
do not prove that a live trusted publish or provenance verification has succeeded.

## Ordering, delayed visibility and recovery

Before any upload, the publisher validates every archive hash and its source commit. It publishes
core first, waits for registry visibility and verifies integrity, then publishes the toolkit. An
existing identical release is skipped; different bytes at the same version stop publication.
Publication across packages is not atomic.

After npm accepts an upload it may remain invisible while processing. The publisher saves a
package/integrity-specific `.accepted.json` receipt under `.release/` and retries only public
metadata reads, up to 21 checks, 15 seconds apart. Only 404 is treated as pending. Never repeatedly
upload an accepted version. Keep `.release/` and retry `release:publish` later to resume verification.
A receipt cannot cover a process interruption before it is written; inspect registry state before
recovery. Authentication, network and integrity errors are not treated as missing packages.

The workflow uploads `weftlet-publication-state`, including receipts, even when publication fails.
For a processing timeout, recover those exact archives and receipts into `.release/` at the
manifest's source commit before an authorized local retry. Do not blindly rerun the whole workflow
while an accepted upload is still processing: a new run starts without the old receipt. Once a
release is visible, the normal integrity check safely skips its already published packages.

## Verify public installation before retiring old names

After successful publication, use a fresh disposable project:

```sh
npm init -y
npx --yes @weftlet/toolkit@0.1.0 init --yes
npx --yes @weftlet/toolkit@0.1.0 config validate
```

Use the actual release version for later releases. Verify registry versions and hashes, core's
transitive resolution, CLI/MCP operation and provenance when applicable. Update release status
only after those public checks pass. Deprecating the old `@launch-echo` names is a separate registry
action after replacement verification; never unpublish the old releases.
