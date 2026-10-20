import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { GraphSnapshot, SemanticArtifact, SnapshotStore } from './core.js';

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

function snapshotPath(root: string, snapshotId: string): string {
  if (
    snapshotId.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(snapshotId) ||
    snapshotId === '.' ||
    snapshotId === '..'
  ) {
    throw new Error('snapshotId must be a safe storage identifier');
  }
  const directory = resolve(root, 'snapshots');
  const candidate = resolve(directory, `${snapshotId}.json`);
  const pathFromDirectory = relative(directory, candidate);
  if (
    pathFromDirectory === '..' ||
    pathFromDirectory.startsWith(`..${sep}`) ||
    isAbsolute(pathFromDirectory)
  ) {
    throw new Error('snapshotId must resolve within the snapshot directory');
  }
  return candidate;
}

export class FileSnapshotStore implements SnapshotStore {
  constructor(private readonly root: string) {}

  async write(snapshot: GraphSnapshot): Promise<void> {
    const existing = await this.read(snapshot.manifest.snapshotId);
    if (existing) {
      if (existing.manifest.contentDigest !== snapshot.manifest.contentDigest) {
        throw new Error(
          `Refusing to overwrite immutable snapshot ${snapshot.manifest.snapshotId} with different content`,
        );
      }
      return;
    }
    await atomicJson(snapshotPath(this.root, snapshot.manifest.snapshotId), snapshot);
  }

  read(snapshotId: string): Promise<GraphSnapshot | undefined> {
    return readJson(snapshotPath(this.root, snapshotId));
  }

  async readHead(headName: string): Promise<GraphSnapshot | undefined> {
    const head = await readJson<{ snapshotId: string }>(
      join(this.root, 'heads', `${headName}.json`),
    );
    return head ? this.read(head.snapshotId) : undefined;
  }

  updateHead(headName: string, snapshotId: string): Promise<void> {
    return atomicJson(join(this.root, 'heads', `${headName}.json`), { snapshotId });
  }
}

export class SemanticArtifactStore {
  constructor(private readonly root: string) {}

  read(key: string): Promise<SemanticArtifact | undefined> {
    return readJson(join(this.root, 'artifacts', 'semantic', `${key}.json`));
  }

  write(artifact: SemanticArtifact): Promise<void> {
    return atomicJson(join(this.root, 'artifacts', 'semantic', `${artifact.key}.json`), artifact);
  }
}
