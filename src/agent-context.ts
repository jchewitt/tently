import { basename } from 'node:path';

import type { ContextGraphConfig } from './config.js';
import type { ImpactQueryService, ImpactScanRequest, SnapshotStore } from './core.js';
import type { GitRepository } from './git.js';
import type { ContextGraphHydrator } from './hydrator.js';
import { SnapshotImpactQueryService } from './query.js';
import { sha256, stableJson } from './util.js';

export interface AgentSemanticScope {
  readonly commitSha: string;
  readonly semanticSources: readonly string[];
  readonly headName: string;
  readonly snapshotSuffix: string;
}

function normalizeRepositoryPath(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error(`ownerDocument must be a repository-relative path: ${path}`);
  }
  return normalized;
}

export class AgentSemanticScopeResolver {
  constructor(
    private readonly config: ContextGraphConfig,
    private readonly repository: GitRepository,
  ) {}

  async resolve(request: ImpactScanRequest): Promise<AgentSemanticScope> {
    const agent = this.config.agentContext;
    if (!agent) throw new Error('Agent context preparation is not configured');
    const commitSha = await this.repository.resolveRef('HEAD');
    const available = new Set(
      (await this.repository.listFilesAt(commitSha, this.config.semanticSources)).filter((path) =>
        /\.(?:md|mdx|txt)$/i.test(path),
      ),
    );
    const selected = new Set<string>();
    for (const path of await this.repository.listFilesAt(commitSha, agent.alwaysSemanticSources)) {
      if (available.has(path)) selected.add(path);
    }

    const ownerDocument = request.ownerDocument
      ? normalizeRepositoryPath(request.ownerDocument)
      : undefined;
    if (ownerDocument) {
      if (!available.has(ownerDocument)) {
        throw new Error(`Owner document is not a configured semantic source: ${ownerDocument}`);
      }
      selected.add(ownerDocument);
      const content = await this.repository.readFileAt(commitSha, ownerDocument);
      if (agent.followDocumentReferences) {
        const references = [...content.matchAll(/\bdocs\/[A-Za-z0-9_./-]+\.md\b/g)]
          .map((match) => match[0])
          .filter((path) => available.has(path));
        for (const path of references.slice(0, agent.maxReferencedDocuments)) selected.add(path);
      }
      if (agent.includeMatchingEvidence) {
        const ownerSlug = basename(ownerDocument).replace(/\.md$/i, '');
        for (const path of [...available].filter(
          (path) =>
            this.config.evidenceRoots.some(
              (root) => path === root || path.startsWith(`${root.replace(/\/$/, '')}/`),
            ) && path.includes(ownerSlug),
        )) {
          selected.add(path);
        }
      }
    } else {
      const terms = [
        request.task,
        ...(request.checklistItems ?? []),
        ...(request.capabilities ?? []),
      ]
        .filter((term): term is string => Boolean(term))
        .slice(0, 8);
      const matches = await this.repository.findTextAt(
        commitSha,
        terms,
        this.config.semanticSources,
      );
      for (const match of matches.slice(0, agent.maxReferencedDocuments)) selected.add(match.path);
    }
    const semanticSources = [...selected].sort();
    if (semanticSources.length === 0) {
      throw new Error('Agent context scope did not resolve any semantic sources');
    }
    const scopeDigest = sha256(stableJson(semanticSources)).slice(0, 16);
    return {
      commitSha,
      semanticSources,
      headName: `agent-${scopeDigest}`,
      snapshotSuffix: `agent-${scopeDigest}`,
    };
  }
}

export class PreparedImpactQueryService implements ImpactQueryService {
  constructor(
    private readonly store: SnapshotStore,
    private readonly hydrator: ContextGraphHydrator,
    private readonly scopeResolver: AgentSemanticScopeResolver,
  ) {}

  async scan(request: ImpactScanRequest) {
    if (request.snapshotId) {
      return new SnapshotImpactQueryService(this.store, 'default').scan(request);
    }
    const scope = await this.scopeResolver.resolve(request);
    return new SnapshotImpactQueryService(this.store, scope.headName).scan(request);
  }
}
