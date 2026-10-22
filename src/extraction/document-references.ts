import { posix } from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Definition, Nodes } from 'mdast';

export interface DocumentReference {
  readonly target: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly relativeTo: 'document' | 'repository';
}

// Markdown destinations are document-relative. Literal paths are repository-relative unless
// prefixed with ./ or ../. Parsing Markdown keeps examples, URLs and link labels out of the graph.
const barePath = /(?<![\w/:@.-])(?:\.{1,2}\/|\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+/g;
const fileName = /\.(?:md|mdx|txt|ts|tsx|mts|cts|js|jsx|mjs|cjs|json|ya?ml|prisma|sh)$/i;

export function documentReferences(content: string): readonly DocumentReference[] {
  const tree = fromMarkdown(content);
  const definitions = new Map<string, Definition>();
  const walk = (node: Nodes, visit: (node: Nodes) => void): void => {
    visit(node);
    if ('children' in node) for (const child of node.children) walk(child, visit);
  };
  walk(tree, (node) => {
    if (node.type === 'definition' && !definitions.has(node.identifier)) {
      definitions.set(node.identifier, node);
    }
  });
  const references: DocumentReference[] = [];
  const add = (node: Nodes, target: string, relativeTo: DocumentReference['relativeTo']) => {
    if (node.position) references.push({ target, relativeTo,
      startLine: node.position.start.line, endLine: node.position.end.line });
  };
  const visit = (node: Nodes): void => {
    if (node.type === 'link') { add(node, node.url, 'document'); return; }
    if (node.type === 'linkReference') {
      const definition = definitions.get(node.identifier);
      // Cite the declaration containing the destination, not a path invented from its label.
      if (definition) add(definition, definition.url, 'document');
      return;
    }
    if (node.type === 'inlineCode') {
      if (!/\s/.test(node.value) && (node.value.includes('/') || fileName.test(node.value))) {
        add(node, node.value, 'repository');
      }
      return;
    }
    if (node.type === 'text' && node.position) {
      const raw = content.slice(node.position.start.offset, node.position.end.offset);
      for (const match of raw.matchAll(barePath)) {
        const target = match[0].replace(/[.,;:]+$/, '');
        if (!/[A-Za-z]/.test(target)) continue;
        const startLine = node.position.start.line + raw.slice(0, match.index).split('\n').length - 1;
        references.push({ target, startLine, endLine: startLine, relativeTo: 'repository' });
      }
      return;
    }
    // Code blocks, images, HTML and unused reference definitions are not repository mappings.
    if ('children' in node) for (const child of node.children) visit(child);
  };
  visit(tree);
  return references;
}

export type ReferenceResolution =
  | { readonly kind: 'resolved'; readonly path: string }
  | { readonly kind: 'ignored' }
  | { readonly kind: 'missing'; readonly path?: string; readonly reason: string };

export function resolveDocumentReference(
  sourcePath: string, reference: DocumentReference, tracked: ReadonlySet<string>,
): ReferenceResolution {
  const target = reference.target;
  // No network, filesystem lookup or guessed basename fallback. A leading / denotes repository root.
  if (!target || target.startsWith('#') || target.startsWith('//') || /^[a-z][\w+.-]*:/i.test(target)) {
    return { kind: 'ignored' };
  }
  let path: string;
  try { path = decodeURIComponent(target.split(/[?#]/, 1)[0]!); }
  catch { return { kind: 'missing', reason: `Malformed repository link destination: ${target}` }; }
  if (/[\\\x00-\x1f\x7f]/.test(path)) {
    return { kind: 'missing', reason: `Unsupported repository link destination: ${target}` };
  }
  const relative = reference.relativeTo === 'document' || /^\.{1,2}\//.test(path);
  path = posix.normalize(path.startsWith('/') ? path.slice(1)
    : posix.join(relative ? posix.dirname(sourcePath) : '', path));
  if (path === '..' || path.startsWith('../') || posix.isAbsolute(path)) {
    return { kind: 'missing', reason: `Repository link escapes the repository: ${target}` };
  }
  if (tracked.has(path)) return { kind: 'resolved', path };
  return { kind: 'missing', path,
    reason: `Document reference ${target} resolves to ${path}, which is not a committed file. Directory references are not expanded.` };
}
