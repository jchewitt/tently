import type { DispatchRequest } from '../contracts/dispatch-request.js';
import type { Queue } from '../transport/queue.js';

export async function submitDispatch(queue: Queue<DispatchRequest>, request: DispatchRequest): Promise<void> {
  if (!request.requestId || !request.destination.trim()) throw new Error('Incomplete dispatch request');
  await queue.publish(request);
}
