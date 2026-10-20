import type { Queue } from './queue.js';
import type { AdmissionMessage } from './contracts/admission.js';
import type { PlanningMessage } from './contracts/planning.js';

export function admission(input: Queue<AdmissionMessage>, output: Queue<PlanningMessage>) {
  input.subscribe(async (message) => {
    await output.publish({ id: message.id, value: message.value + 1 });
  });
}
