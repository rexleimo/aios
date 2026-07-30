import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resolveContextDbRoot } from '../../aios/state-root.mjs';
import { appendMemoEvent } from './events-write.mjs';
import { collectEvents, readJsonlEvents } from './events-read.mjs';
import { appendText, sha256Hex } from './fs-io.mjs';
import { getActiveMemoStorage } from './config.mjs';
import { normalizeRuntimeIdentity } from './provenance.mjs';

const GOVERNANCE_FILE = 'memory-candidates.jsonl';
const SESSION_CANDIDATE_FILE = 'session-close-memory-candidate.json';
const ACTIONS = new Set(['promote', 'reject', 'expire']);
const TERMINAL_STATUS = Object.freeze({
  promote: 'promoted',
  reject: 'rejected',
  expire: 'expired',
});

function text(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function governancePath(workspaceRoot, env = process.env) {
  return path.join(
    resolveContextDbRoot(workspaceRoot, { preferLegacyExisting: true, env }),
    'governance',
    GOVERNANCE_FILE,
  );
}

function stableCandidateHash(candidate) {
  return sha256Hex(JSON.stringify({
    candidateId: candidate.candidateId,
    sourceType: candidate.sourceType,
    createdAt: candidate.createdAt,
    scope: candidate.scope,
    role: candidate.role,
    text: candidate.text,
    refs: candidate.refs,
    provenance: candidate.provenance || null,
    source: candidate.source || null,
  }));
}

function publicCandidate(candidate, { includeText = false } = {}) {
  return {
    candidateId: candidate.candidateId,
    sourceType: candidate.sourceType,
    status: candidate.status,
    createdAt: candidate.createdAt,
    scope: candidate.scope,
    role: candidate.role,
    refCount: candidate.refs.length,
    sourceHash: candidate.sourceHash,
    ...(includeText ? { text: candidate.text, refs: candidate.refs } : {}),
    ...(candidate.lastReceipt ? { lastReceipt: candidate.lastReceipt } : {}),
  };
}

async function memoCandidates(workspaceRoot, { storage, space = '' } = {}) {
  const resolvedStorage = storage || await getActiveMemoStorage(workspaceRoot);
  const { events } = await collectEvents(workspaceRoot, {
    storage: resolvedStorage,
    ...(space ? { space } : {}),
    tolerateMalformed: false,
  });
  return events
    .filter((event) => event.scope === 'project_shared' && event.claimStatus === 'candidate')
    .map((event) => ({
      candidateId: event.eventId,
      sourceType: 'memo-event',
      storage: resolvedStorage,
      space: event.space,
      createdAt: event.ts,
      scope: event.scope,
      role: event.role,
      text: event.text,
      refs: Array.isArray(event.refs) ? event.refs : [],
      validAt: event.validAt,
      turn: event.turn,
      provenance: event.provenance,
      source: { kind: 'memo-event', eventId: event.eventId },
    }));
}

async function sessionCandidates(workspaceRoot, env = process.env) {
  const sessionsRoot = path.join(
    resolveContextDbRoot(workspaceRoot, { preferLegacyExisting: true, env }),
    'sessions',
  );
  let entries = [];
  try {
    entries = await fs.readdir(sessionsRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const candidates = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(sessionsRoot, entry.name, SESSION_CANDIDATE_FILE);
    try {
      const candidate = JSON.parse(await fs.readFile(filePath, 'utf8'));
      if (candidate?.claimStatus !== 'candidate' || !candidate?.candidateId) continue;
      candidates.push({
        candidateId: String(candidate.candidateId),
        sourceType: 'session-close',
        storage: '',
        space: 'default',
        createdAt: String(candidate.createdAt || ''),
        scope: 'project_shared',
        role: String(candidate.role || 'assistant'),
        text: String(candidate.text || ''),
        refs: Array.isArray(candidate.refs) ? candidate.refs.map(String) : [],
        validAt: String(candidate.createdAt || ''),
        turn: candidate.turn,
        provenance: null,
        source: candidate.source || { kind: 'contextdb-session', sessionId: candidate.sessionId },
        sourcePath: filePath,
      });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return candidates;
}

export async function readCandidateGovernanceReceipts({
  workspaceRoot,
  candidateId = '',
  env = process.env,
} = {}) {
  if (!workspaceRoot) throw new Error('readCandidateGovernanceReceipts requires workspaceRoot');
  const { events } = await readJsonlEvents(governancePath(workspaceRoot, env), { tolerateMalformed: false });
  return events
    .filter((receipt) => receipt?.kind === 'memory.candidate-governance-receipt')
    .filter((receipt) => !candidateId || receipt.candidateId === candidateId)
    .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
}

export function foldCandidateTerminalStates(receipts = []) {
  const states = new Map();
  for (const receipt of receipts) {
    if (receipt?.decision !== 'ALLOW' || !TERMINAL_STATUS[receipt.action] || !receipt.candidateId) continue;
    states.set(receipt.candidateId, {
      status: TERMINAL_STATUS[receipt.action],
      lastReceipt: receipt,
    });
  }
  return states;
}

function pendingCandidateState() {
  return { status: 'pending', lastReceipt: null };
}

async function collectCandidates(options) {
  const { workspaceRoot, storage, space = '', env = process.env } = options;
  const [memo, sessions, receipts] = await Promise.all([
    memoCandidates(workspaceRoot, { storage, space }),
    sessionCandidates(workspaceRoot, env),
    readCandidateGovernanceReceipts({ workspaceRoot, env }),
  ]);
  const terminalStates = foldCandidateTerminalStates(receipts);
  return [...memo, ...sessions]
    .map((candidate) => {
      const state = terminalStates.get(candidate.candidateId) || pendingCandidateState();
      const normalized = {
        ...candidate,
        status: state.status,
        lastReceipt: state.lastReceipt,
      };
      return { ...normalized, sourceHash: stableCandidateHash(normalized) };
    })
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function hasBrokerReviewAuthority() {
  return false;
}

export async function listMemoryCandidates({
  workspaceRoot,
  storage,
  space = '',
  status = '',
  includeText = false,
  runtimeIdentity = null,
  env = process.env,
} = {}) {
  if (!workspaceRoot) throw new Error('listMemoryCandidates requires workspaceRoot');
  if (includeText && !hasBrokerReviewAuthority()) {
    const error = new Error('candidate text requires memo review authority');
    error.code = 'AIOS_MEMO_CANDIDATE_DENIED';
    throw error;
  }
  const candidates = await collectCandidates({ workspaceRoot, storage, space, env });
  return candidates
    .filter((candidate) => !status || candidate.status === status)
    .map((candidate) => publicCandidate(candidate, { includeText }));
}

export async function inspectMemoryCandidate({
  workspaceRoot,
  storage,
  space = '',
  candidateId,
  runtimeIdentity,
  env = process.env,
} = {}) {
  if (!hasBrokerReviewAuthority()) {
    const error = new Error('candidate inspect requires memo review authority');
    error.code = 'AIOS_MEMO_CANDIDATE_DENIED';
    throw error;
  }
  const candidates = await collectCandidates({ workspaceRoot, storage, space, env });
  const candidate = candidates.find((item) => item.candidateId === candidateId);
  if (!candidate) return null;
  return {
    ...publicCandidate(candidate, { includeText: true }),
    claimStatus: 'candidate',
    provenance: candidate.provenance,
    source: candidate.source,
  };
}

function authorize(identity, action, reason) {
  if (!reason) return { allowed: false, reasonCode: 'missing_reason', capability: '' };
  return {
    allowed: false,
    reasonCode: 'trusted_authority_unavailable',
    capability: `broker:${action}`,
  };
}

function receiptRow({ candidate, candidateId, action, decision, reason, reasonCode, identity, capability, promotedEventId = '' }) {
  const receiptId = randomUUID();
  return {
    schemaVersion: 1,
    kind: 'memory.candidate-governance-receipt',
    receiptId,
    receiptRef: `contextdb:governance/${GOVERNANCE_FILE}#${receiptId}`,
    candidateId: String(candidateId || ''),
    sourceType: candidate?.sourceType || 'unknown',
    action,
    decision,
    reason: text(reason),
    reasonCode,
    at: new Date().toISOString(),
    principal: {
      producerType: identity?.producerType || '',
      principalId: identity?.principalId || '',
      agentId: identity?.agentId || '',
      sessionId: identity?.sessionId || '',
      runId: identity?.runId || '',
      activationId: identity?.activationId || '',
    },
    authorization: {
      capability,
      policyRevision: identity?.policyRevision || '',
    },
    source: {
      ref: candidate ? `${candidate.sourceType}:${candidate.candidateId}` : `candidate:${candidateId || ''}`,
      hash: candidate?.sourceHash || '',
    },
    ...(promotedEventId ? { promotedEventId } : {}),
  };
}

async function writeReceipt(workspaceRoot, env, receipt) {
  await appendText(governancePath(workspaceRoot, env), `${JSON.stringify(receipt)}\n`);
  return receipt;
}

async function decideCandidate(action, {
  workspaceRoot,
  storage,
  space = '',
  candidateId,
  reason = '',
  runtimeIdentity = null,
  env = process.env,
} = {}) {
  if (!ACTIONS.has(action)) throw new Error(`unsupported candidate action: ${action}`);
  if (!workspaceRoot) throw new Error(`${action}MemoryCandidate requires workspaceRoot`);
  const identity = normalizeRuntimeIdentity(runtimeIdentity);
  const candidates = await collectCandidates({ workspaceRoot, storage, space, env });
  const candidate = candidates.find((item) => item.candidateId === candidateId) || null;
  let authorization = authorize(identity, action, text(reason));
  if (!candidate) authorization = { allowed: false, reasonCode: 'candidate_not_found', capability: authorization.capability };
  if (candidate && candidate.status !== 'pending') {
    authorization = { allowed: false, reasonCode: 'candidate_not_pending', capability: authorization.capability };
  }
  if (!authorization.allowed) {
    const receipt = receiptRow({
      candidate,
      candidateId,
      action,
      decision: 'DENY',
      reason,
      reasonCode: authorization.reasonCode,
      identity,
      capability: authorization.capability,
    });
    await writeReceipt(workspaceRoot, env, receipt);
    return { ok: false, receipt };
  }

  let promotedEvent = null;
  if (action === 'promote') {
    const resolvedStorage = storage || candidate.storage || await getActiveMemoStorage(workspaceRoot);
    try {
      promotedEvent = await appendMemoEvent({
        workspaceRoot,
        storage: resolvedStorage,
        space: candidate.space || 'default',
        text: candidate.text,
        refs: candidate.refs,
        scope: 'project_shared',
        validAt: candidate.validAt,
        runtimeIdentity: identity,
        promotionOf: candidate.candidateId,
        turn: {
          turnType: 'side',
          environment: 'candidate-governance',
          outcome: 'success',
        },
      });
      if (promotedEvent.claimStatus !== 'verified') {
        throw new Error('authorized promotion did not create a verified event');
      }
    } catch (error) {
      const receipt = receiptRow({
        candidate,
        candidateId,
        action,
        decision: 'DENY',
        reason,
        reasonCode: 'promotion_write_failed',
        identity,
        capability: authorization.capability,
      });
      await writeReceipt(workspaceRoot, env, receipt);
      error.receipt = receipt;
      throw error;
    }
  }

  const receipt = receiptRow({
    candidate,
    candidateId,
    action,
    decision: 'ALLOW',
    reason,
    reasonCode: 'authorized',
    identity,
    capability: authorization.capability,
    promotedEventId: promotedEvent?.eventId || '',
  });
  await writeReceipt(workspaceRoot, env, receipt);
  return { ok: true, receipt, ...(promotedEvent ? { promotedEvent } : {}) };
}

export function promoteMemoryCandidate(options = {}) {
  return decideCandidate('promote', options);
}

export function rejectMemoryCandidate(options = {}) {
  return decideCandidate('reject', options);
}

export function expireMemoryCandidate(options = {}) {
  return decideCandidate('expire', options);
}
