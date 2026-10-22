import { evaluatePolicy } from '../src/dispatch/policy.js';
import { retryDispatch } from '../src/dispatch/retry.js';
import { MemoryQueue } from '../src/transport/queue.js';
import type { DispatchRequest } from '../src/contracts/dispatch-request.js';

export async function verifyPolicy(): Promise<void> {
  const accepted = { requestId: 'retry-1', destination: 'Community Center', priority: 'standard' as const };
  if (evaluatePolicy(accepted).lane !== 'economy') throw new Error('Standard request must use economy lane');
  const queue = new MemoryQueue<DispatchRequest>();
  let received = 0;
  queue.subscribe(async () => { received++; });
  if (!await retryDispatch(queue, accepted)) throw new Error('Valid retry rejected');
  if (await retryDispatch(queue, { ...accepted, destination: '' })) throw new Error('Invalid retry admitted');
  if (received !== 1) throw new Error('Retry publication count is incorrect');
}
