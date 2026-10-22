import { archiveDelivery, subscribedTopic, type ArchivedDispatch } from '../src/archive/consumer.js';

export function verifyArchive(): void {
  const archive: ArchivedDispatch[] = [];
  archiveDelivery({ requestId: 'archive-1', destination: 'Public Library', status: 'delivered' }, archive);
  if (subscribedTopic !== 'dispatch.completed.v1' || archive[0]?.requestId !== 'archive-1') {
    throw new Error('Archive did not accept its documented event');
  }
  let rejected = false;
  try { archiveDelivery({ requestId: 'archive-2', status: 'pending' }, archive); }
  catch { rejected = true; }
  if (!rejected || archive.length !== 1) throw new Error('Malformed archival event accepted');
}
