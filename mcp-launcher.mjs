#!/usr/bin/env node
// Standalone development launcher. Installed consumers run dist/mcp.js directly.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

try {
  process.stderr.write('Building current context graph MCP outputs...\n');
  const compiler = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  for (const project of ['packages/core/', '']) {
    execFileSync(process.execPath, [
      compiler, '-p', fileURLToPath(new URL(`${project}tsconfig.json`, import.meta.url)),
    ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 45_000, windowsHide: true });
  }
  // Consumer cwd and CONTEXT_GRAPH_CONFIG belong to the caller.
  await import('./dist/mcp.js');
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  process.stderr.write(`Unable to start context graph MCP: ${error.message}\n`);
  process.exitCode = 1;
}
