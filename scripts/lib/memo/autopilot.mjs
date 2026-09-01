import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resolveContextDbRoot } from '../aios/state-root.mjs';
import { assertWorkspaceMemoryContentSafe } from './safety.mjs';
import { appendMemoEvent, getActiveMemoStorage, listMemoEvents } from './storage.mjs';
import { collectEvents } from './storage/events-read.mjs';
import { recordMemoRecallFeedback } from './storage/feedback.mjs';
import { appendText, sha256Hex } from './storage/fs-io.mjs';
import { stripMemoryDeclaration } from './declaration.mjs';

export const AUTO_MEMORY_POLICY_REVISION = 'auto-memory-v1';
export const AUTO_MEMORY_RECEIPT_FILE = 'memory-events.jsonl';
const MAX_TASK_CHARS = 420;
const MAX_RESULT_CHARS = 900;
const MAX_CONCLUSION_CHARS = 400;
const MAX_MEMO_CHARS = 2_000;
const AUTO_SCAN_LIMIT = 5_000;

function text(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

function clip(value, max) {
  const normalized = text(value);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function redactSecrets(value) {
  return String(value ?? '')
    .replace(/((?:api[_-]?key|access[_-]?token|auth(?:orization)?|password|secret|private[_-]?key)\s*[:=]\s*)[^\s,;]+/giu, '$1[REDACTED]')
    .replace(/\b(?:sk|rk|ghp|xoxb|xapp)-[A-Za-z0-9_-]{12,}\b/gu, '[REDACTED_TOKEN]');
}

function normalizeAgent(value) {
  return text(value).toLowerCase();
}

function normalizeRefs(refs = []) {
  const values = Array.isArray(refs) ? refs : [refs];
  return [...new Set(values.map((item) => text(item)).filter(Boolean))].slice(0, 24);
}

function memoryReceiptPath(rootDir, env = process.env) {
  return path.join(
    resolveContextDbRoot(rootDir, { preferLegacyExisting: true, env }),
    'telemetry',
    AUTO_MEMORY_RECEIPT_FILE,
  );
}

async function writeMemoryReceipt(rootDir, receipt, env = process.env) {
  await appendText(memoryReceiptPath(rootDir, env), `${JSON.stringify({
    schemaVersion: 1,
    kind: 'aios.memory-receipt',
    at: new Date().toISOString(),
    ...receipt,
  })}\n`);
}

function buildAutoRuntimeIdentity({ agent = '', sessionId = '', runId = '', sourceRef = '', content = '', shared = false } = {}) {
  const normalizedAgent = normalizeAgent(agent) || 'aios-agent';
  const normalizedSourceRef = text(sourceRef) || `auto-memory:${sessionId || 'anonymous'}:${Date.now()}`;
  return {
    producerType: 'runtime',
    principalId: 'aios:auto-memory',
    agentId: normalizedAgent,
    role: 'assistant',
    sessionId: text(sessionId),
    runId: text(runId) || normalizedSourceRef,
    policyRevision: AUTO_MEMORY_POLICY_REVISION,
    sourceRef: normalizedSourceRef,
    sourceHash: sha256Hex(String(content ?? '')),
    capabilities: shared ? ['memo:publish-shared'] : [],
  };
}

/* Verification is a semantic judgment that belongs to the agent that ran the
 * turn, not to a regex scanning free-form prose. The agent declares it in the
 * trailing memory declaration block (see declaration.mjs); the harness only
 * parses that block. `run.mjs` triggers a memory write ONLY when the model
 * declared verified=yes — the program never infers verification itself. */

export function inferAutomaticVerification({ explicit = undefined } = {}) {
  // Retained only as an explicit-pass-through for callers that already hold a
  // model-declared boolean. No regex/evidence inference ever runs here.
  if (typeof explicit === 'boolean') return explicit;
  return false;
}

/* The takeaway is the model's call, expressed through the declaration block's
 * `conclusion=` field — not a cue-word guess over free-form prose. The program
 * only clips whatever the model declared, and returns '' when nothing was
 * declared (the memo then simply omits the Conclusion line rather than risking
 * a fabricated takeaway). */
export function extractConclusionSentence(response = '', { declared = '' } = {}) {
  const value = text(declared);
  return value ? clip(value, MAX_CONCLUSION_CHARS) : '';
}

export function buildAutomaticMemoryText({
  prompt = '',
  response = '',
  summary = '',
  outcome = 'success',
  refs = [],
  directText = '',
  declaredConclusion = '',
} = {}) {
  if (directText) return clip(redactSecrets(directText), MAX_MEMO_CHARS);
  // Strip the memory declaration block first so protocol metadata (and its
  // conclusion= keyword) never leaks into the persisted memo text.
  const source = redactSecrets(stripMemoryDeclaration(response || summary));
  const task = clip(redactSecrets(prompt), MAX_TASK_CHARS);
  const result = clip(source, MAX_RESULT_CHARS);
  const conclusion = extractConclusionSentence(source, { declared: declaredConclusion });
  const changed = normalizeRefs(refs).filter((ref) => !ref.startsWith('auto-') && !ref.startsWith('contextdb:'));
  const refText = normalizeRefs(refs);
  const lines = [];
  // Field order is excerpt-aware: turn-recall injects only the head of each
  // hit, so Changed/Conclusion — the highest decision value per char — come
  // before the verbatim Task/Result echo.
  if (changed.length > 0) lines.push(`Changed: ${changed.slice(0, 8).join(', ')}`);
  if (conclusion) lines.push(`Conclusion: ${conclusion}`);
  if (task) lines.push(`Task: ${task}`);
  if (result) lines.push(`Result: ${result}`);
  lines.push(`Outcome: ${text(outcome) || 'success'}`);
  if (refText.length > 0) lines.push(`Refs: ${refText.join(', ')}`);
  return clip(lines.join('\n'), MAX_MEMO_CHARS);
}

/* Whether a turn is worth persisting is the model's judgment, expressed by the
 * `verified=yes` declaration. The program only guards against structurally empty
 * memos (a deterministic length floor), never guesses "was this just a greeting /
 * a thank-you" from a word list. */
function isUsefulMemory(textValue) {
  return text(textValue).length >= 12;
}

async function findExistingAutoMemory({ workspaceRoot, storage, space, agent, sourceRef }) {
  if (!sourceRef) return null;
  const rows = await listMemoEvents(workspaceRoot, {
    storage,
    space,
    limit: AUTO_SCAN_LIMIT,
    agent,
    includeCandidates: true,
    includeInvalid: true,
  });
  return rows.find((row) => Array.isArray(row.refs) && row.refs.includes(sourceRef)) || null;
}

/**
 * Persist a useful result without requiring a human to run `memo add`.
 * Unverified results stay in the current agent namespace; only verified
 * results can enter project_shared recall.
 */
export async function recordAutomaticMemory({
  workspaceRoot,
  sessionId = '',
  agent = '',
  turnId = '',
  runId = '',
  prompt = '',
  response = '',
  summary = '',
  outcome = 'success',
  refs = [],
  verified = false,
  directText = '',
  declaredConclusion = '',
  scope = '',
  supersedes = [],
  sourceRef = '',
  env = process.env,
} = {}) {
  if (!workspaceRoot) return { status: 'skipped', reason: 'missing-root' };
  const normalizedAgent = normalizeAgent(agent) || 'aios-agent';
  const stableRef = text(sourceRef) || `auto-memory:${text(sessionId) || 'anonymous'}:${text(turnId) || sha256Hex(`${prompt}\n${response}`).slice(0, 16)}`;
  const memoryText = buildAutomaticMemoryText({ prompt, response, summary, outcome, refs, directText, declaredConclusion });
  if (!isUsefulMemory(memoryText)) {
    const result = { status: 'skipped', reason: 'too-short', sourceRef: stableRef };
    await writeMemoryReceipt(workspaceRoot, { operation: 'write', ...result }, env).catch(() => {});
    return result;
  }

  const safeScan = (() => {
    try {
      assertWorkspaceMemoryContentSafe(memoryText, { target: 'automatic memory' });
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  })();
  if (!safeScan.ok) {
    const result = { status: 'skipped', reason: 'unsafe-content', detail: clip(safeScan.reason, 160), sourceRef: stableRef };
    await writeMemoryReceipt(workspaceRoot, { operation: 'write', ...result }, env).catch(() => {});
    return result;
  }

  const storage = await getActiveMemoStorage(workspaceRoot, { env });
  const existing = await findExistingAutoMemory({
    workspaceRoot,
    storage,
    space: 'default',
    agent: normalizedAgent,
    sourceRef: stableRef,
  });
  if (existing) {
    const result = { status: 'duplicate', target: 'memo', eventId: existing.eventId, sourceRef: stableRef };
    await writeMemoryReceipt(workspaceRoot, { operation: 'write', ...result }, env).catch(() => {});
    return result;
  }

  // A failed or blocked turn is not a durable fact about the project. Keep it
  // as private working memory even when the text happens to claim success.
  const failedOutcome = ['failed', 'error', 'blocked', 'retry-needed'].includes(text(outcome).toLowerCase());
  const normalizedScope = scope || (verified && !failedOutcome ? 'project_shared' : 'agent_private');
  const identity = buildAutoRuntimeIdentity({
    agent: normalizedAgent,
    sessionId,
    runId,
    sourceRef: stableRef,
    content: memoryText,
    shared: normalizedScope === 'project_shared',
  });
  try {
    const event = await appendMemoEvent({
      workspaceRoot,
      storage,
      space: 'default',
      text: memoryText,
      refs: [...normalizeRefs(refs), stableRef],
      scope: normalizedScope,
      agent: normalizedAgent,
      supersedes: normalizeRefs(supersedes),
      runtimeIdentity: identity,
      turn: {
        turnId: text(turnId),
        turnType: 'side',
        environment: 'auto-memory',
        hindsightStatus: 'evaluated',
        outcome: text(outcome) || 'success',
        verified: Boolean(verified),
      },
      env,
    });
    const result = {
      status: 'saved',
      target: 'memo',
      eventId: event.eventId,
      claimStatus: event.claimStatus,
      scope: event.scope,
      verified: Boolean(verified),
      sourceRef: stableRef,
    };
    await writeMemoryReceipt(workspaceRoot, { operation: 'write', ...result }, env).catch(() => {});
    return result;
  } catch (error) {
    const result = { status: 'error', reason: clip(error?.message || error, 180), sourceRef: stableRef };
    await writeMemoryReceipt(workspaceRoot, { operation: 'write', ...result }, env).catch(() => {});
    return result;
  }
}

/**
 * Promotion path for governed session auto memories. `recordAutomaticSessionMemory`
 * is intentionally gone: persisting a session is the model/human's judgment
 * (expressed through the governed session-close candidate path), never a program
 * side effect. When a human promotes that candidate, this walks the session's
 * private auto memories and appends verified `project_shared` events superseding
 * them, so promotion publishes the full session knowledge, not just the summary.
 *
 * Authorization is inherited from the candidate promotion decision made by the
 * caller (`decideCandidate`); this function must not be exposed as a standalone
 * CLI verb.
 */
export async function promoteAutoMemoriesForSession({
  workspaceRoot,
  sessionId = '',
  agent = '',
  storage = '',
  space = 'default',
  promotionOf = '',
  env = process.env,
} = {}) {
  if (!workspaceRoot || !sessionId) return { status: 'skipped', reason: 'missing-root-or-session', promoted: [] };
  const storageName = text(storage) || await getActiveMemoStorage(workspaceRoot, { env });
  const prefix = `auto-session:${text(sessionId)}`;
  let rows = [];
  try {
    // Raw event stream: the visibility filter hides agent_private rows when no
    // agent is supplied, and promotion must see every private row regardless
    // of which runtime performs the governed promotion.
    rows = (await collectEvents(workspaceRoot, { storage: storageName, space })).events || [];
  } catch {
    return { status: 'skipped', reason: 'events-unreadable', promoted: [] };
  }
  const superseded = new Set(rows.flatMap((row) => Array.isArray(row.supersedes) ? row.supersedes : []));
  const targets = rows.filter((row) =>
    row.kind === 'memo'
    && row.scope === 'agent_private'
    && !superseded.has(row.eventId)
    && (String(row.provenance?.sourceRef || '') === prefix
      || (Array.isArray(row.refs) && row.refs.includes(prefix))));
  const promoted = [];
  for (const target of targets) {
    try {
      const event = await appendMemoEvent({
        workspaceRoot,
        storage: storageName,
        space,
        text: target.text,
        refs: Array.isArray(target.refs) ? target.refs : [],
        scope: 'project_shared',
        agent: text(agent) || text(target.agent),
        validAt: target.validAt,
        supersedes: [target.eventId],
        promotionOf: text(promotionOf),
        runtimeIdentity: buildAutoRuntimeIdentity({
          agent: text(agent) || text(target.agent),
          sessionId: text(sessionId),
          sourceRef: `${prefix}:promoted`,
          content: target.text,
          shared: true,
        }),
        env,
      });
      promoted.push({ eventId: event.eventId, superseded: target.eventId, claimStatus: event.claimStatus });
    } catch {
      // Non-fatal: the candidate promotion itself already succeeded.
    }
  }
  return { status: promoted.length > 0 ? 'promoted' : 'nothing-to-promote', promoted };
}

/**
 * Positive side of the recall feedback loop. Consumers (agent runtime, CLI)
 * call this when a recalled memo actually shaped the outcome; search boosts
 * those events and decays repeatedly-surfaced-but-never-adopted ones.
 */
export async function markMemoUseful({
  workspaceRoot,
  eventIds = [],
  query = '',
  sessionId = '',
  agent = '',
  env = process.env,
} = {}) {
  return recordMemoRecallFeedback({
    workspaceRoot, eventIds, query, sessionId, agent, signal: 'useful', env,
  });
}
