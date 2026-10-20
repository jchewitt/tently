import type { Queue } from './queue.js';
import type { OutcomesMessage } from './contracts/outcomes.js';
import type { DiscoveryMessage } from './contracts/discovery.js';

export function outcomes(input: Queue<OutcomesMessage>, output: Queue<DiscoveryMessage>) {
  input.subscribe(async (message) => {
    await output.publish({ id: message.id, value: message.value + 1 });
  });
}
