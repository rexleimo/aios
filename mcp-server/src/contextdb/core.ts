import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  ensureSqliteSidecar,
  findLatestSessionRow,
  getSessionIndexedSeqs,
  getEventRowById,
  recreateSqliteSidecar,
  searchCheckpointRows,
  searchEventRows,
  timelineCheckpointRows,
  timelineEventRows,
  upsertCheckpointRow,
  upsertEventRow,
  upsertSessionRow,
} from './sqlite.js';
import { semanticRerank } from './semantic.js';
import { buildSearchExplain, type ContextDbSearchExplain } from './explain.js';
import { resolveAiosStateRoot, resolveContextDbRoot, toWorkspaceRelative } from './paths.js';

export type SessionStatus = 'running' | 'blocked' | 'done';
export type EventRole = 'system' | 'user' | 'assistant' | 'tool';
export type VerificationResult = 'unknown' | 'passed' | 'failed' | 'partial';
export type TurnType = 'main' | 'side' | 'system-maintenance' | 'verification';
export type TurnOutcome = 'success' | 'correction' | 'retry-needed' | 'ambiguous' | 'unknown';
export type HindsightStatus = 'pending' | 'evaluated' | 'na' | 'failed';
export type ContextPacketTokenStrategy = 'legacy' | 'balanced' | 'aggressive';

export interface EventTurnEnvelope {
  turnId?: string;
  parentTurnId?: string;
  turnType?: TurnType;
  environment?: string;
  workItemRefs?: string[];
  nextStateRefs?: string[];
  hindsightStatus?: HindsightStatus;
  outcome?: TurnOutcome;
}

export interface CheckpointVerification {
  result: VerificationResult;
  evidence?: string;
}

export interface CheckpointCost {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  usd?: number;
}

export interface CheckpointTelemetry {
  verification?: CheckpointVerification;
  retryCount?: number;
  failureCategory?: string;
  elapsedMs?: number;
  cost?: CheckpointCost;
}

export interface SessionMeta {
  schemaVersion: 1;
  sessionId: string;
  agent: string;
  project: string;
  goal: string;
  tags: string[];
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ContextEvent {
  seq?: number;
  ts: string;
  role: EventRole;
  kind: string;
  text: string;
  refs: string[];
  turn?: EventTurnEnvelope;
}

export interface Checkpoint {
  seq?: number;
  ts: string;
  status: SessionStatus;
  summary: string;
  nextActions: string[];
  artifacts: string[];
  telemetry?: CheckpointTelemetry;
}

export interface ContinuitySummary {
  schemaVersion: 1;
  sessionId: string;
  intent: string;
  summary: string;
  touchedFiles: string[];
  nextActions: string[];
  updatedAt: string;
}

interface SessionPaths {
  dir: string;
  meta: string;
  summary: string;
  checkpoints: string;
  events: string;
  state: string;
  continuitySummary: string;
  continuityJson: string;
}

const MANIFEST_NAME = 'manifest.json';
const INDEX_SESSIONS_NAME = 'sessions.jsonl';
const INDEX_EVENTS_NAME = 'events.jsonl';
const INDEX_CHECKPOINTS_NAME = 'checkpoints.jsonl';
const SQLITE_NAME = 'context.db';
const CHARS_PER_TOKEN_ESTIMATE = 4;
const EVENT_DEDUP_WINDOW_MS = 30_000;
const SESSION_LOCK_TIMEOUT_MS = 10_000;
const INDEX_INCREMENTAL_SYNC_INTERVAL_MS = 1500;
const lastIncrementalSyncByWorkspace = new Map<string, number>();

export interface IndexedEvent {
  eventId: string;
  sessionId: string;
  seq: number;
  ts: string;
  tsEpoch: number;
  project: string;
  agent: string;
  role: EventRole;
  kind: string;
  text: string;
  refs: string[];
  turn?: EventTurnEnvelope;
  textHash: string;
  signatureHash: string;
}

export interface IndexedCheckpoint {
  checkpointId: string;
  sessionId: string;
  seq: number;
  ts: string;
  tsEpoch: number;
  project: string;
  agent: string;
  status: SessionStatus;
  summary: string;
  nextActions: string[];
  artifacts: string[];
  telemetry?: CheckpointTelemetry;
}

export interface TimelineEntry {
  itemType: 'event' | 'checkpoint';
  ts: string;
  tsEpoch: number;
  project: string;
  sessionId: string;
  agent: string;
  label: string;
  details: string;
  refs: string[];
  id: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sessionTimestamp(): string {
  return nowIso().replace(/[-:.]/g, '').slice(0, 15);
}

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'session';
}

function toJsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toEpoch(ts: string): number {
  const epoch = Date.parse(ts);
  return Number.isFinite(epoch) ? epoch : 0;
}

function normalizeRefs(refs: unknown): string[] {
  const items = Array.isArray(refs)
    ? refs
    : typeof refs === 'string'
      ? [refs]
      : [];

  return Array.from(
    new Set(
      items
        .map((ref) => (typeof ref === 'string' ? ref.trim() : ''))
        .filter((ref) => ref.length > 0)
    )
  ).sort();
}

const TURN_TYPES = new Set<TurnType>(['main', 'side', 'system-maintenance', 'verification']);
const TURN_OUTCOMES = new Set<TurnOutcome>(['success', 'correction', 'retry-needed', 'ambiguous', 'unknown']);
const HINDSIGHT_STATUSES = new Set<HindsightStatus>(['pending', 'evaluated', 'na', 'failed']);

function normalizeTextList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0)
    )
  ).sort();
}

function normalizeTurnType(raw: unknown): TurnType | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim().toLowerCase();
  return TURN_TYPES.has(value as TurnType) ? (value as TurnType) : undefined;
}

function normalizeTurnOutcome(raw: unknown): TurnOutcome | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim().toLowerCase();
  return TURN_OUTCOMES.has(value as TurnOutcome) ? (value as TurnOutcome) : undefined;
}

function normalizeHindsightStatus(raw: unknown): HindsightStatus | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim().toLowerCase();
  return HINDSIGHT_STATUSES.has(value as HindsightStatus) ? (value as HindsightStatus) : undefined;
}

function normalizeTurnEnvelope(turn: unknown): EventTurnEnvelope | undefined {
  if (!turn || typeof turn !== 'object' || Array.isArray(turn)) {
    return undefined;
  }

  const raw = turn as Record<string, unknown>;
  const normalized: EventTurnEnvelope = {};
  const turnId = normalizeTextValue(raw.turnId);
  const parentTurnId = normalizeTextValue(raw.parentTurnId);
  const turnType = normalizeTurnType(raw.turnType);
  const environment = normalizeTextValue(raw.environment);
  const workItemRefs = normalizeTextList(raw.workItemRefs);
  const nextStateRefs = normalizeTextList(raw.nextStateRefs);
  const hindsightStatus = normalizeHindsightStatus(raw.hindsightStatus);
  const outcome = normalizeTurnOutcome(raw.outcome);

  if (turnId) normalized.turnId = turnId;
  if (parentTurnId) normalized.parentTurnId = parentTurnId;
  if (turnType) normalized.turnType = turnType;
  if (environment) normalized.environment = environment;
  if (workItemRefs.length > 0) normalized.workItemRefs = workItemRefs;
  if (nextStateRefs.length > 0) normalized.nextStateRefs = nextStateRefs;
  if (hindsightStatus) normalized.hindsightStatus = hindsightStatus;
  if (outcome) normalized.outcome = outcome;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function serializeTurnEnvelope(turn: unknown): string {
  const normalized = normalizeTurnEnvelope(turn);
  if (!normalized) return '';
  return JSON.stringify({
    turnId: normalized.turnId || '',
    parentTurnId: normalized.parentTurnId || '',
    turnType: normalized.turnType || '',
    environment: normalized.environment || '',
    workItemRefs: normalized.workItemRefs || [],
    nextStateRefs: normalized.nextStateRefs || [],
    hindsightStatus: normalized.hindsightStatus || '',
    outcome: normalized.outcome || '',
  });
}

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function sanitizeInline(text: unknown): string {
  // ContextDB event logs may contain legacy or malformed records. Keep packet
  // generation resilient by treating non-string text as empty/printable text.
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

const WORD_RE = /[\p{L}\p{N}]+/gu;
const CJK_CHAR_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function tokenizeForRecall(text: string): string[] {
  const chunks = String(text || '').toLowerCase().match(WORD_RE) ?? [];
  const tokens: string[] = [];

  for (const chunk of chunks) {
    const token = chunk.trim();
    if (!token) continue;

    if (CJK_CHAR_RE.test(token)) {
      const chars = Array.from(token).filter((char) => CJK_CHAR_RE.test(char));
      if (chars.length === 1) {
        tokens.push(chars[0]);
        continue;
      }
      for (let index = 0; index < chars.length - 1; index += 1) {
        tokens.push(`${chars[index]}${chars[index + 1]}`);
      }
      if (token.length <= 8) {
        tokens.push(token);
      }
      continue;
    }

    if (token.length >= 2) {
      tokens.push(token);
    }
  }

  return Array.from(new Set(tokens));
}

function scoreRecallText(queryTokens: string[], text: string): number {
  if (queryTokens.length === 0) return 0;
  const textTokens = new Set(tokenizeForRecall(text));
  let overlap = 0;
  for (const token of queryTokens) {
    if (textTokens.has(token)) {
      overlap += 1;
    }
  }
  if (overlap === 0) return 0;
  const unionSize = new Set([...queryTokens, ...textTokens]).size || 1;
  const jaccard = overlap / unionSize;
  const containment = overlap / queryTokens.length;
  return jaccard * 0.6 + containment * 0.4;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

function estimateEventLineTokens(event: Pick<ContextEvent, 'role' | 'kind'>, text: string): number {
  return estimateTokens(`${event.role}/${event.kind}: ${sanitizeInline(text)}`);
}

function truncateTextForTokenBudget(text: string, tokenBudget: number): string {
  const safeBudget = Math.max(4, Math.floor(tokenBudget));
  const maxChars = Math.max(32, safeBudget * CHARS_PER_TOKEN_ESTIMATE);
  const raw = String(text ?? '');
  if (raw.length <= maxChars) return raw;
  if (maxChars < 96) {
    return `${raw.slice(0, maxChars)} [truncated]`;
  }

  const marker = ' ... [truncated] ... ';
  const available = Math.max(16, maxChars - marker.length);
  const headChars = Math.max(12, Math.floor(available * 0.65));
  const tailChars = Math.max(4, available - headChars);
  return `${raw.slice(0, headChars)}${marker}${raw.slice(-tailChars)}`;
}

const IMPORTANT_SIGNAL_RE = /\b(error|failed|failure|exception|timeout|panic|blocked|retry|todo|next(?:\s+action)?|fix|bug|regression|cannot|can't|unable|denied|forbidden|auth)\b/i;
const STACK_LINE_RE = /^\s*(?:at\s+\S+|traceback\b|caused by:|file\s+".+", line \d+|[a-z0-9_.-]+error:)/i;
const COMMAND_SIGNAL_RE = /\b(?:npm|pnpm|yarn|git|node|python|pytest|cargo|go\s+test|make|cmake|bun)\b/i;
const FILE_SIGNAL_RE = /([A-Za-z0-9._/\\-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|json|md|sh|yaml|yml|toml|rs|go|java|rb|php|cpp|c|h))/i;
const OFFLOAD_CANVAS_MAX_CHARS = 12_000;

function stripAnsi(text: string): string {
  return String(text ?? '').replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
}

function sanitizeOffloadSessionId(id: string): string {
  return String(id || 'default').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128) || 'default';
}

async function readOffloadCanvas(workspaceRoot: string, sessionId: string): Promise<{
  absolutePath: string;
  relativePath: string;
  mermaid: string;
  truncated: boolean;
} | null> {
  const stateRoot = resolveAiosStateRoot(workspaceRoot);
  const safeSessionId = sanitizeOffloadSessionId(sessionId);
  const candidates = [
    path.join(stateRoot, 'offload', 'canvas', safeSessionId, 'task-canvas.mmd'),
    path.join(stateRoot, 'offload', 'split', 'canvas', safeSessionId, 'task-canvas.mmd'),
  ];

  let selected: { absolutePath: string; mtimeMs: number } | null = null;
  for (const absolutePath of candidates) {
    try {
      const stats = await fs.stat(absolutePath);
      if (!stats.isFile()) continue;
      if (!selected || stats.mtimeMs > selected.mtimeMs) {
        selected = { absolutePath, mtimeMs: stats.mtimeMs };
      }
    } catch {
      // Missing canvas is expected for sessions without offloaded tool output.
    }
  }
  if (!selected) return null;

  const raw = await fs.readFile(selected.absolutePath, 'utf8');
  const truncated = raw.length > OFFLOAD_CANVAS_MAX_CHARS;
  const mermaid = truncated
    ? `${raw.slice(0, OFFLOAD_CANVAS_MAX_CHARS).trimEnd()}\n%% [truncated: canvas exceeds ${OFFLOAD_CANVAS_MAX_CHARS} chars]\n`
    : raw;

  return {
    absolutePath: selected.absolutePath,
    relativePath: toWorkspaceRelative(workspaceRoot, selected.absolutePath),
    mermaid,
    truncated,
  };
}

function formatOffloadCanvasPacketBlock(canvas: Awaited<ReturnType<typeof readOffloadCanvas>>): string {
  if (!canvas) {
    return '1. (none)';
  }
  const lines = [
    `- Path: ${canvas.relativePath}`,
    '- Recall: inspect this graph first; use `aios refs grep/read` for only the node-level raw evidence you need.',
    '',
    '```mermaid',
    canvas.mermaid.trimEnd(),
    '```',
  ];
  if (canvas.truncated) {
    lines.splice(2, 0, '- Truncated: yes');
  }
  return lines.join('\n');
}

function hasImportantSignal(text: string): boolean {
  return IMPORTANT_SIGNAL_RE.test(text) || COMMAND_SIGNAL_RE.test(text) || FILE_SIGNAL_RE.test(text);
}

function collapseRepeatingLines(lines: string[], keepRepeats: number): string[] {
  if (lines.length === 0) return [];
  const keptRepeats = Math.max(1, keepRepeats);
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const signature = lines[index].trim();
    let end = index + 1;
    while (end < lines.length && lines[end].trim() === signature) {
      end += 1;
    }
    const runSize = end - index;
    if (signature.length === 0) {
      if (output.length === 0 || output[output.length - 1] !== '') {
        output.push('');
      }
      index = end;
      continue;
    }

    if (runSize <= keptRepeats) {
      for (let lineIndex = index; lineIndex < end; lineIndex += 1) {
        output.push(lines[lineIndex].trim());
      }
    } else {
      for (let lineIndex = 0; lineIndex < keptRepeats; lineIndex += 1) {
        output.push(lines[index + lineIndex].trim());
      }
      output.push(`... [${runSize - keptRepeats} repeated lines omitted]`);
    }
    index = end;
  }
  return output;
}

function collapseStackRuns(lines: string[], mode: 'balanced' | 'aggressive'): string[] {
  if (lines.length === 0) return [];
  const output: string[] = [];
  const maxInline = mode === 'aggressive' ? 4 : 7;
  const keepHead = mode === 'aggressive' ? 2 : 3;
  const keepTail = mode === 'aggressive' ? 1 : 2;
  let index = 0;

  while (index < lines.length) {
    if (!STACK_LINE_RE.test(lines[index])) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < lines.length && STACK_LINE_RE.test(lines[end])) {
      end += 1;
    }
    const run = lines.slice(index, end);
    if (run.length <= maxInline) {
      output.push(...run);
      index = end;
      continue;
    }

    output.push(...run.slice(0, keepHead));
    output.push(`... [${run.length - (keepHead + keepTail)} stack lines omitted]`);
    output.push(...run.slice(run.length - keepTail));
    index = end;
  }

  return output;
}

function trimLargeLineSet(lines: string[], mode: 'balanced' | 'aggressive'): string[] {
  const maxLines = mode === 'aggressive' ? 40 : 70;
  if (lines.length <= maxLines) return lines;

  const headCount = 3;
  const tailCount = 3;
  const head = lines.slice(0, headCount);
  const tail = lines.slice(lines.length - tailCount);
  const middle = lines.slice(headCount, Math.max(headCount, lines.length - tailCount));
  const signalLines = middle.filter((line) => hasImportantSignal(line));
  const allowedMiddle = Math.max(4, maxLines - headCount - tailCount - 1);
  const keptMiddle = signalLines.slice(0, allowedMiddle);
  const omittedCount = Math.max(0, middle.length - keptMiddle.length);

  return [
    ...head,
    ...keptMiddle,
    ...(omittedCount > 0 ? [`... [${omittedCount} lines omitted]`] : []),
    ...tail,
  ];
}

function compressEventText(rawText: string, mode: 'balanced' | 'aggressive'): string {
  const normalized = stripAnsi(String(rawText ?? '')).replace(/\r\n/g, '\n');
  let lines = normalized
    .split('\n')
    .map((line) => line.replace(/\t/g, '  ').trimEnd());

  while (lines.length > 0 && lines[0].trim().length === 0) lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim().length === 0) lines.pop();
  if (lines.length === 0) return sanitizeInline(normalized);

  lines = collapseRepeatingLines(lines, mode === 'aggressive' ? 1 : 2);
  lines = collapseStackRuns(lines, mode);
  lines = trimLargeLineSet(lines, mode);

  if (mode === 'aggressive') {
    lines = lines.map((line) => {
      if (line.length <= 220 || hasImportantSignal(line)) return line;
      return `${line.slice(0, 220)} ... [trimmed]`;
    });
  }

  return lines.join('\n').trim();
}

function collectCriticalTerms(text: string): string[] {
  const raw = String(text ?? '');
  const lower = raw.toLowerCase();
  const terms = new Set<string>();
  const keywordMatches = lower.match(/\b(error|failed|failure|exception|timeout|panic|blocked|retry|todo|fix|bug|regression|auth|denied|forbidden)\b/g) ?? [];
  for (const match of keywordMatches) {
    terms.add(match);
  }

  const fileRegex = /([A-Za-z0-9._/\\-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|json|md|sh|yaml|yml|toml|rs|go|java|rb|php|cpp|c|h))/g;
  let fileMatch: RegExpExecArray | null = null;
  while ((fileMatch = fileRegex.exec(raw)) !== null) {
    if (fileMatch[1]) {
      terms.add(fileMatch[1].toLowerCase());
    }
  }

  return Array.from(terms);
}

function tokenContainmentRatio(sourceText: string, candidateText: string): number {
  const sourceTokens = tokenizeForRecall(sourceText);
  if (sourceTokens.length === 0) return 1;
  const candidateTokens = new Set(tokenizeForRecall(candidateText));
  let overlap = 0;
  for (const token of sourceTokens) {
    if (candidateTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / sourceTokens.length;
}

function isCompressionSafe(originalText: string, compressedText: string, mode: 'balanced' | 'aggressive'): boolean {
  if (compressedText.trim().length === 0) return false;
  if (sanitizeInline(compressedText) === sanitizeInline(originalText)) return false;

  const terms = collectCriticalTerms(originalText);
  if (terms.length > 0) {
    const candidateLower = compressedText.toLowerCase();
    let matchedTerms = 0;
    for (const term of terms) {
      if (candidateLower.includes(term)) {
        matchedTerms += 1;
      }
    }
    const requiredMatches = terms.length <= 3
      ? terms.length
      : Math.max(2, Math.ceil(terms.length * 0.7));
    if (matchedTerms < requiredMatches) {
      return false;
    }
  }

  const containment = tokenContainmentRatio(originalText, compressedText);
  const minContainment = mode === 'aggressive' ? 0.55 : 0.72;
  return containment >= minContainment;
}

function safeCompressEventText(text: string, mode: 'balanced' | 'aggressive'): string {
  const original = String(text ?? '');
  const compressed = compressEventText(original, mode);
  if (!isCompressionSafe(original, compressed, mode)) {
    return original;
  }
  return compressed;
}

interface TokenBudgetCandidate {
  event: ContextEvent;
  index: number;
  priority: number;
  protect: boolean;
  hardProtect: boolean;
  rawText: string;
  compressedText: string;
  chosenText: string;
  rawTokens: number;
  compressedTokens: number;
  chosenTokens: number;
  compressedApplied: boolean;
  truncated: boolean;
  dropped: boolean;
}

interface TokenBudgetSelection {
  events: ContextEvent[];
  tokenUsed: number;
  rawTokens: number;
  compressedEvents: number;
  droppedEvents: number;
  truncatedEvents: number;
}

function normalizeTokenStrategy(raw: unknown): ContextPacketTokenStrategy {
  if (typeof raw !== 'string') return 'balanced';
  const value = raw.trim().toLowerCase();
  if (value === 'legacy' || value === 'balanced' || value === 'aggressive') {
    return value;
  }
  return 'balanced';
}

function scoreEventPriority(event: ContextEvent, index: number, total: number): { score: number; protect: boolean } {
  const text = String(event.text ?? '');
  const normalizedText = sanitizeInline(text);
  const normalizedKind = String(event.kind ?? '').toLowerCase();
  const recency = total <= 1 ? 1 : index / Math.max(1, total - 1);
  let score = recency * 2.2;

  if (event.role === 'user') score += 1.2;
  if (event.role === 'assistant') score += 0.6;
  if (normalizedKind.includes('error')) score += 3;
  if (normalizedKind.includes('warning')) score += 1.4;
  if (hasImportantSignal(normalizedText)) score += 2;
  if (COMMAND_SIGNAL_RE.test(normalizedText)) score += 0.9;
  if (FILE_SIGNAL_RE.test(normalizedText)) score += 0.8;
  if (normalizeRefs(event.refs).length > 0) score += 0.6;
  if (Array.isArray(event.turn?.workItemRefs) && event.turn.workItemRefs.length > 0) score += 0.7;
  if (event.turn?.outcome === 'retry-needed' || event.turn?.outcome === 'correction') score += 1.1;

  const protect = index === total - 1 || score >= 4.6 || /\b(next action|todo|blocked|failure|error|fix)\b/i.test(normalizedText);
  return { score, protect };
}

function applyLegacyTailBudget(events: ContextEvent[], tokenBudget: number): TokenBudgetSelection {
  const rawTokens = events.reduce((sum, event) => sum + estimateEventLineTokens(event, String(event.text ?? '')), 0);
  const selectedFromTail: ContextEvent[] = [];
  let eventTokensUsed = 0;

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const lineTokens = estimateEventLineTokens(event, String(event.text ?? ''));
    if (selectedFromTail.length > 0 && eventTokensUsed + lineTokens > tokenBudget) {
      break;
    }
    if (selectedFromTail.length === 0 && eventTokensUsed + lineTokens > tokenBudget) {
      selectedFromTail.push({
        ...event,
        text: truncateTextForTokenBudget(String(event.text ?? ''), tokenBudget),
      });
      eventTokensUsed = estimateEventLineTokens(event, selectedFromTail[0].text);
      break;
    }
    selectedFromTail.push(event);
    eventTokensUsed += lineTokens;
  }

  const selected = selectedFromTail.reverse();
  return {
    events: selected,
    tokenUsed: eventTokensUsed,
    rawTokens,
    compressedEvents: 0,
    droppedEvents: Math.max(0, events.length - selected.length),
    truncatedEvents: selected.some((item) => String(item.text || '').includes('[truncated]')) ? 1 : 0,
  };
}

function selectEventsWithTokenBudget(
  events: ContextEvent[],
  tokenBudget: number,
  strategy: ContextPacketTokenStrategy,
): TokenBudgetSelection {
  if (events.length === 0) {
    return {
      events: [],
      tokenUsed: 0,
      rawTokens: 0,
      compressedEvents: 0,
      droppedEvents: 0,
      truncatedEvents: 0,
    };
  }

  if (strategy === 'legacy') {
    return applyLegacyTailBudget(events, tokenBudget);
  }

  const compressionMode = strategy === 'aggressive' ? 'aggressive' : 'balanced';
  const lastIndex = events.length - 1;
  const candidates: TokenBudgetCandidate[] = events.map((event, index) => {
    const rawText = String(event.text ?? '');
    const compressedText = safeCompressEventText(rawText, compressionMode);
    const rawTokens = estimateEventLineTokens(event, rawText);
    const compressedTokens = estimateEventLineTokens(event, compressedText);
    const priorityDetails = scoreEventPriority(event, index, events.length);
    return {
      event,
      index,
      priority: priorityDetails.score,
      protect: priorityDetails.protect,
      hardProtect: index === lastIndex,
      rawText,
      compressedText,
      chosenText: rawText,
      rawTokens,
      compressedTokens,
      chosenTokens: rawTokens,
      compressedApplied: false,
      truncated: false,
      dropped: false,
    };
  });

  const rawTokens = candidates.reduce((sum, candidate) => sum + candidate.rawTokens, 0);
  let totalTokens = rawTokens;

  if (totalTokens > tokenBudget) {
    const compressionOrder = candidates
      .filter((candidate) => candidate.compressedTokens < candidate.rawTokens)
      .sort((a, b) => {
        if (a.protect !== b.protect) return a.protect ? 1 : -1;
        const saveA = a.rawTokens - a.compressedTokens;
        const saveB = b.rawTokens - b.compressedTokens;
        if (saveB !== saveA) return saveB - saveA;
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.index - b.index;
      });

    for (const candidate of compressionOrder) {
      if (totalTokens <= tokenBudget) break;
      if (candidate.chosenTokens <= candidate.compressedTokens) continue;
      totalTokens = totalTokens - candidate.chosenTokens + candidate.compressedTokens;
      candidate.chosenText = candidate.compressedText;
      candidate.chosenTokens = candidate.compressedTokens;
      candidate.compressedApplied = true;
    }
  }

  if (totalTokens > tokenBudget) {
    const dropOrder = [...candidates].sort((a, b) => {
      if (a.hardProtect !== b.hardProtect) return a.hardProtect ? 1 : -1;
      if (a.protect !== b.protect) return a.protect ? 1 : -1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.index - b.index;
    });

    for (const candidate of dropOrder) {
      if (totalTokens <= tokenBudget) break;
      if (candidate.hardProtect || candidate.dropped) continue;
      const keptCount = candidates.reduce((count, item) => count + (item.dropped ? 0 : 1), 0);
      if (keptCount <= 1) break;
      candidate.dropped = true;
      totalTokens -= candidate.chosenTokens;
    }
  }

  if (totalTokens > tokenBudget) {
    let guard = 0;
    const maxIterations = Math.max(6, candidates.length * 6);
    while (totalTokens > tokenBudget && guard < maxIterations) {
      guard += 1;
      const active = candidates.filter((candidate) => !candidate.dropped);
      if (active.length === 0) break;
      const target = [...active].sort((a, b) => {
        if (a.hardProtect !== b.hardProtect) return a.hardProtect ? 1 : -1;
        if (a.protect !== b.protect) return a.protect ? 1 : -1;
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (b.chosenTokens !== a.chosenTokens) return b.chosenTokens - a.chosenTokens;
        return a.index - b.index;
      })[0];

      if (!target) break;
      const overflow = totalTokens - tokenBudget;
      const desiredReduction = Math.max(1, Math.min(overflow, Math.floor(target.chosenTokens * 0.35)));
      const nextBudget = Math.max(8, target.chosenTokens - desiredReduction);
      const truncatedText = truncateTextForTokenBudget(target.chosenText, nextBudget);
      const truncatedTokens = estimateEventLineTokens(target.event, truncatedText);

      if (truncatedTokens >= target.chosenTokens) {
        if (!target.hardProtect && active.length > 1) {
          target.dropped = true;
          totalTokens -= target.chosenTokens;
          continue;
        }
        break;
      }

      totalTokens = totalTokens - target.chosenTokens + truncatedTokens;
      target.chosenText = truncatedText;
      target.chosenTokens = truncatedTokens;
      target.truncated = true;
    }
  }

  if (totalTokens > tokenBudget) {
    const active = candidates.filter((candidate) => !candidate.dropped);
    if (active.length > 1) {
      const keep = [...active].sort((a, b) => {
        if (a.hardProtect !== b.hardProtect) return a.hardProtect ? -1 : 1;
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.index - a.index;
      })[0];

      for (const candidate of active) {
        if (candidate === keep) continue;
        candidate.dropped = true;
        totalTokens -= candidate.chosenTokens;
      }
    }
  }

  if (totalTokens > tokenBudget) {
    const survivor = candidates.find((candidate) => !candidate.dropped);
    if (survivor) {
      const truncatedText = truncateTextForTokenBudget(survivor.chosenText, tokenBudget);
      const truncatedTokens = estimateEventLineTokens(survivor.event, truncatedText);
      totalTokens = totalTokens - survivor.chosenTokens + truncatedTokens;
      survivor.chosenText = truncatedText;
      survivor.chosenTokens = truncatedTokens;
      survivor.truncated = true;
    }
  }

  let selectedEvents = candidates
    .filter((candidate) => !candidate.dropped)
    .sort((a, b) => a.index - b.index)
    .map((candidate) => ({
      ...candidate.event,
      text: candidate.chosenText,
    }));

  if (selectedEvents.length === 0) {
    const latest = events[events.length - 1];
    const text = truncateTextForTokenBudget(String(latest.text ?? ''), tokenBudget);
    selectedEvents = [{ ...latest, text }];
    totalTokens = estimateEventLineTokens(latest, text);
  }

  const compressedEvents = candidates.filter((candidate) => !candidate.dropped && candidate.compressedApplied).length;
  const droppedEvents = candidates.filter((candidate) => candidate.dropped).length;
  const truncatedEvents = candidates.filter((candidate) => !candidate.dropped && candidate.truncated).length;

  return {
    events: selectedEvents,
    tokenUsed: Math.max(0, totalTokens),
    rawTokens,
    compressedEvents,
    droppedEvents,
    truncatedEvents,
  };
}

function isVerificationResult(value: string): value is VerificationResult {
  return value === 'unknown' || value === 'passed' || value === 'failed' || value === 'partial';
}

function normalizeTextValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const normalized = Math.floor(value);
  return normalized >= 0 ? normalized : undefined;
}

function normalizeNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value >= 0 ? value : undefined;
}

function normalizeCheckpointCost(cost?: CheckpointCost): CheckpointCost | undefined {
  if (!cost) return undefined;

  const inputTokens = normalizeNonNegativeInteger(cost.inputTokens);
  const outputTokens = normalizeNonNegativeInteger(cost.outputTokens);
  const explicitTotalTokens = normalizeNonNegativeInteger(cost.totalTokens);
  const totalTokens = explicitTotalTokens ?? (
    inputTokens !== undefined || outputTokens !== undefined
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined
  );
  const usd = normalizeNonNegativeNumber(cost.usd);

  const normalized: CheckpointCost = {};
  if (inputTokens !== undefined) normalized.inputTokens = inputTokens;
  if (outputTokens !== undefined) normalized.outputTokens = outputTokens;
  if (totalTokens !== undefined) normalized.totalTokens = totalTokens;
  if (usd !== undefined) normalized.usd = usd;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeCheckpointTelemetry(telemetry?: CheckpointTelemetry): CheckpointTelemetry | undefined {
  if (!telemetry) return undefined;

  const verificationResult = normalizeTextValue(telemetry.verification?.result);
  const verificationEvidence = normalizeTextValue(telemetry.verification?.evidence);
  const verification = verificationResult && isVerificationResult(verificationResult)
    ? {
      result: verificationResult,
      ...(verificationEvidence ? { evidence: verificationEvidence } : {}),
    }
    : undefined;
  const retryCount = normalizeNonNegativeInteger(telemetry.retryCount);
  const failureCategory = normalizeTextValue(telemetry.failureCategory)?.toLowerCase();
  const elapsedMs = normalizeNonNegativeInteger(telemetry.elapsedMs);
  const cost = normalizeCheckpointCost(telemetry.cost);

  const normalized: CheckpointTelemetry = {};
  if (verification) normalized.verification = verification;
  if (retryCount !== undefined) normalized.retryCount = retryCount;
  if (failureCategory) normalized.failureCategory = failureCategory;
  if (elapsedMs !== undefined) normalized.elapsedMs = elapsedMs;
  if (cost) normalized.cost = cost;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function formatCheckpointTelemetryLines(telemetry?: CheckpointTelemetry): string[] {
  const normalized = normalizeCheckpointTelemetry(telemetry);
  if (!normalized) return ['- (none)'];

  const lines: string[] = [];
  if (normalized.verification) {
    const evidence = normalized.verification.evidence ? ` (${normalized.verification.evidence})` : '';
    lines.push(`- Verification: ${normalized.verification.result}${evidence}`);
  }
  if (normalized.retryCount !== undefined) {
    lines.push(`- Retry Count: ${normalized.retryCount}`);
  }
  if (normalized.failureCategory) {
    lines.push(`- Failure Category: ${normalized.failureCategory}`);
  }
  if (normalized.elapsedMs !== undefined) {
    lines.push(`- Elapsed: ${normalized.elapsedMs} ms`);
  }
  if (normalized.cost) {
    const costParts: string[] = [];
    if (normalized.cost.inputTokens !== undefined) costParts.push(`inputTokens=${normalized.cost.inputTokens}`);
    if (normalized.cost.outputTokens !== undefined) costParts.push(`outputTokens=${normalized.cost.outputTokens}`);
    if (normalized.cost.totalTokens !== undefined) costParts.push(`totalTokens=${normalized.cost.totalTokens}`);
    if (normalized.cost.usd !== undefined) costParts.push(`usd=${normalized.cost.usd}`);
    if (costParts.length > 0) {
      lines.push(`- Cost: ${costParts.join(' ' )}`);
    }
  }
  return lines.length > 0 ? lines : ['- (none)'];
}

function eventSignature(event: Pick<ContextEvent, 'role' | 'kind' | 'text' | 'refs' | 'turn'>): string {
  const normalized = `${event.role}|${event.kind}|${sanitizeInline(event.text)}|${normalizeRefs(event.refs).join(',')}|${serializeTurnEnvelope(event.turn)}`;
  return hashText(normalized);
}

async function ensureFile(filePath: string, content: string = ''): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, content, 'utf8');
  }
}

async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  await fs.appendFile(filePath, toJsonLine(value), 'utf8');
}

async function readLastJsonLine<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) return null;
    return JSON.parse(lines[lines.length - 1]) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    throw error;
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function writeAtomicFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.tmp.${process.pid}.${crypto.randomUUID().slice(0, 8)}`
  );
  await fs.writeFile(tmpPath, content, 'utf8');
  try {
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeAtomicFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJsonLines<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const rows: T[] = [];
    for (const line of raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)) {
      try {
        rows.push(JSON.parse(line) as T);
      } catch {
        // keep processing remaining lines instead of dropping the entire file
      }
    }
    return rows;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      throw error;
    }
    return [];
  }
}

function getDbRoot(workspaceRoot: string): string {
  return resolveContextDbRoot(workspaceRoot, { preferLegacyExisting: true });
}

function getSessionsIndexPath(workspaceRoot: string): string {
  return path.join(getDbRoot(workspaceRoot), 'index', INDEX_SESSIONS_NAME);
}

function getEventsIndexPath(workspaceRoot: string): string {
  return path.join(getDbRoot(workspaceRoot), 'index', INDEX_EVENTS_NAME);
}

function getCheckpointsIndexPath(workspaceRoot: string): string {
  return path.join(getDbRoot(workspaceRoot), 'index', INDEX_CHECKPOINTS_NAME);
}

function getSqlitePath(workspaceRoot: string): string {
  return path.join(getDbRoot(workspaceRoot), 'index', SQLITE_NAME);
}

function getSessionPaths(workspaceRoot: string, sessionId: string): SessionPaths {
  const dir = path.join(getDbRoot(workspaceRoot), 'sessions', sessionId);
  return {
    dir,
    meta: path.join(dir, 'meta.json'),
    summary: path.join(dir, 'l0-summary.md'),
    checkpoints: path.join(dir, 'l1-checkpoints.jsonl'),
    events: path.join(dir, 'l2-events.jsonl'),
    state: path.join(dir, 'state.json'),
    continuitySummary: path.join(dir, 'continuity-summary.md'),
    continuityJson: path.join(dir, 'continuity.json'),
  };
}

async function acquireSessionLock(lockPath: string, timeoutMs: number = SESSION_LOCK_TIMEOUT_MS): Promise<() => Promise<void>> {
  const start = Date.now();
  while (true) {
    try {
      const handle = await fs.open(lockPath, 'wx');
      return async () => {
        try {
          await handle.close();
        } finally {
          await fs.unlink(lockPath).catch(() => {});
        }
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw error;
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Session lock timeout for ${lockPath}`);
      }
      await sleep(25 + Math.floor(Math.random() * 100));
    }
  }
}

async function withSessionLock<T>(workspaceRoot: string, sessionId: string, fn: () => Promise<T>): Promise<T> {
  const paths = getSessionPaths(workspaceRoot, sessionId);
  const lockPath = path.join(paths.dir, '.session.lock');
  const release = await acquireSessionLock(lockPath);
  try {
    return await fn();
  } finally {
    await release();
  }
}

async function touchSessionMeta(workspaceRoot: string, sessionId: string, mutate?: (meta: SessionMeta) => SessionMeta): Promise<SessionMeta> {
  const paths = getSessionPaths(workspaceRoot, sessionId);
  const meta = await readJson<SessionMeta>(paths.meta);
  const updated = mutate ? mutate(meta) : meta;
  updated.updatedAt = nowIso();
  await writeJson(paths.meta, updated);
  return updated;
}

function formatSummaryMarkdown(meta: SessionMeta, checkpoint: Checkpoint): string {
  const nextActions = checkpoint.nextActions.length > 0
    ? checkpoint.nextActions.map((item) => `- ${item}`).join('\n')
    : '- (none)';
  const telemetry = formatCheckpointTelemetryLines(checkpoint.telemetry).join('\n');
  const artifacts = checkpoint.artifacts.length > 0
    ? checkpoint.artifacts.map((item) => `- ${item}`).join('\n')
    : '- (none)';

  return [
    `# Session ${meta.sessionId}`,
    '',
    `- Agent: ${meta.agent}`,
    `- Project: ${meta.project}`,
    `- Goal: ${meta.goal}`,
    `- Status: ${checkpoint.status}`,
    `- Updated: ${checkpoint.ts}`,
    '',
    '## Summary',
    checkpoint.summary,
    '',
    '## Next Actions',
    nextActions,
    '',
    '## Telemetry',
    telemetry,
    '',
    '## Artifacts',
    artifacts,
    '',
  ].join('\n');
}

function normalizeContinuityList(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter((item) => item.length > 0)));
}

function buildContinuitySummary(meta: SessionMeta, checkpoint: Checkpoint): ContinuitySummary {
  return {
    schemaVersion: 1,
    sessionId: meta.sessionId,
    intent: meta.goal || 'continue current session',
    summary: checkpoint.summary || 'No checkpoint summary recorded yet.',
    touchedFiles: normalizeContinuityList(checkpoint.artifacts),
    nextActions: normalizeContinuityList(checkpoint.nextActions),
    updatedAt: checkpoint.ts,
  };
}

function formatContinuityMarkdown(continuity: ContinuitySummary): string {
  const touchedFiles = continuity.touchedFiles.length > 0
    ? continuity.touchedFiles.map((item) => `- ${item}`).join('\n')
    : '- (none recorded)';
  const nextActions = continuity.nextActions.length > 0
    ? continuity.nextActions.map((item) => `- ${item}`).join('\n')
    : '- (none recorded)';

  return [
    '# Continuity Summary',
    '',
    `- Session: ${continuity.sessionId}`,
    `- Intent: ${continuity.intent}`,
    `- Updated: ${continuity.updatedAt}`,
    '',
    '## Current State',
    continuity.summary,
    '',
    '## Touched Files',
    touchedFiles,
    '',
    '## Next Actions',
    nextActions,
    '',
  ].join('\n');
}

function formatContinuityPacketBlock(continuity: ContinuitySummary | null): string {
  if (!continuity) return 'No continuity summary yet.';
  const touchedFiles = continuity.touchedFiles.length > 0
    ? continuity.touchedFiles.map((item) => `- ${item}`).join('\n')
    : '- (none recorded)';
  const nextActions = continuity.nextActions.length > 0
    ? continuity.nextActions.map((item) => `- ${item}`).join('\n')
    : '- (none recorded)';
  return [
    `- Intent: ${continuity.intent}`,
    `- Updated: ${continuity.updatedAt}`,
    '',
    continuity.summary,
    '',
    'Touched Files:',
    touchedFiles,
    '',
    'Next Actions:',
    nextActions,
  ].join('\n');
}

function normalizeContinuitySummary(raw: unknown): ContinuitySummary | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const sessionId = typeof value.sessionId === 'string' ? value.sessionId.trim() : '';
  const summary = typeof value.summary === 'string' ? value.summary.trim() : '';
  if (!sessionId || !summary) return null;
  return {
    schemaVersion: 1,
    sessionId,
    intent: typeof value.intent === 'string' && value.intent.trim() ? value.intent.trim() : 'continue current session',
    summary,
    touchedFiles: normalizeContinuityList(Array.isArray(value.touchedFiles) ? value.touchedFiles.map((item) => String(item)) : []),
    nextActions: normalizeContinuityList(Array.isArray(value.nextActions) ? value.nextActions.map((item) => String(item)) : []),
    updatedAt: typeof value.updatedAt === 'string' && value.updatedAt.trim() ? value.updatedAt.trim() : nowIso(),
  };
}

async function readContinuitySummary(paths: SessionPaths): Promise<ContinuitySummary | null> {
  try {
    return normalizeContinuitySummary(await readJson<unknown>(paths.continuityJson));
  } catch {
    return null;
  }
}

export function resolveWorkspaceRoot(cwd: string = process.cwd()): string {
  const candidates = [
    cwd,
    path.resolve(cwd, '..'),
    path.resolve(cwd, '..', '..'),
    path.resolve(cwd, '..', '..', '..'),
  ];

  for (const candidate of candidates) {
    const hasConfig = existsSync(path.join(candidate, 'config', 'browser-profiles.json'));
    const hasMemory = existsSync(path.join(candidate, 'memory'));
    if (hasConfig && hasMemory) {
      return candidate;
    }
  }

  return cwd;
}

export async function ensureContextDb(workspaceRoot: string): Promise<string> {
  const dbRoot = getDbRoot(workspaceRoot);
  await Promise.all([
    fs.mkdir(path.join(dbRoot, 'sessions'), { recursive: true }),
    fs.mkdir(path.join(dbRoot, 'index'), { recursive: true }),
    fs.mkdir(path.join(dbRoot, 'exports'), { recursive: true }),
  ]);

  const manifestPath = path.join(dbRoot, MANIFEST_NAME);
  if (!existsSync(manifestPath)) {
    await writeJson(manifestPath, {
      version: 1,
      layout: 'l0-l1-l2',
      description: 'Filesystem context database for multi-CLI agent memory',
      createdAt: nowIso(),
    });
  }

  await ensureFile(getSessionsIndexPath(workspaceRoot), '');
  await ensureFile(getEventsIndexPath(workspaceRoot), '');
  await ensureFile(getCheckpointsIndexPath(workspaceRoot), '');
  ensureSqliteSidecar(getSqlitePath(workspaceRoot));
  return dbRoot;
}

export interface CreateSessionInput {
  workspaceRoot: string;
  agent: string;
  project: string;
  goal: string;
  tags?: string[];
  sessionId?: string;
}

export async function createSession(input: CreateSessionInput): Promise<SessionMeta> {
  if (!input.agent || !input.project || !input.goal) {
    throw new Error('createSession requires agent, project, and goal');
  }

  await ensureContextDb(input.workspaceRoot);
  const sessionId = input.sessionId || `${slugify(input.agent)}-${sessionTimestamp()}-${crypto.randomUUID().slice(0, 8)}`;
  const paths = getSessionPaths(input.workspaceRoot, sessionId);
  await fs.mkdir(paths.dir, { recursive: false });

  const ts = nowIso();
  const meta: SessionMeta = {
    schemaVersion: 1,
    sessionId,
    agent: input.agent,
    project: input.project,
    goal: input.goal,
    tags: input.tags ?? [],
    status: 'running',
    createdAt: ts,
    updatedAt: ts,
  };

  await Promise.all([
    writeJson(paths.meta, meta),
    writeAtomicFile(
      paths.summary,
      `# Session ${sessionId}\n\nPending first checkpoint.\n`,
    ),
    ensureFile(paths.checkpoints, ''),
    ensureFile(paths.events, ''),
    writeJson(paths.state, {
      sessionId,
      lastEventAt: null,
      lastEventSeq: 0,
      lastCheckpointAt: null,
      lastCheckpointSeq: 0,
      status: 'running',
      nextActions: [],
    }),
  ]);

  await appendJsonLine(getSessionsIndexPath(input.workspaceRoot), {
    sessionId,
    agent: input.agent,
    project: input.project,
    goal: input.goal,
    tags: input.tags ?? [],
    createdAt: ts,
  });

  try {
    upsertSessionRow(getSqlitePath(input.workspaceRoot), {
      sessionId,
      agent: input.agent,
      project: input.project,
      goal: input.goal,
      tags: input.tags ?? [],
      createdAt: ts,
      updatedAt: ts,
    });
  } catch {
    // SQLite sidecar is a rebuildable cache; canonical session files already persisted.
  }

  return meta;
}

export interface AppendEventInput {
  workspaceRoot: string;
  sessionId: string;
  role: EventRole;
  text: string;
  kind?: string;
  refs?: string[];
  turn?: EventTurnEnvelope;
}

export async function appendEvent(input: AppendEventInput): Promise<ContextEvent> {
  if (!input.sessionId || !input.role || !input.text) {
    throw new Error('appendEvent requires sessionId, role, and text');
  }

  await ensureContextDb(input.workspaceRoot);
  const paths = getSessionPaths(input.workspaceRoot, input.sessionId);
  return await withSessionLock(input.workspaceRoot, input.sessionId, async () => {
    const state = await readJson<Record<string, unknown>>(paths.state);
    const nextSeq = (typeof state.lastEventSeq === 'number'
      ? state.lastEventSeq
      : Number(state.lastEventSeq) || 0) + 1;

    const turn = normalizeTurnEnvelope(input.turn);
    const event: ContextEvent = {
      seq: nextSeq,
      ts: nowIso(),
      role: input.role,
      kind: input.kind || 'message',
      text: input.text,
      refs: normalizeRefs(input.refs ?? []),
      ...(turn ? { turn } : {}),
    };

    const lastEvent = await readLastJsonLine<ContextEvent>(paths.events);
    if (lastEvent) {
      const sameSignature = eventSignature({
        role: lastEvent.role,
        kind: lastEvent.kind,
        text: lastEvent.text,
        refs: lastEvent.refs ?? [],
        turn: lastEvent.turn,
      }) === eventSignature(event);
      const withinWindow = Math.abs(toEpoch(event.ts) - toEpoch(lastEvent.ts)) <= EVENT_DEDUP_WINDOW_MS;
      if (sameSignature && withinWindow) {
        return lastEvent;
      }
    }

    await appendJsonLine(paths.events, event);
    const meta = await touchSessionMeta(input.workspaceRoot, input.sessionId);

    state.lastEventAt = event.ts;
    state.lastEventSeq = nextSeq;
    await writeJson(paths.state, state);

    const indexed: IndexedEvent = {
      eventId: `${input.sessionId}#${nextSeq}`,
      sessionId: input.sessionId,
      seq: nextSeq,
      ts: event.ts,
      tsEpoch: toEpoch(event.ts),
      project: meta.project,
      agent: meta.agent,
      role: event.role,
      kind: event.kind,
      text: event.text,
      refs: event.refs,
      ...(event.turn ? { turn: event.turn } : {}),
      textHash: hashText(sanitizeInline(event.text)),
      signatureHash: eventSignature(event),
    };
    await appendJsonLine(getEventsIndexPath(input.workspaceRoot), indexed);
    try {
      upsertSessionRow(getSqlitePath(input.workspaceRoot), {
        sessionId: input.sessionId,
        agent: meta.agent,
        project: meta.project,
        goal: meta.goal,
        tags: meta.tags,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      });
      upsertEventRow(getSqlitePath(input.workspaceRoot), indexed);
    } catch {
      // SQLite sidecar is a rebuildable cache; canonical event files already persisted.
    }
    return event;
  });
}

export interface WriteCheckpointInput {
  workspaceRoot: string;
  sessionId: string;
  summary: string;
  status?: SessionStatus;
  nextActions?: string[];
  artifacts?: string[];
  telemetry?: CheckpointTelemetry;
}

export async function writeCheckpoint(input: WriteCheckpointInput): Promise<Checkpoint> {
  if (!input.sessionId || !input.summary) {
    throw new Error('writeCheckpoint requires sessionId and summary');
  }

  await ensureContextDb(input.workspaceRoot);
  const paths = getSessionPaths(input.workspaceRoot, input.sessionId);
  const status = input.status ?? 'running';
  return await withSessionLock(input.workspaceRoot, input.sessionId, async () => {
    const state = await readJson<Record<string, unknown>>(paths.state);
    const nextSeq = (typeof state.lastCheckpointSeq === 'number'
      ? state.lastCheckpointSeq
      : Number(state.lastCheckpointSeq) || 0) + 1;

    const checkpoint: Checkpoint = {
      seq: nextSeq,
      ts: nowIso(),
      status,
      summary: input.summary,
      nextActions: input.nextActions ?? [],
      artifacts: input.artifacts ?? [],
      telemetry: normalizeCheckpointTelemetry(input.telemetry),
    };

    await appendJsonLine(paths.checkpoints, checkpoint);
    const meta = await touchSessionMeta(input.workspaceRoot, input.sessionId, (prev) => ({
      ...prev,
      status,
    }));
    const continuity = buildContinuitySummary(meta, checkpoint);
    await Promise.all([
      writeAtomicFile(paths.summary, formatSummaryMarkdown(meta, checkpoint)),
      writeAtomicFile(paths.continuitySummary, formatContinuityMarkdown(continuity)),
      writeJson(paths.continuityJson, continuity),
    ]);

    state.lastCheckpointAt = checkpoint.ts;
    state.lastCheckpointSeq = nextSeq;
    state.status = status;
    state.nextActions = checkpoint.nextActions;
    await writeJson(paths.state, state);

    const indexed: IndexedCheckpoint = {
      checkpointId: `${input.sessionId}#C${nextSeq}`,
      sessionId: input.sessionId,
      seq: nextSeq,
      ts: checkpoint.ts,
      tsEpoch: toEpoch(checkpoint.ts),
      project: meta.project,
      agent: meta.agent,
      status: checkpoint.status,
      summary: checkpoint.summary,
      nextActions: checkpoint.nextActions,
      artifacts: checkpoint.artifacts,
      telemetry: checkpoint.telemetry,
    };
    await appendJsonLine(getCheckpointsIndexPath(input.workspaceRoot), indexed);
    try {
      upsertSessionRow(getSqlitePath(input.workspaceRoot), {
        sessionId: input.sessionId,
        agent: meta.agent,
        project: meta.project,
        goal: meta.goal,
        tags: meta.tags,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      });
      upsertCheckpointRow(getSqlitePath(input.workspaceRoot), indexed);
    } catch {
      // SQLite sidecar is a rebuildable cache; canonical checkpoint files already persisted.
    }
    return checkpoint;
  });
}

export async function getSessionMeta(workspaceRoot: string, sessionId: string): Promise<SessionMeta> {
  return await readJson<SessionMeta>(getSessionPaths(workspaceRoot, sessionId).meta);
}

export async function findLatestSession(workspaceRoot: string, agent: string, project?: string): Promise<SessionMeta | null> {
  await ensureContextDb(workspaceRoot);
  try {
    const latestRow = await withSidecarReadFallback(workspaceRoot, () => {
      return findLatestSessionRow(getSqlitePath(workspaceRoot), { agent, project });
    });
    if (latestRow) {
      const metaPath = getSessionPaths(workspaceRoot, latestRow.sessionId).meta;
      if (existsSync(metaPath)) {
        return await readJson<SessionMeta>(metaPath);
      }
    }
  } catch {
    // Fall back to filesystem scan when sidecar lookup is unavailable.
  }

  const sessionsRoot = path.join(getDbRoot(workspaceRoot), 'sessions');
  const entries = await fs.readdir(sessionsRoot, { withFileTypes: true });
  const metas: SessionMeta[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(sessionsRoot, entry.name, 'meta.json');
    if (!existsSync(metaPath)) continue;
    let meta: SessionMeta;
    try {
      meta = await readJson<SessionMeta>(metaPath);
    } catch {
      continue;
    }
    if (meta.agent !== agent) continue;
    if (project && meta.project !== project) continue;
    metas.push(meta);
  }

  metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return metas[0] ?? null;
}

export interface BuildPacketInput {
  workspaceRoot: string;
  sessionId: string;
  eventLimit?: number;
  tokenBudget?: number;
  tokenStrategy?: ContextPacketTokenStrategy;
  recallStrategy?: 'tail' | 'smart';
  kinds?: string[];
  refs?: string[];
  dedupeEvents?: boolean;
  outputPath?: string;
}

export interface BuildPacketOutput {
  markdown: string;
  outputPath?: string;
}

export async function buildContextPacket(input: BuildPacketInput): Promise<BuildPacketOutput> {
  await ensureContextDb(input.workspaceRoot);
  const paths = getSessionPaths(input.workspaceRoot, input.sessionId);
  const eventLimit = input.eventLimit ?? 30;
  const tokenBudget = typeof input.tokenBudget === 'number' && Number.isFinite(input.tokenBudget) && input.tokenBudget > 0
    ? Math.floor(input.tokenBudget)
    : null;

  const [meta, summaryRaw, checkpoints, events, continuity, offloadCanvas] = await Promise.all([
    readJson<SessionMeta>(paths.meta),
    fs.readFile(paths.summary, 'utf8'),
    readJsonLines<Checkpoint>(paths.checkpoints),
    readJsonLines<ContextEvent>(paths.events),
    readContinuitySummary(paths),
    readOffloadCanvas(input.workspaceRoot, input.sessionId),
  ]);

  const latestCheckpoint = checkpoints[checkpoints.length - 1] ?? null;
  const checkpointNextActions = latestCheckpoint && Array.isArray(latestCheckpoint.nextActions)
    ? latestCheckpoint.nextActions
    : [];
  const checkpointArtifacts = latestCheckpoint && Array.isArray(latestCheckpoint.artifacts)
    ? latestCheckpoint.artifacts
    : [];
  const kindFilters = new Set((input.kinds ?? []).map((kind) => kind.trim()).filter((kind) => kind.length > 0));
  const refFilters = new Set(normalizeRefs(input.refs ?? []));

  let filteredEvents = events;
  if (kindFilters.size > 0) {
    filteredEvents = filteredEvents.filter((event) => kindFilters.has(event.kind));
  }
  if (refFilters.size > 0) {
    filteredEvents = filteredEvents.filter((event) => normalizeRefs(event.refs).some((ref) => refFilters.has(ref)));
  }

  if (input.dedupeEvents !== false) {
    const seen = new Set<string>();
    const deduped: ContextEvent[] = [];
    for (let index = filteredEvents.length - 1; index >= 0; index -= 1) {
      const event = filteredEvents[index];
      const signature = eventSignature({
        role: event.role,
        kind: event.kind,
        text: event.text,
        refs: event.refs ?? [],
        turn: event.turn,
      });
      if (seen.has(signature)) continue;
      seen.add(signature);
      deduped.push(event);
    }
    filteredEvents = deduped.reverse();
  }

  const recallStrategy = input.recallStrategy === 'tail' ? 'tail' : 'smart';
  let selectedEvents = filteredEvents;
  if (eventLimit > 0) {
    if (recallStrategy === 'tail') {
      selectedEvents = filteredEvents.slice(Math.max(0, filteredEvents.length - eventLimit));
    } else {
      const poolWindow = Math.max(eventLimit * 6, 50);
      const poolOffset = Math.max(0, filteredEvents.length - poolWindow);
      const pool = filteredEvents.slice(poolOffset);
      const recentCount = Math.min(pool.length, Math.max(2, Math.floor(eventLimit / 2)));
      const selectedIndexes = new Set<number>();
      for (let index = pool.length - recentCount; index < pool.length; index += 1) {
        if (index >= 0) {
          selectedIndexes.add(index);
        }
      }

      const recallQuery = [
        meta.goal,
        latestCheckpoint?.summary ?? '',
        checkpointNextActions.join(' '),
        latestCheckpoint?.telemetry?.failureCategory ?? '',
      ].join(' ');
      const recallTokens = tokenizeForRecall(recallQuery);
      const rankedPool = pool
        .map((event, index) => ({
          index,
          score: scoreRecallText(
            recallTokens,
            `${event.role} ${event.kind} ${sanitizeInline(event.text)} ${normalizeRefs(event.refs).join(' ')}`
          ),
        }))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return b.index - a.index;
        });

      for (const candidate of rankedPool) {
        if (selectedIndexes.size >= eventLimit) break;
        selectedIndexes.add(candidate.index);
      }

      selectedEvents = Array.from(selectedIndexes)
        .sort((a, b) => a - b)
        .map((index) => pool[index]);
    }
  }

  let eventTokensUsed = 0;
  let tokenWindowRawTokens = 0;
  let tokenWindowCompressedEvents = 0;
  let tokenWindowDroppedEvents = 0;
  let tokenWindowTruncatedEvents = 0;
  let effectiveTokenStrategy: ContextPacketTokenStrategy | null = null;

  if (tokenBudget !== null) {
    effectiveTokenStrategy = normalizeTokenStrategy(input.tokenStrategy);
    const selection = selectEventsWithTokenBudget(selectedEvents, tokenBudget, effectiveTokenStrategy);
    selectedEvents = selection.events;
    tokenWindowRawTokens = selection.rawTokens;
    tokenWindowCompressedEvents = selection.compressedEvents;
    tokenWindowDroppedEvents = selection.droppedEvents;
    tokenWindowTruncatedEvents = selection.truncatedEvents;
    eventTokensUsed = selectedEvents.reduce((sum, event) => {
      return sum + estimateEventLineTokens(event, String(event.text ?? ''));
    }, 0);
  } else {
    eventTokensUsed = selectedEvents.reduce((sum, event) => {
      return sum + estimateEventLineTokens(event, String(event.text ?? ''));
    }, 0);
    tokenWindowRawTokens = eventTokensUsed;
  }

  const focusQuery = [
    meta.goal,
    latestCheckpoint?.summary ?? '',
    checkpointNextActions.join(' '),
    selectedEvents.map((event) => `${event.kind} ${sanitizeInline(event.text)}`).join(' '),
  ].join(' ').trim();

  const relevantCheckpointRows = recallStrategy === 'smart' && focusQuery.length > 0
    ? await withSidecarReadFallback(input.workspaceRoot, () => {
      return searchCheckpointRows(getSqlitePath(input.workspaceRoot), {
        project: meta.project,
        sessionId: input.sessionId,
        query: focusQuery,
        limit: 5,
      });
    })
    : [];

  const checkpointBlock = latestCheckpoint
    ? [
      `- Status: ${latestCheckpoint.status}`,
      `- Time: ${latestCheckpoint.ts}`,
      `- Sequence: ${latestCheckpoint.seq ?? '(legacy)'}`,
      '',
      'Next Actions:',
      ...(checkpointNextActions.length > 0
        ? checkpointNextActions.map((item) => `- ${item}`)
        : ['- (none)']),
      '',
      'Telemetry:',
      ...formatCheckpointTelemetryLines(latestCheckpoint.telemetry),
      '',
      'Artifacts:',
      ...(checkpointArtifacts.length > 0
        ? checkpointArtifacts.map((item) => `- ${item}`)
        : ['- (none)']),
    ].join('\n')
    : 'No checkpoint yet.';

  const currentCheckpointSeq = typeof latestCheckpoint?.seq === 'number' ? latestCheckpoint.seq : null;
  const relevantCheckpointBlock = relevantCheckpointRows
    .filter((row) => currentCheckpointSeq === null || row.seq !== currentCheckpointSeq)
    .slice(0, 3)
    .map((row, index) => {
      const nextActions = row.nextActions.length > 0 ? row.nextActions.join('; ') : '(none)';
      const failureCategory = row.telemetry?.failureCategory ? ` failure=${row.telemetry.failureCategory}` : '';
      return `${index + 1}. [${row.ts}] (${row.checkpointId}) checkpoint/${row.status}${failureCategory}: ${sanitizeInline(row.summary)} | next=${nextActions}`;
    })
    .join('\n');

  const eventBlock = selectedEvents.length > 0
    ? selectedEvents
      .map((item, index) => {
        const eventId = item.seq ? `${input.sessionId}#${item.seq}` : `${input.sessionId}#?`;
        const refs = normalizeRefs(item.refs);
        const refsLabel = refs.length > 0 ? ` refs=[${refs.join(', ')}]` : '';
        const turn = normalizeTurnEnvelope(item.turn);
        const turnBits: string[] = [];
        if (turn?.turnId) turnBits.push(`turn=${turn.turnId}`);
        if (turn?.turnType) turnBits.push(`type=${turn.turnType}`);
        if (turn?.environment) turnBits.push(`env=${turn.environment}`);
        if (Array.isArray(turn?.workItemRefs) && turn.workItemRefs.length > 0) {
          turnBits.push(`wi=${turn.workItemRefs.join(',')}`);
        }
        const turnLabel = turnBits.length > 0 ? ` turn=[${turnBits.join(' ')}]` : '';
        return `${index + 1}. [${item.ts}] (${eventId}) ${item.role}/${item.kind}${refsLabel}${turnLabel}: ${sanitizeInline(item.text)}`;
      })
      .join('\n')
    : '1. (no events yet)';

  const tokenWindowLine = tokenBudget !== null
    ? `- Event Window: selected=${selectedEvents.length} filtered=${filteredEvents.length} cap=${eventLimit} tokenBudget=${tokenBudget} tokenUsed=${eventTokensUsed} strategy=${effectiveTokenStrategy ?? 'balanced'} rawTokenUsed=${tokenWindowRawTokens} compressed=${tokenWindowCompressedEvents} dropped=${tokenWindowDroppedEvents} truncated=${tokenWindowTruncatedEvents}`
    : `- Event Window: selected=${selectedEvents.length} filtered=${filteredEvents.length} cap=${eventLimit} tokenBudget=unbounded tokenUsed=${eventTokensUsed}`;

  const markdown = [
    '# ContextDB Report',
    '',
    `- Generated: ${nowIso()}`,
    `- Session: ${meta.sessionId}`,
    `- Agent: ${meta.agent}`,
    `- Project: ${meta.project}`,
    `- Goal: ${meta.goal}`,
    `- Status: ${meta.status}`,
    `- Event Filters: kinds=${kindFilters.size > 0 ? Array.from(kindFilters).join(',') : '(all)'} refs=${refFilters.size > 0 ? Array.from(refFilters).join(',') : '(all)'}`,
    tokenWindowLine,
    '',
    '## Session Summary',
    summaryRaw.trim(),
    '',
    '## Continuity',
    formatContinuityPacketBlock(continuity),
    '',
    '## Latest Checkpoint',
    checkpointBlock,
    '',
    '## Related Checkpoints',
    relevantCheckpointBlock || '1. (none)',
    '',
    '## Event Log',
    eventBlock,
    '',
    '## Offload References',
    formatOffloadCanvasPacketBlock(offloadCanvas),
    '',
  ].join('\n');

  if (!input.outputPath) {
    return { markdown };
  }

  const outputPath = path.isAbsolute(input.outputPath)
    ? input.outputPath
    : path.resolve(input.workspaceRoot, input.outputPath);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await writeAtomicFile(outputPath, markdown);
  return { markdown, outputPath };
}

export interface SearchEventsInput {
  workspaceRoot: string;
  query?: string;
  project?: string;
  sessionId?: string;
  role?: EventRole;
  kinds?: string[];
  refs?: string[];
  limit?: number;
  semantic?: boolean;
  explain?: boolean;
}

export interface SearchEventsOutput {
  results: Array<IndexedEvent & { explain?: ContextDbSearchExplain }>;
}

export interface SearchCheckpointsInput {
  workspaceRoot: string;
  query?: string;
  project?: string;
  sessionId?: string;
  statuses?: SessionStatus[];
  limit?: number;
  semantic?: boolean;
  explain?: boolean;
}

export interface SearchCheckpointsOutput {
  results: Array<IndexedCheckpoint & { explain?: ContextDbSearchExplain }>;
}

export type SearchScope = 'events' | 'checkpoints' | 'all';

export type SearchMemoryResult =
  | ({ itemType: 'event' } & IndexedEvent & { explain?: ContextDbSearchExplain })
  | ({ itemType: 'checkpoint' } & IndexedCheckpoint & { explain?: ContextDbSearchExplain });

export interface SearchMemoryInput {
  workspaceRoot: string;
  query?: string;
  project?: string;
  sessionId?: string;
  role?: EventRole;
  kinds?: string[];
  refs?: string[];
  statuses?: SessionStatus[];
  limit?: number;
  semantic?: boolean;
  explain?: boolean;
  scope?: SearchScope;
}

export interface SearchMemoryOutput {
  results: SearchMemoryResult[];
}

export interface SessionRecallHighlight {
  itemType: 'event' | 'checkpoint';
  id: string;
  ts: string;
  label: string;
  text: string;
  refs: string[];
  score: number;
}

export interface SessionRecallScoreExplanation {
  formula: string;
  lexical: number;
  lexicalEventRank: number;
  lexicalEventText: number;
  lexicalCheckpointRank: number;
  lexicalCheckpointText: number;
  goalMatch: number;
  projectMatch: number;
  projectWeight: number;
  recencyDecay: number;
  recencyAgeHours: number;
  matchedEvents: number;
  matchedCheckpoints: number;
}

export interface SessionRecallResult {
  sessionId: string;
  agent: string;
  project: string;
  goal: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  matchScore: number;
  summary: string;
  highlights: SessionRecallHighlight[];
  scoreExplanation?: SessionRecallScoreExplanation;
}

export interface RecallSessionsInput {
  workspaceRoot: string;
  query?: string;
  project?: string;
  sessionId?: string;
  excludeSessionId?: string;
  limit?: number;
  highlightLimit?: number;
  explainScore?: boolean;
}

export interface RecallSessionsOutput {
  results: SessionRecallResult[];
}

function clipRecallText(text: unknown, maxChars: number = 180): string {
  const normalized = sanitizeInline(text);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(24, maxChars)).trimEnd()}…`;
}

interface RecallScoreAccumulator {
  eventHits: number;
  checkpointHits: number;
  eventRank: number;
  eventLexical: number;
  checkpointRank: number;
  checkpointLexical: number;
}

function roundRecallScore(value: number, digits: number = 4): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function getRecallScoreAccumulator(
  bySessionId: Map<string, RecallScoreAccumulator>,
  sessionId: string
): RecallScoreAccumulator {
  const existing = bySessionId.get(sessionId);
  if (existing) return existing;

  const created: RecallScoreAccumulator = {
    eventHits: 0,
    checkpointHits: 0,
    eventRank: 0,
    eventLexical: 0,
    checkpointRank: 0,
    checkpointLexical: 0,
  };
  bySessionId.set(sessionId, created);
  return created;
}

function computeRecallRecencyDecay(
  updatedAt: string,
  nowEpoch: number
): { score: number; ageHours: number } {
  const updatedEpoch = Date.parse(updatedAt);
  if (!Number.isFinite(updatedEpoch) || updatedEpoch <= 0 || !Number.isFinite(nowEpoch) || nowEpoch <= 0) {
    return { score: 0, ageHours: 0 };
  }

  const ageHours = Math.max(0, (nowEpoch - updatedEpoch) / (1000 * 60 * 60));
  // 72h half-life keeps recent sessions preferred while preserving older high-signal sessions.
  const score = Math.exp(-ageHours / 72);
  return {
    score: roundRecallScore(score),
    ageHours: roundRecallScore(ageHours, 2),
  };
}

async function listRecallSessionMetas(
  workspaceRoot: string,
  {
    project,
    sessionId,
    excludeSessionId,
  }: {
    project?: string;
    sessionId?: string;
    excludeSessionId?: string;
  }
): Promise<SessionMeta[]> {
  const sessionsRoot = path.join(getDbRoot(workspaceRoot), 'sessions');
  const entries = await fs.readdir(sessionsRoot, { withFileTypes: true }).catch(() => []);

  const metas: SessionMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const entryName = entry.name;
    if (sessionId && entryName !== sessionId) continue;
    if (excludeSessionId && entryName === excludeSessionId) continue;

    const metaPath = path.join(sessionsRoot, entryName, 'meta.json');
    if (!existsSync(metaPath)) continue;

    let meta: SessionMeta;
    try {
      meta = await readJson<SessionMeta>(metaPath);
    } catch {
      continue;
    }
    if (project && meta.project !== project) continue;
    metas.push(meta);
  }

  metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return metas;
}

function buildRecallSummary({
  query,
  latestCheckpoint,
  latestEvent,
  topCheckpointHighlight,
  topEventHighlight,
}: {
  query: string;
  latestCheckpoint: Checkpoint | null;
  latestEvent: ContextEvent | null;
  topCheckpointHighlight: SessionRecallHighlight | null;
  topEventHighlight: SessionRecallHighlight | null;
}): string {
  if (query) {
    if (topCheckpointHighlight && topCheckpointHighlight.score > 0) {
      return `Matched checkpoint: ${topCheckpointHighlight.text}`;
    }
    if (topEventHighlight && topEventHighlight.score > 0) {
      return `Matched event: ${topEventHighlight.text}`;
    }
    if (latestCheckpoint) {
      return `No direct query hit; latest checkpoint (${latestCheckpoint.status}): ${clipRecallText(latestCheckpoint.summary)}`;
    }
    if (latestEvent) {
      return `No direct query hit; latest event (${latestEvent.role}/${latestEvent.kind}): ${clipRecallText(latestEvent.text)}`;
    }
    return 'No checkpoints or events recorded yet.';
  }

  if (latestCheckpoint) {
    return `Latest checkpoint (${latestCheckpoint.status}): ${clipRecallText(latestCheckpoint.summary)}`;
  }
  if (latestEvent) {
    return `Latest event (${latestEvent.role}/${latestEvent.kind}): ${clipRecallText(latestEvent.text)}`;
  }
  return 'No checkpoints or events recorded yet.';
}

function isRecoverableSidecarError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /sqlite|database|no such table|cannot open/i.test(message);
}

async function ensureManifestAndIndexes(workspaceRoot: string): Promise<void> {
  const dbRoot = getDbRoot(workspaceRoot);
  await Promise.all([
    fs.mkdir(path.join(dbRoot, 'sessions'), { recursive: true }),
    fs.mkdir(path.join(dbRoot, 'index'), { recursive: true }),
    fs.mkdir(path.join(dbRoot, 'exports'), { recursive: true }),
  ]);
  const manifestPath = path.join(dbRoot, MANIFEST_NAME);
  if (!existsSync(manifestPath)) {
    await writeJson(manifestPath, {
      version: 1,
      layout: 'l0-l1-l2',
      description: 'Filesystem context database for multi-CLI agent memory',
      createdAt: nowIso(),
    });
  }
  await ensureFile(getSessionsIndexPath(workspaceRoot), '');
  await ensureFile(getEventsIndexPath(workspaceRoot), '');
  await ensureFile(getCheckpointsIndexPath(workspaceRoot), '');
}

function normalizeSeqFromUnknown(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const seq = Math.floor(value);
  return seq > 0 ? seq : 0;
}

export interface IndexSyncOutput {
  ok: true;
  mode: 'incremental';
  workspaceRoot: string;
  dbPath: string;
  forced: boolean;
  skippedByThrottle: boolean;
  scannedSessions: number;
  upsertedSessions: number;
  scannedEvents: number;
  upsertedEvents: number;
  scannedCheckpoints: number;
  upsertedCheckpoints: number;
  tookMs: number;
  syncedAt: string;
}

function shouldRunIncrementalIndexSync(workspaceRoot: string, force: boolean): boolean {
  if (force) return true;
  const now = Date.now();
  const lastRun = lastIncrementalSyncByWorkspace.get(workspaceRoot) ?? 0;
  return now - lastRun >= INDEX_INCREMENTAL_SYNC_INTERVAL_MS;
}

async function syncContextIndexIncremental(
  workspaceRoot: string,
  options?: { force?: boolean }
): Promise<IndexSyncOutput> {
  const startedAt = Date.now();
  const force = options?.force === true;
  const dbPath = getSqlitePath(workspaceRoot);
  if (!shouldRunIncrementalIndexSync(workspaceRoot, force)) {
    return {
      ok: true,
      mode: 'incremental',
      workspaceRoot,
      dbPath,
      forced: force,
      skippedByThrottle: true,
      scannedSessions: 0,
      upsertedSessions: 0,
      scannedEvents: 0,
      upsertedEvents: 0,
      scannedCheckpoints: 0,
      upsertedCheckpoints: 0,
      tookMs: Date.now() - startedAt,
      syncedAt: nowIso(),
    };
  }

  await ensureManifestAndIndexes(workspaceRoot);
  ensureSqliteSidecar(dbPath);
  const sessionsRoot = path.join(getDbRoot(workspaceRoot), 'sessions');
  const entries = await fs.readdir(sessionsRoot, { withFileTypes: true });
  let scannedSessions = 0;
  let upsertedSessions = 0;
  let scannedEvents = 0;
  let upsertedEvents = 0;
  let scannedCheckpoints = 0;
  let upsertedCheckpoints = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    scannedSessions += 1;
    const sessionId = entry.name;
    const paths = getSessionPaths(workspaceRoot, sessionId);
    if (!existsSync(paths.meta)) continue;

    let meta: SessionMeta;
    try {
      meta = await readJson<SessionMeta>(paths.meta);
    } catch {
      continue;
    }

    upsertSessionRow(dbPath, {
      sessionId: meta.sessionId,
      agent: meta.agent,
      project: meta.project,
      goal: meta.goal,
      tags: meta.tags,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    });
    upsertedSessions += 1;

    const indexedSeqs = getSessionIndexedSeqs(dbPath, meta.sessionId);
    let stateLastEventSeq = indexedSeqs.eventSeq;
    let stateLastCheckpointSeq = indexedSeqs.checkpointSeq;
    let hasStateFile = false;
    try {
      const state = await readJson<Record<string, unknown>>(paths.state);
      hasStateFile = true;
      stateLastEventSeq = Math.max(stateLastEventSeq, normalizeSeqFromUnknown(state.lastEventSeq));
      stateLastCheckpointSeq = Math.max(stateLastCheckpointSeq, normalizeSeqFromUnknown(state.lastCheckpointSeq));
    } catch {
      // Legacy sessions may not have a state file; continue with indexed maxima.
    }

    if (!hasStateFile || stateLastEventSeq > indexedSeqs.eventSeq) {
      const eventRows = await readJsonLines<ContextEvent>(paths.events);
      scannedEvents += eventRows.length;
      for (let index = 0; index < eventRows.length; index += 1) {
        const event = eventRows[index];
        const seq = typeof event.seq === 'number' && Number.isFinite(event.seq) && event.seq > 0
          ? Math.floor(event.seq)
          : index + 1;
        if (seq <= indexedSeqs.eventSeq) continue;
        const refs = normalizeRefs(event.refs ?? []);
        const turn = normalizeTurnEnvelope(event.turn);
        const ts = typeof event.ts === 'string' && event.ts.length > 0 ? event.ts : nowIso();
        const indexed: IndexedEvent = {
          eventId: `${meta.sessionId}#${seq}`,
          sessionId: meta.sessionId,
          seq,
          ts,
          tsEpoch: toEpoch(ts),
          project: meta.project,
          agent: meta.agent,
          role: event.role,
          kind: event.kind,
          text: event.text,
          refs,
          ...(turn ? { turn } : {}),
          textHash: hashText(sanitizeInline(event.text)),
          signatureHash: eventSignature({
            role: event.role,
            kind: event.kind,
            text: event.text,
            refs,
            turn,
          }),
        };
        upsertEventRow(dbPath, indexed);
        upsertedEvents += 1;
      }
    }

    if (!hasStateFile || stateLastCheckpointSeq > indexedSeqs.checkpointSeq) {
      const checkpointRows = await readJsonLines<Checkpoint>(paths.checkpoints);
      scannedCheckpoints += checkpointRows.length;
      for (let index = 0; index < checkpointRows.length; index += 1) {
        const checkpoint = checkpointRows[index];
        const seq = typeof checkpoint.seq === 'number' && Number.isFinite(checkpoint.seq) && checkpoint.seq > 0
          ? Math.floor(checkpoint.seq)
          : index + 1;
        if (seq <= indexedSeqs.checkpointSeq) continue;
        const ts = typeof checkpoint.ts === 'string' && checkpoint.ts.length > 0 ? checkpoint.ts : nowIso();
        const indexed: IndexedCheckpoint = {
          checkpointId: `${meta.sessionId}#C${seq}`,
          sessionId: meta.sessionId,
          seq,
          ts,
          tsEpoch: toEpoch(ts),
          project: meta.project,
          agent: meta.agent,
          status: checkpoint.status,
          summary: checkpoint.summary,
          nextActions: checkpoint.nextActions ?? [],
          artifacts: checkpoint.artifacts ?? [],
          telemetry: normalizeCheckpointTelemetry(checkpoint.telemetry),
        };
        upsertCheckpointRow(dbPath, indexed);
        upsertedCheckpoints += 1;
      }
    }
  }

  const finishedAt = Date.now();
  lastIncrementalSyncByWorkspace.set(workspaceRoot, finishedAt);
  return {
    ok: true,
    mode: 'incremental',
    workspaceRoot,
    dbPath,
    forced: force,
    skippedByThrottle: false,
    scannedSessions,
    upsertedSessions,
    scannedEvents,
    upsertedEvents,
    scannedCheckpoints,
    upsertedCheckpoints,
    tookMs: finishedAt - startedAt,
    syncedAt: nowIso(),
  };
}

export async function syncContextIndex(
  workspaceRoot: string,
  options?: { force?: boolean }
): Promise<IndexSyncOutput> {
  await ensureContextDb(workspaceRoot);
  return await syncContextIndexIncremental(workspaceRoot, options);
}

async function withSidecarReadFallback<T>(
  workspaceRoot: string,
  reader: () => T
): Promise<T> {
  const dbPath = getSqlitePath(workspaceRoot);
  if (!existsSync(dbPath)) {
    await rebuildContextIndex(workspaceRoot);
  }

  try {
    await syncContextIndexIncremental(workspaceRoot);
  } catch {
    // Fallback handled below if reader still fails.
  }

  try {
    return reader();
  } catch (error) {
    if (!isRecoverableSidecarError(error)) {
      throw error;
    }
    try {
      await syncContextIndexIncremental(workspaceRoot, { force: true });
      return reader();
    } catch {
      await rebuildContextIndex(workspaceRoot);
    }
    return reader();
  }
}

export interface RebuildIndexOutput {
  ok: true;
  workspaceRoot: string;
  dbPath: string;
  sessions: number;
  events: number;
  checkpoints: number;
  tookMs: number;
}

export async function rebuildContextIndex(workspaceRoot: string): Promise<RebuildIndexOutput> {
  const startedAt = Date.now();
  await ensureManifestAndIndexes(workspaceRoot);
  const dbPath = getSqlitePath(workspaceRoot);
  recreateSqliteSidecar(dbPath);

  const sessionsRoot = path.join(getDbRoot(workspaceRoot), 'sessions');
  const entries = await fs.readdir(sessionsRoot, { withFileTypes: true });

  let sessions = 0;
  let events = 0;
  let checkpoints = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionId = entry.name;
    const paths = getSessionPaths(workspaceRoot, sessionId);
    if (!existsSync(paths.meta)) continue;

    let meta: SessionMeta;
    try {
      meta = await readJson<SessionMeta>(paths.meta);
    } catch {
      continue;
    }

    upsertSessionRow(dbPath, {
      sessionId: meta.sessionId,
      agent: meta.agent,
      project: meta.project,
      goal: meta.goal,
      tags: meta.tags,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    });
    sessions += 1;

    const eventRows = await readJsonLines<ContextEvent>(paths.events);
    for (let index = 0; index < eventRows.length; index += 1) {
      const event = eventRows[index];
      const seq = typeof event.seq === 'number' && Number.isFinite(event.seq) && event.seq > 0
        ? Math.floor(event.seq)
        : index + 1;
      const refs = normalizeRefs(event.refs ?? []);
      const turn = normalizeTurnEnvelope(event.turn);
      const ts = typeof event.ts === 'string' && event.ts.length > 0 ? event.ts : nowIso();
      const indexed: IndexedEvent = {
        eventId: `${meta.sessionId}#${seq}`,
        sessionId: meta.sessionId,
        seq,
        ts,
        tsEpoch: toEpoch(ts),
        project: meta.project,
        agent: meta.agent,
        role: event.role,
        kind: event.kind,
        text: event.text,
        refs,
        ...(turn ? { turn } : {}),
        textHash: hashText(sanitizeInline(event.text)),
        signatureHash: eventSignature({
          role: event.role,
          kind: event.kind,
          text: event.text,
          refs,
          turn,
        }),
      };
      upsertEventRow(dbPath, indexed);
      events += 1;
    }

    const checkpointRows = await readJsonLines<Checkpoint>(paths.checkpoints);
    for (let index = 0; index < checkpointRows.length; index += 1) {
      const checkpoint = checkpointRows[index];
      const seq = typeof checkpoint.seq === 'number' && Number.isFinite(checkpoint.seq) && checkpoint.seq > 0
        ? Math.floor(checkpoint.seq)
        : index + 1;
      const ts = typeof checkpoint.ts === 'string' && checkpoint.ts.length > 0 ? checkpoint.ts : nowIso();
      const indexed: IndexedCheckpoint = {
        checkpointId: `${meta.sessionId}#C${seq}`,
        sessionId: meta.sessionId,
        seq,
        ts,
        tsEpoch: toEpoch(ts),
        project: meta.project,
        agent: meta.agent,
        status: checkpoint.status,
        summary: checkpoint.summary,
        nextActions: checkpoint.nextActions ?? [],
        artifacts: checkpoint.artifacts ?? [],
        telemetry: normalizeCheckpointTelemetry(checkpoint.telemetry),
      };
      upsertCheckpointRow(dbPath, indexed);
      checkpoints += 1;
    }
  }

  const finishedAt = Date.now();
  lastIncrementalSyncByWorkspace.set(workspaceRoot, finishedAt);
  return {
    ok: true,
    workspaceRoot,
    dbPath,
    sessions,
    events,
    checkpoints,
    tookMs: finishedAt - startedAt,
  };
}

export async function searchEvents(input: SearchEventsInput): Promise<SearchEventsOutput> {
  await ensureContextDb(input.workspaceRoot);
  const limit = input.limit && Number.isFinite(input.limit) ? Math.max(1, Math.floor(input.limit)) : 20;
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const semanticRequested = input.semantic === true && query.length > 0;
  const candidateLimit = semanticRequested ? Math.max(limit * 10, 100) : limit;

  const rows = await withSidecarReadFallback(input.workspaceRoot, () => {
    return searchEventRows(getSqlitePath(input.workspaceRoot), {
      project: input.project,
      sessionId: input.sessionId,
      role: input.role,
      kinds: (input.kinds ?? []).map((kind) => kind.trim()).filter((kind) => kind.length > 0),
      refs: normalizeRefs(input.refs ?? []),
      query: query.length > 0 ? query : undefined,
      limit: candidateLimit,
    });
  });

  let selectedRows = rows.slice(0, limit);
  if (semanticRequested) {
    try {
      const reranked = await semanticRerank(
        query,
        rows.map((row) => ({
          id: row.eventId,
          text: `${row.kind} ${row.text}`,
          value: row,
        })),
        limit
      );
      if (reranked && reranked.length > 0) {
        selectedRows = reranked.map((item) => item.value);
      } else {
        selectedRows = await withSidecarReadFallback(input.workspaceRoot, () => {
          return searchEventRows(getSqlitePath(input.workspaceRoot), {
            project: input.project,
            sessionId: input.sessionId,
            role: input.role,
            kinds: (input.kinds ?? []).map((kind) => kind.trim()).filter((kind) => kind.length > 0),
            refs: normalizeRefs(input.refs ?? []),
            query,
            limit,
          });
        });
      }
    } catch {
      selectedRows = await withSidecarReadFallback(input.workspaceRoot, () => {
        return searchEventRows(getSqlitePath(input.workspaceRoot), {
          project: input.project,
          sessionId: input.sessionId,
          role: input.role,
          kinds: (input.kinds ?? []).map((kind) => kind.trim()).filter((kind) => kind.length > 0),
          refs: normalizeRefs(input.refs ?? []),
          query,
          limit,
        });
      });
    }
  }

  const retrievalMode = semanticRequested ? 'semantic' : 'lexical';
  const results: Array<IndexedEvent & { explain?: ContextDbSearchExplain }> = selectedRows.map((row) => {
    const indexed: IndexedEvent & { explain?: ContextDbSearchExplain } = {
      eventId: row.eventId,
      sessionId: row.sessionId,
      seq: row.seq,
      ts: row.ts,
      tsEpoch: row.tsEpoch,
      project: row.project,
      agent: row.agent,
      role: row.role as EventRole,
      kind: row.kind,
      text: row.text,
      refs: row.refs,
      textHash: row.textHash,
      signatureHash: row.signatureHash,
    };
    if (input.explain === true) {
      indexed.explain = buildSearchExplain({
        query,
        text: `${row.kind} ${row.text} ${row.refs.join(' ')}`,
        retrievalMode,
        semanticScore: semanticRequested ? 1 : 0,
      });
    }
    return indexed;
  });
  return { results };
}

export async function searchCheckpoints(input: SearchCheckpointsInput): Promise<SearchCheckpointsOutput> {
  await ensureContextDb(input.workspaceRoot);
  const limit = input.limit && Number.isFinite(input.limit) ? Math.max(1, Math.floor(input.limit)) : 20;
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const semanticRequested = input.semantic === true && query.length > 0;
  const candidateLimit = semanticRequested ? Math.max(limit * 10, 100) : limit;

  const rows = await withSidecarReadFallback(input.workspaceRoot, () => {
    return searchCheckpointRows(getSqlitePath(input.workspaceRoot), {
      project: input.project,
      sessionId: input.sessionId,
      statuses: (input.statuses ?? []).map((status) => String(status).trim()).filter((status) => status.length > 0),
      query: query.length > 0 ? query : undefined,
      limit: candidateLimit,
    });
  });

  let selectedRows = rows.slice(0, limit);
  if (semanticRequested) {
    try {
      const reranked = await semanticRerank(
        query,
        rows.map((row) => ({
          id: row.checkpointId,
          text: `${row.status} ${row.summary} ${row.nextActions.join(' ')} ${row.artifacts.join(' ')}`,
          value: row,
        })),
        limit
      );
      if (reranked && reranked.length > 0) {
        selectedRows = reranked.map((item) => item.value);
      } else {
        selectedRows = await withSidecarReadFallback(input.workspaceRoot, () => {
          return searchCheckpointRows(getSqlitePath(input.workspaceRoot), {
            project: input.project,
            sessionId: input.sessionId,
            statuses: (input.statuses ?? []).map((status) => String(status).trim()).filter((status) => status.length > 0),
            query,
            limit,
          });
        });
      }
    } catch {
      selectedRows = await withSidecarReadFallback(input.workspaceRoot, () => {
        return searchCheckpointRows(getSqlitePath(input.workspaceRoot), {
          project: input.project,
          sessionId: input.sessionId,
          statuses: (input.statuses ?? []).map((status) => String(status).trim()).filter((status) => status.length > 0),
          query,
          limit,
        });
      });
    }
  }

  const retrievalMode = semanticRequested ? 'semantic' : 'lexical';
  const results: Array<IndexedCheckpoint & { explain?: ContextDbSearchExplain }> = selectedRows.map((row) => {
    const indexed: IndexedCheckpoint & { explain?: ContextDbSearchExplain } = {
      checkpointId: row.checkpointId,
      sessionId: row.sessionId,
      seq: row.seq,
      ts: row.ts,
      tsEpoch: row.tsEpoch,
      project: row.project,
      agent: row.agent,
      status: row.status as SessionStatus,
      summary: row.summary,
      nextActions: row.nextActions,
      artifacts: row.artifacts,
      telemetry: row.telemetry,
    };
    if (input.explain === true) {
      indexed.explain = buildSearchExplain({
        query,
        text: `${row.status} ${row.summary} ${row.nextActions.join(' ')} ${row.artifacts.join(' ')} ${row.telemetry?.failureCategory ?? ''}`,
        retrievalMode,
        semanticScore: semanticRequested ? 1 : 0,
      });
    }
    return indexed;
  });
  return { results };
}

export async function searchMemory(input: SearchMemoryInput): Promise<SearchMemoryOutput> {
  const scope = input.scope ?? 'all';
  const limit = input.limit && Number.isFinite(input.limit) ? Math.max(1, Math.floor(input.limit)) : 20;
  const results: SearchMemoryResult[] = [];

  if (scope === 'events' || scope === 'all') {
    const events = await searchEvents({
      workspaceRoot: input.workspaceRoot,
      query: input.query,
      project: input.project,
      sessionId: input.sessionId,
      role: input.role,
      kinds: input.kinds,
      refs: input.refs,
      limit: scope === 'all' ? Math.max(limit * 2, 50) : limit,
      semantic: input.semantic,
      explain: input.explain,
    });
    results.push(...events.results.map((item) => ({ itemType: 'event' as const, ...item })));
  }

  if (scope === 'checkpoints' || scope === 'all') {
    const checkpoints = await searchCheckpoints({
      workspaceRoot: input.workspaceRoot,
      query: input.query,
      project: input.project,
      sessionId: input.sessionId,
      statuses: input.statuses,
      limit: scope === 'all' ? Math.max(limit * 2, 50) : limit,
      semantic: input.semantic,
      explain: input.explain,
    });
    results.push(...checkpoints.results.map((item) => ({ itemType: 'checkpoint' as const, ...item })));
  }

  results.sort((a, b) => b.tsEpoch - a.tsEpoch);
  return { results: results.slice(0, limit) };
}

export async function recallSessions(input: RecallSessionsInput): Promise<RecallSessionsOutput> {
  await ensureContextDb(input.workspaceRoot);
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const explainScore = input.explainScore === true;
  const limit = input.limit && Number.isFinite(input.limit)
    ? Math.min(20, Math.max(1, Math.floor(input.limit)))
    : 3;
  const highlightLimit = input.highlightLimit && Number.isFinite(input.highlightLimit)
    ? Math.min(8, Math.max(1, Math.floor(input.highlightLimit)))
    : 3;

  const metas = await listRecallSessionMetas(input.workspaceRoot, {
    project: input.project,
    sessionId: input.sessionId,
    excludeSessionId: input.excludeSessionId,
  });
  if (metas.length === 0) {
    return { results: [] };
  }

  const metaBySessionId = new Map(metas.map((item) => [item.sessionId, item]));
  const nowEpoch = Date.now();
  const queryTokens = query ? tokenizeForRecall(query) : [];
  const hasQuery = queryTokens.length > 0;

  const eventHitsBySessionId = new Map<string, IndexedEvent[]>();
  const checkpointHitsBySessionId = new Map<string, IndexedCheckpoint[]>();
  const scoreAccumulatorBySessionId = new Map<string, RecallScoreAccumulator>();

  if (hasQuery) {
    const candidateLimit = Math.min(500, Math.max(limit * 40, 120));
    const [eventHits, checkpointHits] = await Promise.all([
      searchEvents({
        workspaceRoot: input.workspaceRoot,
        query,
        project: input.project,
        limit: candidateLimit,
        semantic: false,
      }),
      searchCheckpoints({
        workspaceRoot: input.workspaceRoot,
        query,
        project: input.project,
        limit: candidateLimit,
        semantic: false,
      }),
    ]);

    for (let index = 0; index < eventHits.results.length; index += 1) {
      const hit = eventHits.results[index];
      const meta = metaBySessionId.get(hit.sessionId);
      if (!meta) continue;

      const bucket = eventHitsBySessionId.get(hit.sessionId) ?? [];
      if (bucket.length < highlightLimit * 4) {
        bucket.push(hit);
      }
      eventHitsBySessionId.set(hit.sessionId, bucket);

      const rankWeight = 1 / (index + 1);
      const lexicalScore = scoreRecallText(queryTokens, `${hit.kind} ${hit.text} ${hit.refs.join(' ')}`);
      const accumulator = getRecallScoreAccumulator(scoreAccumulatorBySessionId, hit.sessionId);
      accumulator.eventHits += 1;
      accumulator.eventRank += (rankWeight * 0.55);
      accumulator.eventLexical += (lexicalScore * 0.45);
    }

    for (let index = 0; index < checkpointHits.results.length; index += 1) {
      const hit = checkpointHits.results[index];
      const meta = metaBySessionId.get(hit.sessionId);
      if (!meta) continue;

      const bucket = checkpointHitsBySessionId.get(hit.sessionId) ?? [];
      if (bucket.length < highlightLimit * 4) {
        bucket.push(hit);
      }
      checkpointHitsBySessionId.set(hit.sessionId, bucket);

      const rankWeight = 1 / (index + 1);
      const lexicalScore = scoreRecallText(
        queryTokens,
        `${hit.status} ${hit.summary} ${hit.nextActions.join(' ')} ${hit.artifacts.join(' ')}`
      );
      const accumulator = getRecallScoreAccumulator(scoreAccumulatorBySessionId, hit.sessionId);
      accumulator.checkpointHits += 1;
      accumulator.checkpointRank += (rankWeight * 0.65);
      accumulator.checkpointLexical += (lexicalScore * 0.55);
    }
  }

  const candidates = hasQuery
    ? metas
      .filter((meta) => {
        const accumulator = scoreAccumulatorBySessionId.get(meta.sessionId);
        return Boolean(accumulator && (accumulator.eventHits > 0 || accumulator.checkpointHits > 0));
      })
      .slice(0, Math.max(limit * 6, 30))
    : metas.slice(0, Math.max(limit, 10));

  const results: SessionRecallResult[] = [];
  for (const meta of candidates) {
    const paths = getSessionPaths(input.workspaceRoot, meta.sessionId);
    const [latestCheckpoint, latestEvent] = await Promise.all([
      readLastJsonLine<Checkpoint>(paths.checkpoints),
      readLastJsonLine<ContextEvent>(paths.events),
    ]);

    const topCheckpointHits = (checkpointHitsBySessionId.get(meta.sessionId) ?? [])
      .slice(0, highlightLimit)
      .map((hit, index): SessionRecallHighlight => {
        const score = Number((1 / (index + 1)).toFixed(4));
        return {
          itemType: 'checkpoint',
          id: hit.checkpointId,
          ts: hit.ts,
          label: `checkpoint/${hit.status}`,
          text: clipRecallText(hit.summary),
          refs: normalizeRefs(hit.artifacts),
          score,
        };
      });

    const remainingEventHighlights = Math.max(0, highlightLimit - topCheckpointHits.length);
    const topEventHits = (eventHitsBySessionId.get(meta.sessionId) ?? [])
      .slice(0, remainingEventHighlights)
      .map((hit, index): SessionRecallHighlight => {
        const score = Number((1 / (index + 1)).toFixed(4));
        return {
          itemType: 'event',
          id: hit.eventId,
          ts: hit.ts,
          label: `${hit.role}/${hit.kind}`,
          text: clipRecallText(hit.text),
          refs: normalizeRefs(hit.refs),
          score,
        };
      });

    const highlights = [...topCheckpointHits, ...topEventHits];
    if (!hasQuery) {
      if (latestCheckpoint) {
        highlights.push({
          itemType: 'checkpoint',
          id: latestCheckpoint.seq ? `${meta.sessionId}#C${latestCheckpoint.seq}` : `${meta.sessionId}#C?`,
          ts: latestCheckpoint.ts,
          label: `checkpoint/${latestCheckpoint.status}`,
          text: clipRecallText(latestCheckpoint.summary),
          refs: normalizeRefs(latestCheckpoint.artifacts),
          score: 0,
        });
      } else if (latestEvent) {
        highlights.push({
          itemType: 'event',
          id: latestEvent.seq ? `${meta.sessionId}#${latestEvent.seq}` : `${meta.sessionId}#?`,
          ts: latestEvent.ts,
          label: `${latestEvent.role}/${latestEvent.kind}`,
          text: clipRecallText(latestEvent.text),
          refs: normalizeRefs(latestEvent.refs),
          score: 0,
        });
      }
    }

    const topCheckpointHighlight = highlights.find((item) => item.itemType === 'checkpoint') ?? null;
    const topEventHighlight = highlights.find((item) => item.itemType === 'event') ?? null;
    const summary = buildRecallSummary({
      query,
      latestCheckpoint,
      latestEvent,
      topCheckpointHighlight,
      topEventHighlight,
    });

    const scoreAccumulator = scoreAccumulatorBySessionId.get(meta.sessionId) ?? null;
    const lexicalEventRank = scoreAccumulator?.eventRank ?? 0;
    const lexicalEventText = scoreAccumulator?.eventLexical ?? 0;
    const lexicalCheckpointRank = scoreAccumulator?.checkpointRank ?? 0;
    const lexicalCheckpointText = scoreAccumulator?.checkpointLexical ?? 0;
    const lexical = lexicalEventRank + lexicalEventText + lexicalCheckpointRank + lexicalCheckpointText;
    const goalMatch = hasQuery ? scoreRecallText(queryTokens, `${meta.goal}`) : 0;
    const projectMatch = hasQuery ? scoreRecallText(queryTokens, `${meta.project}`) : 0;
    const recency = hasQuery ? computeRecallRecencyDecay(meta.updatedAt, nowEpoch) : { score: 0, ageHours: 0 };
    const projectWeight = hasQuery ? (1 + (projectMatch * 0.35)) : 1;
    const combinedScore = hasQuery
      ? (lexical + (goalMatch * 0.35) + (recency.score * 0.25)) * projectWeight
      : 0;
    const status = latestCheckpoint?.status ?? meta.status;
    const matchScore = hasQuery ? roundRecallScore(combinedScore) : 0;
    const scoreExplanation = hasQuery && explainScore
      ? {
        formula: 'total=(lexical + goalMatch*0.35 + recencyDecay*0.25) * (1 + projectMatch*0.35)',
        lexical: roundRecallScore(lexical),
        lexicalEventRank: roundRecallScore(lexicalEventRank),
        lexicalEventText: roundRecallScore(lexicalEventText),
        lexicalCheckpointRank: roundRecallScore(lexicalCheckpointRank),
        lexicalCheckpointText: roundRecallScore(lexicalCheckpointText),
        goalMatch: roundRecallScore(goalMatch),
        projectMatch: roundRecallScore(projectMatch),
        projectWeight: roundRecallScore(projectWeight),
        recencyDecay: roundRecallScore(recency.score),
        recencyAgeHours: roundRecallScore(recency.ageHours, 2),
        matchedEvents: scoreAccumulator?.eventHits ?? 0,
        matchedCheckpoints: scoreAccumulator?.checkpointHits ?? 0,
      }
      : undefined;

    results.push({
      sessionId: meta.sessionId,
      agent: meta.agent,
      project: meta.project,
      goal: meta.goal,
      status,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      matchScore,
      summary,
      highlights: highlights.slice(0, highlightLimit),
      ...(scoreExplanation ? { scoreExplanation } : {}),
    });
  }

  if (hasQuery) {
    results.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  } else {
    results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  return { results: results.slice(0, limit) };
}

export interface GetEventByIdInput {
  workspaceRoot: string;
  eventId: string;
}

export interface GetEventByIdOutput {
  eventId: string;
  sessionId: string;
  project: string;
  agent: string;
  event: ContextEvent | null;
}

export async function getEventById(input: GetEventByIdInput): Promise<GetEventByIdOutput> {
  const matched = input.eventId.match(/^(.*)#(\d+)$/);
  if (!matched) {
    throw new Error('eventId must match "<sessionId>#<seq>"');
  }
  const sessionId = matched[1];
  const seq = Number(matched[2]);
  if (!Number.isFinite(seq) || seq <= 0) {
    throw new Error('eventId sequence must be a positive integer');
  }

  await ensureContextDb(input.workspaceRoot);
  const [meta, indexed] = await Promise.all([
    getSessionMeta(input.workspaceRoot, sessionId),
    withSidecarReadFallback(input.workspaceRoot, () => getEventRowById(getSqlitePath(input.workspaceRoot), input.eventId)),
  ]);

  if (indexed) {
    return {
      eventId: input.eventId,
      sessionId,
      project: meta.project,
      agent: meta.agent,
      event: {
        seq: indexed.seq,
        ts: indexed.ts,
        role: indexed.role as EventRole,
        kind: indexed.kind,
        text: indexed.text,
        refs: indexed.refs,
        ...(indexed.turn ? { turn: indexed.turn } : {}),
      },
    };
  }

  const events = await readJsonLines<ContextEvent>(getSessionPaths(input.workspaceRoot, sessionId).events);
  const bySeq = events.find((event) => event.seq === seq) ?? null;
  const fallback = events[seq - 1] ?? null;
  return {
    eventId: input.eventId,
    sessionId,
    project: meta.project,
    agent: meta.agent,
    event: bySeq ?? fallback,
  };
}

export interface BuildTimelineInput {
  workspaceRoot: string;
  project?: string;
  sessionId?: string;
  limit?: number;
}

export interface BuildTimelineOutput {
  items: TimelineEntry[];
}

export async function buildTimeline(input: BuildTimelineInput): Promise<BuildTimelineOutput> {
  await ensureContextDb(input.workspaceRoot);
  const limit = input.limit && Number.isFinite(input.limit) ? Math.max(1, Math.floor(input.limit)) : 50;
  const [events, checkpoints] = await withSidecarReadFallback(input.workspaceRoot, () => {
    return [
      timelineEventRows(getSqlitePath(input.workspaceRoot), {
        project: input.project,
        sessionId: input.sessionId,
        limit,
      }),
      timelineCheckpointRows(getSqlitePath(input.workspaceRoot), {
        project: input.project,
        sessionId: input.sessionId,
        limit,
      }),
    ] as const;
  });

  const entries: TimelineEntry[] = [
    ...events.map((event): TimelineEntry => ({
      itemType: 'event',
      ts: event.ts,
      tsEpoch: event.tsEpoch,
      project: event.project,
      sessionId: event.sessionId,
      agent: event.agent,
      label: `${event.role}/${event.kind}`,
      details: sanitizeInline(event.text),
      refs: event.refs,
      id: event.eventId,
    })),
    ...checkpoints.map((checkpoint): TimelineEntry => ({
      itemType: 'checkpoint',
      ts: checkpoint.ts,
      tsEpoch: checkpoint.tsEpoch,
      project: checkpoint.project,
      sessionId: checkpoint.sessionId,
      agent: checkpoint.agent,
      label: `checkpoint/${checkpoint.status}`,
      details: sanitizeInline(checkpoint.summary),
      refs: checkpoint.artifacts,
      id: checkpoint.checkpointId,
    })),
  ];

  entries.sort((a, b) => b.tsEpoch - a.tsEpoch);
  return { items: entries.slice(0, limit) };
}
