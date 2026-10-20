# npm release

Package names selected by the maintainer:

- `@launch-echo/tently`: the CLI/MCP/toolkit users install.
- `@launch-echo/tently-core`: neutral contracts and utilities, installed transitively.

Both currently target version `0.1.0`. This is the initial standalone release, with the native
Windows limitations in `VALIDATION.md`. The old `@launchecho/context-graph-*` names were never
published by this extraction. Licenses and LaunchEcho attribution are preserved.

## Current status

The maintainer requested npm publication. Public registry reads returned 404 for both selected
names; this does not prove organization ownership or publishing permission. This cloud session
has no configured npm identity (`npm whoami` returns `ENEEDAUTH`), so no registry publish has
occurred. Authentication must be configured through a trusted npm login or secure CI settings,
never by putting credentials in repository files or chat.

## Prepare and review

Use Node 24, pnpm 10.18.2 and a clean checkout containing the reviewed changes:

```sh
nvm install
nvm use
pnpm install --frozen-lockfile
pnpm release:prepare
```

The repository's `.nvmrc` selects Node 24; use your preferred version manager if nvm is not
installed. Check `node --version` in the shell running the release. Node 22.14.0 cannot load
the locked Undici dependency: its missing `zlib.createZstdDecompress` causes failures before
the CLI or MCP starts. The toolkit now declares Node 24+ and checks this before dependency
loading. This replaces the earlier incorrect Node 20.11+ toolkit claim.

Both the JavaScript pnpm distribution and standalone `@pnpm/exe` are supported. The release,
license and package-smoke scripts detect which entry point pnpm supplied instead of passing
a native executable to Node. An `ELF` syntax error from the license check on an older checkout
is this launcher bug; pull the fix before retrying.

Preparation runs the full publication gate, including setup/config tests and a disposable
registry that serves only the two local archives. The npm exec test installs just
`@launch-echo/tently`, resolves its core dependency and infers the `tently` binary as npx does.
It exercises `init --yes`, `config validate` and `config show`. This is an installation test;
it does not publish packages to npm. The independent consumer also tests SCIP, RDF/SHACL,
visualization and MCP.

The command packs both workspaces with pnpm so `workspace:` dependency ranges become normal
version ranges, runs `npm publish --dry-run`, and writes `.release/manifest.json` with the
source commit, package versions and SHA-512 integrity of each tarball. Review that manifest,
the package contents and `docs/extraction-manifest.json`. `.release/` is ignored by Git.
Build outputs, credentials, caches and runtime evidence do not become source commits.

## Publish from an authorized environment

Authenticate an npm account with publishing permission for the `launch-echo` organization.
Use npm's normal login/2FA flow or configured CI credentials; do not add secrets to the project.
Then, from the same clean checkout and prepared archives:

```sh
npm whoami --registry=https://registry.npmjs.org
pnpm release:publish
```

Run publication directly in an interactive terminal (without piping or redirecting its output).
Enabling npm 2FA means publication can request an additional browser approval or one-time code;
complete npm's challenge in that terminal. The registry URL above is the public npm registry.
The publisher inherits terminal input/output for real publication so npm can perform its normal
2FA flow. An earlier wrapper captured stdout, which disabled npm's interactive challenge and
returned `EOTP` immediately. Pull the fix and prepare archives again before retrying.

For the managed cloud, configure `TENTLY_NPM_TOKEN` through secure environment settings with
access limited to `registry.npmjs.org`, then save and publish the environment configuration.
The saved requirement alone does not provide a token or activate it. Use a credential authorized
to publish both packages in the `launch-echo` scope. Never paste its value into chat or a file.
The release publisher uses a temporary, restricted-permission npm configuration containing
only the literal `${TENTLY_NPM_TOKEN}` reference and removes it afterward. Its own `whoami`
check uses that configuration; a separate bare `npm whoami` may still report no login.
Without this variable, the publisher retains normal npm login configuration.

The publisher verifies all archive hashes and the source commit before any registry write.
It publishes core first, then the toolkit, using public access. It verifies each published
archive's registry integrity. If a prior attempt published one package, rerunning skips it only
when the existing version has exactly the prepared integrity; a different archive at the same
version is an error. npm package publication is not atomic across the two packages.

Local publication explicitly disables provenance because it cannot generate a supported CI
attestation. On GitHub Actions the script requests provenance; that environment must have npm
publishing authentication/trusted publishing configured and `id-token: write`. Merely setting an
environment variable does not establish provenance or authentication. No automatic release runs
on repository pushes.

After successful publication, verify from a fresh project:

```sh
npx --yes @launch-echo/tently@0.1.0 init --yes
npx --yes @launch-echo/tently@0.1.0 config validate
```

Update the README and this release status only after public-registry installation succeeds.
The local tarball/disposable-registry smoke alone is not proof that a public release exists.
