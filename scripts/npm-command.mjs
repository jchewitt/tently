import { execFileSync } from 'node:child_process';

/** npm's browser/OTP challenge requires both stdin and stdout to remain terminals. */
export function runNpm(npmCli, args, cwd) {
  const interactivePublish = args[0] === 'publish' && !args.includes('--dry-run');
  return execFileSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: interactivePublish ? 'inherit' : ['inherit', 'pipe', 'inherit'],
  });
}
