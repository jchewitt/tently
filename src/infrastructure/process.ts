import { spawn } from 'node:child_process';

export interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
}

export function runProcess(
  command: string,
  args: readonly string[],
  cwd: string,
  environment?: Readonly<Record<string, string | undefined>>,
): Promise<ProcessResult> {
  const executable = process.platform === 'win32' && command === 'pnpm' ? 'pnpm.cmd' : command;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      cwd,
      env: environment ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(-8000)}`));
    });
  });
}
