import type { ImpactScanRequest } from './core.js';

const allowedFields = new Set([
  'snapshotId',
  'ownerDocument',
  'task',
  'checklistItems',
  'changedFiles',
  'symbols',
  'capabilities',
  'maxFacts',
]);

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function optionalStringArray(value: unknown, field: string): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string' && item.trim().length > 0)
  ) {
    throw new Error(`${field} must be an array of non-empty strings`);
  }
  return value;
}

export function parseImpactScanRequest(value: unknown): ImpactScanRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('impact.scan arguments must be an object');
  }
  const record = value as Record<string, unknown>;
  const unexpected = Object.keys(record).filter((field) => !allowedFields.has(field));
  if (unexpected.length > 0)
    throw new Error(`Unknown impact.scan fields: ${unexpected.join(', ')}`);
  const maxFacts = record.maxFacts;
  if (
    maxFacts !== undefined &&
    (!Number.isInteger(maxFacts) || Number(maxFacts) < 1 || Number(maxFacts) > 200)
  ) {
    throw new Error('maxFacts must be an integer between 1 and 200');
  }
  return {
    snapshotId: optionalString(record.snapshotId, 'snapshotId'),
    ownerDocument: optionalString(record.ownerDocument, 'ownerDocument'),
    task: optionalString(record.task, 'task'),
    checklistItems: optionalStringArray(record.checklistItems, 'checklistItems'),
    changedFiles: optionalStringArray(record.changedFiles, 'changedFiles'),
    symbols: optionalStringArray(record.symbols, 'symbols'),
    capabilities: optionalStringArray(record.capabilities, 'capabilities'),
    maxFacts: maxFacts as number | undefined,
  };
}
