import type { Queue } from './queue.js';
import type { ExecutionMessage } from './contracts/execution.js';
import type { OutcomesMessage } from './contracts/outcomes.js';

export function execution(input: Queue<ExecutionMessage>, output: Queue<OutcomesMessage>) {
  input.subscribe(async (message) => {
    await output.publish({ id: message.id, value: message.value + 1 });
  });
}
