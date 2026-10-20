import { spawn } from 'node:child_process';

export interface SemanticRunOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}
export class SemanticProviderError extends Error {
  constructor(
    readonly code: 'timeout' | 'cancelled' | 'unavailable' | 'exit' | 'invalid-output',
    message: string,
    readonly retryable = false,
  ) { super(message); this.name = 'SemanticProviderError'; }
}

/** Intentionally never forwards provider stderr, prompts or environment values. */
export function runSemanticProcess(
  command: string, args: readonly string[], cwd: string, prompt: string,
  environment: Record<string, string | undefined>, options: SemanticRunOptions = {},
): Promise<void> {
  if (options.signal?.aborted) {
    return Promise.reject(new SemanticProviderError('cancelled', 'Semantic extraction cancelled'));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd, env: environment, stdio: ['pipe', 'ignore', 'ignore'],
      windowsHide: true, detached: process.platform !== 'win32',
    });
    let failure: SemanticProviderError | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch { /* The process may have already exited. */ }
    };
    const stop = (code: 'timeout' | 'cancelled') => {
      if (failure) return;
      failure = new SemanticProviderError(code, `Semantic extraction ${code}`);
      kill('SIGTERM');
      killTimer = setTimeout(() => kill('SIGKILL'), 1000);
      killTimer.unref();
    };
    const cancel = () => stop('cancelled');
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => stop('timeout'), options.timeoutMs ?? 120_000);
    const cleanup = () => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      options.signal?.removeEventListener('abort', cancel);
    };
    child.once('error', () => {
      cleanup();
      reject(new SemanticProviderError('unavailable', 'Semantic provider executable could not start'));
    });
    child.once('close', (code) => {
      cleanup();
      if (failure) reject(failure);
      else if (code === 0) resolve();
      else reject(new SemanticProviderError('exit', `Semantic provider exited with status ${code}`, code === 75));
    });
    child.stdin.on('error', () => { /* The exit status supplies the safe failure report. */ });
    child.stdin.end(prompt);
    if (options.signal?.aborted) cancel();
  });
}
