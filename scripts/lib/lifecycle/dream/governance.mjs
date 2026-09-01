import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resolveMemoRoot } from '../../aios/state-root.mjs';
import { collectEvents } from '../../memo/storage/events-read.mjs';
import { appendText, atomicWriteText, collectRecursiveFiles, readTextIfExists, sha256Hex } from '../../memo/storage/fs-io.mjs';
import { fileEventsPath, splitEventsRoot } from '../../memo/storage/paths.mjs';
import { normalizeRuntimeIdentity } from '../../memo/storage/provenance.mjs';
import { withMemoStorageLock } from '../../memo/storage/lock.mjs';
import { readOrRebuildDreamArchiveIndex } from './archive-index.mjs';

const ACTIONS = new Set(['approve', 'reject', 'archive', 'restore', 'gc']);
const DEFAULT_RETENTION_DAYS = 30;

function dreamRoot(rootDir, env = process.env) {
  return path.join(resolveMemoRoot(rootDir, { env }), 'dream');
}

function proposalsRoot(rootDir, env = process.env) {
  return path.join(dreamRoot(rootDir, env), 'proposals');
}

function governancePath(rootDir, env = process.env) {
  return path.join(dreamRoot(rootDir, env), 'governance', 'events.jsonl');
}

function archiveRoot(rootDir, proposalId, env = process.env) {
  const safe = String(proposalId || '').replace(/[^A-Za-z0-9._-]+/gu, '-');
  return path.join(dreamRoot(rootDir, env), 'archive', safe);
}

function snapshotPath(rootDir, proposalId, env = process.env) {
  return path.join(archiveRoot(rootDir, proposalId, env), 'snapshot.json');
}

function cleanText(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function retentionDays(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_RETENTION_DAYS), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_RETENTION_DAYS;
  return Math.min(365, Math.max(1, parsed));
}

async function proposalFiles(rootDir, env) {
  let entries = [];
  try {
    entries = await fs.readdir(proposalsRoot(rootDir, env), { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(proposalsRoot(rootDir, env), entry.name))
    .sort((a, b) => a.localeCompare(b));
}

async function readProposals(rootDir, env = process.env) {
  const proposals = [];
  for (const filePath of await proposalFiles(rootDir, env)) {
    const proposal = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (proposal?.kind === 'memo.dream-consolidation-proposal' && proposal?.proposalId) {
      proposals.push({ ...proposal, proposalPath: filePath });
    }
  }
  return proposals;
}

export async function readDreamGovernanceReceipts({ rootDir, proposalId = '', env = process.env } = {}) {
  if (!rootDir) throw new Error('readDreamGovernanceReceipts requires rootDir');
  const raw = await readTextIfExists(governancePath(rootDir, env));
  const receipts = [];
  for (const line of raw.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const receipt = JSON.parse(line);
    if (receipt?.kind !== 'memo.dream-governance-receipt') continue;
    if (!proposalId || receipt.proposalId === proposalId) receipts.push(receipt);
  }
  return receipts.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
}

function initialProposalState() {
  return { status: 'proposed', approval: null, archive: null, gc: null, latest: null };
}

function applyAllowedReceipt(state, receipt) {
  if (receipt.decision !== 'ALLOW') return state;
  const next = { ...state, latest: receipt };
  if (receipt.action === 'approve') {
    next.status = 'approved';
    next.approval = receipt;
  } else if (receipt.action === 'reject') {
    next.status = 'rejected';
  } else if (receipt.action === 'archive') {
    next.status = 'archived';
    next.archive = receipt;
  } else if (receipt.action === 'gc') {
    next.status = 'gc';
    next.gc = receipt;
  } else if (receipt.action === 'restore') {
    next.status = 'restored';
  }
  return next;
}

export function foldDreamProposalStates(receipts = []) {
  const states = new Map();
  for (const receipt of receipts) {
    const proposalId = String(receipt?.proposalId || '');
    if (!proposalId || receipt?.decision !== 'ALLOW') continue;
    states.set(proposalId, applyAllowedReceipt(states.get(proposalId) || initialProposalState(), receipt));
  }
  return states;
}

function proposalState(receipts, proposalId) {
  return foldDreamProposalStates(receipts).get(proposalId) || initialProposalState();
}

function proposalSummary(proposal, state) {
  return {
    proposalId: proposal.proposalId,
    status: state.status,
    createdAt: proposal.createdAt,
    storage: proposal.source?.storage || '',
    spaces: proposal.source?.spaces || [],
    actionCount: Array.isArray(proposal.actions) ? proposal.actions.length : 0,
    summary: proposal.summary,
    ...(state.latest ? { lastReceipt: state.latest } : {}),
  };
}

export async function listDreamProposals({ rootDir, status = '', env = process.env } = {}) {
  if (!rootDir) throw new Error('listDreamProposals requires rootDir');
  const [proposals, receipts] = await Promise.all([
    readProposals(rootDir, env),
    readDreamGovernanceReceipts({ rootDir, env }),
  ]);
  const states = foldDreamProposalStates(receipts);
  return proposals
    .map((proposal) => proposalSummary(proposal, states.get(proposal.proposalId) || initialProposalState()))
    .filter((proposal) => !status || proposal.status === status)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function hasBrokerReviewAuthority() {
  return false;
}

export async function inspectDreamProposal({ rootDir, proposalId, runtimeIdentity, env = process.env } = {}) {
  if (!hasBrokerReviewAuthority()) {
    const error = new Error('Dream proposal inspect requires tombstone review authority');
    error.code = 'AIOS_DREAM_GOVERNANCE_DENIED';
    throw error;
  }
  const [proposals, receipts] = await Promise.all([
    readProposals(rootDir, env),
    readDreamGovernanceReceipts({ rootDir, proposalId, env }),
  ]);
  const proposal = proposals.find((item) => item.proposalId === proposalId);
  if (!proposal) return null;
  return { ...proposal, status: proposalState(receipts, proposalId).status, receipts };
}

function authorize(identity, action, reason) {
  // Broker-reserved seam: runtimeIdentity is recorded in the receipt, but the current policy never authorizes mutations.
  if (!reason) return { allowed: false, reasonCode: 'missing_reason', capability: '' };
  return {
    allowed: false,
    reasonCode: 'trusted_authority_unavailable',
    capability: `broker:${action}`,
  };
}

function receiptRow({ proposal, proposalId, action, decision, reason, reasonCode, identity, capability, now, days, snapshotRef = '' }) {
  const receiptId = randomUUID();
  return {
    schemaVersion: 1,
    kind: 'memo.dream-governance-receipt',
    receiptId,
    receiptRef: `memo:dream/governance/events.jsonl#${receiptId}`,
    proposalId: String(proposalId || ''),
    action,
    decision,
    reason: cleanText(reason),
    reasonCode,
    at: new Date(now || Date.now()).toISOString(),
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
      proposalRef: proposal?.proposalPath ? `file:${proposal.proposalPath}` : '',
      manifestHash: proposal ? sha256Hex(JSON.stringify(proposal.sourceManifest || [])) : '',
      eventHashes: proposal?.sourceManifest || [],
    },
    retentionDays: days,
    ...(snapshotRef ? { snapshotRef } : {}),
  };
}

async function writeReceipt(rootDir, env, receipt) {
  await appendText(governancePath(rootDir, env), `${JSON.stringify(receipt)}\n`);
  return receipt;
}

async function currentProposal(rootDir, proposalId, env) {
  const proposals = await readProposals(rootDir, env);
  return proposals.find((proposal) => proposal.proposalId === proposalId) || null;
}

async function manifestFresh(rootDir, proposal, env = process.env) {
  const storage = proposal.source?.storage || 'file';
  const { events } = await collectEvents(rootDir, { storage, env });
  const byId = new Map(events.map((event) => [event.eventId, event]));
  return (proposal.sourceManifest || []).every((item) => {
    const event = byId.get(item.eventId);
    return event && sha256Hex(JSON.stringify(event)) === item.sourceHash;
  });
}

function transitionReason(action, state) {
  if (action === 'approve' || action === 'reject') return state.status === 'proposed' ? '' : 'proposal_not_proposed';
  if (action === 'archive') return ['approved', 'restored'].includes(state.status) ? '' : 'proposal_not_approved';
  if (action === 'restore') return ['archived', 'gc'].includes(state.status) ? '' : 'proposal_not_archived';
  if (action === 'gc') return state.status === 'archived' ? '' : 'proposal_not_archived';
  return 'invalid_action';
}

async function createGcSnapshot(rootDir, proposal, env, now) {
  const storage = proposal.source?.storage || 'file';
  const targetIds = new Set((proposal.actions || []).map((action) => action.eventId));
  const records = [];
  if (storage === 'file') {
    const sourcePath = fileEventsPath(rootDir, { env });
    const raw = await readTextIfExists(sourcePath);
    const survivors = [];
    for (const line of raw.split(/\r?\n/u)) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (targetIds.has(event.eventId)) records.push({ kind: 'file-line', line });
      else survivors.push(line);
    }
    const snapshot = {
      schemaVersion: 1,
      kind: 'memo.dream-gc-snapshot',
      proposalId: proposal.proposalId,
      storage,
      createdAt: new Date(now || Date.now()).toISOString(),
      records,
    };
    const target = snapshotPath(rootDir, proposal.proposalId, env);
    await atomicWriteText(target, `${JSON.stringify(snapshot, null, 2)}\n`);
    await atomicWriteText(sourcePath, survivors.length ? `${survivors.join('\n')}\n` : '');
    return { snapshot, target };
  }

  const sourceRoot = splitEventsRoot(rootDir, { env });
  const files = await collectRecursiveFiles(sourceRoot, (filePath) => filePath.endsWith('.json'));
  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8');
    const event = JSON.parse(content);
    if (targetIds.has(event.eventId)) {
      records.push({
        kind: 'split-file',
        relativePath: path.relative(sourceRoot, filePath).split(path.sep).join('/'),
        content,
      });
    }
  }
  const snapshot = {
    schemaVersion: 1,
    kind: 'memo.dream-gc-snapshot',
    proposalId: proposal.proposalId,
    storage,
    createdAt: new Date(now || Date.now()).toISOString(),
    records,
  };
  const target = snapshotPath(rootDir, proposal.proposalId, env);
  await atomicWriteText(target, `${JSON.stringify(snapshot, null, 2)}\n`);
  for (const record of records) {
    await fs.unlink(path.join(sourceRoot, ...record.relativePath.split('/')));
  }
  return { snapshot, target };
}

async function restoreSnapshot(rootDir, proposalId, env) {
  const target = snapshotPath(rootDir, proposalId, env);
  let snapshot;
  try {
    snapshot = JSON.parse(await fs.readFile(target, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return { restored: 0, snapshotRef: '' };
    throw error;
  }
  let restored = 0;
  if (snapshot.storage === 'file') {
    const sourcePath = fileEventsPath(rootDir, { env });
    const existingRaw = await readTextIfExists(sourcePath);
    const existingIds = new Set(existingRaw.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line).eventId));
    const missing = snapshot.records.filter((record) => !existingIds.has(JSON.parse(record.line).eventId));
    if (missing.length > 0) await appendText(sourcePath, `${missing.map((record) => record.line).join('\n')}\n`);
    restored = missing.length;
  } else {
    const sourceRoot = splitEventsRoot(rootDir, { env });
    for (const record of snapshot.records) {
      const filePath = path.join(sourceRoot, ...record.relativePath.split('/'));
      try {
        await fs.access(filePath);
      } catch {
        await atomicWriteText(filePath, record.content);
        restored += 1;
      }
    }
  }
  return { restored, snapshotRef: `file:${target}` };
}

async function decide(action, {
  rootDir,
  proposalId,
  reason = '',
  retentionDays: requestedRetention,
  runtimeIdentity,
  env = process.env,
  now = new Date(),
} = {}) {
  if (!ACTIONS.has(action)) throw new Error(`unsupported Dream governance action: ${action}`);
  const identity = normalizeRuntimeIdentity(runtimeIdentity);
  const proposal = await currentProposal(rootDir, proposalId, env);
  const receipts = await readDreamGovernanceReceipts({ rootDir, proposalId, env });
  const state = proposalState(receipts, proposalId);
  let authorization = authorize(identity, action, cleanText(reason));
  if (!proposal) authorization = { allowed: false, reasonCode: 'proposal_not_found', capability: authorization.capability };
  const transition = proposal ? transitionReason(action, state) : '';
  if (authorization.allowed && transition) {
    authorization = { allowed: false, reasonCode: transition, capability: authorization.capability };
  }
  if (action === 'gc' && !['file', 'split'].includes(String(proposal?.source?.storage || 'file'))) {
    authorization = {
      allowed: false,
      reasonCode: 'gc_unsupported_storage',
      capability: 'broker:gc',
    };
  }
  const days = action === 'approve'
    ? retentionDays(requestedRetention)
    : state.approval?.retentionDays || DEFAULT_RETENTION_DAYS;

  if (authorization.allowed && ['archive', 'gc'].includes(action) && !await manifestFresh(rootDir, proposal, env)) {
    authorization = { allowed: false, reasonCode: 'source_manifest_stale', capability: authorization.capability };
  }
  if (authorization.allowed && action === 'gc') {
    const archivedAt = new Date(state.archive?.at || 0).getTime();
    const eligibleAt = archivedAt + days * 24 * 60 * 60 * 1000;
    if (!archivedAt || new Date(now).getTime() < eligibleAt) {
      authorization = { allowed: false, reasonCode: 'retention_not_elapsed', capability: authorization.capability };
    }
  }

  if (!authorization.allowed) {
    const receipt = receiptRow({
      proposal,
      proposalId,
      action,
      decision: 'DENY',
      reason,
      reasonCode: authorization.reasonCode,
      identity,
      capability: authorization.capability,
      now,
      days,
    });
    await writeReceipt(rootDir, env, receipt);
    return { ok: false, receipt };
  }

  let snapshotRef = '';
  if (action === 'gc') {
    // GC physically deletes archived events; run under the same storage lock
    // appendMemoEvent uses so a concurrent writer cannot interleave with the
    // snapshot-then-rewrite. This replaces the old blanket
    // `gc_disabled_pending_concurrency_control` denial.
    const gcResult = await withMemoStorageLock({ workspaceRoot: rootDir, env }, async () =>
      createGcSnapshot(rootDir, proposal, env, now));
    snapshotRef = `file:${gcResult.target}`;
  } else if (action === 'restore' && state.status === 'gc') {
    // Restore writes back into the live event files; hold the storage lock for
    // the same reason GC does.
    snapshotRef = (await withMemoStorageLock({ workspaceRoot: rootDir, env }, async () =>
      restoreSnapshot(rootDir, proposalId, env))).snapshotRef;
  }
  const receipt = receiptRow({
    proposal,
    proposalId,
    action,
    decision: 'ALLOW',
    reason,
    reasonCode: 'authorized',
    identity,
    capability: authorization.capability,
    now,
    days,
    snapshotRef,
  });
  await writeReceipt(rootDir, env, receipt);
  return { ok: true, receipt };
}

export function approveDreamProposal(options = {}) {
  return decide('approve', options);
}

export function rejectDreamProposal(options = {}) {
  return decide('reject', options);
}

export function archiveDreamProposal(options = {}) {
  return decide('archive', options);
}

export function restoreDreamProposal(options = {}) {
  return decide('restore', options);
}

export function gcDreamProposal(options = {}) {
  return decide('gc', options);
}

export async function runDreamGovernanceCommand(options = {}, {
  rootDir = process.cwd(),
  env = process.env,
  runtimeIdentity = null,
} = {}) {
  const action = String(options.governanceAction || '').trim().toLowerCase();
  if (action === 'list') return listDreamProposals({ rootDir, env });
  if (action === 'inspect') {
    return inspectDreamProposal({
      rootDir,
      proposalId: options.proposalId,
      runtimeIdentity,
      env,
    });
  }
  const operation = {
    approve: approveDreamProposal,
    reject: rejectDreamProposal,
    archive: archiveDreamProposal,
    restore: restoreDreamProposal,
    gc: gcDreamProposal,
  }[action];
  if (!operation) throw new Error(`unsupported Dream governance action: ${action}`);
  if (!options.proposalId) throw new Error(`Dream governance ${action} requires --proposal`);
  const result = await operation({
    rootDir,
    proposalId: options.proposalId,
    reason: options.reason,
    retentionDays: options.retentionDays,
    runtimeIdentity,
    env,
  });
  return { ...result, exitCode: result.ok ? 0 : 1 };
}

async function deriveDreamArchivedEventIds(rootDir, env) {
  const [proposals, receipts] = await Promise.all([
    readProposals(rootDir, env),
    readDreamGovernanceReceipts({ rootDir, env }),
  ]);
  const ids = new Set();
  const states = foldDreamProposalStates(receipts);
  for (const proposal of proposals) {
    const state = states.get(proposal.proposalId) || initialProposalState();
    if (!['archived', 'gc'].includes(state.status)) continue;
    for (const action of proposal.actions || []) ids.add(action.eventId);
  }
  return ids;
}

export async function readDreamArchivedEventIds({ rootDir, env = process.env } = {}) {
  return await readOrRebuildDreamArchiveIndex({
    rootDir,
    env,
    deriveArchivedEventIds: () => deriveDreamArchivedEventIds(rootDir, env),
  });
}
