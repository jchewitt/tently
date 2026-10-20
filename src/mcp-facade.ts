import type { ImpactQueryService, ImpactScanRequest } from './core.js';

export const impactScanToolName = 'impact.scan';

export async function handleImpactScan(service: ImpactQueryService, request: ImpactScanRequest) {
  return service.scan(request);
}
