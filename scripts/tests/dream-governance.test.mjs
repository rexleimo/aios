import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runDream } from '../lib/lifecycle/dream/index.mjs';
import {
  approveDreamProposal,
  archiveDreamProposal,
  foldDreamProposalStates,
  gcDreamProposal,
  inspectDreamProposal,
  listDreamProposals,
  readDreamGovernanceReceipts,
  rejectDreamProposal,
  restoreDreamProposal,
} from '../lib/lifecycle/dream/governance.mjs';
import { appendMemoEvent, listMemoEvents, setActiveMemoStorage } from '../lib/memo/storage.mjs';

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
    capabilities: [
      'memo:review-tombstone',
      'memo:approve-tombstone',
      'memo:archive-shared',
      'memo:restore-shared',
      'memo:gc-shared',
    ],
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

async function createProposal(rootDir, storage = 'file', options = {}) {
  await setActiveMemoStorage(rootDir, storage);
  const text = options.text || `duplicate-${storage}`;
  await appendMemoEvent({ workspaceRoot: rootDir, storage, text });
  await appendMemoEvent({ workspaceRoot: rootDir, storage, text });
  await appendMemoEvent({
    workspaceRoot: rootDir,
    storage,
    text,
    scope: 'agent_private',
    agent: 'private-agent',
  });
  await appendMemoEvent({
    workspaceRoot: rootDir,
    storage,
    text,
    runtimeIdentity: candidateWriter(),
  });
  const applied = await runDream({
    rootDir,
    mode: 'apply',
    spaces: ['default'],
    env: options.env,
  });
  return {
    applied,
    proposal: JSON.parse(await readFile(applied.proposalPath, 'utf8')),
    beforeProposal: await readFile(applied.proposalPath, 'utf8'),
  };
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
  return spawnSync(process.execPath, [cliPath, 'dream', '--workspace', rootDir, ...args], {
    cwd: rootDir,
    env: cliEnv(),
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('Dream governance public API exists', () => {
  for (const fn of [
    listDreamProposals,
    inspectDreamProposal,
    approveDreamProposal,
    rejectDreamProposal,
    archiveDreamProposal,
    restoreDreamProposal,
    gcDreamProposal,
    readDreamGovernanceReceipts,
  ]) assert.equal(typeof fn, 'function');
});

test('Dream receipt states fold in one pass and ignore DENY attempts', () => {
  const states = foldDreamProposalStates([
    { proposalId: 'p1', action: 'approve', decision: 'ALLOW', at: '1' },
    { proposalId: 'p2', action: 'reject', decision: 'DENY', at: '2' },
    { proposalId: 'p1', action: 'archive', decision: 'ALLOW', at: '3' },
    { proposalId: 'p1', action: 'restore', decision: 'ALLOW', at: '4' },
  ]);
  assert.equal(states.get('p1').status, 'restored');
  assert.equal(states.get('p1').approval.action, 'approve');
  assert.equal(states.has('p2'), false);
});

test('proposal-only apply stays immutable and excludes private plus unapproved candidates', async () => {
  await withRoot('dream-proposal-safe-', async (rootDir) => {
    const fixture = await createProposal(rootDir);
    assert.equal(fixture.proposal.actions.length, 1);
    assert.equal(fixture.proposal.sourceManifest.some((item) => item.scope === 'agent_private'), false);
    const listed = await listDreamProposals({ rootDir });
    assert.equal(listed[0].status, 'proposed');
    assert.equal(await readFile(fixture.applied.proposalPath, 'utf8'), fixture.beforeProposal);
  });
});

test('proposal detail inspect fails closed without broker authority', async () => {
  await withRoot('dream-inspect-deny-', async (rootDir) => {
    const fixture = await createProposal(rootDir);
    await assert.rejects(
      inspectDreamProposal({
        rootDir,
        proposalId: fixture.proposal.proposalId,
        runtimeIdentity: spoofedIdentity(),
      }),
      { code: 'AIOS_DREAM_GOVERNANCE_DENIED' },
    );
  });
});

test('all raw-identity Dream mutations DENY and proposal remains proposed', async () => {
  await withRoot('dream-mutations-deny-', async (rootDir) => {
    const fixture = await createProposal(rootDir);
    for (const [action, operation] of [
      ['approve', approveDreamProposal],
      ['reject', rejectDreamProposal],
      ['archive', archiveDreamProposal],
      ['restore', restoreDreamProposal],
    ]) {
      const result = await operation({
        rootDir,
        proposalId: fixture.proposal.proposalId,
        reason: `spoofed ${action}`,
        runtimeIdentity: spoofedIdentity(),
      });
      assert.equal(result.ok, false);
      assert.equal(result.receipt.reasonCode, 'trusted_authority_unavailable');
    }
    assert.equal((await listDreamProposals({ rootDir }))[0].status, 'proposed');
    assert.equal(await readFile(fixture.applied.proposalPath, 'utf8'), fixture.beforeProposal);
  });
});

test('physical GC is broker-gated and cannot mutate file or split canonical storage', async () => {
  for (const storage of ['file', 'split']) {
    await withRoot(`dream-gc-gated-${storage}-`, async (rootDir) => {
      const fixture = await createProposal(rootDir, storage);
      const targetId = fixture.proposal.actions[0].eventId;
      const before = await listMemoEvents(rootDir, {
        storage,
        limit: 50,
        includeArchived: true,
        includeCandidates: true,
      });
      const result = await gcDreamProposal({
        rootDir,
        proposalId: fixture.proposal.proposalId,
        reason: 'spoofed GC',
        runtimeIdentity: spoofedIdentity(),
      });
      assert.equal(result.ok, false);
      assert.equal(result.receipt.reasonCode, 'trusted_authority_unavailable');
      const after = await listMemoEvents(rootDir, {
        storage,
        limit: 50,
        includeArchived: true,
        includeCandidates: true,
      });
      assert.equal(after.some((event) => event.eventId === targetId), true);
      assert.deepEqual(after.map((event) => event.eventId).sort(), before.map((event) => event.eventId).sort());
    });
  }
});

test('DENY receipts use custom state root and contain hashes rather than memo text', async () => {
  await withRoot('dream-custom-root-', async (rootDir) => {
    const env = { ...process.env, AIOS_PROJECT_STATE_DIR: 'custom-state' };
    const fixture = await createProposal(rootDir, 'file', { env, text: 'secret duplicate text' });
    await approveDreamProposal({
      rootDir,
      proposalId: fixture.proposal.proposalId,
      reason: 'spoofed approval',
      runtimeIdentity: spoofedIdentity(),
      env,
    });
    const receipts = await readDreamGovernanceReceipts({ rootDir, env });
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].decision, 'DENY');
    assert.equal(JSON.stringify(receipts).includes('secret duplicate text'), false);
    await access(path.join(rootDir, 'custom-state', 'memo', 'dream', 'governance', 'events.jsonl'));
  });
});

test('Dream CLI lists metadata but spoofed approve exits non-zero', async () => {
  await withRoot('dream-cli-deny-', async (rootDir) => {
    const fixture = await createProposal(rootDir);
    const list = runCli(rootDir, ['--governance', 'list', '--json']);
    assert.equal(list.status, 0, list.stderr || list.stdout);
    assert.equal(JSON.parse(list.stdout)[0].proposalId, fixture.proposal.proposalId);
    const approve = runCli(rootDir, [
      '--governance', 'approve', '--proposal', fixture.proposal.proposalId,
      '--reason', 'spoofed CLI approval', '--json',
    ]);
    assert.notEqual(approve.status, 0);
    const receipts = await readDreamGovernanceReceipts({ rootDir });
    assert.equal(receipts.at(-1)?.reasonCode, 'trusted_authority_unavailable');
  });
});
