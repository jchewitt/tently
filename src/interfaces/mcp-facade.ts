// Modified for standalone extraction; see docs/extraction-manifest.json.
import type { ImpactQueryService, ImpactScanRequest } from "@launch-echo/tently-core";

export const impactScanToolName = 'impact.scan';

export async function handleImpactScan(service: ImpactQueryService, request: ImpactScanRequest) {
  return service.scan(request);
}
