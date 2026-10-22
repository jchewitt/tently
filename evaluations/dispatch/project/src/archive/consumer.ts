// This service intentionally has no shared TypeScript symbol with the dispatch service.
// A deployment subscription, outside this source extractor, supplies its messages.
export const subscribedTopic = 'dispatch.completed.v1';

export interface ArchivedDispatch {
  requestId: string;
  destination: string;
}

export function archiveDelivery(payload: unknown, archive: ArchivedDispatch[]): void {
  if (typeof payload !== 'object' || payload === null ||
      !('requestId' in payload) || typeof payload.requestId !== 'string' ||
      !('destination' in payload) || typeof payload.destination !== 'string' ||
      !('status' in payload) || payload.status !== 'delivered') {
    throw new Error('Invalid delivered event');
  }
  archive.push({ requestId: payload.requestId, destination: payload.destination });
}
