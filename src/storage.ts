// Modified for standalone extraction; see docs/extraction-manifest.json.
import { mkdir, readFile, rename, writeFile, link, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
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
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function safeKey(key: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(key)) throw new Error('Unsafe storage identifier');
  return key;
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
    const destination = snapshotPath(this.root, snapshot.manifest.snapshotId);
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(snapshot), { flag: 'wx' });
      // Linking a complete file publishes atomically without ever replacing a winner.
      await link(temporary, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await this.read(snapshot.manifest.snapshotId);
      if (existing?.manifest.contentDigest !== snapshot.manifest.contentDigest) {
        throw new Error(
          `Refusing to overwrite immutable snapshot ${snapshot.manifest.snapshotId} with different content`,
        );
      }
    } finally {
      await rm(temporary, { force: true });
    }
  }

  read(snapshotId: string): Promise<GraphSnapshot | undefined> {
    return readJson(snapshotPath(this.root, snapshotId));
  }

  async readHead(headName: string): Promise<GraphSnapshot | undefined> {
    const head = await readJson<{ snapshotId: string }>(
      join(this.root, 'heads', `${safeKey(headName)}.json`),
    );
    return head ? this.read(head.snapshotId) : undefined;
  }

  async updateHead(headName: string, snapshotId: string): Promise<void> {
    if (!(await this.read(snapshotId))) throw new Error('Cannot point a head to an absent snapshot');
    return atomicJson(join(this.root, 'heads', `${safeKey(headName)}.json`), { snapshotId });
  }
}

export class SemanticArtifactStore {
  constructor(private readonly root: string) {}

  read(key: string): Promise<SemanticArtifact | undefined> {
    return readJson(join(this.root, 'artifacts', 'semantic', `${safeKey(key)}.json`));
  }

  async write(artifact: SemanticArtifact): Promise<void> {
    const path = join(this.root, 'artifacts', 'semantic', `${safeKey(artifact.key)}.json`);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(artifact), { flag: 'wx' });
      await link(temporary, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if ((await this.read(artifact.key))?.outputDigest !== artifact.outputDigest) {
        throw new Error('Concurrent semantic artifact differs; retry with explicit force refresh');
      }
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
