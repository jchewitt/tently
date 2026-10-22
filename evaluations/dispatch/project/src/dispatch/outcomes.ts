import type { DispatchReceipt } from '../contracts/dispatch-receipt.js';
import type { Queue } from '../transport/queue.js';

export function attachOutcomes(input: Queue<DispatchReceipt>, delivered: Map<string, DispatchReceipt>): void {
  input.subscribe(async (receipt) => {
    delivered.set(receipt.requestId, receipt);
  });
}
