import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const path = resolve(root, 'docs/extraction-manifest.json');
const existing = await readFile(path, 'utf8');
const manifest = JSON.parse(existing);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const check = process.argv.includes('--check');
for (const entry of manifest.imports) {
  const target = resolve(root, entry.destinationPath);
  let content = await readFile(target, 'utf8');
  entry.modified = digest(content) !== entry.sourceSha256;
  if (entry.modified && !/Modified for standalone extraction|x-extraction-modifications/i.test(content)) {
    if (/\.(ts|mjs)$/.test(target)) {
      const notice = '// Modified for standalone extraction; see docs/extraction-manifest.json.\n';
      content = content.startsWith('#!') ? content.replace(/\n/, `\n${notice}`) : notice + content;
    } else if (target.endsWith('.md')) {
      const notice = '<!-- Modified for standalone extraction; see docs/extraction-manifest.json. -->\n';
      content = content.startsWith('---\n') ? content.replace(/\n---\n/, `\n---\n${notice}`) : notice + content;
    } else if (/\.ya?ml$/.test(target)) {
      content = '# Modified for standalone extraction; see docs/extraction-manifest.json.\n' + content;
    } else if (target.endsWith('.json')) {
      content = JSON.stringify({ ...JSON.parse(content),
        'x-extraction-modifications': 'Modified for standalone extraction; see docs/extraction-manifest.json.' }, null, 2) + '\n';
    }
    if (content !== await readFile(target, 'utf8')) {
      if (check) throw new Error(`Missing modification notice: ${entry.destinationPath}`);
      await writeFile(target, content);
    }
  }
  entry.destinationSha256 = digest(content);
}
const imported = new Set(manifest.imports.map((entry) => entry.destinationPath));
manifest.authoredPaths = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))].filter((path) => !imported.has(path)).sort();
const expected = JSON.stringify(manifest, null, 2) + '\n';
if (check && expected !== existing) throw new Error('Extraction manifest is stale; run pnpm inventory:update');
if (!check) await writeFile(path, expected);
