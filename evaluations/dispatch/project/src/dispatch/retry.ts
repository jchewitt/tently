import type { DispatchRequest } from '../contracts/dispatch-request.js';
import type { Queue } from '../transport/queue.js';
import { evaluatePolicy } from './policy.js';

export async function retryDispatch(input: Queue<DispatchRequest>, request: DispatchRequest): Promise<boolean> {
  if (!evaluatePolicy(request).accepted) return false;
  await input.publish(request);
  return true;
}
