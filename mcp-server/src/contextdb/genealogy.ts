import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import type { Checkpoint, ContextEvent, SessionMeta } from './core.js';

export type MemoryGenealogyNodeType =
  | 'project'
  | 'workspace-memory'
  | 'session'
  | 'checkpoint'
  | 'event'
  | 'continuity'
  | 'handoff'
  | 'ref';

export type MemoryGenealogyEdgeType =
  | 'contains'
  | 'summarizes'
  | 'inherits'
  | 'references'
  | 'relates'
  | 'risk';

export type MemoryGenealogyRisk = 'none' | 'stale' | 'blocked' | 'failed' | 'missing-evidence';

export interface MemoryGenealogyNode {
  id: string;
  type: MemoryGenealogyNodeType;
  label: string;
  summary: string;
  sessionId?: string;
  project?: string;
  agent?: string;
  status?: string;
  sourcePath?: string;
  ts?: string;
  trust: number;
  risk: MemoryGenealogyRisk;
  refs: string[];
  hiddenRaw?: boolean;
  metadata?: Record<string, unknown>;
}

export interface MemoryGenealogyEdge {
  source: string;
  target: string;
  type: MemoryGenealogyEdgeType;
  strength: number;
  label?: string;
}

export interface MemoryGenealogyGraph {
  schemaVersion: 1;
  generatedAt: string;
  project: string;
  root: string;
  limits: {
    requestedLimit: number;
    includeEvents: boolean;
    eventsPerSession: number;
  };
  summary: {
    nodes: number;
    edges: number;
    sessions: number;
    checkpoints: number;
    events: number;
    refs: number;
    hiddenEvents: number;
    risks: Record<MemoryGenealogyRisk, number>;
  };
  nodes: MemoryGenealogyNode[];
  edges: MemoryGenealogyEdge[];
  warnings: string[];
}

export interface BuildMemoryGenealogyInput {
  workspaceRoot: string;
  project?: string;
  sessionId?: string;
  limit?: number;
  includeEvents?: boolean;
  eventsPerSession?: number;
}

interface SessionRecord {
  dir: string;
  meta: SessionMeta;
}

type SessionCheckpoint = Checkpoint;
type SessionEvent = ContextEvent;

const DB_RELATIVE_PATH = path.join('memory', 'context-db');
const RISK_VALUES: MemoryGenealogyRisk[] = ['none', 'stale', 'blocked', 'failed', 'missing-evidence'];

function normalizeLimit(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(500, Math.max(1, Math.floor(parsed)));
}

function redactSensitive(value: string): string {
  return String(value || '')
    .replace(/\b((?:api[_-]?key|token|secret|password|authorization))\s*[:=]\s*["']?[^"'\s]+/gi, '$1=[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/g, 'Bearer [redacted]');
}

function clip(value: unknown, maxLength: number): string {
  const text = redactSensitive(String(value ?? '').replace(/\s+/g, ' ').trim());
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength)).trimEnd()}…`;
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of values) {
    const text = String(item ?? '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output;
}

function normalizeSeq(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function hashId(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 10);
}

function sanitizeIdPart(value: string): string {
  return String(value || 'ref')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'ref';
}

function toRelative(workspaceRoot: string, filePath: string): string {
  const relative = path.relative(workspaceRoot, filePath);
  return relative && !relative.startsWith('..') ? relative.replace(/\\/g, '/') : filePath.replace(/\\/g, '/');
}

async function readJsonMaybe<T>(filePath: string, warnings: string[]): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      warnings.push(`Could not read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return null;
  }
}

async function readJsonLines<T>(filePath: string, warnings: string[]): Promise<T[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const rows: T[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        rows.push(JSON.parse(trimmed) as T);
      } catch {
        warnings.push(`Skipped malformed JSONL row in ${filePath}`);
      }
    }
    return rows;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      warnings.push(`Could not read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return [];
  }
}

async function readSessionMetas(sessionsRoot: string, warnings: string[]): Promise<SessionRecord[]> {
  const entries = await fs.readdir(sessionsRoot, { withFileTypes: true }).catch(() => []);
  const records: SessionRecord[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(sessionsRoot, entry.name);
    const meta = await readJsonMaybe<SessionMeta>(path.join(dir, 'meta.json'), warnings);
    if (!meta?.sessionId) continue;
    records.push({ dir, meta });
  }
  return records;
}

function addNode(nodes: Map<string, MemoryGenealogyNode>, node: MemoryGenealogyNode): void {
  if (nodes.has(node.id)) return;
  nodes.set(node.id, {
    ...node,
    label: clip(node.label, 80),
    summary: clip(node.summary, 260),
    refs: normalizeStringArray(node.refs).slice(0, 12),
    trust: Number.isFinite(node.trust) ? Math.max(0, Math.min(1, Number(node.trust))) : 0.5,
  });
}

function addEdge(
  edges: MemoryGenealogyEdge[],
  source: string,
  target: string,
  type: MemoryGenealogyEdgeType,
  strength: number,
  label?: string
): void {
  if (!source || !target || source === target) return;
  if (edges.some((edge) => edge.source === source && edge.target === target && edge.type === type)) return;
  edges.push({
    source,
    target,
    type,
    strength: Number.isFinite(strength) ? Math.max(0, Math.min(1, Number(strength))) : 0.5,
    ...(label ? { label } : {}),
  });
}

function trustFromStatus(status = ''): number {
  if (status === 'done') return 0.9;
  if (status === 'blocked') return 0.35;
  return 0.65;
}

function riskFromStatus(status = ''): MemoryGenealogyRisk {
  if (status === 'blocked') return 'blocked';
  return 'none';
}

function trustFromCheckpoint(checkpoint: SessionCheckpoint): number {
  const result = checkpoint.telemetry?.verification?.result;
  if (result === 'passed') return 0.95;
  if (result === 'failed') return 0.25;
  if (result === 'partial') return 0.65;
  if (checkpoint.telemetry?.failureCategory) return 0.35;
  return trustFromStatus(checkpoint.status);
}

function riskFromCheckpoint(checkpoint: SessionCheckpoint): MemoryGenealogyRisk {
  if (checkpoint.telemetry?.verification?.result === 'failed') return 'failed';
  if (checkpoint.telemetry?.failureCategory) return 'failed';
  return riskFromStatus(checkpoint.status);
}

function addRefNodes({
  workspaceRoot,
  nodes,
  edges,
  sourceNodeId,
  refs,
}: {
  workspaceRoot: string;
  nodes: Map<string, MemoryGenealogyNode>;
  edges: MemoryGenealogyEdge[];
  sourceNodeId: string;
  refs: string[];
}): void {
  for (const ref of normalizeStringArray(refs).slice(0, 8)) {
    const basename = path.basename(ref) || ref;
    const id = `ref:${sanitizeIdPart(basename)}:${hashId(ref)}`;
    addNode(nodes, {
      id,
      type: 'ref',
      label: basename,
      summary: ref,
      sourcePath: ref,
      trust: 0.7,
      risk: 'none',
      refs: [ref],
      metadata: { exists: existsSync(path.resolve(workspaceRoot, ref)) },
    });
    addEdge(edges, sourceNodeId, id, 'references', 0.72, 'ref');
  }
}

async function addWorkspaceMemoryNode({
  workspaceRoot,
  dbRoot,
  project,
  root,
  nodes,
  edges,
  warnings,
}: {
  workspaceRoot: string;
  dbRoot: string;
  project: string;
  root: string;
  nodes: Map<string, MemoryGenealogyNode>;
  edges: MemoryGenealogyEdge[];
  warnings: string[];
}): Promise<void> {
  const workspaceMemoryPath = path.join(dbRoot, '.workspace-memory.json');
  const pinnedPath = path.join(dbRoot, 'sessions', 'workspace-memory--default', 'pinned.md');
  if (!existsSync(workspaceMemoryPath) && !existsSync(pinnedPath)) return;

  const pinned = existsSync(pinnedPath)
    ? clip(await fs.readFile(pinnedPath, 'utf8').catch(() => ''), 220)
    : '';
  const workspaceMemory = await readJsonMaybe<Record<string, unknown>>(workspaceMemoryPath, warnings);
  const id = 'workspace-memory:default';
  addNode(nodes, {
    id,
    type: 'workspace-memory',
    label: 'Workspace memory',
    summary: pinned || 'Durable workspace memory and pinned facts.',
    project,
    sourcePath: existsSync(pinnedPath)
      ? toRelative(workspaceRoot, pinnedPath)
      : toRelative(workspaceRoot, workspaceMemoryPath),
    trust: 0.85,
    risk: 'none',
    refs: [],
    metadata: workspaceMemory ?? {},
  });
  addEdge(edges, root, id, 'contains', 0.86, 'workspace-memory');
}

async function addContinuityAndHandoffNodes({
  workspaceRoot,
  sessionDir,
  meta,
  sessionNodeId,
  nodes,
  edges,
  warnings,
}: {
  workspaceRoot: string;
  sessionDir: string;
  meta: SessionMeta;
  sessionNodeId: string;
  nodes: Map<string, MemoryGenealogyNode>;
  edges: MemoryGenealogyEdge[];
  warnings: string[];
}): Promise<void> {
  const continuityPath = path.join(sessionDir, 'continuity.json');
  const continuity = await readJsonMaybe<Record<string, unknown>>(continuityPath, warnings);
  if (continuity) {
    const refs = normalizeStringArray([
      ...normalizeStringArray(continuity.touchedFiles),
      ...normalizeStringArray(continuity.nextActions),
    ]);
    const id = `continuity:${meta.sessionId}`;
    addNode(nodes, {
      id,
      type: 'continuity',
      label: 'Continuity summary',
      summary: String(continuity.summary || continuity.intent || 'Continuity state for session handoff.'),
      sessionId: meta.sessionId,
      project: meta.project,
      agent: meta.agent,
      sourcePath: toRelative(workspaceRoot, continuityPath),
      ts: String(continuity.updatedAt || meta.updatedAt || ''),
      trust: 0.78,
      risk: 'none',
      refs,
      metadata: continuity,
    });
    addEdge(edges, sessionNodeId, id, 'contains', 0.78, 'continuity');
    addEdge(edges, id, sessionNodeId, 'inherits', 0.68, 'continuity');
    addRefNodes({ workspaceRoot, nodes, edges, sourceNodeId: id, refs });
  }

  const handoffPath = path.join(sessionDir, 'handoff.json');
  const handoff = await readJsonMaybe<Record<string, unknown>>(handoffPath, warnings);
  if (handoff) {
    const refs = normalizeStringArray([
      ...normalizeStringArray(handoff.touchedFiles),
      ...normalizeStringArray(handoff.nextActions),
      ...normalizeStringArray(handoff.blockers),
    ]);
    const id = `handoff:${meta.sessionId}`;
    addNode(nodes, {
      id,
      type: 'handoff',
      label: 'Handoff',
      summary: String(handoff.progress || handoff.intent || 'Explicit handoff packet.'),
      sessionId: meta.sessionId,
      project: meta.project,
      agent: meta.agent,
      sourcePath: toRelative(workspaceRoot, handoffPath),
      trust: 0.74,
      risk: refs.length > 0 ? 'none' : 'missing-evidence',
      refs,
      metadata: handoff,
    });
    addEdge(edges, sessionNodeId, id, 'contains', 0.72, 'handoff');
    addEdge(edges, id, sessionNodeId, 'inherits', 0.7, 'handoff');
    addRefNodes({ workspaceRoot, nodes, edges, sourceNodeId: id, refs });
  }
}

function summarizeGraph(
  nodes: MemoryGenealogyNode[],
  edges: MemoryGenealogyEdge[],
  hiddenEvents: number,
  emittedEvents: number
): MemoryGenealogyGraph['summary'] {
  const risks = Object.fromEntries(RISK_VALUES.map((risk) => [risk, 0])) as Record<MemoryGenealogyRisk, number>;
  for (const node of nodes) {
    risks[node.risk] = (risks[node.risk] ?? 0) + 1;
  }
  return {
    nodes: nodes.length,
    edges: edges.length,
    sessions: nodes.filter((node) => node.type === 'session').length,
    checkpoints: nodes.filter((node) => node.type === 'checkpoint').length,
    events: emittedEvents,
    refs: nodes.filter((node) => node.type === 'ref').length,
    hiddenEvents,
    risks,
  };
}

export async function buildMemoryGenealogyGraph(input: BuildMemoryGenealogyInput): Promise<MemoryGenealogyGraph> {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const requestedLimit = normalizeLimit(input.limit, 40);
  const includeEvents = input.includeEvents === true;
  const eventsPerSession = normalizeLimit(input.eventsPerSession, 20);
  const dbRoot = path.join(workspaceRoot, DB_RELATIVE_PATH);
  const sessionsRoot = path.join(dbRoot, 'sessions');
  const generatedAt = new Date().toISOString();
  const project = input.project || 'workspace';
  const root = `project:${project}`;
  const nodes = new Map<string, MemoryGenealogyNode>();
  const edges: MemoryGenealogyEdge[] = [];
  const warnings: string[] = [];

  addNode(nodes, {
    id: root,
    type: 'project',
    label: project,
    summary: `ContextDB memory genealogy for ${project}`,
    project,
    sourcePath: DB_RELATIVE_PATH.replace(/\\/g, '/'),
    trust: 1,
    risk: 'none',
    refs: [],
  });

  await addWorkspaceMemoryNode({ workspaceRoot, dbRoot, project, root, nodes, edges, warnings });

  const metas = await readSessionMetas(sessionsRoot, warnings);
  const filtered = metas
    .filter((item) => !input.project || item.meta.project === input.project)
    .filter((item) => !input.sessionId || item.meta.sessionId === input.sessionId)
    .sort((left, right) => String(right.meta.updatedAt || '').localeCompare(String(left.meta.updatedAt || '')))
    .slice(0, requestedLimit);

  let hiddenEvents = 0;
  let emittedEvents = 0;
  for (const item of filtered) {
    const sessionNodeId = `session:${item.meta.sessionId}`;
    const sessionRisk = riskFromStatus(item.meta.status);
    addNode(nodes, {
      id: sessionNodeId,
      type: 'session',
      label: `${item.meta.agent} · ${clip(item.meta.goal, 48)}`,
      summary: item.meta.goal,
      sessionId: item.meta.sessionId,
      project: item.meta.project,
      agent: item.meta.agent,
      status: item.meta.status,
      sourcePath: toRelative(workspaceRoot, path.join(item.dir, 'meta.json')),
      ts: item.meta.updatedAt || item.meta.createdAt,
      trust: trustFromStatus(item.meta.status),
      risk: sessionRisk,
      refs: [],
      metadata: { tags: item.meta.tags || [] },
    });
    addEdge(edges, root, sessionNodeId, 'contains', 1, 'session');
    if (sessionRisk !== 'none') addEdge(edges, sessionNodeId, root, 'risk', 0.7, sessionRisk);

    const checkpoints = await readJsonLines<SessionCheckpoint>(path.join(item.dir, 'l1-checkpoints.jsonl'), warnings);
    const events = await readJsonLines<SessionEvent>(path.join(item.dir, 'l2-events.jsonl'), warnings);
    hiddenEvents += includeEvents ? Math.max(0, events.length - eventsPerSession) : events.length;

    for (let index = 0; index < checkpoints.slice(-10).length; index += 1) {
      const checkpoint = checkpoints.slice(-10)[index];
      const seq = normalizeSeq(checkpoint.seq, Math.max(1, checkpoints.length - checkpoints.slice(-10).length + index + 1));
      const checkpointNodeId = `checkpoint:${item.meta.sessionId}#C${seq}`;
      const refs = normalizeStringArray([...(checkpoint.artifacts || []), ...(checkpoint.nextActions || [])]);
      const checkpointRisk = riskFromCheckpoint(checkpoint);
      addNode(nodes, {
        id: checkpointNodeId,
        type: 'checkpoint',
        label: `C${seq} · ${checkpoint.status || item.meta.status}`,
        summary: checkpoint.summary || 'No checkpoint summary recorded.',
        sessionId: item.meta.sessionId,
        project: item.meta.project,
        agent: item.meta.agent,
        status: checkpoint.status,
        sourcePath: toRelative(workspaceRoot, path.join(item.dir, 'l1-checkpoints.jsonl')),
        ts: checkpoint.ts,
        trust: trustFromCheckpoint(checkpoint),
        risk: checkpointRisk,
        refs,
        metadata: { nextActions: checkpoint.nextActions || [], telemetry: checkpoint.telemetry || {} },
      });
      addEdge(edges, sessionNodeId, checkpointNodeId, 'contains', 0.92, 'checkpoint');
      addEdge(edges, checkpointNodeId, sessionNodeId, 'summarizes', 0.62, 'latest-state');
      addRefNodes({ workspaceRoot, nodes, edges, sourceNodeId: checkpointNodeId, refs });
      if (checkpointRisk !== 'none') addEdge(edges, checkpointNodeId, sessionNodeId, 'risk', 0.75, checkpointRisk);
    }

    if (includeEvents) {
      const visibleEvents = events.slice(-eventsPerSession);
      for (let index = 0; index < visibleEvents.length; index += 1) {
        const event = visibleEvents[index];
        const seq = normalizeSeq(event.seq, Math.max(1, events.length - visibleEvents.length + index + 1));
        const eventNodeId = `event:${item.meta.sessionId}#${seq}`;
        const refs = normalizeStringArray(event.refs || []);
        addNode(nodes, {
          id: eventNodeId,
          type: 'event',
          label: `${event.role || 'event'}/${event.kind || 'message'} #${seq}`,
          summary: clip(event.text || '', 180),
          sessionId: item.meta.sessionId,
          project: item.meta.project,
          agent: item.meta.agent,
          sourcePath: toRelative(workspaceRoot, path.join(item.dir, 'l2-events.jsonl')),
          ts: event.ts,
          trust: 0.6,
          risk: refs.length > 0 ? 'none' : 'missing-evidence',
          refs,
          hiddenRaw: true,
          metadata: { role: event.role, kind: event.kind, turn: event.turn || null },
        });
        addEdge(edges, sessionNodeId, eventNodeId, 'contains', 0.55, 'event');
        const latestCheckpoint = checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;
        if (latestCheckpoint) {
          const latestSeq = normalizeSeq(latestCheckpoint.seq, checkpoints.length);
          addEdge(edges, `checkpoint:${item.meta.sessionId}#C${latestSeq}`, eventNodeId, 'summarizes', 0.45, 'event-window');
        }
        addRefNodes({ workspaceRoot, nodes, edges, sourceNodeId: eventNodeId, refs });
        emittedEvents += 1;
      }
    }

    await addContinuityAndHandoffNodes({ workspaceRoot, sessionDir: item.dir, meta: item.meta, sessionNodeId, nodes, edges, warnings });
  }

  const nodeCap = requestedLimit * (includeEvents ? Math.max(32, eventsPerSession + 18) : 32);
  const cappedNodes = Array.from(nodes.values()).slice(0, Math.max(1, nodeCap));
  const nodeIds = new Set(cappedNodes.map((node) => node.id));
  const cappedEdges = edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .slice(0, Math.max(1, nodeCap * 2));
  const summary = summarizeGraph(cappedNodes, cappedEdges, hiddenEvents, emittedEvents);

  return {
    schemaVersion: 1,
    generatedAt,
    project,
    root,
    limits: { requestedLimit, includeEvents, eventsPerSession },
    summary,
    nodes: cappedNodes,
    edges: cappedEdges,
    warnings,
  };
}
