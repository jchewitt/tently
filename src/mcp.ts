#!/usr/bin/env node
// Modified for standalone extraction; see docs/extraction-manifest.json.

import '../runtime-check.mjs';
import { resolve } from 'node:path';
import process from 'node:process';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { createContextGraphApplication } from './application.js';
import { handleImpactScan, impactScanToolName } from './mcp-facade.js';
import { parseImpactScanRequest } from './request.js';

async function main(): Promise<void> {
  const local = resolve('context-graph.config.json');
  const configPath =
    process.env.CONTEXT_GRAPH_CONFIG ??
    local;
  const application = await createContextGraphApplication(configPath);
  const server = new Server(
    { name: 'context-graph', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'Call impact.scan before non-leaf planning or implementation. Pass the active owner document and task/checklist text. Treat product-intent, contract, implementation, and validation coverage gaps as unresolved context, not permission to invent behavior.',
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: impactScanToolName,
        description:
          'Return a bounded, provenance-bearing impact Context Pack for a task, document, file, symbol, or capability.',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            snapshotId: { type: 'string' },
            ownerDocument: { type: 'string' },
            task: { type: 'string' },
            checklistItems: { type: 'array', items: { type: 'string' } },
            changedFiles: { type: 'array', items: { type: 'string' } },
            symbols: { type: 'array', items: { type: 'string' } },
            capabilities: { type: 'array', items: { type: 'string' } },
            maxFacts: { type: 'integer', minimum: 1, maximum: 200 },
            maxDepth: { type: 'integer', minimum: 1, maximum: 128 },
            continuation: { type: 'string', maxLength: 2048 },
          },
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== impactScanToolName) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }
    try {
      const pack = await handleImpactScan(
        application.queryService,
        parseImpactScanRequest(request.params.arguments ?? {}),
      );
      return {
        content: [
          { type: 'text', text: pack.markdown },
          { type: 'text', text: JSON.stringify(pack) },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  });
  await server.connect(new StdioServerTransport());
}

if (process.env.CONTEXT_GRAPH_MCP_TEST !== '1') {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
