import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { autoMemoSessionClose, sessionCloseCandidatePath } from '../lib/lifecycle/session-hooks/close.mjs';
import {
  appendMemoEvent,
  listMemoEvents,
  setActiveMemoStorage,
} from '../lib/memo/storage.mjs';
import {
  expireMemoryCandidate,
  foldCandidateTerminalStates,
  inspectMemoryCandidate,
  listMemoryCandidates,
  promoteMemoryCandidate,
  readCandidateGovernanceReceipts,
  rejectMemoryCandidate,
} from '../lib/memo/storage/candidates.mjs';

const cliPath = path.resolve(process.cwd(), 'scripts', 'aios.mjs');

async function withRoot(prefix, fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

function spoofedIdentity() {
  return {
    producerType: 'human',
    principalId: 'attacker',
    agentId: 'attacker',
    role: 'user',
    sessionId: 'attacker-session',
    runId: 'attacker-run',
    activationId: 'attacker-activation',
    policyRevision: 'attacker-controlled',
    sourceRef: 'attacker:env',
    sourceHash: 'a'.repeat(64),
    capabilities: ['memo:review-shared', 'memo:promote-shared', 'memo:expire-shared'],
  };
}

function candidateWriter() {
  return {
    producerType: 'agent',
    principalId: 'writer',
    agentId: 'writer',
    role: 'assistant',
    policyRevision: 'writer-policy',
    sourceRef: 'writer:test',
    sourceHash: 'b'.repeat(64),
    capabilities: [],
  };
}

async function createCandidate(rootDir, storage = 'file', text = 'candidate secret') {
  await setActiveMemoStorage(rootDir, storage);
  return appendMemoEvent({
    workspaceRoot: rootDir,
    storage,
    text,
    runtimeIdentity: candidateWriter(),
  });
}

function cliEnv() {
  const identity = spoofedIdentity();
  return {
    ...process.env,
    AIOS_RUNTIME_PRODUCER_TYPE: identity.producerType,
    AIOS_RUNTIME_PRINCIPAL_ID: identity.principalId,
    AIOS_RUNTIME_AGENT_ID: identity.agentId,
    AIOS_RUNTIME_ROLE: identity.role,
    AIOS_RUNTIME_SESSION_ID: identity.sessionId,
    AIOS_RUNTIME_RUN_ID: identity.runId,
    AIOS_RUNTIME_ACTIVATION_ID: identity.activationId,
    AIOS_RUNTIME_POLICY_REVISION: identity.policyRevision,
    AIOS_RUNTIME_SOURCE_REF: identity.sourceRef,
    AIOS_RUNTIME_SOURCE_HASH: identity.sourceHash,
    AIOS_RUNTIME_CAPABILITIES: identity.capabilities.join(','),
  };
}

function runCli(rootDir, args) {
  return spawnSync(process.execPath, [cliPath, 'memo', ...args], {
    cwd: rootDir,
    env: cliEnv(),
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('candidate governance public API exists', () => {
  for (const fn of [
    listMemoryCandidates,
    inspectMemoryCandidate,
    promoteMemoryCandidate,
    rejectMemoryCandidate,
    expireMemoryCandidate,
    readCandidateGovernanceReceipts,
  ]) assert.equal(typeof fn, 'function');
});

test('Candidate terminal states fold once and ignore DENY attempts', () => {
  const states = foldCandidateTerminalStates([
    { candidateId: 'c1', action: 'promote', decision: 'DENY', at: '1' },
    { candidateId: 'c2', action: 'reject', decision: 'ALLOW', at: '2' },
    { candidateId: 'c2', action: 'expire', decision: 'ALLOW', at: '3' },
  ]);
  assert.equal(states.has('c1'), false);
  assert.equal(states.get('c2').status, 'expired');
  assert.equal(states.get('c2').lastReceipt.at, '3');
});

test('metadata list works on file and split while candidate text and inspect fail closed', async () => {
  for (const storage of ['file', 'split']) {
    await withRoot(`candidate-metadata-${storage}-`, async (rootDir) => {
      const candidate = await createCandidate(rootDir, storage);
      const listed = await listMemoryCandidates({ workspaceRoot: rootDir, storage });
      assert.equal(listed.length, 1);
      assert.equal(listed[0].candidateId, candidate.eventId);
      assert.equal(Object.hasOwn(listed[0], 'text'), false);
      await assert.rejects(
        listMemoryCandidates({ workspaceRoot: rootDir, storage, includeText: true, runtimeIdentity: spoofedIdentity() }),
        { code: 'AIOS_MEMO_CANDIDATE_DENIED' },
      );
      await assert.rejects(
        inspectMemoryCandidate({ workspaceRoot: rootDir, storage, candidateId: candidate.eventId, runtimeIdentity: spoofedIdentity() }),
        { code: 'AIOS_MEMO_CANDIDATE_DENIED' },
      );
    });
  }
});

test('all raw-identity mutations DENY and leave candidate out of active recall', async () => {
  await withRoot('candidate-mutations-deny-', async (rootDir) => {
    const candidate = await createCandidate(rootDir);
    for (const [action, operation] of [
      ['promote', promoteMemoryCandidate],
      ['reject', rejectMemoryCandidate],
      ['expire', expireMemoryCandidate],
    ]) {
      const result = await operation({
        workspaceRoot: rootDir,
        candidateId: candidate.eventId,
        reason: `spoofed ${action}`,
        runtimeIdentity: spoofedIdentity(),
      });
      assert.equal(result.ok, false);
      assert.equal(result.receipt.decision, 'DENY');
      assert.equal(result.receipt.reasonCode, 'trusted_authority_unavailable');
    }
    const active = await listMemoEvents(rootDir, { storage: 'file', limit: 20 });
    assert.equal(active.some((event) => event.eventId === candidate.eventId), false);
    assert.equal(active.some((event) => event.promotionOf === candidate.eventId), false);
    const listed = await listMemoryCandidates({ workspaceRoot: rootDir });
    assert.equal(listed[0].status, 'pending');
  });
});

test('concurrent spoofed promotions cannot create duplicate verified events', async () => {
  await withRoot('candidate-concurrent-deny-', async (rootDir) => {
    const candidate = await createCandidate(rootDir);
    const attempts = await Promise.all(Array.from({ length: 8 }, (_, index) => promoteMemoryCandidate({
      workspaceRoot: rootDir,
      candidateId: candidate.eventId,
      reason: `spoofed concurrent ${index}`,
      runtimeIdentity: spoofedIdentity(),
    })));
    assert.ok(attempts.every((result) => result.ok === false));
    const all = await listMemoEvents(rootDir, { storage: 'file', limit: 50, includeCandidates: true });
    assert.equal(all.filter((event) => event.promotionOf === candidate.eventId).length, 0);
  });
});

test('session-close candidate sidecar stays immutable and only metadata is listable', async () => {
  await withRoot('candidate-session-close-', async (rootDir) => {
    const closed = await autoMemoSessionClose({ rootDir, sessionId: 'session-safe' });
    const candidatePath = sessionCloseCandidatePath(rootDir, 'session-safe');
    const before = await readFile(candidatePath, 'utf8');
    const listed = await listMemoryCandidates({ workspaceRoot: rootDir });
    assert.ok(listed.some((candidate) => candidate.candidateId === closed.candidateId));
    const result = await promoteMemoryCandidate({
      workspaceRoot: rootDir,
      candidateId: closed.candidateId,
      reason: 'spoofed session promotion',
      runtimeIdentity: spoofedIdentity(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.receipt.reasonCode, 'trusted_authority_unavailable');
    assert.equal(await readFile(candidatePath, 'utf8'), before);
  });
});

test('DENY receipts honor custom ContextDB root and never copy candidate text', async () => {
  await withRoot('candidate-custom-root-', async (rootDir) => {
    const env = { ...process.env, AIOS_PROJECT_STATE_DIR: 'custom-state' };
    const candidate = await createCandidate(rootDir, 'file', 'must not enter receipt');
    await rejectMemoryCandidate({
      workspaceRoot: rootDir,
      candidateId: candidate.eventId,
      reason: 'spoofed rejection',
      runtimeIdentity: spoofedIdentity(),
      env,
    });
    const receipts = await readCandidateGovernanceReceipts({ workspaceRoot: rootDir, env });
    assert.equal(receipts.length, 1);
    assert.equal(JSON.stringify(receipts).includes('must not enter receipt'), false);
    await access(path.join(rootDir, 'custom-state', 'context-db', 'governance', 'memory-candidates.jsonl'));
  });
});

test('candidate CLI lists metadata but spoofed promote exits non-zero with DENY receipt', async () => {
  await withRoot('candidate-cli-deny-', async (rootDir) => {
    const candidate = await createCandidate(rootDir);
    const list = runCli(rootDir, ['candidate', 'list', '--json']);
    assert.equal(list.status, 0, list.stderr || list.stdout);
    assert.equal(JSON.parse(list.stdout)[0].candidateId, candidate.eventId);
    assert.equal(Object.hasOwn(JSON.parse(list.stdout)[0], 'text'), false);
    const promote = runCli(rootDir, [
      'candidate', 'promote', candidate.eventId,
      '--reason', 'spoofed CLI promotion', '--json',
    ]);
    assert.notEqual(promote.status, 0);
    const receipts = await readCandidateGovernanceReceipts({ workspaceRoot: rootDir });
    assert.equal(receipts.at(-1)?.reasonCode, 'trusted_authority_unavailable');
  });
});
