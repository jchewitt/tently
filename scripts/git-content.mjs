import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export function createGitLineEndingReader(root) {
  const git = (args, input) => execFileSync('git', args, { cwd: root, input, encoding: 'utf8' }).trim();
  let objectFormat;
  const blobId = (bytes) => createHash(objectFormat ??= git(['rev-parse', '--show-object-format'])).update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

  /** Match Git's CRLF conversion without staging, writing objects, or running custom filters. */
  return function committedLineEndings(relativePath, bytes) {
    if (!bytes.includes(Buffer.from('\r\n'))) return bytes;
    const attributes = execFileSync('git', ['check-attr', '-z', 'filter', 'working-tree-encoding', '--', relativePath],
      { cwd: root, encoding: 'utf8' }).split('\0');
    for (let index = 2; index < attributes.length; index += 3) {
      if (!['unspecified', 'unset'].includes(attributes[index])) {
        throw new Error(`Cannot normalize CRLF with a custom Git filter or encoding: ${relativePath}`);
      }
    }
    const cleanedId = git(['-c', 'core.safecrlf=false', 'hash-object', `--path=${relativePath}`, '--stdin'], bytes);
    if (cleanedId === blobId(bytes)) return bytes;
    // Remove only CR immediately preceding LF, preserving every other byte, including binary data.
    const lf = Buffer.from(bytes.filter((byte, index) => byte !== 13 || bytes[index + 1] !== 10));
    if (cleanedId !== blobId(lf)) throw new Error(`Unsupported Git content conversion: ${relativePath}`);
    return lf;
  };
}
