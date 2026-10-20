import { readFile, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import type { GraphFact, GraphSnapshot } from "@launch-echo/tently-core";
import { GitRepository } from "../repository/git.js";
import { RdfEvidenceGraph, CG, nodeIri } from "../graph/rdf.js";
import { sha256, stableJson } from "../infrastructure/util.js";
import { runProcess } from "../infrastructure/process.js";

export interface ArchitecturePolicy {
  schemaVersion: 1;
  roots: string[];
  modules: { id: string; path: string; domain: string; layer: string; adapter?: boolean }[];
  contracts?: { path: string; owner: string }[];
  rules: { id: string; kind: 'forbidden-import' | 'no-cycles' | 'contract-owner';
    from?: string; to?: string; approved: boolean; approvalRef?: string; transitive?: boolean }[];
  advisory: { maxLines: number; maxComplexity: number; duplicateMinTokens: number };
  baseline?: { fingerprint: string; approvalRef: string; reason: string }[];
  exceptions?: { fingerprint: string; ruleId: string; from: string; to: string;
    expires: string; approvalRef: string; reason: string }[];
}
export interface GovernanceFinding {
  category: 'rule-violation' | 'extraction-gap' | 'infrastructure-failure' | 'advisory';
  ruleId: string;
  from: string;
  to: string;
  message: string;
  fingerprint: string;
  disposition: 'new' | 'baseline' | 'exception';
}

export async function analyzeArchitecture(root: string, policy: ArchitecturePolicy, policyPath = 'architecture.policy.json') {
  const findings: GovernanceFinding[] = [];
  const add = (category: GovernanceFinding['category'], ruleId: string, from: string, to: string, message: string) => {
    const fingerprint = sha256(stableJson({ category, ruleId, from, to }));
    const exception = policy.exceptions?.find((item) => item.fingerprint === fingerprint &&
      item.ruleId === ruleId && item.from === from && item.to === to && item.reason && item.approvalRef &&
      new Date(item.expires).getTime() > Date.now());
    const baseline = policy.baseline?.find((item) => item.fingerprint === fingerprint && item.reason && item.approvalRef);
    findings.push({ category, ruleId, from, to, message, fingerprint,
      disposition: exception ? 'exception' : baseline ? 'baseline' : 'new' });
  };
  if (policy.schemaVersion !== 1 || !Array.isArray(policy.rules) || !policy.roots?.length) {
    throw new Error('Invalid architecture policy');
  }
  for (const rule of policy.rules) {
    if (rule.approved && !rule.approvalRef) throw new Error(`Approved rule ${rule.id} requires an approvalRef`);
    if (rule.kind === 'forbidden-import' && (!rule.from || !rule.to)) throw new Error(`Rule ${rule.id} requires from/to patterns`);
  }
  const repository = new GitRepository(root);
  const commitSha = await repository.resolveRef('HEAD');
  const dirtyPaths = new Set(await repository.workingChanges());
  const facts: GraphFact[] = [];
  const inputs: Record<string, string> = {};
  const policyDigest = sha256(stableJson(policy));
  const ruleFor = (name: string) => policy.rules.find((rule) => rule.id === name);
  let modules: { source: string; dependencies: { resolved: string; couldNotResolve?: boolean; coreModule?: boolean; matchesDoNotFollow?: boolean }[] }[] = [];
  try {
    const { cruise } = await import('dependency-cruiser');
    const result = await cruise(policy.roots, {
      baseDir: root, outputType: 'json', validate: true, tsPreCompilationDeps: true,
      doNotFollow: { path: 'node_modules' },
      ruleSet: { forbidden: policy.rules.filter((r) => r.kind !== 'contract-owner' && !r.transitive).map((rule) => ({
        name: rule.id, severity: rule.approved ? 'error' as const : 'warn' as const,
        from: rule.from ? { path: rule.from } : {},
        to: rule.kind === 'no-cycles' ? { circular: true } : { path: rule.to! },
      })) },
    }, { conditionNames: ['import', 'node', 'types', 'default'], exportsFields: ['exports'] });
    const parsed = JSON.parse(String(result.output));
    modules = parsed.modules;
    const external = new Set(modules.flatMap((module) => module.dependencies
      .filter((dependency) => dependency.coreModule || dependency.matchesDoNotFollow)
      .map((dependency) => dependency.resolved)));
    for (const violation of parsed.summary.violations) {
      const rule = ruleFor(violation.rule.name);
      add(rule?.approved ? 'rule-violation' : 'advisory', violation.rule.name,
        violation.from, violation.to, `Dependency rule violated${violation.cycle ? ': cycle detected' : ''}`);
    }
    for (const module of modules) {
      // Roots are entry points, not a filter on the transitive dependency closure.
      if (external.has(module.source) || /(?:^|\/)node_modules(?:\/|$)/.test(module.source)) continue;
      let content: string;
      try {
        const path = await realpath(resolve(root, module.source));
        const within = relative(await realpath(root), path);
        if (within === '..' || /^\.\.[\\/]/.test(within) || isAbsolute(within)) {
          add('extraction-gap', 'external-source', module.source, '', 'Required dependency is outside the repository boundary');
          continue;
        }
        content = await readFile(path, 'utf8');
      }
      catch { add('extraction-gap', 'unreadable-source', module.source, '', 'Required source could not be read'); continue; }
      inputs[module.source] = sha256(content);
      const membership = policy.modules.filter((m) => new RegExp(m.path).test(module.source));
      if (membership.length !== 1) add('extraction-gap', 'module-mapping', module.source, '',
        'Source needs exactly one canonical module/layer mapping');
      for (const dependency of module.dependencies) {
        if (dependency.couldNotResolve) {
          add('extraction-gap', 'unresolved-import', module.source, dependency.resolved, 'Import could not be resolved');
          continue;
        }
        if (dependency.coreModule || dependency.matchesDoNotFollow) continue;
        const lines = content.split('\n');
        facts.push({
          id: sha256(stableJson({ from: module.source, to: dependency.resolved, digest: inputs[module.source] })),
          subject: { id: `component:file:${module.source}`, kind: 'Component', label: module.source,
            attributes: membership[0] ? { domain: membership[0].domain, layer: membership[0].layer,
              module: membership[0].id, adapter: Boolean(membership[0].adapter) } : {} },
          predicate: 'consumes',
          object: { id: `component:file:${dependency.resolved}`, kind: 'Component', label: dependency.resolved },
          provenance: { path: module.source, startLine: 1, endLine: lines.length, digest: inputs[module.source]!, commitSha },
          extractor: { id: 'dependency-cruiser', version: '18.7.0' }, confidence: 1,
          authority: dirtyPaths.has(module.source) ? 'draft' : 'implemented', snapshotId: 'pending',
        });
      }
    }
  } catch (error) {
    add('infrastructure-failure', 'dependency-cruiser', '', '', String(error));
  }
  for (const contract of policy.contracts ?? []) {
    const rule = policy.rules.find((rule) => rule.kind === 'contract-owner');
    const owners = policy.modules.filter((module) => module.id === contract.owner);
    if (owners.length !== 1 || !inputs[contract.path]) {
      add('extraction-gap', rule?.id ?? 'contract-owner', contract.path, contract.owner, 'Contract or canonical owner evidence is missing');
    }
    const conflicts = policy.contracts!.filter((c) => c.path === contract.path && c.owner !== contract.owner);
    if (conflicts.length) add(rule?.approved ? 'rule-violation' : 'advisory',
      rule?.id ?? 'contract-owner', contract.path, contract.owner, 'Contradictory canonical owners');
  }
  const policySource = await readFile(resolve(root, policyPath), 'utf8');
  if (stableJson(JSON.parse(policySource)) !== stableJson(policy)) {
    throw new Error('Policy differs from its cited source file');
  }
  const policySpan = { path: policyPath, startLine: 1, endLine: policySource.split('\n').length,
    digest: sha256(policySource), commitSha };
  const addPolicyFact = (subject: GraphFact['subject'], predicate: GraphFact['predicate'], object: GraphFact['object']) => {
    facts.push({ id: sha256(stableJson({ subject, predicate, object, policyDigest })),
      subject, predicate, object, provenance: policySpan,
      extractor: { id: 'architecture-policy', version: '1' }, confidence: 1,
      authority: dirtyPaths.has(policyPath) ? 'draft' : 'declared', snapshotId: 'pending' });
  };
  for (const module of policy.modules) {
    const node = { id: `module:${module.id}`, kind: 'Component' as const, label: module.id,
      attributes: { domain: module.domain, layer: module.layer, adapter: Boolean(module.adapter) } };
    addPolicyFact(node, 'governedBy', { id: `layer:${module.layer}`, kind: 'Scope', label: module.layer });
    for (const path of Object.keys(inputs).filter((path) => new RegExp(module.path).test(path))) {
      addPolicyFact(node, 'contains', { id: `component:file:${path}`, kind: 'Component', label: path });
    }
  }
  for (const contract of policy.contracts ?? []) {
    addPolicyFact({ id: `contract:file:${contract.path}`, kind: 'Contract', label: contract.path },
      'operationallyOwnedBy', { id: `module:${contract.owner}`, kind: 'Component', label: contract.owner });
  }
  if (!Object.keys(inputs).length) add('extraction-gap', 'source-coverage', '', '', 'No source files were analyzed');
  const contentDigest = sha256(stableJson({ inputs, policyDigest, commitSha, dirtyPaths: [...dirtyPaths].sort(),
    tools: { dependencyCruiser: '18.7.0', eslint: '10.13.0', jscpd: '5.4.1', analyzer: '2' } }));
  const snapshotId = `architecture-${contentDigest}`;
  const snapshot: GraphSnapshot = {
    manifest: {
      schemaVersion: 1, repositoryId: 'architecture-analysis', ref: 'HEAD', commitSha, snapshotId,
      configurationDigest: policyDigest, scope: policy.roots, contentDigest,
      ...(dirtyPaths.size ? { baseSha: commitSha, overlayDigest: contentDigest } : {}),
      ontologyVersion: 'architecture-v1', extractorVersions: { 'dependency-cruiser': '18.7.0' },
      semanticModel: 'none', semanticPromptVersion: 'none', generatedAt: new Date().toISOString(),
      semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '',
    },
    facts: facts.map((fact) => ({ ...fact, snapshotId })), runtimeEvidence: [], invariants: [], unresolved: [],
  };
  for (const rule of policy.rules.filter((rule) => rule.transitive && rule.kind === 'forbidden-import')) {
    const graph = new RdfEvidenceGraph(snapshot);
    const result = await graph.select(`SELECT DISTINCT ?from ?to WHERE {
      ?from <${CG}consumes>+ ?to
    }`, 100_000);
    if (result.truncated) add('extraction-gap', rule.id, '', '', 'Transitive dependency query truncated');
    for (const row of result.rows) {
      const from = modules.find((m) => nodeIri(`component:file:${m.source}`) === row.from)?.source;
      const to = modules.find((m) => nodeIri(`component:file:${m.source}`) === row.to)?.source;
      if (from && to && new RegExp(rule.from!).test(from) && new RegExp(rule.to!).test(to)) {
        add(rule.approved ? 'rule-violation' : 'advisory', rule.id, from, to,
          'Transitive dependency inferred by SPARQL property path from source import evidence');
      }
    }
  }
  try {
    const { ESLint } = await import('eslint');
    const parser = await import('@typescript-eslint/parser');
    const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: [{
      files: ['**/*.ts'], languageOptions: { parser },
      rules: { complexity: ['warn', policy.advisory.maxComplexity],
        'max-lines': ['warn', { max: policy.advisory.maxLines, skipBlankLines: true, skipComments: true }] },
    }] });
    const results = await eslint.lintFiles(policy.roots.map((path) => `${path}/**/*.ts`));
    for (const result of results) for (const message of result.messages) {
      add(message.fatal ? 'extraction-gap' : 'advisory', `eslint:${message.ruleId ?? 'parse'}`,
        result.filePath.slice(root.length + 1), String(message.line),
        `${message.message} Size/complexity is a review signal, not proof of modularity.`);
    }
  } catch (error) { add('infrastructure-failure', 'eslint', '', '', String(error)); }
  const temporary = await mkdtemp(join(tmpdir(), 'graph-duplication-'));
  try {
    const require = createRequire(import.meta.url);
    const command = require.resolve('jscpd/run-jscpd.js');
    const config = join(temporary, 'config.json');
    await writeFile(config, JSON.stringify({ semantic: false, reporters: ['json'],
      format: ['typescript'], minTokens: policy.advisory.duplicateMinTokens, minLines: 5,
      threshold: 100, output: temporary, silent: true }));
    await runProcess(process.execPath, [command, '--config', config, '--workers', '2', ...policy.roots], root);
    const report = JSON.parse(await readFile(join(temporary, 'jscpd-report.json'), 'utf8'));
    for (const duplicate of report.duplicates ?? []) {
      add('advisory', 'jscpd:duplication', duplicate.firstFile?.name ?? '',
        duplicate.secondFile?.name ?? '', 'Text duplication requires semantic review; it does not prove equivalent business logic');
    }
  } catch (error) { add('infrastructure-failure', 'jscpd', '', '', String(error)); }
  finally { await rm(temporary, { recursive: true, force: true }); }
  return { policyPath, inputDigest: contentDigest, snapshot, findings,
    passed: !findings.some((finding) =>
      finding.category === 'infrastructure-failure' || finding.category === 'extraction-gap' ||
      (finding.category === 'rule-violation' && finding.disposition === 'new')),
  };
}
