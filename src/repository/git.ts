// Modified for standalone extraction; see docs/extraction-manifest.json.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { posix } from 'node:path';

import type { ExtractionContext, SemanticSource } from "@weftlet/core";
import { sha256, slug } from "../infrastructure/util.js";

const execFileAsync = promisify(execFile);

export interface GitDelta {
  readonly changedPaths: readonly string[];
  readonly deletedPaths: readonly string[];
  readonly renamedPaths: Readonly<Record<string, string>>;
}

export interface GitTextMatch {
  readonly path: string;
  readonly line: number;
}

export class GitRepository {
  constructor(readonly root: string) {}

  private async execute(args: readonly string[], trim: boolean): Promise<string> {
    const { stdout } = await execFileAsync('git', [...args], {
      cwd: this.root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return trim ? stdout.trim() : stdout;
  }

  run(args: readonly string[]): Promise<string> {
    return this.execute(args, true);
  }

  resolveRef(ref: string): Promise<string> {
    return this.run(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
  }

  async workingChanges(): Promise<readonly string[]> {
    const prefix = await this.run(['rev-parse', '--show-prefix']);
    const output = await this.execute(['status', '--porcelain=v1', '-z', '--untracked-files=all'], false);
    const records = output.split('\0');
    const paths = new Set<string>();
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      if (!record) continue;
      const path = posix.relative(prefix || '.', record.slice(3));
      if (!path.startsWith('.context-graph/')) paths.add(path);
      if (/[RC]/.test(record.slice(0, 2))) {
        const prior = records[++index];
        if (prior) paths.add(posix.relative(prefix || '.', prior));
      }
    }
    return [...paths].sort();
  }

  async firstParent(commitSha: string): Promise<string | undefined> {
    const parents = (await this.run(['show', '-s', '--format=%P', commitSha]))
      .split(/\s+/)
      .filter(Boolean);
    return parents[0];
  }

  async requireExactCleanCommit(commitSha: string): Promise<void> {
    const head = await this.resolveRef('HEAD');
    if (head !== commitSha) {
      throw new Error(`Ref resolved to ${commitSha}, but checked-out HEAD is ${head}`);
    }
    const status = await this.run(['status', '--porcelain=v1', '--untracked-files=all']);
    const relevant = status
      .split('\n')
      .filter(Boolean)
      .filter((line) => !line.includes('.context-graph/'));
    if (relevant.length > 0) {
      throw new Error(
        'Committed hydration requires a clean worktree. Preserve and commit changes through normal review, then retry. Dirty-state overlays are not implemented.',
      );
    }
  }

  async listFilesAt(commitSha: string, roots: readonly string[]): Promise<readonly string[]> {
    const output = await this.run(['ls-tree', '-r', '--name-only', commitSha, '--', ...roots]);
    return output.split('\n').filter(Boolean).sort();
  }

  listAllFilesAt(commitSha: string): Promise<readonly string[]> {
    return this.listFilesAt(commitSha, ['.']);
  }

  readFileAt(commitSha: string, path: string): Promise<string> {
    // Git object paths are top-level-relative unless explicitly prefixed with ./.
    return this.execute(['show', `${commitSha}:./${path}`], false);
  }

  async findTextAt(
    commitSha: string,
    needles: readonly string[],
    roots: readonly string[],
  ): Promise<readonly GitTextMatch[]> {
    if (needles.length === 0) return [];
    let output = '';
    try {
      output = await this.run([
        'grep',
        '-n',
        '-F',
        ...needles.flatMap((needle) => ['-e', needle]),
        commitSha,
        '--',
        ...roots,
      ]);
    } catch (error) {
      if ((error as { code?: number }).code === 1) return [];
      throw error;
    }
    const matches = new Map<string, GitTextMatch>();
    for (const line of output.split('\n').filter(Boolean)) {
      const parsed = line.match(/^[^:]+:(.*?):(\d+):/);
      if (!parsed?.[1] || !parsed[2]) continue;
      const match = { path: parsed[1], line: Number(parsed[2]) };
      if (!matches.has(match.path)) matches.set(match.path, match);
    }
    return [...matches.values()].sort((left, right) => left.path.localeCompare(right.path));
  }

  async delta(
    baseSha: string | undefined,
    headSha: string,
    roots: readonly string[],
  ): Promise<GitDelta> {
    if (!baseSha) {
      return {
        changedPaths: await this.listFilesAt(headSha, roots),
        deletedPaths: [],
        renamedPaths: {},
      };
    }
    const output = await this.run([
      'diff',
      '--relative',
      '--name-status',
      '--find-renames=50%',
      baseSha,
      headSha,
      '--',
      ...roots,
    ]);
    const changed = new Set<string>();
    const deleted = new Set<string>();
    const renamed: Record<string, string> = {};
    for (const line of output.split('\n').filter(Boolean)) {
      const [status = '', first = '', second = ''] = line.split('\t');
      if (status.startsWith('R')) {
        renamed[first] = second;
        changed.add(second);
        deleted.add(first);
      } else if (status === 'D') {
        deleted.add(first);
      } else {
        changed.add(first);
      }
    }
    return {
      changedPaths: [...changed].sort(),
      deletedPaths: [...deleted].sort(),
      renamedPaths: renamed,
    };
  }

  async semanticSources(
    context: ExtractionContext,
    roots: readonly string[],
  ): Promise<readonly SemanticSource[]> {
    const paths = (await this.listFilesAt(context.commitSha, roots)).filter((path) =>
      /\.(md|mdx|txt)$/i.test(path),
    );
    return Promise.all(
      paths.map(async (path) => {
        const content = await this.readFileAt(context.commitSha, path);
        const explicit = content.match(/^semantic-id:\s*([^\s]+)\s*$/m)?.[1];
        return {
          stableSemanticId: explicit ?? `doc:${slug(path)}`,
          path,
          content,
          digest: sha256(content),
        };
      }),
    );
  }
}
