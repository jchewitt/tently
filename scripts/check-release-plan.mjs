import { fileURLToPath } from 'node:url';
import { checkReleasePlan } from './release-plan.mjs';

await checkReleasePlan(fileURLToPath(new URL('../', import.meta.url)));
console.log('Release plan matches committed versions; no pending changesets remain.');
