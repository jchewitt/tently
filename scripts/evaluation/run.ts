import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createContextGraphApplication } from '../../src/application/application.js';
import { createSemanticExtractor } from '../../src/extraction/providers.js';
import { sha256, stableJson } from '../../src/infrastructure/util.js';
import { atomicRename } from '../../src/storage/atomic-rename.js';
import { scoreImpactCase, validateSuite, type EvaluationSuite } from './score.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evaluatorSources = ['scripts/evaluation/run.ts', 'scripts/evaluation/score.ts',
  'evaluations/weftlet/document-only.mjs'];
const { values } = parseArgs({ options: {
  ref: { type: 'string', default: 'HEAD' }, snapshot: { type: 'string' },
  output: { type: 'string', default: '.context-graph/evaluation/weftlet/report.json' },
  config: { type: 'string', default: 'evaluations/weftlet/context-graph.config.json' },
} });
const suiteBytes = await readFile(resolve(root, 'evaluations/weftlet/cases.json'));
const suite = JSON.parse(suiteBytes.toString('utf8')) as EvaluationSuite;
const application = await createContextGraphApplication(resolve(root, values.config!));
// This command never initiates a live provider run. Score a separately hydrated, reviewed
// Codex configuration with --snapshot instead; a missing snapshot never triggers refresh.
if (!values.snapshot && (application.config.semantic.provider !== 'module' ||
    application.config.semantic.providerIdentity !== 'weftlet-document-only-v1' ||
    application.config.semantic.providerModule !== './evaluations/weftlet/document-only.mjs')) {
  throw new Error('Only the document-only control may refresh here; use --snapshot for provider evaluations');
}
const commitSha = values.snapshot
  ? (await application.snapshotStore.read(values.snapshot))?.manifest.commitSha
  : await application.repository.resolveRef(values.ref!);
if (!commitSha) throw new Error('Evaluation snapshot is absent; no refresh was attempted');
validateSuite(suite, await application.repository.listAllFilesAt(commitSha));
let hydration;
if (!values.snapshot) {
  hydration = await application.hydrator.hydrate({ ref: commitSha, headName: application.headName,
    onProgress(event) { process.stderr.write(`[evaluation] ${event.phase}\n`); } });
}
const snapshot = hydration?.snapshot ?? await application.snapshotStore.read(values.snapshot!);
if (!snapshot) throw new Error('Evaluation snapshot is absent');
if (snapshot.manifest.repositoryId !== 'jchewitt/weftlet' || snapshot.manifest.overlayDigest ||
    snapshot.manifest.configurationDigest !== sha256(stableJson(application.config))) {
  throw new Error('Evaluation requires committed Weftlet evidence with a matching configuration');
}
const results = [];
for (const item of suite.cases) {
  process.stderr.write(`[evaluation] scan ${item.id}\n`);
  results.push(await scoreImpactCase(application.queryService, snapshot, item, suite.budget));
}
const counts: Record<string, number> = {};
for (const fact of snapshot.facts) counts[fact.extractor.id] = (counts[fact.extractor.id] ?? 0) + 1;
const extractorPaths = Object.fromEntries(Object.keys(counts).sort().map((id) => [id,
  [...new Set(snapshot.facts.filter((fact) => fact.extractor.id === id).map((fact) => fact.provenance.path))].sort()]));
// Identity construction is lazy: saved scoring does not load a module, read artifact caches,
// check Codex login, or need the model/compiler/indexer to be available.
const providerIdentity = createSemanticExtractor(application.config.semantic, application.repositoryRoot).identity;
const report = {
  schemaVersion: 1, status: 'advisory-evaluation', generatedAt: new Date().toISOString(),
  evaluatorCommit: await application.repository.resolveRef('HEAD'),
  evaluatorSourceDigests: Object.fromEntries(await Promise.all(evaluatorSources.map(async (path) =>
    [path, sha256(await readFile(resolve(root, path)))]))),
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  excludedWorkingChanges: await application.repository.workingChanges(),
  suiteDigest: sha256(suiteBytes), configuration: application.config, snapshot: snapshot.manifest,
  modelQuality: application.config.semantic.providerIdentity === 'weftlet-document-only-v1'
    ? 'not-evaluated: no semantic assertions or model calls' : 'requires human review of semantic assertions',
  hydration: hydration ? { extracted: hydration.semanticExtracted, reused: hydration.semanticReused } : 'saved-evidence-only',
  coverage: { totalFacts: snapshot.facts.length, extractorCounts: counts,
    extractorPaths,
    semanticAssertions: snapshot.facts.filter((fact) => fact.extractor.id === providerIdentity).length,
    runtimeReferences: snapshot.runtimeEvidence.length,
    approvedIntentSources: application.config.approvedIntentSources ?? [] },
  results,
  limitations: [
    'Expected paths are reviewable hypotheses, not exhaustive labels or approved product policy.',
    'Recall measures candidate file relationship retrieval, not a proven dependency path or whether a proposed change is safe.',
    'Unjudged results are not false positives. Distraction controls measure query noise, not false graph assertions.',
    'Presence of a test file does not prove that behavior was tested or that the test passed.',
    'Missing relationships are gaps in this extraction/configuration, not proof of missing implementation.',
    'A successful evaluation command means measurement completed; it is not a quality or merge gate.',
  ],
};
const output = resolve(root, values.output!);
await mkdir(dirname(output), { recursive: true });
const temporary = `${output}.${randomUUID()}.tmp`;
try {
  await writeFile(temporary, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  await atomicRename(temporary, output);
} finally { await rm(temporary, { force: true }); }
process.stdout.write(JSON.stringify({ report: output, snapshot: snapshot.manifest.snapshotId,
  results: results.map(({ id, recall, exploration }) => ({ id, recall, exploration })) }, null, 2) + '\n');
