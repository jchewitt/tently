import { appendFile } from 'node:fs/promises';
import { selectPublicationState } from './publication-state.mjs';

const { GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, GH_TOKEN, GITHUB_OUTPUT } = process.env;
if (GITHUB_REPOSITORY !== 'jchewitt/weftlet' || !/^\d+$/.test(GITHUB_RUN_ID ?? '') ||
    !/^[1-9]\d*$/.test(GITHUB_RUN_ATTEMPT ?? '') || !GH_TOKEN || !GITHUB_OUTPUT) {
  throw new Error('Publication recovery requires the repository workflow context');
}
const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/artifacts?per_page=100`, {
  headers: { authorization: `Bearer ${GH_TOKEN}`, accept: 'application/vnd.github+json' },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Cannot inspect previous publication receipts (${response.status})`);
const data = await response.json();
if (data.total_count > data.artifacts.length) throw new Error('Too many recovery artifacts; inspect publication state manually');
const name = selectPublicationState(data.artifacts, Number(GITHUB_RUN_ATTEMPT));
await appendFile(GITHUB_OUTPUT, `name=${name}\n`);
console.log(name ? `Recovering publication receipts from ${name}` : 'No earlier publication receipts for this run');
