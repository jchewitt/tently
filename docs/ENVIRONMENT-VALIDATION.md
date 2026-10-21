# Remaining environment validation

macOS is outside the maintainer's current validation scope. Treat the following checks
separately; a live model provider is not a prerequisite for deterministic development.

## Hosted CI: verified

GitHub-hosted Ubuntu run [39492039168](https://github.com/jchewitt/weftlet/actions/runs/39492039168)
completed successfully at `92ae118ccb22f59aaa150b1c8f3a009bdacc788a`. Its `deterministic` job
ran checkout and the repository's composite action. That action selects Node 24 / pnpm
10.18.2, installs the frozen lockfile and runs the complete publication gate, including the
packed-consumer smoke. It neither publishes packages nor invokes a live model. Codex/npm
publication credentials and the managed cloud filesystem are not needed by this job.

A subsequent hosted [run 39656137105](https://github.com/jchewitt/weftlet/actions/runs/39656137105)
passed at `4cdc4e5bc8b53bde3b23ce0be550146ac6ae817c`: the full Ubuntu job and a focused
Windows job covering storage contention, committed archive bytes and all original MCP startup
cases. This Windows subset does not establish full Windows release-preparation readiness.

The Windows reliability increment passed [run 39676848049](https://github.com/jchewitt/weftlet/actions/runs/39676848049):
34 native Windows tests plus repository inventory and license checks, and the full Ubuntu
publication gate with 178 deterministic tests. The npm launchers use a synthetic CLI fixture;
this does not claim live Codex authentication or a full Windows publication gate.

## Fresh cloud: requires a new task

Before publishing the current environment snapshot:

1. Commit/push destination work and confirm the reusable install/start instructions are current.
2. Run `bash scripts/cloud-install.sh` and `pnpm govern` using the shell exports in
   `CLOUD-ENVIRONMENT.md`.
3. Run `node scripts/check-restoration.mjs --checkpoint`, then `--verify` as a local rehearsal.
   This retains a public repository snapshot, its digest and a query configuration with an
   intentionally unavailable model provider under ignored `.context-graph/`.
4. Save/publish the environment configuration through the cloud UI. A draft save alone does
   not apply it or create a restored environment.

Open a genuinely new cloud task using that published environment and this destination repo.
An additional shell or a fresh clone in the same machine does not establish platform restoration.
Give the new task this instruction:

> Validate restoration using docs/ENVIRONMENT-VALIDATION.md. Record the actual environment,
> repository SHA and tool versions. Before rebuilding or running governance, run the saved
> evidence verification. Do not regenerate a missing checkpoint, install missing dependencies,
> call a model, publish packages or change tracked files to conceal a restoration failure.
> Then run the deterministic publication gate and record results and missing prerequisites.

In that new task:

- Check cwd/origin/SHA, Node 24+, pnpm 10.18.2, dependency availability and writable workspace
  caches. Apply the saved shell exports, without assuming exported variables or processes survived.
- Run `node scripts/check-restoration.mjs --verify` **first**. It checks the saved content hash
  and queries that exact snapshot despite the unavailable provider. Historical/configuration
  mismatch evidence must remain ineligible for current-diff validation. Missing retained files
  are a restoration result, not permission to regenerate proof.
- Run `pnpm context-graph:publication-check`. Record the tested SHA, results and optional skips.
  This rebuilds and exercises real SCIP, RDF/SHACL, snapshots, CLI/MCP and installed consumption.
- Record whether the environment actually came from a new task. Passing the rehearsal here
  establishes only current-instance behavior.

MCP is a client-launched stdio process; it must initialize afresh. No background web process
is required to survive restoration. Current tools do not let this agent create/publish a new
cloud instance; the user launches that final validation task through the cloud UI.

## Browser: run through browser MCP

Browser MCP is not attached in the current task. It can be attached to a browser-capable task
or run on HDesk. Use public evidence and generate a fresh HTML viewer with the corresponding
CLI JSON Context Pack. Keep the tested SHA, snapshot ID, JSON and HTML together. Serve it using
the browser tool's supported local/forwarded access; do not assume another machine's localhost
is reachable.

Check node selection by mouse and keyboard, detail/citation rendering, authority and cluster
filters, neighbor drill-down, directed path highlighting and the explicit no-path result.
Check commit/scope/coverage/staleness and truncation indicators against the JSON pack; an absent
path in a bounded page must not be presented as proof of no dependency. Check configured source
links, browser console errors and network failures. Capture screenshots/results and browser
version. Rendering HTML or testing its JavaScript functions alone does not establish interaction.

## Live Codex: separate remaining environment issue

The HDesk live Windows pass remains valid for its recorded commit/tool versions. The managed
cloud's earlier read-only-filesystem failure is still unresolved. First isolate CLI startup,
supported writable paths and managed runtime requirements using redacted diagnostics; do not
copy credentials or change the managed CLI home. Use a minimal public fixture and an explicit
model budget for a later live retry. A fresh-task live failure should be recorded separately
from successful deterministic restoration. HDesk can validate the adapter and browser behavior,
but cannot prove that a different hosted environment restored correctly.
