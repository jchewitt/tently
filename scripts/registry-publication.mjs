import { setTimeout } from 'node:timers/promises';

/** Retry visibility checks only: a successful publish must never be retried here. */
export async function publishAndVerify({
  pkg, lookup, publish, wasAccepted, recordAccepted,
  wait = setTimeout, log = console.log, attempts = 21, intervalMs = 15_000,
}) {
  const label = `${pkg.name}@${pkg.version}`;
  const verify = (actual) => {
    if (actual !== pkg.integrity) throw new Error(`${label} exists with different bytes; publication stopped`);
  };
  const existing = await lookup();
  if (existing !== null) {
    verify(existing);
    log(`Already published with matching integrity: ${label}`);
    return;
  }
  if (!await wasAccepted()) {
    log(`Publishing ${label}`);
    await publish();
    await recordAccepted();
  } else {
    log(`npm previously accepted ${label}; checking visibility without republishing`);
  }
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const actual = await lookup();
    if (actual !== null) {
      verify(actual);
      log(`Registry integrity verified: ${label}`);
      return;
    }
    if (attempt < attempts) {
      log(`${label} is still processing (check ${attempt}/${attempts}); retrying visibility in ${intervalMs / 1000}s`);
      await wait(intervalMs);
    }
  }
  throw new Error(`npm accepted ${label}, but it is not visible after ${attempts} checks. ` +
    'Keep .release/ and rerun release:publish later; the saved acceptance record prevents republishing. ' +
    'No later package was published by this run.');
}
