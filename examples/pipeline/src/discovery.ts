import type { Queue } from './queue.js';
import type { DiscoveryMessage } from './contracts/discovery.js';
import type { AnalysisMessage } from './contracts/analysis.js';

export function discovery(input: Queue<DiscoveryMessage>, output: Queue<AnalysisMessage>) {
  input.subscribe(async (message) => {
    await output.publish({ id: message.id, value: message.value + 1 });
  });
}
