# Evaluate Weftlet in a real project

Run this trial on the machine where you develop the consumer project. Weftlet is a local
toolkit and MCP server; it does not require a hosted Weftlet service or this project's Codex
development workspace. Saved evidence queries work without a model login. Hydrating selected
prose uses the configured provider; an OAuth failure may block new extraction but does not
remove an already published snapshot.

Use a pinned, reviewed toolkit version and its matching documentation. The current `main`
contains features beyond npm `0.1.2`, including explicit routing declarations. To evaluate
those features before their release, use both locally prepared package archives from the
same reviewed commit; see [release preparation](RELEASING.md). Record that commit separately
from the package version, which does not change with every development commit.

## Choose tasks before querying

Start with three small, real changes: a shared contract change, a downstream consumer across
an asynchronous boundary, and a local implementation change. Before the first query, write
down each task, changed paths, expected consumers/contracts/tests/documents and why they
matter. Include a few plausible but irrelevant files as noise controls. Record the expected
relationships, not just filenames. Keep these initial expectations when reviewing results;
record later corrections separately instead of changing the denominator after seeing a score.

Review configuration and source scope before hydration. Begin with a few explicitly selected
documents and bounded `maxDocuments`, `maxSourceBytes`, `timeoutMs` and `retries`. Keep your
existing ChatGPT login mode if that is your chosen provider; there is no need to switch to
API billing. See [provider configuration](PROVIDERS.md). A second unchanged hydration should
reuse semantic artifacts. Do not use `--force-semantic` for that check.

Commit the project inputs you want indexed. Hydration reads the chosen commit while leaving
the active checkout alone; it excludes uncommitted edits. Test/workspace source inclusion and
package aliases may need an explicit [TypeScript source project](ADR-010-committed-source-indexing.md).
Do not approve documents, add routing mappings or change extraction scope merely to improve
the first measurement. Record such changes as a separate comparison with its own snapshot.

## Capture a private run

The following commands use Bash on Linux/WSL and an already installed project-local toolkit.
Ensure `.context-graph/` is ignored first. From the consumer repository root, start a dedicated
Bash session with `bash`, then run the blocks below in that same session. Fail-fast settings
exit that session on an error while retaining the bundle; fix the cause before starting a new
trial. Native PowerShell needs equivalent redirection/exit-status handling. This recipe does
not install packages, authenticate, commit files or upload results.

```bash
set -euo pipefail
git check-ignore -q .context-graph/trials/
trial="$PWD/.context-graph/trials/$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$trial"
printf 'Private trial directory: %s\n' "$trial"
weftlet_cmd=("$PWD/node_modules/.bin/weftlet")
config="$PWD/context-graph.config.json"

# Captures each command's exact arguments, streams, status and elapsed seconds.
capture() {
  local label="$1" started=$SECONDS status
  shift
  test ! -e "$trial/$label.argv.json" || return 1
  node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1), null, 2)+"\n")' \
    "$@" > "$trial/$label.argv.json"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$trial/$label.started.txt"
  if "$@" > "$trial/$label.stdout" 2> "$trial/$label.stderr"; then
    status=0
  else
    status=$?
  fi
  printf '{"exitCode":%s,"elapsedSeconds":%s}\n' "$status" "$((SECONDS-started))" \
    > "$trial/$label.result.json"
  return "$status"
}

capture project-commit git rev-parse HEAD
capture working-state git status --porcelain=v1 --untracked-files=all
capture runtime node -p 'JSON.stringify({node:process.version,platform:process.platform,arch:process.arch})'
capture packages npm ls @weftlet/toolkit @weftlet/core --json
capture config "${weftlet_cmd[@]}" config show --config "$config"
capture doctor "${weftlet_cmd[@]}" doctor --config "$config"
```

Keep the initial task expectations in `expectations.md` in this private directory before
continuing. Retain your
package lockfile, toolkit commit if using a development build, and Codex version if selected.
`doctor` reports readiness without a model request; its successful exit does not mean every
reported dependency is available or that live extraction works. There is no CLI `--version`
command; the package metadata above records installed versions.

After reviewing source scope and the provider budget, run hydration and its reuse check:

```bash
evidence_ref=$(cat "$trial/project-commit.stdout")
capture hydrate "${weftlet_cmd[@]}" hydrate --config "$config" --ref "$evidence_ref"
snapshot=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).snapshotId)' "$trial/hydrate.stdout")
capture hydrate-repeat "${weftlet_cmd[@]}" hydrate --config "$config" --ref "$evidence_ref"
capture diagnostics "${weftlet_cmd[@]}" diagnostics show --config "$config" --snapshot "$snapshot"
capture shacl "${weftlet_cmd[@]}" validate --config "$config" --snapshot "$snapshot"
```

Compare `hydrate.stdout` and `hydrate-repeat.stdout`: with unchanged inputs/configuration,
expect the same `snapshotId` and `contentDigest`, zero `semanticExtracted` on the repeat and
the expected `semanticReused` count. With no selected prose, zero reused is expected and
does not test model extraction. A refresh failure is an infrastructure/extraction result,
not a semantic-quality pass. Keep its status and stderr, and query an earlier snapshot by
its recorded ID if useful; identify that historical evidence in the trial.

## Record what the agent actually sees

Replace the example task and path with the first predeclared task. Keep this request fixed
while paginating, including its snapshot and budgets:

```bash
request=(impact scan --config "$config" --snapshot "$snapshot" \
  --changed-file src/example.ts --task 'Describe the planned change here' \
  --max-facts 60 --max-depth 32 --json)
capture task1-page1 "${weftlet_cmd[@]}" "${request[@]}"
continuation=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).exploration?.continuation ?? "")' "$trial/task1-page1.stdout")
if test -n "$continuation"; then
  capture task1-page2 "${weftlet_cmd[@]}" "${request[@]}" --continuation "$continuation"
fi
```

For subsequent pages, read the token from the **last** response and keep a new filename for
each page. Start with a declared three-page budget per task; preserve the final continuation
and `depthLimitReached`/`truncated` fields if you stop there. Exhausting a page budget is not
proof that other consumers are absent. Repeat for tasks two and three with distinct labels.
Keep all pages actually used, including complete provenance, coverage, ranking version and
`evidenceState`. Queries do not refresh evidence. Historical or draft evidence cannot satisfy
current-diff validation just because it contains useful relationships.

For an agent using MCP, retain the actual `impact.scan` request arguments and complete tool
responses from the client session, including continuations and any errors. Weftlet does not
persist a tool-call transcript automatically. A separate CLI replay can aid diagnosis but
does not establish what the agent saw. Also retain a short account of what the agent changed
in its implementation or test plan because of these results, and the actual test outcomes.

Retain the selected immutable snapshot, not just the mutable head pointer. With workspace
storage, it is `<repositoryRoot>/<storagePath>/snapshots/<snapshotId>.json`; the default
`storagePath` is `.context-graph`. `storageScope: "user"` instead uses a configuration/checkout
hash directory under `~/.cache/context-graph`. Preserve the original store and exact
configuration if its resolved path is uncertain. Semantic artifacts under `artifacts/semantic/`
contain model output; keep them locally if extraction debugging is needed. They are not
required to query an existing snapshot. Do not copy credentials or whole account directories.

## Review usefulness and share only the result

For each expected relationship, record whether it appeared on page one, later within budget,
or was missed. Distinguish an absent extracted link from a reachable link beyond the budget
when the retained snapshot permits that diagnosis. Manually check cited source lines against
the recorded commit and assess whether the relationship is supported. Record wrong identities,
contradictions, misleading authority, irrelevant results and useful unexpected discoveries.
Intent approval, model assertion review, implementation, tests and runtime observations remain
separate; a test-file link does not prove that a test ran or passed.

Record elapsed hydration/query time, cache reuse, provider failures and whether the findings
changed the development decision. Keep missing evidence, rule violations and infrastructure
failures separate. These three tasks are a bounded usefulness trial, not a universal accuracy
score or a merge gate. Optional [source-checkout evaluation tooling](IMPACT-EVALUATION.md)
can score saved snapshots using an independently authored case suite; it is not an installed
`weftlet evaluate` command, and its reduced witnesses do not replace the raw pages above.

Keep the bundle private with the consumer project: configuration, paths, task text, snapshots,
model artifacts and agent transcripts can contain private product information. Do not dump
environment variables, login files or full prompts into a shared report. Share a reviewed
summary containing versions/SHAs, counts, timings, misses and a small sanitized reproduction
when possible. Browser checks can be done separately using the [viewer guide](VIEWER.md)
and [interaction checklist](ENVIRONMENT-VALIDATION.md#browser-run-through-browser-mcp).
