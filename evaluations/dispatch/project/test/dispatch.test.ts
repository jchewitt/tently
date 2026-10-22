import type { DispatchRequest } from '../src/contracts/dispatch-request.js';
import type { DispatchPlan } from '../src/contracts/dispatch-plan.js';
import type { DispatchReceipt } from '../src/contracts/dispatch-receipt.js';
import { MemoryQueue } from '../src/transport/queue.js';
import { submitDispatch } from '../src/api/dispatch.js';
import { attachPlanner } from '../src/dispatch/planner.js';
import { attachExecutor } from '../src/dispatch/executor.js';
import { attachOutcomes } from '../src/dispatch/outcomes.js';

export async function verifyDispatch(): Promise<void> {
  const requests = new MemoryQueue<DispatchRequest>();
  const plans = new MemoryQueue<DispatchPlan>();
  const receipts = new MemoryQueue<DispatchReceipt>();
  const delivered = new Map<string, DispatchReceipt>();
  const published: { topic: string; payload: unknown }[] = [];
  attachPlanner(requests, plans);
  attachExecutor(plans, receipts, {
    async publish(topic, payload) { published.push({ topic, payload }); },
  });
  attachOutcomes(receipts, delivered);
  const pending = submitDispatch(requests, { requestId: 'parcel-1', destination: 'Public Library', priority: 'urgent' });
  if (delivered.size !== 0) throw new Error('Transport must defer delivery');
  await pending;
  if (delivered.get('parcel-1')?.lane !== 'express') throw new Error('Urgent delivery lost its lane');
  if (published.length !== 1 || published[0]?.topic !== 'dispatch.completed.v1') {
    throw new Error('Completion topic was not published');
  }
  let rejected = false;
  try { await submitDispatch(requests, { requestId: 'parcel-2', destination: ' ', priority: 'standard' }); }
  catch { rejected = true; }
  if (!rejected || delivered.has('parcel-2')) throw new Error('Invalid request reached outcomes');
}
