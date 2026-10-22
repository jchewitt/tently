import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScipSourceProject } from '../configuration/scip-project.js';
import { matchesRepositoryGlob } from '../repository/glob.js';

const generatedProject = '.weftlet-scip-source-project.json';

/** Only writes compiler configuration into a disposable committed tree; never source or dependencies. */
export async function prepareScipSourceProject(
  root: string, project: ScipSourceProject, trackedPaths: readonly string[],
): Promise<string> {
  if (trackedPaths.includes(generatedProject)) throw new Error(`Reserved SCIP project path is already tracked: ${generatedProject}`);
  const files = trackedPaths.filter((path) => /\.(?:[cm]?ts|tsx)$/.test(path) &&
    project.include.some((pattern) => matchesRepositoryGlob(path, pattern))).sort();
  if (!files.length || files.length > 5000) throw new Error('SCIP source project must select 1–5000 committed TypeScript files');
  const tracked = new Set(trackedPaths);
  const paths: Record<string, string[]> = Object.create(null);
  for (const [name, path] of Object.entries(project.aliases ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (!tracked.has(path)) throw new Error(`SCIP source alias ${name} targets an absent committed file: ${path}`);
    if (!files.includes(path)) throw new Error(`SCIP source alias ${name} target must be selected by sourceProject.include: ${path}`);
    paths[name] = [`./${path}`];
  }
  // A separate program deliberately avoids inherited build exclusions, output files,
  // external tsconfig packages and machine-specific path mappings. This is local-symbol
  // analysis, not a replacement for the repository's compiler or dependency installation.
  await writeFile(join(root, generatedProject), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', jsx: 'preserve',
      noEmit: true, skipLibCheck: true, types: [], baseUrl: '.', paths,
    },
    files: files.map((path) => `./${path}`), include: [], exclude: [],
  }) + '\n', { flag: 'wx' });
  return generatedProject;
}
