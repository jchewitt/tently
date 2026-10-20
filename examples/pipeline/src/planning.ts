import type { Queue } from './queue.js';
import type { PlanningMessage } from './contracts/planning.js';
import type { ExecutionMessage } from './contracts/execution.js';

export function planning(input: Queue<PlanningMessage>, output: Queue<ExecutionMessage>) {
  input.subscribe(async (message) => {
    await output.publish({ id: message.id, value: message.value + 1 });
  });
}
