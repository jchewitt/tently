import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GraphSnapshot } from '@weftlet/core';
import type { ContextGraphConfig } from '../../src/configuration/config.js';
import { sha256, stableJson } from '../../src/infrastructure/util.js';
import { assertEvaluationRefreshAllowed, assertEvaluationSnapshot, isDocumentControl } from './protocol.js';
import type { EvaluationSuite } from './score.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const original: ContextGraphConfig = JSON.parse(readFileSync(resolve(root,
  'evaluations/weftlet/source-project.config.json'), 'utf8'));
const fixtureRoot = resolve(root, 'evaluations/dispatch/project');
const config: ContextGraphConfig = { ...original, repositoryId: 'example/dispatch-evaluation',
  semantic: { ...original.semantic, providerModule: relative(fixtureRoot,
    resolve(root, 'evaluations/weftlet/document-only.mjs')).split('\\').join('/') } };
const suite: EvaluationSuite = { schemaVersion: 1, status: 'hypotheses', repositoryId: config.repositoryId,
  budget: { maxFacts: 60, maxDepth: 32, maxPages: 3 }, cases: [] };
const snapshot: GraphSnapshot = { manifest: { snapshotId: 'snapshot', contentDigest: 'digest', commitSha: 'commit',
  schemaVersion: 1, repositoryId: config.repositoryId, ref: 'commit', ontologyVersion: '1', extractorVersions: {},
  semanticModel: 'none', semanticPromptVersion: '1', generatedAt: '2026-10-22T00:00:00Z',
  semanticArtifactKeys: [], scipIndexDigest: 'scip', rdfDigest: 'rdf',
  configurationDigest: sha256(stableJson(config)) }, invariants: [], runtimeEvidence: [], unresolved: [], facts: [] };

describe('evaluation boundaries', () => {
  it('permits the same no-assertion control resolved from a separate project root', () => {
    expect(isDocumentControl(original, root, root)).toBe(true);
    expect(isDocumentControl(config, fixtureRoot, root)).toBe(true);
    expect(() => assertEvaluationRefreshAllowed(config, fixtureRoot, root)).not.toThrow();
    expect(() => assertEvaluationSnapshot(snapshot, config, suite)).not.toThrow();
  });

  it('rejects live providers and modules that only copy the control identity', () => {
    for (const semantic of [
      { ...config.semantic, provider: 'codex-cli' as const },
      { ...config.semantic, providerModule: './impostor.mjs' },
      { ...config.semantic, providerIdentity: 'different' },
      { ...config.semantic, providerModule: 'not-an-installed-provider' },
    ]) {
      expect(() => assertEvaluationRefreshAllowed({ ...config, semantic }, fixtureRoot, root))
        .toThrow('use --snapshot');
    }
  });

  it('rejects repository, suite and configuration mismatches rather than scoring unrelated evidence', () => {
    for (const manifest of [
      { ...snapshot.manifest, repositoryId: 'other/project' },
      { ...snapshot.manifest, configurationDigest: 'other' },
      { ...snapshot.manifest, overlayDigest: 'draft' },
    ]) expect(() => assertEvaluationSnapshot({ ...snapshot, manifest }, config, suite)).toThrow('committed evidence');
    expect(() => assertEvaluationSnapshot(snapshot, config, { ...suite, repositoryId: 'other/project' }))
      .toThrow('matching repository');
  });

  it('keeps historical suites without repository metadata usable with matching evidence', () => {
    const { repositoryId: _repository, ...legacySuite } = suite;
    expect(() => assertEvaluationSnapshot(snapshot, config, legacySuite)).not.toThrow();
  });
});
