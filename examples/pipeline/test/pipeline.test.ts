import { MemoryQueue } from '../src/queue.js';
import { discovery } from '../src/discovery.js';
import { analysis } from '../src/analysis.js';
import { admission } from '../src/admission.js';
import { planning } from '../src/planning.js';
import { execution } from '../src/execution.js';
import { outcomes } from '../src/outcomes.js';

export async function verifyPipeline(): Promise<void> {
  const queues = Array.from({ length: 7 }, () => new MemoryQueue<{ id: string; value: number }>());
  [discovery, analysis, admission, planning, execution, outcomes].forEach((stage, index) =>
    stage(queues[index]!, queues[index + 1]!));
  let observed: number | undefined;
  queues[6]!.subscribe(async (message) => { observed = message.value; });
  await queues[0]!.publish({ id: 'public-fixture', value: 0 });
  if (observed !== 6) throw new Error(`Expected all six asynchronous stages; received ${observed}`);
}
