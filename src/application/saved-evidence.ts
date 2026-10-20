import type { ImpactQueryService, ImpactScanRequest } from "@launch-echo/tently-core";
import type { GitRepository } from "../repository/git.js";
import { MarkdownContextPackRenderer } from "../graph/query.js";
import { inWorkingScope, readWorkingContent } from "../repository/working-content.js";
import { sha256 } from "../infrastructure/util.js";

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
    const workingChanges = await this.repository.workingChanges();
    const capturedWorkingChanges: string[] = [];
    const changedSinceCapture = new Set<string>();
    let overlayFreshness: 'current' | 'stale' | 'unknown' | undefined;
    if (pack.snapshot.overlayDigest) {
      overlayFreshness = 'unknown';
      const capture = pack.snapshot.overlayCapture;
      if (capture) {
        overlayFreshness = 'current';
        for (const file of capture.files) {
          try {
            const content = await readWorkingContent(this.repository.root, file.path);
            if ((content === null ? null : sha256(content)) === file.digest) capturedWorkingChanges.push(file.path);
            else changedSinceCapture.add(file.path);
          } catch {
            overlayFreshness = 'unknown';
            changedSinceCapture.add(file.path);
          }
        }
        for (const path of workingChanges) {
          if (!capturedWorkingChanges.includes(path) && inWorkingScope(path, capture.sourcePatterns)) changedSinceCapture.add(path);
        }
        if (changedSinceCapture.size && overlayFreshness !== 'unknown') overlayFreshness = 'stale';
      }
    }
    const excludedWorkingChanges = workingChanges.filter((path) => !capturedWorkingChanges.includes(path));
    const evidenceState = {
      currentCommit,
      excludedWorkingChanges,
      ...(overlayFreshness ? { overlayFreshness, capturedWorkingChanges, changedSinceCapture: [...changedSinceCapture].sort() } : {}),
      stale: currentCommit !== pack.snapshot.commitSha || (overlayFreshness !== undefined && overlayFreshness !== 'current'),
      configurationMatches: pack.snapshot.configurationDigest === this.configurationDigest,
      eligibleForCurrentDiffValidation: false as const,
    };
    const result = { ...pack, evidenceState };
    return { ...result, markdown: new MarkdownContextPackRenderer().render(result) };
  }
}
