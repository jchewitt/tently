import type { DispatchPlan } from '../contracts/dispatch-plan.js';
import type { DispatchReceipt } from '../contracts/dispatch-receipt.js';
import type { Queue, TopicPublisher } from '../transport/queue.js';

export function attachExecutor(
  input: Queue<DispatchPlan>, output: Queue<DispatchReceipt>, events: TopicPublisher,
): void {
  input.subscribe(async (plan) => {
    const receipt: DispatchReceipt = {
      requestId: plan.request.requestId,
      destination: plan.request.destination,
      lane: plan.lane,
      status: 'delivered',
    };
    await output.publish(receipt);
    // Deployment routes this topic to an independently compiled archival service.
    await events.publish('dispatch.completed.v1', receipt);
  });
}
