// Modified for standalone extraction; see docs/extraction-manifest.json.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxWorkers: 2,
    include: ['src/**/*.test.ts', 'examples/generic-typescript/test/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
