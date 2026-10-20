import type { Queue } from './queue.js';
import type { AnalysisMessage } from './contracts/analysis.js';
import type { AdmissionMessage } from './contracts/admission.js';

export function analysis(input: Queue<AnalysisMessage>, output: Queue<AdmissionMessage>) {
  input.subscribe(async (message) => {
    await output.publish({ id: message.id, value: message.value + 1 });
  });
}
