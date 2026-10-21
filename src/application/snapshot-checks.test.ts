// Modified for standalone extraction; see docs/extraction-manifest.json.
import { describe, expect, it, vi } from 'vitest';

import type { GraphSnapshot } from "@weftlet/core";
import { SnapshotChecks } from "./snapshot-checks.js";

function fixture({ agent = true, stale = false, missing = false } = {}) {
  const snapshot = {
    manifest: { commitSha: stale ? 'old' : 'head' },
    invariants: [],
  } as unknown as GraphSnapshot;
  const readHead = vi.fn(async () => (missing ? undefined : snapshot));
  const compareClean = vi.fn(async () => ({ snapshot, semanticExtracted: 0, semanticReused: 1 }));
  const resolve = vi.fn(async () => ({
    commitSha: 'head',
    headName: 'agent-owner',
    snapshotSuffix: 'agent-owner',
    semanticSources: ['docs/owner.md', 'docs/policy.md'],
  }));
  const checks = new SnapshotChecks(
    { readHead },
    { resolveRef: async (ref) => (ref === 'HEAD' ? 'head' : ref) },
    { compareClean },
    agent ? { resolve } : undefined,
  );
  return { checks, readHead, compareClean, resolve, snapshot };
}

describe('final snapshot checks', () => {
  it('reads the exact owner scope, not default, without hydrating', async () => {
    const f = fixture();
    const request = { ownerDocument: 'docs/owner.md', task: 'bounded repair' };
    expect(await f.checks.read(request)).toBe(f.snapshot);
    expect(f.resolve).toHaveBeenCalledWith(request);
    expect(f.readHead).toHaveBeenCalledWith('agent-owner');
    expect(f.compareClean).not.toHaveBeenCalled();
  });

  it('passes the exact same semantic source scope to clean comparison', async () => {
    const f = fixture();
    await f.checks.compare({ ownerDocument: 'docs/owner.md' });
    expect(f.compareClean).toHaveBeenCalledWith({
      ref: 'head',
      headName: 'agent-owner',
      semanticSources: ['docs/owner.md', 'docs/policy.md'],
    });
  });

  it.each([{ missing: true }, { stale: true }])(
    'rejects missing or stale evidence: %j',
    async (options) => {
      const f = fixture(options);
      await expect(f.checks.read({})).rejects.toThrow(
        'No exact-commit graph snapshot for scope agent-owner',
      );
      await expect(f.checks.compare({})).rejects.toThrow('same config and owner/task selectors');
      expect(f.compareClean).not.toHaveBeenCalled();
    },
  );

  it('retains default snapshots for non-agent profiles', async () => {
    const f = fixture({ agent: false });
    await f.checks.read({});
    expect(f.readHead).toHaveBeenCalledWith('default');
  });

  it('rejects explicit stale snapshot IDs and non-HEAD agent refs before checking evidence', async () => {
    const f = fixture();
    await expect(f.checks.read({ snapshotId: 'old' })).rejects.toThrow('not --snapshot');
    await expect(f.checks.compare({}, 'old')).rejects.toThrow('current HEAD');
    expect(f.readHead).not.toHaveBeenCalled();
  });
});
