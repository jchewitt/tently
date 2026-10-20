import { expect, it, vi } from 'vitest';
import { publishAndVerify } from '../scripts/registry-publication.mjs';

const pkg = { name: '@example/core', version: '0.1.0', integrity: 'sha512-expected' };
function fixture(values: Array<string | null | Error>) {
  let accepted = false;
  return {
    pkg, attempts: 3, intervalMs: 1,
    lookup: vi.fn(async () => {
      const value = values.shift();
      if (value instanceof Error) throw value;
      if (value === undefined) throw new Error('Unexpected lookup');
      return value;
    }),
    publish: vi.fn(async () => {}),
    wasAccepted: vi.fn(async () => accepted),
    recordAccepted: vi.fn(async () => { accepted = true; }),
    wait: vi.fn(async () => {}), log: vi.fn(),
  };
}

it('waits through missing registry metadata after acceptance without publishing again', async () => {
  const options = fixture([null, null, null, pkg.integrity]);
  await publishAndVerify(options);
  expect(options.publish).toHaveBeenCalledTimes(1);
  expect(options.recordAccepted).toHaveBeenCalledTimes(1);
  expect(options.wait).toHaveBeenCalledTimes(2);
});

it('skips an existing archive only when its registry integrity matches', async () => {
  const options = fixture([pkg.integrity]);
  await publishAndVerify(options);
  expect(options.publish).not.toHaveBeenCalled();
  const mismatch = fixture(['sha512-other']);
  await expect(publishAndVerify(mismatch)).rejects.toThrow('different bytes');
  expect(mismatch.publish).not.toHaveBeenCalled();
});

it('times out with saved acceptance and resumes without republishing or advancing dependents', async () => {
  const values = [null, null, null, null];
  const options = fixture(values);
  const dependent = vi.fn();
  await expect((async () => {
    await publishAndVerify(options);
    dependent();
  })()).rejects.toThrow('Keep .release/');
  expect(dependent).not.toHaveBeenCalled();
  expect(options.publish).toHaveBeenCalledTimes(1);
  expect(options.wait).toHaveBeenCalledTimes(2);
  values.push(null, null, pkg.integrity);
  await publishAndVerify(options);
  expect(options.publish).toHaveBeenCalledTimes(1);
  expect(options.recordAccepted).toHaveBeenCalledTimes(1);
});

it('stops immediately on registry errors instead of interpreting them as absence', async () => {
  for (const code of ['E401', 'E403', 'E500', 'ETIMEDOUT']) {
    const options = fixture([new Error(code)]);
    await expect(publishAndVerify(options)).rejects.toThrow(code);
    expect(options.publish).not.toHaveBeenCalled();
    expect(options.wait).not.toHaveBeenCalled();
  }
});

it('retains acceptance when a later registry read fails', async () => {
  const options = fixture([null, new Error('ETIMEDOUT')]);
  await expect(publishAndVerify(options)).rejects.toThrow('ETIMEDOUT');
  expect(await options.wasAccepted()).toBe(true);
  expect(options.publish).toHaveBeenCalledTimes(1);
});

it('rejects mismatched bytes after publication', async () => {
  const options = fixture([null, 'sha512-other']);
  await expect(publishAndVerify(options)).rejects.toThrow('different bytes');
  expect(options.wait).not.toHaveBeenCalled();
});

it('does not record acceptance or retry when npm publish itself fails', async () => {
  const options = fixture([null]);
  options.publish.mockRejectedValueOnce(new Error('EOTP'));
  await expect(publishAndVerify(options)).rejects.toThrow('EOTP');
  expect(options.recordAccepted).not.toHaveBeenCalled();
  expect(options.lookup).toHaveBeenCalledTimes(1);
});
