export const minimumNodeMajor = 24;

/** Run before loading dependencies that require newer Node built-ins. */
export function assertSupportedNode(version = process.versions.node) {
  const major = Number(version.split('.')[0]);
  if (!Number.isInteger(major) || major < minimumNodeMajor) {
    throw new Error(`Tently requires Node.js ${minimumNodeMajor} or newer; found ${version}. ` +
      'Use Node 24 (nvm install 24 && nvm use 24), then reinstall dependencies and retry.');
  }
}

assertSupportedNode();
