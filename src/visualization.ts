// Modified for standalone extraction; see docs/extraction-manifest.json.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';

import type {
  ContextPack,
  ContextPackLane,
  GraphNode,
  GraphNodeKind,
  ImpactQueryService,
  ImpactScanRequest,
  GraphFact,
} from './core.js';
import { contextPackEvidenceAuthority, contextPackLaneForFact } from './query.js';
import { viewerScript } from './viewer-interaction.js';
import { diagnosticSummary } from './diagnostics.js';

export type ContextGraphVisualizationFormat = 'dot' | 'html' | 'svg';

export interface VisualizationWriteOptions {
  readonly outputPath: string;
  readonly format?: ContextGraphVisualizationFormat;
  readonly force?: boolean;
  readonly sourceUrlTemplate?: string;
}

export interface VisualizationWriteResult {
  readonly outputPath: string;
  readonly format: ContextGraphVisualizationFormat;
  readonly snapshotId: string;
  readonly commitSha: string;
  readonly factCount: number;
  readonly runtimeEvidenceCount: number;
}

type EvidenceAuthority = 'declared' | 'implemented' | 'observed' | 'validated' | 'inferred' | 'draft';
type VisualColumn = 'intent' | 'contracts' | 'implementation' | 'evidence';

interface VisualNode {
  readonly id: string;
  readonly label: string;
  readonly kind: GraphNodeKind;
  readonly column: VisualColumn;
  readonly cluster: string;
}

interface VisualEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly authority: EvidenceAuthority;
  readonly provenance: string;
  readonly detail: string;
  readonly source: GraphFact['provenance'];
  readonly sourceUrl?: string;
}

interface VisualModel {
  readonly nodes: readonly VisualNode[];
  readonly edges: readonly VisualEdge[];
}

interface PositionedNode extends VisualNode {
  readonly x: number;
  readonly y: number;
}

export const MAX_VISUALIZATION_FACTS = 200;
export const MAX_VISUALIZATION_RUNTIME_REFERENCES = 500;

const columns: readonly VisualColumn[] = ['intent', 'contracts', 'implementation', 'evidence'];
const columnLabels: Readonly<Record<VisualColumn, string>> = {
  intent: 'Product intent',
  contracts: 'Contracts & invariants',
  implementation: 'Implementation',
  evidence: 'Validation & evidence',
};
const authorityColors: Readonly<Record<EvidenceAuthority, string>> = {
  inferred: '#64748b',
  draft: '#d97706',
  declared: '#7c3aed',
  implemented: '#0284c7',
  observed: '#ea580c',
  validated: '#059669',
};
const columnColors: Readonly<Record<VisualColumn, string>> = {
  intent: '#f3e8ff',
  contracts: '#fef3c7',
  implementation: '#e0f2fe',
  evidence: '#d1fae5',
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeDot(value: string): string {
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')}"`;
}

function jsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function visualColumn(
  kind: GraphNodeKind,
  selectedLanes?: ReadonlySet<ContextPackLane>,
): VisualColumn {
  if (['Contract', 'Invariant', 'PersistenceModel'].includes(kind)) return 'contracts';
  if (['Evidence', 'Snapshot'].includes(kind)) return 'evidence';
  if (['Project', 'Document', 'Capability', 'Workflow', 'Scope'].includes(kind)) {
    if (selectedLanes?.has('productIntent')) return 'intent';
    if (selectedLanes?.has('contractsAndInvariants')) return 'contracts';
    if (selectedLanes?.has('implementationAndConsumers')) return 'implementation';
    if (selectedLanes?.has('validationEvidence')) return 'evidence';
  }
  return 'implementation';
}

function addNode(
  nodes: Map<string, VisualNode>,
  node: GraphNode,
  selectedLanes?: ReadonlySet<ContextPackLane>,
): void {
  if (nodes.has(node.id)) return;
  nodes.set(node.id, {
    id: node.id,
    label: node.label,
    kind: node.kind,
    cluster: String(node.attributes?.module ?? node.attributes?.layer ?? node.kind),
    column: visualColumn(node.kind, selectedLanes),
  });
}

function assertVisualizationBounds(pack: ContextPack): void {
  if (pack.facts.length > MAX_VISUALIZATION_FACTS) {
    throw new Error(
      `Context Pack contains ${pack.facts.length} facts; visualization limit is ${MAX_VISUALIZATION_FACTS}`,
    );
  }
  if (pack.runtimeEvidence.length > MAX_VISUALIZATION_RUNTIME_REFERENCES) {
    throw new Error(
      `Context Pack contains ${pack.runtimeEvidence.length} runtime references; visualization limit is ${MAX_VISUALIZATION_RUNTIME_REFERENCES}`,
    );
  }
}

export function sourceLink(source: GraphFact['provenance'], template?: string): string | undefined {
  if (!template) return undefined;
  if (!template.includes('{commit}') || !template.includes('{path}')) throw new Error('Source URL template must include {commit} and {path}');
  if (source.path.startsWith('/') || source.path.includes('\\') || source.path.split('/').some(part => part === '..' || part === '.')) throw new Error('Source path must be repository relative');
  const url = new URL(template.replaceAll('{commit}', encodeURIComponent(source.commitSha))
    .replaceAll('{path}', source.path.split('/').map(encodeURIComponent).join('/'))
    .replaceAll('{line}', String(source.startLine)));
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Source URL template must use HTTPS without credentials');
  return url.href;
}

function visualModel(pack: ContextPack, sourceUrlTemplate?: string): VisualModel {
  assertVisualizationBounds(pack);
  const nodes = new Map<string, VisualNode>();
  const selectedLanes = new Map<string, Set<ContextPackLane>>();
  const edges: VisualEdge[] = [];
  for (const fact of pack.facts) {
    const lane = contextPackLaneForFact(fact);
    if (!lane) continue;
    for (const node of [fact.subject, fact.object]) {
      const lanes = selectedLanes.get(node.id) ?? new Set<ContextPackLane>();
      lanes.add(lane);
      selectedLanes.set(node.id, lanes);
    }
  }
  for (const fact of pack.facts) {
    addNode(nodes, fact.subject, selectedLanes.get(fact.subject.id));
    addNode(nodes, fact.object, selectedLanes.get(fact.object.id));
    edges.push({
      id: fact.id,
      from: fact.subject.id,
      to: fact.object.id,
      label: fact.predicate,
      authority: contextPackEvidenceAuthority(fact),
      provenance: `${fact.provenance.path}:${fact.provenance.startLine}`,
      detail: `confidence ${fact.confidence}; ${fact.extractor.id}@${fact.extractor.version}; source ${fact.sourceAuthority ?? 'see citation'}; extraction ${fact.extractionReview ?? 'unspecified'}`,
      source: fact.provenance,
      sourceUrl: sourceLink(fact.provenance, sourceUrlTemplate),
    });
  }
  return {
    nodes: [...nodes.values()].sort(
      (left, right) =>
        columns.indexOf(left.column) - columns.indexOf(right.column) ||
        left.cluster.localeCompare(right.cluster) ||
        left.label.localeCompare(right.label) ||
        left.id.localeCompare(right.id),
    ),
    edges,
  };
}

function truncated(value: string, limit = 34): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function positionedNodes(model: VisualModel): {
  readonly nodes: readonly PositionedNode[];
  readonly width: number;
  readonly height: number;
} {
  const margin = 36;
  const columnWidth = 284;
  const rowHeight = 78;
  const headerHeight = 104;
  const positioned: PositionedNode[] = [];
  let maxHeight = 320;
  for (const [columnIndex, column] of columns.entries()) {
    const members = model.nodes.filter((node) => node.column === column);
    let y = headerHeight;
    let cluster = '';
    members.forEach((node) => {
      if (node.cluster !== cluster) { y += 24; cluster = node.cluster; }
      positioned.push({
        ...node,
        x: margin + columnIndex * columnWidth,
        y,
      });
      y += rowHeight;
    });
    maxHeight = Math.max(maxHeight, y);
  }
  return {
    nodes: positioned,
    width: margin * 2 + columnWidth * columns.length - 32,
    height: Math.max(420, maxHeight + margin),
  };
}

function edgePath(source: PositionedNode, target: PositionedNode, offset: number): string {
  const nodeWidth = 228;
  const nodeHeight = 52;
  const sourceOnLeft = source.x < target.x;
  const sameColumn = source.x === target.x;
  const startX = sameColumn ? source.x + nodeWidth : sourceOnLeft ? source.x + nodeWidth : source.x;
  const endX = sameColumn ? target.x + nodeWidth : sourceOnLeft ? target.x : target.x + nodeWidth;
  const startY = source.y + nodeHeight / 2;
  const endY = target.y + nodeHeight / 2;
  if (source.id === target.id) {
    return `M ${startX} ${startY} C ${startX + 72} ${startY - 50}, ${startX + 72} ${startY + 50}, ${startX} ${startY + 6}`;
  }
  if (sameColumn) {
    const controlX = startX + 48 + Math.abs(offset);
    return `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`;
  }
  const middleX = (startX + endX) / 2 + offset;
  return `M ${startX} ${startY} C ${middleX} ${startY}, ${middleX} ${endY}, ${endX} ${endY}`;
}

function edgeLabelPosition(
  source: PositionedNode,
  target: PositionedNode,
  offset: number,
): { readonly x: number; readonly y: number } {
  const nodeWidth = 228;
  const nodeHeight = 52;
  if (source.id === target.id) {
    return { x: source.x + nodeWidth + 58, y: source.y + nodeHeight / 2 - 28 };
  }
  if (source.x === target.x) {
    return {
      x: source.x + nodeWidth + 54 + Math.abs(offset),
      y: (source.y + target.y + nodeHeight) / 2 - 4,
    };
  }
  return {
    x: (source.x + target.x + nodeWidth) / 2 + offset / 2,
    y: (source.y + target.y + nodeHeight) / 2 - 5,
  };
}

export function renderContextPackDot(pack: ContextPack): string {
  const model = visualModel(pack);
  const lines = [
    'digraph ContextPack {',
    `  graph [rankdir=LR, bgcolor="#f8fafc", label=${escapeDot(
      `Context Pack ${pack.snapshot.commitSha.slice(0, 12)} · ${model.edges.length} relationships`,
    )}, labelloc=t, fontname="Arial"];`,
    '  node [shape=box, style="rounded,filled", fontname="Arial", color="#334155"];',
    '  edge [fontname="Arial", fontsize=9];',
  ];
  for (const column of columns) {
    lines.push(`  subgraph ${escapeDot(`cluster-${column}`)} {`);
    lines.push(`    label=${escapeDot(columnLabels[column])};`);
    lines.push(`    color=${escapeDot(columnColors[column])};`);
    for (const node of model.nodes.filter((item) => item.column === column)) {
      lines.push(
        `    ${escapeDot(node.id)} [label=${escapeDot(`${node.label}\n${node.kind}`)}, fillcolor=${escapeDot(
          columnColors[column],
        )}];`,
      );
    }
    lines.push('  }');
  }
  for (const edge of model.edges) {
    lines.push(
      `  ${escapeDot(edge.from)} -> ${escapeDot(edge.to)} [label=${escapeDot(edge.label)}, color=${escapeDot(
        authorityColors[edge.authority],
      )}, tooltip=${escapeDot(`${edge.provenance}; ${edge.detail}`)}];`,
    );
  }
  lines.push('}', '');
  return lines.join('\n');
}

export function renderContextPackSvg(pack: ContextPack): string {
  const model = visualModel(pack);
  const layout = positionedNodes(model);
  const positions = new Map(layout.nodes.map((node) => [node.id, node]));
  const edgeMarkup = model.edges
    .map((edge, index) => {
      const source = positions.get(edge.from);
      const target = positions.get(edge.to);
      if (!source || !target) return '';
      const offset = ((index % 7) - 3) * 7;
      const label = edgeLabelPosition(source, target, offset);
      const search = [source.label, target.label, edge.label, edge.provenance, edge.detail].join(
        ' ',
      );
      return `<g class="visual-edge authority-${edge.authority}" data-visual-edge="true" data-edge-id="${escapeXml(edge.id)}" data-authority="${edge.authority}" data-from="${escapeXml(
        source.id,
      )}" data-to="${escapeXml(target.id)}" data-search="${escapeXml(search.toLowerCase())}">
  <title>${escapeXml(`${source.label} —${edge.label}→ ${target.label}; ${edge.provenance}; ${edge.detail}`)}</title>
  <path d="${edgePath(source, target, offset)}" marker-end="url(#arrow-${edge.authority})" />
  <text class="edge-label" x="${label.x}" y="${label.y}" text-anchor="middle">${escapeXml(truncated(edge.label, 22))}</text>
</g>`;
    })
    .join('\n');
  const nodeMarkup = layout.nodes
    .map(
      (
        node,
      ) => `<g class="visual-node column-${node.column}" data-visual-node="true" data-node-id="${escapeXml(
        node.id,
      )}" role="button" tabindex="0" aria-label="${escapeXml(node.label)}" data-cluster="${escapeXml(node.cluster)}" data-search="${escapeXml(`${node.label} ${node.kind} ${node.id}`.toLowerCase())}" transform="translate(${node.x} ${node.y})">
  <title>${escapeXml(`${node.label} (${node.kind}) · ${node.id}`)}</title>
  <rect width="228" height="52" rx="9" />
  <text class="node-label" x="12" y="22">${escapeXml(truncated(node.label))}</text>
  <text class="node-kind" x="12" y="40">${escapeXml(node.kind)}</text>
</g>`,
    )
    .join('\n');
  const headings = columns
    .map(
      (column, index) =>
        `<text class="column-heading" x="${36 + index * 284}" y="76">${escapeXml(columnLabels[column])}</text>`,
    )
    .join('\n');
  const clusterHeadings = layout.nodes.filter((node, index, nodes) => index === 0 ||
    node.column !== nodes[index - 1]!.column || node.cluster !== nodes[index - 1]!.cluster)
    .map((node) => `<text data-cluster-heading="${escapeXml(node.cluster)}" x="${node.x}" y="${node.y - 8}" class="node-kind">${escapeXml(truncated(node.cluster))}</text>`).join('');
  const markers = (Object.entries(authorityColors) as [EvidenceAuthority, string][])
    .map(
      ([authority, color]) =>
        `<marker id="arrow-${authority}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${color}" /></marker>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="graph-title graph-description" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">
<title id="graph-title">Context Pack ${escapeXml(pack.snapshot.commitSha.slice(0, 12))}</title>
<desc id="graph-description">${model.nodes.length} nodes and ${model.edges.length} bounded relationships from snapshot ${escapeXml(pack.snapshot.snapshotId)}</desc>
<defs>${markers}</defs>
<style>
  svg { background: #f8fafc; color: #0f172a; font-family: Arial, sans-serif; }
  .column-heading { fill: #334155; font-size: 15px; font-weight: 700; }
  .visual-node rect { stroke: #64748b; stroke-width: 1.2; }
  .column-intent rect { fill: ${columnColors.intent}; }
  .column-contracts rect { fill: ${columnColors.contracts}; }
  .column-implementation rect { fill: ${columnColors.implementation}; }
  .column-evidence rect { fill: ${columnColors.evidence}; }
  .node-label { fill: #0f172a; font-size: 12px; font-weight: 700; }
  .node-kind { fill: #475569; font-size: 10px; }
  .visual-edge { fill: none; opacity: .72; }
  .visual-edge path { stroke-width: 1.4; }
  .edge-label { fill: #334155; font-size: 9px; paint-order: stroke; stroke: #f8fafc; stroke-width: 3px; }
  .authority-declared path { stroke: ${authorityColors.declared}; }
  .authority-implemented path { stroke: ${authorityColors.implemented}; }
  .authority-observed path { stroke: ${authorityColors.observed}; }
  .authority-validated path { stroke: ${authorityColors.validated}; }
  .authority-inferred path { stroke: ${authorityColors.inferred}; }
  .authority-draft path { stroke: ${authorityColors.draft}; }
  .is-hidden { display: none; }
</style>
<rect width="100%" height="100%" fill="#f8fafc" />
<text x="36" y="34" fill="#0f172a" font-size="19" font-weight="700">Context Pack ${escapeXml(
    pack.snapshot.commitSha.slice(0, 12),
  )}</text>
<text x="36" y="53" fill="#64748b" font-size="11">${model.nodes.length} nodes · ${model.edges.length} relationships · bounded to ${pack.facts.length} facts</text>
${headings}
${clusterHeadings}
${edgeMarkup}
${nodeMarkup}
</svg>`;
}

function detailList(items: readonly string[], empty: string): string {
  return items.length
    ? `<ul>${items.map((item) => `<li>${escapeXml(item)}</li>`).join('')}</ul>`
    : `<p>${escapeXml(empty)}</p>`;
}

export function renderContextPackHtml(pack: ContextPack, sourceUrlTemplate?: string): string {
  const model = visualModel(pack, sourceUrlTemplate);
  const svg = renderContextPackSvg(pack);
  const nodes = new Map(model.nodes.map((node) => [node.id, node]));
  const relationships = model.edges
    .map((edge) => {
      const source = nodes.get(edge.from);
      const target = nodes.get(edge.to);
      const sourceLabel = source?.label ?? edge.from;
      const targetLabel = target?.label ?? edge.to;
      return `<tr data-relationship-row data-edge-id="${escapeXml(edge.id)}" data-authority="${edge.authority}" data-search="${escapeXml(
        `${sourceLabel} ${edge.from} ${targetLabel} ${edge.to} ${edge.label} ${edge.provenance} ${edge.detail}`.toLowerCase(),
      )}"><td><span class="layer layer-${edge.authority}">${edge.authority}</span></td><td><strong>${escapeXml(
        sourceLabel,
      )}</strong><br /><code>${escapeXml(edge.from)}</code></td><td>${escapeXml(
        edge.label,
      )}</td><td><strong>${escapeXml(targetLabel)}</strong><br /><code>${escapeXml(
        edge.to,
      )}</code></td><td>${edge.sourceUrl ? `<a href="${escapeXml(edge.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeXml(edge.provenance)}</a>` : escapeXml(edge.provenance)}</td></tr>`;
    })
    .join('');
  const controls = (Object.keys(authorityColors) as EvidenceAuthority[])
    .map(
      (authority) =>
        `<label><input type="checkbox" data-layer="${authority}" checked /> ${authority}</label>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
  <title>Context Pack ${escapeXml(pack.snapshot.commitSha.slice(0, 12))}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #0f172a; background: #e2e8f0; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    header { background: #0f172a; color: #f8fafc; padding: 20px 24px; }
    header h1 { font-size: 21px; margin: 0 0 6px; }
    header p { color: #cbd5e1; margin: 0; font-size: 13px; }
    .controls { align-items: center; background: #fff; border-bottom: 1px solid #cbd5e1; display: flex; flex-wrap: wrap; gap: 14px; padding: 12px 24px; position: sticky; top: 0; z-index: 2; }
    .controls input[type="search"] { border: 1px solid #94a3b8; border-radius: 6px; min-width: 270px; padding: 7px 9px; }
    .controls label { font-size: 13px; }
    button { background: #334155; border: 0; border-radius: 6px; color: white; cursor: pointer; padding: 7px 11px; }
    main { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) 340px; padding: 16px; }
    .panel { background: white; border: 1px solid #cbd5e1; border-radius: 9px; box-shadow: 0 1px 2px rgb(15 23 42 / 8%); }
    .canvas { max-height: calc(100vh - 155px); overflow: auto; }
    .canvas svg { display: block; }
    aside { display: flex; flex-direction: column; gap: 12px; }
    aside section, details { padding: 14px; }
    h2 { font-size: 15px; margin: 0 0 9px; }
    ul { margin: 6px 0; padding-left: 21px; }
    li, p, summary { font-size: 12px; line-height: 1.45; }
    .metric { background: #f1f5f9; border-radius: 6px; display: inline-block; font-size: 12px; margin: 2px; padding: 5px 7px; }
    .relationships { grid-column: 1 / -1; overflow: auto; }
    table { border-collapse: collapse; font-size: 11px; width: 100%; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 7px; text-align: left; vertical-align: top; }
    .layer { border-radius: 999px; color: white; display: inline-block; padding: 2px 7px; }
    .layer-declared { background: ${authorityColors.declared}; }
    .layer-implemented { background: ${authorityColors.implemented}; }
    .layer-observed { background: ${authorityColors.observed}; }
    .layer-validated { background: ${authorityColors.validated}; }
    .layer-inferred { background: ${authorityColors.inferred}; }
    .layer-draft { background: ${authorityColors.draft}; }
    pre { font-size: 11px; overflow: auto; white-space: pre-wrap; }
    .is-hidden { display: none !important; }
    .visual-node { cursor: pointer; }
    .visual-node.is-selected rect { stroke: #be123c; stroke-width: 3; }
    .visual-edge.is-highlighted { opacity: 1; }
    .visual-edge.is-highlighted path { stroke: #be123c; stroke-width: 4; }
    #node-detail { overflow-wrap: anywhere; max-height: 440px; overflow: auto; }
    #path-status { max-width: 450px; }
    select { max-width: 260px; padding: 6px; }
    .evidence-status { background: #fff7ed; padding: 12px 24px; overflow-wrap: anywhere; }
    @media (max-width: 900px) { main { grid-template-columns: 1fr; } .relationships { grid-column: 1; } }
  </style>
</head>
<body>
  <header>
    <h1>Context Pack ${escapeXml(pack.snapshot.commitSha.slice(0, 12))}</h1>
    <p>Snapshot ${escapeXml(pack.snapshot.snapshotId)} · generated from the bounded Context Pack service</p>
  </header>
  <div class="controls" aria-label="Graph filters">
    <input id="graph-search" type="search" placeholder="Search nodes, relations, or source paths" aria-label="Search graph" />
    ${controls}
    <label>Cluster <select id="graph-cluster"><option value="">All</option>${[...new Set(model.nodes.map(node => node.cluster))].sort().map(cluster => `<option value="${escapeXml(cluster)}">${escapeXml(cluster)}</option>`).join('')}</select></label>
    <label><input type="checkbox" id="neighbors-only" /> Selected node and neighbors</label>
    <label>Path target <select id="path-target">${model.nodes.map(node => `<option value="${escapeXml(node.id)}">${escapeXml(node.label)}</option>`).join('')}</select></label>
    <button id="highlight-path" type="button">Highlight directed path</button>
    <span id="path-status" aria-live="polite"></span>
    <button id="reset-filters" type="button">Reset</button>
    <span id="visible-count" aria-live="polite"></span>
  </div>
  <section class="evidence-status" aria-label="Evidence status">
    <strong>${pack.snapshot.overlayDigest ? 'DRAFT overlay' : pack.evidenceState?.stale ? 'HISTORICAL evidence' : pack.evidenceState ? 'Saved evidence at current commit' : 'Saved evidence — current checkout not assessed'}</strong>
    <p>Configuration: ${escapeXml(pack.snapshot.configurationDigest ?? 'unknown')}; ${pack.evidenceState ? (pack.evidenceState.configurationMatches ? 'matches current configuration' : 'configuration mismatch') : 'configuration match unknown'}.
    Scope: ${escapeXml(pack.snapshot.scope?.join(', ') ?? 'unknown')}.
    Excluded working paths: ${pack.evidenceState?.excludedWorkingChanges.length ?? 'unknown'}. This view does not validate the current diff.</p>
    <p>${pack.exploration ? `${pack.exploration.returned}/${pack.exploration.reachableFacts} reachable facts on this page; max depth ${pack.exploration.maxDepth}; ${pack.exploration.truncated ? 'TRUNCATED' : 'not truncated within this scope'}${pack.exploration.depthLimitReached ? '; depth limit reached — rerun with greater --max-depth' : ''}` : 'Query completeness metadata unavailable.'}</p>
    ${pack.exploration?.continuation ? `<details><summary>Continue agent/CLI query with this token</summary><code>${escapeXml(pack.exploration.continuation)}</code></details>` : ''}
    ${pack.evidenceState?.excludedWorkingChanges.length ? `<details><summary>Excluded working changes</summary>${detailList(pack.evidenceState.excludedWorkingChanges, '')}</details>` : ''}
  </section>
  <main>
    <section class="panel canvas" aria-label="Context graph">${svg}</section>
    <aside>
      <section class="panel"><h2>Node and source evidence</h2><div id="node-detail">Select a node to inspect its cited relationships.</div></section>
      <section class="panel"><h2>Runtime references</h2>${detailList(pack.runtimeEvidence.map(reference => `${reference.serviceName}: ${reference.operation ?? 'observation'} · ${reference.sourcePath} · ${reference.observedAt ?? 'time unknown'}`), 'None in this page.')}<p>Edges are only the facts returned by the agent query. References do not create extra relationships.</p></section>
      <section class="panel">
        <h2>Coverage</h2>
        ${Object.entries(pack.coverage.counts)
          .map(([lane, count]) => `<span class="metric">${escapeXml(lane)}: ${count}</span>`)
          .join('')}
        ${detailList(pack.coverage.gaps, 'No Context Pack lane gaps detected.')}
      </section>
      <section class="panel">
        <h2>Governing invariants</h2>
        ${detailList(
          pack.invariants.map((item) => `${item.status}: ${item.message}`),
          'No governing invariants matched this view.',
        )}
      </section>
      <section class="panel">
        <h2>Scoped diagnostics</h2>
        ${detailList(diagnosticSummary(pack), 'None recorded.')}
      </section>
      <section class="panel">
        <h2>Suggested files</h2>
        ${detailList(pack.suggestedFiles, 'No files suggested.')}
      </section>
    </aside>
    <details class="panel relationships">
      <summary><strong>Relationships (${model.edges.length})</strong></summary>
      <table>
        <thead><tr><th>Authority</th><th>From</th><th>Relationship</th><th>To</th><th>Source</th></tr></thead>
        <tbody>${relationships}</tbody>
      </table>
    </details>
    <details class="panel relationships">
      <summary><strong>Rendered Context Pack</strong></summary>
      <pre>${escapeXml(pack.markdown)}</pre>
    </details>
  </main>
  <script id="context-pack" type="application/json">${jsonForHtml(pack)}</script>
  <script id="visual-model" type="application/json">${jsonForHtml(model)}</script>
  <script>${viewerScript()}</script>
</body>
</html>
`;
}

export function resolveVisualizationFormat(
  outputPath: string,
  format?: string,
): ContextGraphVisualizationFormat {
  const candidate = format?.toLowerCase() ?? extname(outputPath).slice(1).toLowerCase();
  if (candidate === 'dot' || candidate === 'html' || candidate === 'svg') return candidate;
  throw new Error('Visualization format must be html, dot, or svg (or use a matching extension)');
}

export function renderContextPackVisualization(
  pack: ContextPack,
  format: ContextGraphVisualizationFormat,
  sourceUrlTemplate?: string,
): string {
  if (format === 'dot') return renderContextPackDot(pack);
  if (format === 'svg') return renderContextPackSvg(pack);
  return renderContextPackHtml(pack, sourceUrlTemplate);
}

export async function writeContextPackVisualization(
  pack: ContextPack,
  options: VisualizationWriteOptions,
): Promise<VisualizationWriteResult> {
  if (!options.outputPath.trim()) throw new Error('Visualization output path must not be empty');
  const format = resolveVisualizationFormat(options.outputPath, options.format);
  const outputPath = resolve(options.outputPath);
  await mkdir(dirname(outputPath), { recursive: true });
  try {
    await writeFile(outputPath, renderContextPackVisualization(pack, format, options.sourceUrlTemplate), {
      encoding: 'utf8',
      flag: options.force ? 'w' : 'wx',
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') {
      throw new Error(
        `Visualization output already exists: ${outputPath}; pass --force to replace it`,
      );
    }
    throw error;
  }
  return {
    outputPath,
    format,
    snapshotId: pack.snapshot.snapshotId,
    commitSha: pack.snapshot.commitSha,
    factCount: pack.facts.length,
    runtimeEvidenceCount: pack.runtimeEvidence.length,
  };
}

export async function visualizeContextPack(
  queryService: ImpactQueryService,
  request: ImpactScanRequest,
  options: VisualizationWriteOptions,
): Promise<VisualizationWriteResult> {
  return writeContextPackVisualization(await queryService.scan(request), options);
}
