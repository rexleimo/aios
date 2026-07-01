import fsSync from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { canvasJsonPath, canvasMmdPath, canvasJsonlPath } from './refs-store.mjs';
import { writeFileAtomic } from '../fs/atomic-write.mjs';

const CANVAS_VERSION = 1;
const CANVAS_RECALL_MAX_CHARS = 12_000;

// ── load / create ──

export async function loadCanvas(workspaceRoot, sessionId, storage) {
  const jsonPath = canvasJsonPath(workspaceRoot, sessionId, storage);
  if (!fsSync.existsSync(jsonPath)) return emptyCanvas(sessionId);
  try {
    const data = JSON.parse(await readFile(jsonPath, 'utf8'));
    return data;
  } catch {
    return emptyCanvas(sessionId);
  }
}

function emptyCanvas(sessionId) {
  return {
    version: CANVAS_VERSION,
    session: sessionId,
    started: new Date().toISOString(),
    updated: new Date().toISOString(),
    nodes: [],
    edges: [],
  };
}

// ── add node ──

export async function addNode(workspaceRoot, sessionId, node, storage) {
  const canvas = await loadCanvas(workspaceRoot, sessionId, storage);

  const existing = canvas.nodes.find(n => n.id === node.id);
  if (existing) {
    Object.assign(existing, node, { id: node.id });
  } else {
    canvas.nodes.push(node);
    if (canvas.nodes.length >= 2) {
      const prev = canvas.nodes[canvas.nodes.length - 2];
      const edgeExists = canvas.edges.some(e => e.from === prev.id && e.to === node.id);
      if (!edgeExists) {
        canvas.edges.push({ from: prev.id, to: node.id, kind: 'next' });
      }
    }
  }

  canvas.updated = new Date().toISOString();
  await saveCanvas(workspaceRoot, sessionId, canvas, storage);
  return canvas;
}

// ── save ──

async function saveCanvas(workspaceRoot, sessionId, canvas, storage) {
  const jsonPath = canvasJsonPath(workspaceRoot, sessionId, storage);
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFileAtomic(jsonPath, JSON.stringify(canvas, null, 2), 'utf8');

  const mmd = canvasToMermaid(canvas);
  const mmdPath = canvasMmdPath(workspaceRoot, sessionId, storage);
  await writeFileAtomic(mmdPath, mmd, 'utf8');
}

// ── Mermaid generation ──

export function canvasToMermaid(canvas) {
  const lines = ['graph LR'];

  const statusStyles = new Map();

  for (const node of canvas.nodes) {
    const safeId = mermaidNodeId(node.id);
    const label = mermaidLabel(node);
    const cls = `s_${safeId}`;
    lines.push(`    ${safeId}["${label}"]`);
    if (node.status === 'ok') statusStyles.set(cls, 'fill:#dcfce7,stroke:#16a34a');
    else if (node.status === 'fail') statusStyles.set(cls, 'fill:#fecaca,stroke:#dc2626');
    else statusStyles.set(cls, 'fill:#f1f5f9,stroke:#94a3b8');
    lines.push(`    class ${safeId} ${cls}`);
  }

  for (const edge of canvas.edges) {
    const kind = edge.kind === 'next' ? '-->' : `-. "${edge.kind}" .->`;
    lines.push(`    ${mermaidNodeId(edge.from)} ${kind} ${mermaidNodeId(edge.to)}`);
  }

  if (statusStyles.size > 0) {
    lines.push('');
    for (const [cls, style] of statusStyles) {
      lines.push(`    classDef ${cls} ${style}`);
    }
  }

  return lines.join('\n') + '\n';
}

function mermaidNodeId(id) {
  const safe = String(id || 'node').replace(/[^a-zA-Z0-9_]/g, '_');
  return `m_${safe || 'node'}`;
}

function mermaidLabel(node) {
  const tool = node.tool || '?';
  const lbl = node.label || '';
  const maxLen = 28;
  const truncated = lbl.length > maxLen ? `${lbl.slice(0, maxLen - 3)}...` : lbl;
  return escapeMermaidLabel(`${node.id} ${tool}: ${truncated}`);
}

function escapeMermaidLabel(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ');
}

// ── append to jsonl (split storage) ──

export async function appendNodeJsonl(workspaceRoot, sessionId, node) {
  const jsonlPath = canvasJsonlPath(workspaceRoot, sessionId);
  await mkdir(path.dirname(jsonlPath), { recursive: true });
  const line = JSON.stringify(node) + '\n';
  const { appendFile } = await import('node:fs/promises');
  await appendFile(jsonlPath, line, 'utf8');
}

// ── regenerate canvas from jsonl ──

export async function regenerateFromJsonl(workspaceRoot, sessionId) {
  const jsonlPath = canvasJsonlPath(workspaceRoot, sessionId);
  if (!fsSync.existsSync(jsonlPath)) return null;

  const content = await readFile(jsonlPath, 'utf8');
  const nodes = content.trim().split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  const canvas = emptyCanvas(sessionId);
  canvas.nodes = nodes;
  canvas.edges = [];
  for (let i = 1; i < nodes.length; i++) {
    canvas.edges.push({ from: nodes[i - 1].id, to: nodes[i].id, kind: 'next' });
  }
  if (nodes.length > 0) {
    canvas.started = nodes[0].ts || canvas.started;
    canvas.updated = nodes[nodes.length - 1].ts || canvas.updated;
  }

  await saveCanvas(workspaceRoot, sessionId, canvas, 'split');
  return canvas;
}

// ── canvas path helper ──

export function getCanvasPaths(workspaceRoot, sessionId, storage) {
  return {
    json: canvasJsonPath(workspaceRoot, sessionId, storage),
    mmd: canvasMmdPath(workspaceRoot, sessionId, storage),
    jsonl: storage === 'split' ? canvasJsonlPath(workspaceRoot, sessionId) : null,
  };
}

export async function findCanvasMermaid(workspaceRoot, sessionId, preferredStorage = '') {
  const storages = [];
  if (preferredStorage === 'file' || preferredStorage === 'split') {
    storages.push(preferredStorage);
    storages.push(preferredStorage === 'file' ? 'split' : 'file');
  } else {
    storages.push('file', 'split');
  }

  let selected = null;
  for (const storage of storages) {
    const filePath = canvasMmdPath(workspaceRoot, sessionId, storage);
    try {
      const st = fsSync.statSync(filePath);
      if (!st.isFile()) continue;
      if (!selected || st.mtimeMs > selected.mtimeMs) {
        selected = { filePath, storage, mtimeMs: st.mtimeMs };
      }
    } catch {
      // Sessions without offloaded output do not have a canvas yet.
    }
  }

  if (!selected) return null;

  const raw = await readFile(selected.filePath, 'utf8');
  const truncated = raw.length > CANVAS_RECALL_MAX_CHARS;
  const mermaid = truncated
    ? `${raw.slice(0, CANVAS_RECALL_MAX_CHARS).trimEnd()}\n%% [truncated: canvas exceeds ${CANVAS_RECALL_MAX_CHARS} chars]\n`
    : raw;
  const root = path.resolve(workspaceRoot || process.cwd());
  const relativePath = path.relative(root, selected.filePath).replace(/\\/g, '/');

  return {
    path: selected.filePath,
    relativePath,
    storage: selected.storage,
    mermaid,
    truncated,
  };
}

// ── auto-compaction ──

const COMPACT_MILD_NODES = 20;
const COMPACT_AGGRESSIVE_NODES = 50;
const COMPACT_EMERGENCY_NODES = 100;
const COMPACT_KEEP_RECENT = 10;
const COMPACT_EMERGENCY_KEEP_RECENT = 5;

export function computeCompactAction(nodeCount) {
  if (nodeCount >= COMPACT_EMERGENCY_NODES) return 'emergency';
  if (nodeCount >= COMPACT_AGGRESSIVE_NODES) return 'aggressive';
  if (nodeCount >= COMPACT_MILD_NODES) return 'mild';
  return 'none';
}

export async function compactCanvas(workspaceRoot, sessionId, storage, { maxRecent = COMPACT_KEEP_RECENT } = {}) {
  const canvas = await loadCanvas(workspaceRoot, sessionId, storage);
  const action = computeCompactAction(canvas.nodes.length);
  if (action === 'none') return { action: 'none', canvas };

  // emergency 压缩比 aggressive 更激进：只保留最近 5 个节点（而非 10 个），
  // 且把被压缩的节点摘要合并为一个 summary node，防止 context overflow 时 canvas 自身过大。
  const keepRecent = action === 'emergency' ? COMPACT_EMERGENCY_KEEP_RECENT : maxRecent;
  const stale = canvas.nodes.length - keepRecent;
  const oldNodes = canvas.nodes.slice(0, stale);
  const recentNodes = canvas.nodes.slice(stale);

  const summaryNode = {
    id: `compact-${oldNodes[0]?.id || 'start'}-to-${oldNodes[oldNodes.length - 1]?.id || 'end'}`,
    tool: action === 'emergency' ? 'offload:compact-emergency' : 'offload:compact',
    label: `[${action} compacted ${oldNodes.length} earlier steps]`,
    status: 'ok',
    ts: new Date().toISOString(),
    ref: '',
  };

  const compacted = {
    version: canvas.version,
    session: canvas.session,
    started: canvas.started,
    updated: new Date().toISOString(),
    nodes: [summaryNode, ...recentNodes],
    edges: [{ from: summaryNode.id, to: recentNodes[0]?.id || summaryNode.id, kind: 'next' }],
  };

  for (let i = 1; i < recentNodes.length; i++) {
    compacted.edges.push({ from: recentNodes[i - 1].id, to: recentNodes[i].id, kind: 'next' });
  }

  await saveCanvas(workspaceRoot, sessionId, compacted, storage);
  return { action, canvas: compacted, removedCount: oldNodes.length };
}
