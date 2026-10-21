import { rename } from 'node:fs/promises';
import { platform } from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

/** Replace a complete file without unlinking the previous value, even under Windows contention. */
export async function atomicRename(source: string, destination: string): Promise<void> {
  for (let retry = 0; ; retry++) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // Windows readers, concurrent renames and scanners can temporarily deny replacement.
      // Retry the atomic operation itself across processes; never delete/truncate the target.
      // Bound waiting to 50 retries (4.55 seconds), then propagate the original I/O error.
      if (platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '') || retry >= 50) {
        throw error;
      }
      await delay(Math.min((retry + 1) * 10, 100));
    }
  }
}
