import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { ContextGraphConfig } from './config.js';
import type { ExtractionContext, GraphSnapshot } from './core.js';
import { GitRepository } from './git.js';
import { withCommittedTree } from './committed-tree.js';
import { FileSnapshotStore } from './storage.js';
import { RepositoryContractExtractor, RepositoryFileExtractor, ScipSymbolExtractor, ScipTypeScriptIndexer } from './static.js';
import { sha256, stableJson } from './util.js';
import { contextPackEvidenceAuthority } from './query.js';
import { inWorkingScope, readWorkingContent } from './working-content.js';

const execute = promisify(execFile);
const implementationExtractors = new Set([
  'repository-file-extractor', 'repository-contract-extractor', 'scip-symbol-extractor',
]);

/** Conservative code overlay: reindex implementation; invalidate changed prose, never synthesize intent. */
export async function buildWorkingOverlay(
  repository: GitRepository,
  config: ContextGraphConfig,
  store: FileSnapshotStore,
  storageRoot: string,
  baseSnapshotId: string,
  agent = 'default',
): Promise<GraphSnapshot> {
  const base = await store.read(baseSnapshotId);
  if (!base || base.manifest.overlayDigest) throw new Error('Overlay requires a committed base snapshot');
  if (base.manifest.configurationDigest !== sha256(stableJson(config))) {
    throw new Error('Overlay configuration must match its base snapshot');
  }
  const head = await repository.resolveRef('HEAD');
  if (head !== base.manifest.commitSha) throw new Error('Overlay base must match checkout HEAD');
  const changed = await repository.workingChanges();
  if (changed.length > 500) throw new Error('Overlay exceeds the 500 changed-path bound');
  const captured: { path: string; content: Buffer | null }[] = [];
  const roots = [...config.codeRoots, ...config.semanticSources, ...config.evidenceRoots,
    ...config.contractPatterns];
  const excluded: string[] = [];
  for (const path of changed) {
    if (!inWorkingScope(path, roots)) {
      excluded.push(path);
      continue;
    }
    const content = await readWorkingContent(repository.root, path);
    captured.push({ path, content });
  }
  const overlayCapture = {
    files: captured.map(({ path, content }) => ({ path, digest: content === null ? null : sha256(content) })),
    sourcePatterns: roots, excludedPaths: excluded,
  };
  const overlayDigest = sha256(stableJson({ version: 2, ...overlayCapture }));
  const snapshotId = `${head}-overlay-${sha256(base.manifest.contentDigest + overlayDigest).slice(0, 32)}`;
  const affected = new Set(captured.map((file) => file.path));
  const facts = await withCommittedTree(repository.root, head, async (root) => {
    for (const file of captured) {
      const target = join(root, file.path);
      if (file.content === null) await rm(target, { force: true });
      else {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.content);
      }
    }
    const git = (...args: string[]) => execute('git', args, { cwd: root });
    await git('init', '--quiet');
    await git('add', '.');
    await git('-c', 'user.name=Context Graph Draft', '-c', 'user.email=draft@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Isolated overlay input');
    const draftRepository = new GitRepository(root);
    const context: ExtractionContext = {
      repositoryRoot: root, repositoryId: config.repositoryId, ref: 'HEAD',
      commitSha: await draftRepository.resolveRef('HEAD'), snapshotId,
      changedPaths: captured.filter((f) => f.content !== null).map((f) => f.path),
      deletedPaths: captured.filter((f) => f.content === null).map((f) => f.path),
      renamedPaths: {},
    };
    const scip = await new ScipTypeScriptIndexer(config.scip, storageRoot).index(context);
    const extractors = [
      new RepositoryFileExtractor(draftRepository, config.codeRoots, scip.digest),
      new RepositoryContractExtractor(draftRepository, config.contractPatterns,
        config.contractConsumerRoots ?? config.codeRoots, config.contractAliases),
      new ScipSymbolExtractor(draftRepository, scip),
    ];
    return (await Promise.all(extractors.map((e) => e.extract(context)))).flat().map(({ id: _id, ...fact }) => {
      const draft = { ...fact, snapshotId, authority: 'draft' as const,
        provenance: { ...fact.provenance, commitSha: head } };
      return { ...draft, id: sha256(stableJson(draft)) };
    });
  });
  const retained = base.facts.filter((fact) =>
    !implementationExtractors.has(fact.extractor.id) &&
    contextPackEvidenceAuthority(fact) !== 'implemented' &&
    fact.extractor.id !== 'otlp-runtime-evidence' &&
    !affected.has(fact.provenance.path) &&
    ![fact.subject, fact.object].some((node) => [...affected].some((path) =>
      node.id === `component:file:${path}` || node.id === `document:${path}` || node.label === path,
    )),
  ).map((fact) => ({ ...fact, snapshotId }));
  const allFacts = [...retained, ...facts].sort((a, b) => a.id.localeCompare(b.id));
  const overlay: GraphSnapshot = {
    ...base,
    manifest: {
      ...base.manifest, snapshotId, baseSha: head, overlayDigest, overlayCapture,
      generatedAt: new Date().toISOString(), contentDigest: sha256(stableJson(allFacts)),
    },
    facts: allFacts,
    invariants: base.invariants.map((rule) => ({
      ...rule, status: 'unknown', message: `Draft overlay requires revalidation: ${rule.invariantId}`,
    })),
    runtimeEvidence: [],
    unresolved: [
      'Draft implementation overlay: changed semantic documents require explicit re-extraction.',
      `Changes outside configured source scope are excluded: ${excluded.join(', ') || '(none)'}`,
    ],
    diagnostics: [],
  };
  if (await repository.resolveRef('HEAD') !== head) throw new Error('HEAD changed during overlay capture; retry');
  await store.write(overlay);
  await store.updateHead(`overlay-${sha256(`${resolve(repository.root)}:${agent}`).slice(0, 24)}`, snapshotId);
  return overlay;
}
