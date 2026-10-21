// Modified for standalone extraction; see docs/extraction-manifest.json.
import type { AgentSemanticScopeResolver } from "./agent-context.js";
import type { ImpactScanRequest, SnapshotStore } from "@weftlet/core";
import type { GitRepository } from "../repository/git.js";
import type { ContextGraphHydrator } from "./hydrator.js";

// Final checks must use the same scope resolver as prepared impact scans, without silently
// starting hydration or substituting another owner's (or an older commit's) evidence.
export class SnapshotChecks {
  constructor(
    private readonly store: Pick<SnapshotStore, 'readHead'>,
    private readonly repository: Pick<GitRepository, 'resolveRef'> & Partial<Pick<GitRepository, 'workingChanges'>>,
    private readonly hydrator: Pick<ContextGraphHydrator, 'compareClean'>,
    private readonly scopeResolver?: Pick<AgentSemanticScopeResolver, 'resolve'>,
    private readonly configurationDigest?: string,
  ) {}

  private async target(request: ImpactScanRequest, ref: string) {
    if (request.snapshotId)
      throw new Error('Final checks select exact-ref evidence, not --snapshot');
    const commitSha = await this.repository.resolveRef(ref);
    if ((await this.repository.workingChanges?.())?.length) {
      throw new Error('Saved committed evidence cannot validate excluded working changes');
    }
    const scope = await this.scopeResolver?.resolve(request);
    if (scope && scope.commitSha !== commitSha) {
      throw new Error('Agent final checks require the current HEAD; the requested ref differs');
    }
    return {
      ref: commitSha,
      headName: scope?.headName ?? 'default',
      semanticSources: scope?.semanticSources,
    };
  }

  private async readTarget(target: { ref: string; headName: string }) {
    const snapshot = await this.store.readHead(target.headName);
    if (!snapshot || snapshot.manifest.commitSha !== target.ref || snapshot.manifest.overlayDigest) {
      throw new Error(
        `No exact-commit graph snapshot for scope ${target.headName} at ${target.ref}. Run hydrate with the same config and owner/task selectors first.`,
      );
    }
    if (this.configurationDigest && snapshot.manifest.configurationDigest !== this.configurationDigest) {
      throw new Error('Snapshot configuration differs from current configuration; refresh required');
    }
    return snapshot;
  }

  async read(request: ImpactScanRequest, ref = 'HEAD') {
    return this.readTarget(await this.target(request, ref));
  }

  async compare(request: ImpactScanRequest, ref = 'HEAD') {
    const target = await this.target(request, ref);
    await this.readTarget(target);
    return this.hydrator.compareClean(target);
  }
}
