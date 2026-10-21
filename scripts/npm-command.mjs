import { execFileSync } from 'node:child_process';

/** npm 11.21 keys dry-run output by package name; older npm returns the record directly. */
export function validatePublishInspection(output, expected) {
  const parsed = JSON.parse(output);
  const record = parsed && !Array.isArray(parsed) && Object.keys(parsed).length === 1 &&
    Object.hasOwn(parsed, expected.name) ? parsed[expected.name] : parsed;
  if (!record || Array.isArray(record) || record.name !== expected.name ||
      record.version !== expected.version || record.integrity !== expected.integrity) {
    throw new Error('Tarball identity or integrity mismatch in npm dry-run output');
  }
}

/** npm's browser/OTP challenge requires both stdin and stdout to remain terminals. */
export function runNpm(npmCli, args, cwd) {
  const interactivePublish = args[0] === 'publish' && !args.includes('--dry-run');
  return execFileSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: interactivePublish ? 'inherit' : ['inherit', 'pipe', 'inherit'],
  });
}
