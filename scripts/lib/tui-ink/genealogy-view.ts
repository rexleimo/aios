import type {
  MemoryGenealogyGraph,
  MemoryGenealogyNode,
  MemoryGenealogyRisk,
} from '../../../mcp-server/src/contextdb/genealogy.ts';

export interface GenealogyRow {
  id: string;
  nodeId: string;
  depth: number;
  label: string;
  detail: string;
  node: MemoryGenealogyNode;
}

const RISK_ORDER: MemoryGenealogyRisk[] = ['none', 'failed', 'blocked', 'missing-evidence', 'stale'];
const PRIMARY_EDGE_TYPES = new Set(['contains', 'summarizes', 'references']);
const MAX_ROWS = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeNodes(nodes: unknown): MemoryGenealogyNode[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.filter((node): node is MemoryGenealogyNode => {
    return isRecord(node) && typeof node.id === 'string' && node.id.trim().length > 0;
  });
}

function normalizeEdges(edges: unknown) {
  if (!Array.isArray(edges)) return [];
  return edges.filter((edge): edge is { source: string; target: string; type: string } => {
    return (
      isRecord(edge) &&
      typeof edge.source === 'string' &&
      typeof edge.target === 'string' &&
      typeof edge.type === 'string' &&
      PRIMARY_EDGE_TYPES.has(edge.type)
    );
  });
}

function clip(value: unknown, maxLength: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength)).trimEnd()}...`;
}

function nodeRank(node: MemoryGenealogyNode): number {
  const ranks: Record<string, number> = {
    project: 0,
    'workspace-memory': 1,
    session: 2,
    checkpoint: 3,
    continuity: 4,
    handoff: 5,
    event: 6,
    ref: 7,
  };
  return ranks[node.type] ?? 99;
}

function sortNodes(a: MemoryGenealogyNode, b: MemoryGenealogyNode): number {
  const rankDelta = nodeRank(a) - nodeRank(b);
  if (rankDelta !== 0) return rankDelta;
  return String(b.ts ?? '').localeCompare(String(a.ts ?? '')) || String(a.label ?? '').localeCompare(String(b.label ?? ''));
}

function formatTrust(value: unknown): string {
  const trust = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(trust)) return 'unknown';
  return `${Math.round(trust * 100)}%`;
}

function makeDetail(node: MemoryGenealogyNode): string {
  const parts: string[] = [String(node.type ?? 'unknown')];
  if (node.status) parts.push(node.status);
  if (node.agent) parts.push(node.agent);
  if (node.risk !== 'none') parts.push(`risk:${node.risk}`);
  parts.push(`trust:${formatTrust(node.trust)}`);
  if (node.ts) parts.push(node.ts.slice(0, 10));
  return parts.join(' | ');
}

function buildChildren(graph: MemoryGenealogyGraph): Map<string, MemoryGenealogyNode[]> {
  const nodes = normalizeNodes(graph.nodes);
  const edges = normalizeEdges(graph.edges);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, MemoryGenealogyNode[]>();

  for (const edge of edges) {
    const target = byId.get(edge.target);
    if (!target) continue;
    const current = children.get(edge.source) ?? [];
    if (!current.some((node) => node.id === target.id)) current.push(target);
    children.set(edge.source, current);
  }

  for (const [source, nodes] of children) {
    children.set(source, nodes.sort(sortNodes));
  }

  return children;
}

export function formatGenealogyRows(graph: MemoryGenealogyGraph): GenealogyRow[] {
  const nodes = normalizeNodes(graph.nodes);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = buildChildren(graph);
  const rows: GenealogyRow[] = [];
  const seen = new Set<string>();

  const visit = (node: MemoryGenealogyNode, depth: number) => {
    if (seen.has(node.id) || rows.length >= MAX_ROWS) return;
    seen.add(node.id);
    rows.push({
      id: `${rows.length}:${node.id}`,
      nodeId: node.id,
      depth,
      label: clip(node.label || node.id, 54),
      detail: makeDetail(node),
      node,
    });

    for (const child of children.get(node.id) ?? []) {
      visit(child, depth + 1);
    }
  };

  const root = byId.get(graph.root) ?? nodes.find((node) => node.type === 'project');
  if (root) visit(root, 0);

  for (const node of [...nodes].sort(sortNodes)) {
    if (!seen.has(node.id)) visit(node, 0);
  }

  return rows;
}

export function formatRiskSummary(risks: Partial<Record<MemoryGenealogyRisk, number>> | null | undefined): string {
  if (!isRecord(risks)) return 'none 0';
  const visible = RISK_ORDER
    .map((risk) => [risk, risks[risk] ?? 0] as const)
    .filter(([, count]) => count > 0);
  if (visible.length === 0) return 'none 0';
  return visible.map(([risk, count]) => `${risk} ${count}`).join(' | ');
}

export function formatNodeDetails(node: MemoryGenealogyNode): string[] {
  const refs = Array.isArray(node.refs) ? node.refs : [];
  const lines = [
    `Type: ${node.type}`,
    `ID: ${node.id}`,
    `Risk: ${node.risk}`,
    `Trust: ${formatTrust(node.trust)}`,
  ];

  if (node.status) lines.push(`Status: ${node.status}`);
  if (node.agent) lines.push(`Agent: ${node.agent}`);
  if (node.sessionId) lines.push(`Session: ${node.sessionId}`);
  if (node.project) lines.push(`Project: ${node.project}`);
  if (node.ts) lines.push(`Time: ${node.ts}`);
  if (node.sourcePath) lines.push(`Source: ${node.sourcePath}`);
  if (node.summary) lines.push(`Summary: ${clip(node.summary, 220)}`);
  if (refs.length > 0) lines.push(`Refs: ${refs.slice(0, 6).join(', ')}`);
  if (node.hiddenRaw) lines.push('Raw: hidden by default; press E to reload with redacted events.');

  return lines;
}
