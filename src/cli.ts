#!/usr/bin/env node
// Modified for standalone extraction; see docs/extraction-manifest.json.

import { resolve } from 'node:path';
import process from 'node:process';

import { createContextGraphApplication } from './application.js';
import type { ImpactScanRequest } from './core.js';
import { compileOntologyAtExactCheckout } from './ontology.js';
import { visualizeContextPack } from './visualization.js';

function valueAfter(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function valuesAfter(args: readonly string[], name: string): readonly string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1] as string);
  }
  return values;
}

function defaultConfigPath(): string {
  const local = resolve('context-graph.config.json');
  return local;
}

export function impactRequestFromArgs(args: readonly string[]): ImpactScanRequest {
  return {
    snapshotId: valueAfter(args, '--snapshot'),
    ownerDocument: valueAfter(args, '--owner-doc'),
    task: valueAfter(args, '--task'),
    checklistItems: valuesAfter(args, '--checklist'),
    changedFiles: valuesAfter(args, '--changed-file'),
    symbols: valuesAfter(args, '--symbol'),
    capabilities: valuesAfter(args, '--capability'),
    maxFacts: valueAfter(args, '--max-facts') ? Number(valueAfter(args, '--max-facts')) : undefined,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const configPath = valueAfter(args, '--config') ?? defaultConfigPath();
  const application = await createContextGraphApplication(configPath);
  const [command, subcommand] = args;
  if (command === 'hydrate') {
    const result = await application.hydrator.hydrate({
      ref: valueAfter(args, '--ref') ?? 'HEAD',
      headName: application.headName,
      forceSemantic: args.includes('--force-semantic'),
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          snapshotId: result.snapshot.manifest.snapshotId,
          commitSha: result.snapshot.manifest.commitSha,
          contentDigest: result.snapshot.manifest.contentDigest,
          semanticExtracted: result.semanticExtracted,
          semanticReused: result.semanticReused,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  if (command === 'clean-compare') {
    const result = await application.snapshotChecks.compare(
      impactRequestFromArgs(args),
      valueAfter(args, '--ref') ?? 'HEAD',
    );
    process.stdout.write(`${result.snapshot.manifest.contentDigest}\n`);
    return;
  }
  if (command === 'impact' && subcommand === 'scan') {
    const pack = await application.queryService.scan(impactRequestFromArgs(args));
    process.stdout.write(
      args.includes('--json') ? `${JSON.stringify(pack, null, 2)}\n` : `${pack.markdown}\n`,
    );
    return;
  }
  if (command === 'visualize') {
    const outputPath = valueAfter(args, '--output');
    if (!outputPath) throw new Error('visualize requires --output <path>');
    const result = await visualizeContextPack(
      application.queryService,
      impactRequestFromArgs(args),
      {
        outputPath,
        format: valueAfter(args, '--format') as 'dot' | 'html' | 'svg' | undefined,
        force: args.includes('--force'),
      },
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === 'invariant' && subcommand === 'check') {
    const snapshot = await application.snapshotChecks.read(
      impactRequestFromArgs(args),
      valueAfter(args, '--ref') ?? 'HEAD',
    );
    process.stdout.write(`${JSON.stringify(snapshot.invariants, null, 2)}\n`);
    if (snapshot.invariants.some((item) => item.status === 'fail')) process.exitCode = 1;
    return;
  }
  if (command === 'diagnostics' && subcommand === 'show') {
    const snapshotId = valueAfter(args, '--snapshot');
    if (!snapshotId)
      throw new Error('diagnostics show requires --snapshot <snapshotId> from a Context Pack');
    const snapshot = await application.snapshotStore.read(snapshotId);
    if (!snapshot) throw new Error('No graph snapshot is available for that identifier');
    process.stdout.write(
      `${JSON.stringify(
        {
          snapshotId,
          diagnostics: snapshot.diagnostics ?? [],
          legacyUnclassified: snapshot.unresolved,
          invariants: snapshot.invariants,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  if (command === 'ontology' && subcommand === 'compile') {
    const result = await compileOntologyAtExactCheckout(
      application.repository,
      application.ontologyCompiler,
      valueAfter(args, '--ref') ?? 'HEAD',
    );
    process.stdout.write(
      `${JSON.stringify({ digest: result.digest, files: result.rdfFiles }, null, 2)}\n`,
    );
    return;
  }
  throw new Error(
    'Usage: context-graph hydrate|clean-compare|impact scan|diagnostics show --snapshot <id>|invariant check|ontology compile|visualize --output <file.html|file.dot|file.svg>',
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
