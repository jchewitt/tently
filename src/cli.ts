#!/usr/bin/env node
// Modified for standalone extraction; see docs/extraction-manifest.json.

import { resolve } from 'node:path';
import process from 'node:process';

import { createContextGraphApplication } from './application.js';
import type { ImpactScanRequest } from './core.js';
import { compileOntologyAtExactCheckout } from './ontology.js';
import { visualizeContextPack } from './visualization.js';
import { buildWorkingOverlay } from './overlay.js';
import { RdfEvidenceGraph } from './rdf.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { analyzeArchitecture, type ArchitecturePolicy } from './governance.js';
import { FileSnapshotStore } from './storage.js';
import { diagnoseSetup } from './doctor.js';

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
    maxDepth: valueAfter(args, '--max-depth') ? Number(valueAfter(args, '--max-depth')) : undefined,
    continuation: valueAfter(args, '--continuation'),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || !args.length) {
    process.stdout.write('context-graph doctor|hydrate|overlay|impact scan|sparql|validate|govern|visualize|diagnostics show|invariant check|clean-compare|ontology compile\nUse --config <file>; queries accept --snapshot <id>. impact scan accepts --changed-file, --capability, --max-facts, --max-depth, --continuation. See README.md for examples.\n');
    return;
  }
  if (args[0] === 'govern') {
    const policyFile = resolve(valueAfter(args, '--policy') ?? 'architecture.policy.json');
    const policy = JSON.parse(await readFile(policyFile, 'utf8')) as ArchitecturePolicy;
    const result = await analyzeArchitecture(dirname(policyFile), policy, basename(policyFile));
    await new FileSnapshotStore(join(dirname(policyFile), '.context-graph')).write(result.snapshot);
    const reportPath = valueAfter(args, '--output');
    if (reportPath) {
      await mkdir(dirname(resolve(reportPath)), { recursive: true });
      await writeFile(resolve(reportPath), `${JSON.stringify(result, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify({ passed: result.passed, findings: result.findings.length, snapshotId: result.snapshot.manifest.snapshotId, reportPath })}\n`);
    } else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.passed) process.exitCode = 1;
    return;
  }
  const configPath = valueAfter(args, '--config') ?? defaultConfigPath();
  if (args[0] === 'doctor') {
    process.stdout.write(`${JSON.stringify(await diagnoseSetup(configPath), null, 2)}\n`);
    return;
  }
  const application = await createContextGraphApplication(configPath);
  const [command, subcommand] = args;
  if (command === 'sparql' || command === 'validate') {
    const id = valueAfter(args, '--snapshot');
    const snapshot = id ? await application.snapshotStore.read(id) :
      await application.snapshotStore.readHead(application.headName);
    if (!snapshot) throw new Error('No graph snapshot is available');
    const graph = new RdfEvidenceGraph(snapshot);
    if (command === 'validate') {
      const report = await graph.validate();
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      if (!report.conforms) process.exitCode = 1;
    } else {
      const query = valueAfter(args, '--query-file');
      if (!query) throw new Error('sparql requires --query-file <local SELECT query>');
      process.stdout.write(`${JSON.stringify(await graph.select(await readFile(query, 'utf8')), null, 2)}\n`);
    }
    return;
  }
  if (command === 'overlay') {
    const base = valueAfter(args, '--base-snapshot');
    if (!base) throw new Error('overlay requires --base-snapshot <committed snapshot ID>');
    const result = await buildWorkingOverlay(application.repository, application.config,
      application.snapshotStore, application.storageRoot, base, valueAfter(args, '--agent'));
    process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
    return;
  }
  if (command === 'hydrate') {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    process.once('SIGINT', cancel);
    const scope = await application.scopeResolver?.resolve(impactRequestFromArgs(args));
    const result = await application.hydrator.hydrate({
      ref: valueAfter(args, '--ref') ?? 'HEAD',
      headName: scope?.headName ?? application.headName,
      semanticSources: scope?.semanticSources,
      forceSemantic: args.includes('--force-semantic'),
      signal: controller.signal,
      onProgress: args.includes('--quiet') ? undefined : (event) =>
        process.stderr.write(`[context-graph] ${event.phase}${event.total === undefined ? '' : ` ${event.completed}/${event.total}`}\n`),
    });
    process.removeListener('SIGINT', cancel);
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
        sourceUrlTemplate: valueAfter(args, '--source-url-template'),
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
    if (snapshot.invariants.some((item) => item.status !== 'pass')) process.exitCode = 1;
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
