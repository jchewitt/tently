import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

/** Materialize committed bytes without registering a worktree or touching the active checkout. */
export async function withCommittedTree<T>(
  repositoryRoot: string,
  commitSha: string,
  operation: (root: string) => Promise<T>,
): Promise<T> {
  if (!/^[a-f0-9]{40}$/.test(commitSha)) throw new Error('Committed tree requires an exact SHA');
  const temporary = await mkdtemp(join(tmpdir(), 'context-graph-commit-'));
  try {
    const { stdout: tree } = await execute('git', ['ls-tree', '-r', commitSha], {
      cwd: repositoryRoot, maxBuffer: 64 * 1024 * 1024,
    });
    // Do not dereference repository-controlled links outside the isolated tree.
    if (/^(120000|160000) /m.test(tree)) {
      throw new Error('Committed hydration does not yet support symlinks or submodules');
    }
    // Override checkout conversion for this command without changing the user's Git config.
    const { stdout } = await execute('git', ['-c', 'core.autocrlf=false', 'archive', '--format=tar', commitSha], {
      cwd: repositoryRoot, encoding: 'buffer', maxBuffer: 128 * 1024 * 1024,
    });
    const archive = join(temporary, 'source.tar');
    await writeFile(archive, stdout);
    const { mkdir } = await import('node:fs/promises');
    const root = join(temporary, 'checkout');
    await mkdir(root);
    await execute('tar', ['-xf', archive, '-C', root]);
    return await operation(root);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
