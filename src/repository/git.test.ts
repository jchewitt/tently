// Modified for standalone extraction; see docs/extraction-manifest.json.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { GitRepository } from "./git.js";
import { sha256 } from "../infrastructure/util.js";
import { withCommittedTree } from "./committed-tree.js";

const execFileAsync = promisify(execFile);

describe('GitRepository', () => {
  it('keeps committed reads, deltas, dirty paths and isolated archives relative to a nested repository root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-nested-'));
    const nested = join(root, 'apps', 'example');
    await mkdir(nested, { recursive: true });
    const git = (...args: string[]) => execFileAsync('git', args, { cwd: root });
    await git('init', '--quiet');
    await writeFile(join(root, 'outside.txt'), 'outside');
    await writeFile(join(nested, 'source.md'), '# Public intent\n');
    await git('add', '.');
    const commit = () => git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture');
    await commit();
    const repository = new GitRepository(nested);
    const base = await repository.resolveRef('HEAD');
    expect(await repository.listAllFilesAt(base)).toEqual(['source.md']);
    expect(await repository.readFileAt(base, 'source.md')).toBe('# Public intent\n');
    expect(await repository.findTextAt(base, ['Public'], ['.'])).toEqual([{ path: 'source.md', line: 1 }]);
    await rename(join(nested, 'source.md'), join(nested, 'renamed.md'));
    await git('add', '.'); await commit();
    const head = await repository.resolveRef('HEAD');
    expect(await repository.delta(base, head, ['.'])).toEqual({
      changedPaths: ['renamed.md'], deletedPaths: ['source.md'], renamedPaths: { 'source.md': 'renamed.md' },
    });
    await writeFile(join(root, 'outside.txt'), 'outside draft');
    await writeFile(join(nested, 'renamed.md'), 'draft');
    expect(await repository.workingChanges()).toEqual(['../../outside.txt', 'renamed.md']);
    await withCommittedTree(nested, head, async (isolated) => {
      expect(await readFile(join(isolated, 'renamed.md'), 'utf8')).toBe('# Public intent\n');
      await expect(readFile(join(isolated, 'outside.txt'))).rejects.toThrow();
    });
  });
  it('reads the exact committed bytes used for semantic provenance digests', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-git-'));
    const content = '# Exact bytes\n\nTrailing whitespace is significant.  \n';
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['config', 'user.email', 'context-graph@example.test'], {
      cwd: root,
    });
    await execFileAsync('git', ['config', 'user.name', 'Context Graph Test'], { cwd: root });
    await writeFile(join(root, 'source.md'), content, 'utf8');
    await execFileAsync('git', ['add', 'source.md'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'fixture'], { cwd: root });

    const repository = new GitRepository(root);
    const sha = await repository.resolveRef('HEAD');
    const actual = await repository.readFileAt(sha, 'source.md');
    expect(actual).toBe(content);
    expect(sha256(actual)).toBe(sha256(content));
    await expect(
      repository.findTextAt(sha, ['Trailing whitespace'], ['source.md']),
    ).resolves.toEqual([{ path: 'source.md', line: 3 }]);
    await expect(repository.findTextAt(sha, ['not present'], ['source.md'])).resolves.toEqual([]);
    await writeFile(join(root, 'source.md'), 'uncommitted change');
    await expect(repository.requireExactCleanCommit(sha)).rejects.toThrow(
      'Dirty-state overlays are not implemented',
    );
  });
});
