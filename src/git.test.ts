import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { GitRepository } from './git.js';
import { sha256 } from './util.js';

const execFileAsync = promisify(execFile);

describe('GitRepository', () => {
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
