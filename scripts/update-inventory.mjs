import { readFile, writeFile } from 'node:fs/promises';
import { createGitLineEndingReader } from './git-content.mjs';
import { isUtf8 } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const path = resolve(root, 'docs/extraction-manifest.json');
const existingBytes = await readFile(path);
const existing = existingBytes.toString('utf8');
const manifest = JSON.parse(existing);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const check = process.argv.includes('--check');
const committedLineEndings = createGitLineEndingReader(root);

function checkoutLineEndings(canonical, original) {
  return original.includes(Buffer.from('\r\n')) ? canonical.replace(/\r?\n/g, '\r\n') : canonical;
}

for (const entry of manifest.imports) {
  const target = resolve(root, entry.destinationPath);
  const original = await readFile(target);
  let bytes = committedLineEndings(entry.destinationPath, original);
  let content = bytes.toString('utf8');
  entry.modified = digest(bytes) !== entry.sourceSha256;
  if (entry.modified && !/Modified for standalone extraction|x-extraction-modifications/i.test(content)) {
    if (/\.(ts|mjs|md|ya?ml|json)$/.test(target) && (!isUtf8(bytes) || bytes.includes(0))) {
      throw new Error(`Cannot annotate a non-text import: ${entry.destinationPath}`);
    }
    if (/\.(ts|mjs)$/.test(target)) {
      const notice = '// Modified for standalone extraction; see docs/extraction-manifest.json.\n';
      content = content.startsWith('#!') ? content.replace(/\n/, `\n${notice}`) : notice + content;
    } else if (target.endsWith('.md')) {
      const notice = '<!-- Modified for standalone extraction; see docs/extraction-manifest.json. -->\n';
      content = content.startsWith('---\n') ? content.replace(/\n---\n/, `\n---\n${notice}`) : notice + content;
    } else if (/\.ya?ml$/.test(target)) {
      content = '# Modified for standalone extraction; see docs/extraction-manifest.json.\n' + content;
    } else if (target.endsWith('.json')) {
      const parsed = JSON.parse(content);
      const annotate = (value) => ({ ...value, 'x-extraction-modifications': 'Modified for standalone extraction; see docs/extraction-manifest.json.' });
      content = JSON.stringify(Array.isArray(parsed) ? parsed.map(annotate) : annotate(parsed), null, 2) + '\n';
    }
    if (content !== bytes.toString('utf8')) {
      if (check) throw new Error(`Missing modification notice: ${entry.destinationPath}`);
      const output = bytes.equals(original) ? content : checkoutLineEndings(content, original);
      await writeFile(target, output);
      bytes = committedLineEndings(entry.destinationPath, Buffer.from(output));
    }
  }
  entry.destinationSha256 = digest(bytes);
}
const imported = new Set(manifest.imports.map((entry) => entry.destinationPath));
const deleted = new Set(execFileSync('git', ['ls-files', '--deleted', '-z'],
  { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean));
manifest.authoredPaths = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))].filter((path) => !imported.has(path) && !deleted.has(path)).sort();
const expected = JSON.stringify(manifest, null, 2) + '\n';
const canonicalManifest = committedLineEndings('docs/extraction-manifest.json', existingBytes).toString('utf8');
if (check && expected !== canonicalManifest) throw new Error('Extraction manifest is stale; run pnpm inventory:update');
if (!check && expected !== canonicalManifest) await writeFile(path, checkoutLineEndings(expected, existingBytes));
