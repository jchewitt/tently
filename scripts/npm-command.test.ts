import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { validatePublishInspection } from './npm-command.mjs';

it('validates flat and package-keyed npm dry-run output against the exact prepared archive', () => {
  const expected = { name: '@weftlet/core', version: '0.1.1', integrity: 'sha512-fixture' };
  const inspection = { ...expected, files: [], entryCount: 0 };
  for (const output of [inspection, { [expected.name]: inspection }]) {
    expect(() => validatePublishInspection(JSON.stringify(output), expected)).not.toThrow();
  }
  for (const record of [
    { ...inspection, name: '@someone/other' }, { ...inspection, version: '0.1.0' },
    { ...inspection, integrity: 'sha512-different' }, { name: expected.name, version: expected.version },
  ]) {
    for (const output of [record, { [expected.name]: record }]) {
      expect(() => validatePublishInspection(JSON.stringify(output), expected)).toThrow('identity or integrity');
    }
  }
  for (const output of [null, [], [inspection], {}, { other: inspection },
    { [expected.name]: inspection, other: inspection }]) {
    expect(() => validatePublishInspection(JSON.stringify(output), expected)).toThrow('identity or integrity');
  }
  expect(() => validatePublishInspection('invalid JSON', expected)).toThrow();
});

it('streams publication prompts while retaining captured JSON for dry runs and registry reads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tently npm command '));
  try {
    const cli = join(directory, 'fake-npm.cjs');
    await writeFile(cli, 'console.log(JSON.stringify(process.argv.slice(2)));');
    const module = new URL("./npm-command.mjs", import.meta.url).href;
    for (const args of [['publish', 'package.tgz'], ['publish', 'package.tgz', '--dry-run', '--json'], ['view', 'package', '--json']]) {
      const output = execFileSync(process.execPath, ['--input-type=module', '--eval', `
        import { runNpm } from ${JSON.stringify(module)};
        const captured = runNpm(${JSON.stringify(cli)}, ${JSON.stringify(args)}, ${JSON.stringify(directory)});
        console.log(JSON.stringify({ captured }));
      `], { encoding: 'utf8' }).trim().split('\n');
      if (args[0] === 'publish' && !args.includes('--dry-run')) {
        expect(JSON.parse(output[0]!)).toEqual(args);
        expect(JSON.parse(output[1]!)).toEqual({ captured: null });
      } else {
        expect(output).toHaveLength(1);
        expect(JSON.parse(JSON.parse(output[0]!).captured)).toEqual(args);
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
