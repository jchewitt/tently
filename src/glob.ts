function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function escapeRegularExpression(character: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(character) ? `\\${character}` : character;
}

export function matchesRepositoryGlob(path: string, pattern: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedPattern = normalizePath(pattern);
  let expression = '^';
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index] as string;
    if (character === '*' && normalizedPattern[index + 1] === '*') {
      index += 1;
      if (normalizedPattern[index + 1] === '/') {
        index += 1;
        expression += '(?:.*/)?';
      } else {
        expression += '.*';
      }
    } else if (character === '*') {
      expression += '[^/]*';
    } else if (character === '?') {
      expression += '[^/]';
    } else {
      expression += escapeRegularExpression(character);
    }
  }
  return new RegExp(`${expression}$`).test(normalizedPath);
}

export function contractPatternRoots(patterns: readonly string[]): readonly string[] {
  return [
    ...new Set(
      patterns.map((pattern) => {
        const normalized = normalizePath(pattern);
        const wildcard = normalized.search(/[?*]/);
        if (wildcard < 0) return normalized;
        const slash = normalized.lastIndexOf('/', wildcard);
        return slash < 0 ? '.' : normalized.slice(0, slash);
      }),
    ),
  ].sort();
}
