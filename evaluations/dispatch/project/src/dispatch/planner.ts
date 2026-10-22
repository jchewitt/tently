import type { DispatchRequest } from '../contracts/dispatch-request.js';
import type { DispatchPlan } from '../contracts/dispatch-plan.js';
import type { Queue } from '../transport/queue.js';
import { evaluatePolicy } from './policy.js';

export function attachPlanner(input: Queue<DispatchRequest>, output: Queue<DispatchPlan>): void {
  input.subscribe(async (request) => {
    const decision = evaluatePolicy(request);
    if (!decision.accepted) throw new Error('Dispatch policy rejected destination');
    await output.publish({ request, lane: decision.lane, attempt: 1 });
  });
}
