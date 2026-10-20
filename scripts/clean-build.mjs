import { rm } from 'node:fs/promises';

// Rebuild from source without retaining obsolete modules after files move or disappear.
for (const directory of ['../dist/', '../packages/core/dist/']) {
  await rm(new URL(directory, import.meta.url), { recursive: true, force: true });
}
