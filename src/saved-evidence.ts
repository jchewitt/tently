import type { ImpactQueryService, ImpactScanRequest } from './core.js';
import type { GitRepository } from './git.js';
import { MarkdownContextPackRenderer } from './query.js';

/** Read-side metadata; never calls an indexer, model, compiler, or refresh operation. */
export class SavedEvidenceQueryService implements ImpactQueryService {
  constructor(
    private readonly queries: ImpactQueryService,
    private readonly repository: GitRepository,
    private readonly configurationDigest: string,
  ) {}

  async scan(request: ImpactScanRequest) {
    const pack = await this.queries.scan(request);
    const currentCommit = await this.repository.resolveRef('HEAD').catch(() => undefined);
    const excludedWorkingChanges = await this.repository.workingChanges();
    const evidenceState = {
      currentCommit,
      excludedWorkingChanges,
      stale: currentCommit !== pack.snapshot.commitSha,
      configurationMatches: pack.snapshot.configurationDigest === this.configurationDigest,
      eligibleForCurrentDiffValidation: false as const,
    };
    const result = { ...pack, evidenceState };
    return { ...result, markdown: new MarkdownContextPackRenderer().render(result) };
  }
}
