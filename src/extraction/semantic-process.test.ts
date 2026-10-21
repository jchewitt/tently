import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { runSemanticProcess } from './semantic-process.js';

it('cancels a launcher and its active child process', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-provider-tree-'));
  const heartbeat = join(root, 'heartbeat');
  const controller = new AbortController();
  let childPid: number | undefined;
  let pending: Promise<unknown> | undefined;
  try {
    const worker = join(root, 'worker.mjs'), launcher = join(root, 'launcher.mjs');
    await writeFile(worker, `import { writeFileSync } from 'node:fs';
      let tick = 0;
      setInterval(() => writeFileSync(${JSON.stringify(heartbeat)}, JSON.stringify({pid:process.pid,tick:++tick})), 25);`);
    await writeFile(launcher, `import { spawn } from 'node:child_process';
      spawn(process.execPath, [${JSON.stringify(worker)}], {stdio:'ignore'});
      setInterval(() => {}, 1000);`);
    // Attach a rejection handler immediately so an early startup failure cannot become unhandled.
    pending = runSemanticProcess(process.execPath, [launcher], root, 'public fixture', {},
      { signal: controller.signal, timeoutMs: 15_000 }).catch(error => error);
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try { childPid = JSON.parse(await readFile(heartbeat, 'utf8')).pid; break; } catch {}
      await delay(25);
    }
    expect(childPid).toBeTypeOf('number');
    controller.abort();
    expect(await pending).toMatchObject({ code: 'cancelled' });
    const stopped = await readFile(heartbeat, 'utf8');
    await delay(150);
    expect(await readFile(heartbeat, 'utf8')).toBe(stopped);
    if (process.platform === 'win32') expect(() => process.kill(childPid!, 0)).toThrow();
  } finally {
    controller.abort();
    if (pending) await pending;
    // Ensure a failing regression cannot leave the fixture behind on an older implementation.
    if (childPid) { try { process.kill(childPid, 'SIGKILL'); } catch {} }
    await rm(root, { recursive: true, force: true });
  }
}, 25_000);
