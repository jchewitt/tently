/** Explicit source-only indexing, independent of a consumer's build tsconfig. */
export interface ScipSourceProject {
  readonly include: readonly string[];
  readonly aliases?: Readonly<Record<string, string>>;
}

function repositoryPath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 &&
    !/[\\:\x00-\x1f]/.test(value) &&
    value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/** Also used by direct indexer callers, which need not pass through loadConfig. */
export function assertScipSourceProject(value: unknown): asserts value is ScipSourceProject {
  const error = (reason: string): never => { throw new Error(`Invalid scip.sourceProject: ${reason}`); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) error('expected an object');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !['include', 'aliases'].includes(key))) error('unknown field');
  if (!Array.isArray(record.include) || record.include.length === 0 || record.include.length > 100 ||
      !record.include.every(repositoryPath)) error('include requires 1–100 repository-relative paths/globs');
  if (record.aliases !== undefined) {
    if (!record.aliases || typeof record.aliases !== 'object' || Array.isArray(record.aliases)) error('aliases must be an object');
    const entries = Object.entries(record.aliases as Record<string, unknown>);
    if (entries.length > 100) error('at most 100 exact aliases are supported');
    for (const [name, path] of entries) {
      if (!/^(?:@[\w.-]+\/)?[\w.-]+(?:\/[\w.-]+)*$/.test(name) ||
          name.split('/').some((segment) => segment === '.' || segment === '..') ||
          !repositoryPath(path) || /[*?]/.test(path) || !/\.(?:[cm]?ts|tsx)$/.test(path)) {
        error(`alias ${name} must map an exact module name to a repository TypeScript file`);
      }
    }
  }
}

export function assertSourceProjectInvocation(command: string, args: readonly string[]): void {
  if (command !== 'bundled-scip-typescript' || args.length !== 2 ||
      args[0] !== 'index' || args[1] !== '--no-global-caches') {
    throw new Error('scip.sourceProject requires bundled-scip-typescript and args ["index", "--no-global-caches"]');
  }
}

export function scipSourcePatterns(project: ScipSourceProject | undefined): readonly string[] {
  return project ? [...project.include, ...Object.values(project.aliases ?? {})] : [];
}
