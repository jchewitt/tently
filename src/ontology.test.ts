// Modified for standalone extraction; see docs/extraction-manifest.json.
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import type { SemanticArtifact } from './core.js';
import { GitRepository } from './git.js';
import {
  compileOntologyAtExactCheckout,
  dockerHostUserArguments,
  renderGeneratedOntologyRoot,
  requireLinuxDocker,
} from './ontology.js';

const execFileAsync = promisify(execFile);

describe('ontology compilation', () => {
  it('requires a responsive Linux engine and preserves the probe failure as its cause', async () => {
    await expect(requireLinuxDocker('.', async () => 'linux\n')).resolves.toBeUndefined();
    await expect(requireLinuxDocker('.', async () => 'windows\n')).rejects.toThrow(
      'Docker preflight failed',
    );
    const error = new Error('probe timed out');
    await expect(
      requireLinuxDocker('.', async () => {
        throw error;
      }),
    ).rejects.toMatchObject({ cause: error });
  });
  it('rejects a requested ref that is not the exact clean checkout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-ontology-ref-'));
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['config', 'user.email', 'context-graph@example.test'], {
      cwd: root,
    });
    await execFileAsync('git', ['config', 'user.name', 'Context Graph Test'], { cwd: root });
    await writeFile(join(root, 'source.txt'), 'one\n', 'utf8');
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'one'], { cwd: root });
    await writeFile(join(root, 'source.txt'), 'two\n', 'utf8');
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'two'], { cwd: root });
    let compiled = false;

    await expect(
      compileOntologyAtExactCheckout(
        new GitRepository(root),
        {
          async compile() {
            compiled = true;
            return { root: 'rdf', rdfFiles: [], digest: 'digest' };
          },
        },
        'HEAD~',
      ),
    ).rejects.toThrow('checked-out HEAD');
    expect(compiled).toBe(false);
  });

  it('imports every generated semantic description into the deterministic RDF root', () => {
    const artifact = {
      key: 'artifact-key',
      oml: 'description <https://context-graph.dev/generated/artifact-key#> as generated {}',
    } as SemanticArtifact;

    const root = renderGeneratedOntologyRoot([artifact]);
    expect(root).toContain('includes <https://context-graph.dev/generated/artifact-key#>');
    expect(root).not.toContain('context.example.dev');
  });

  it('runs containers as the host user on POSIX to avoid root-owned workspaces', () => {
    const args = dockerHostUserArguments();
    if (process.platform === 'win32') expect(args).toEqual([]);
    else {
      expect(args).toContain('--user');
      expect(args).toContain('GRADLE_USER_HOME=/workspace/.gradle');
    }
  });
});
