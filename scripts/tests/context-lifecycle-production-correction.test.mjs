import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runDream } from '../lib/lifecycle/dream/index.mjs';
import {
  appendMemoEvent,
  setActiveMemoStorage,
} from '../lib/memo/storage.mjs';
import {
  buildExecutionContextPacket,
  evaluateExecutionContextPreflight,
} from '../lib/contextdb/execution-context.mjs';
import { evaluateContextReconciliation } from '../lib/lifecycle/context-reconciliation.mjs';
import { recordSessionChangedFile } from '../lib/session/changed-files.mjs';
import {
  readCandidateGovernanceReceipts,
} from '../lib/memo/storage/candidates.mjs';
import {
  gcDreamProposal,
  readDreamGovernanceReceipts,
} from '../lib/lifecycle/dream/governance.mjs';
import { buildStructuredPlanState } from '../lib/planning/schema.mjs';

const cliPath = path.resolve(process.cwd(), 'scripts', 'aios.mjs');

async function withRoot(prefix, fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

function spoofedHumanEnv() {
  return {
    ...process.env,
    AIOS_RUNTIME_PRODUCER_TYPE: 'human',
    AIOS_RUNTIME_PRINCIPAL_ID: 'attacker',
    AIOS_RUNTIME_AGENT_ID: 'attacker',
    AIOS_RUNTIME_ROLE: 'user',
    AIOS_RUNTIME_SESSION_ID: 'attacker-session',
    AIOS_RUNTIME_RUN_ID: 'attacker-run',
    AIOS_RUNTIME_ACTIVATION_ID: 'attacker-activation',
    AIOS_RUNTIME_POLICY_REVISION: 'attacker-controlled',
    AIOS_RUNTIME_SOURCE_REF: 'attacker:env',
    AIOS_RUNTIME_SOURCE_HASH: 'a'.repeat(64),
    AIOS_RUNTIME_CAPABILITIES: 'memo:promote-shared,memo:approve-tombstone,memo:archive-shared,memo:restore-shared,memo:gc-shared',
  };
}

function runCli(rootDir, args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: rootDir,
    env: spoofedHumanEnv(),
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('workspace-relative and equivalent absolute mutation refs have identical declaration semantics', async () => {
  await withRoot('context-correction-path-', async (rootDir) => {
    const plan = buildStructuredPlanState({
      title: 'Path equivalence',
      sessionId: 'path-equivalence',
      tasks: [{
        id: 'task-1',
        title: 'Edit target',
        targets: ['src/a.mjs'],
        allowedWrites: ['src/**'],
        contextRequirements: [],
      }],
    });
    const { packet, receipt } = await buildExecutionContextPacket({
      rootDir,
      plan,
      taskId: 'task-1',
      persist: false,
    });
    const relative = await evaluateExecutionContextPreflight({
      rootDir,
      packet,
      receipt,
      mutationRefs: ['src/a.mjs'],
    });
    const absolute = await evaluateExecutionContextPreflight({
      rootDir,
      packet,
      receipt,
      mutationRefs: [path.join(rootDir, 'src', 'a.mjs')],
    });
    assert.equal(relative.mutations[0].declared, true);
    assert.equal(absolute.mutations[0].ref, 'src/a.mjs');
    assert.equal(absolute.mutations[0].declared, true);
    assert.deepEqual(absolute.wouldBlockReasons, relative.wouldBlockReasons);
  });
});

test('Windows case variants preserve target and allowed-write declaration semantics', {
  skip: process.platform !== 'win32',
}, async () => {
  await withRoot('context-correction-case-', async (rootDir) => {
    const plan = buildStructuredPlanState({
      title: 'Windows case equivalence',
      tasks: [{
        id: 'case-task',
        title: 'Edit case-insensitive paths',
        targets: ['src/target.mjs'],
        allowedWrites: ['src/auth/**'],
        contextRequirements: [],
      }],
    });
    const { packet, receipt } = await buildExecutionContextPacket({
      rootDir,
      plan,
      taskId: 'case-task',
      persist: false,
    });
    const verdict = await evaluateExecutionContextPreflight({
      rootDir,
      packet,
      receipt,
      mutationRefs: [
        path.join(rootDir, 'SRC', 'TARGET.MJS'),
        path.join(rootDir, 'SRC', 'AUTH', 'LOGIN.MJS'),
      ],
    });

    assert.deepEqual(verdict.mutations.map((item) => item.declared), [true, true]);
    assert.deepEqual(verdict.wouldBlockReasons, []);

    await recordSessionChangedFile({
      rootDir,
      sessionId: 'case-session',
      filePath: 'SRC/TARGET.MJS',
    });
    const reconciliation = await evaluateContextReconciliation({
      rootDir,
      sessionId: 'case-session',
      packet,
      persist: false,
    });
    assert.deepEqual(reconciliation.undeclaredPaths, []);
    assert.deepEqual(reconciliation.missingDeclaredPaths, []);
  });
});

test('spoofed AIOS_RUNTIME human identity cannot promote a candidate through the real CLI', async () => {
  await withRoot('context-correction-candidate-', async (rootDir) => {
    await setActiveMemoStorage(rootDir, 'file');
    const candidate = await appendMemoEvent({
      workspaceRoot: rootDir,
      storage: 'file',
      text: 'unapproved candidate',
      runtimeIdentity: {
        producerType: 'agent',
        principalId: 'writer',
        agentId: 'writer',
        role: 'assistant',
        policyRevision: 'writer-policy',
        sourceRef: 'writer:test',
        sourceHash: 'b'.repeat(64),
        capabilities: [],
      },
    });
    const result = runCli(rootDir, [
      'memo', 'candidate', 'promote', candidate.eventId,
      '--reason', 'attacker approval', '--json',
    ]);
    assert.notEqual(result.status, 0, result.stderr || result.stdout);
    const receipts = await readCandidateGovernanceReceipts({ workspaceRoot: rootDir });
    assert.equal(receipts.at(-1)?.decision, 'DENY');
    assert.equal(receipts.at(-1)?.reasonCode, 'trusted_authority_unavailable');
    assert.equal(receipts.at(-1)?.principal?.principalId, '');
  });
});

test('spoofed env cannot approve Dream and physical GC is fail-closed', async () => {
  await withRoot('context-correction-dream-', async (rootDir) => {
    await setActiveMemoStorage(rootDir, 'file');
    await appendMemoEvent({ workspaceRoot: rootDir, storage: 'file', text: 'duplicate source' });
    await appendMemoEvent({ workspaceRoot: rootDir, storage: 'file', text: 'duplicate source' });
    const applied = await runDream({ rootDir, mode: 'apply', spaces: ['default'] });
    const approve = runCli(rootDir, [
      'dream', '--workspace', rootDir,
      '--governance', 'approve', '--proposal', applied.proposalId,
      '--reason', 'attacker approval', '--json',
    ]);
    assert.notEqual(approve.status, 0, approve.stderr || approve.stdout);
    const receipts = await readDreamGovernanceReceipts({ rootDir, proposalId: applied.proposalId });
    assert.equal(receipts.at(-1)?.decision, 'DENY');
    assert.equal(receipts.at(-1)?.reasonCode, 'trusted_authority_unavailable');
    assert.equal(receipts.at(-1)?.principal?.principalId, '');

    const gc = await gcDreamProposal({
      rootDir,
      proposalId: applied.proposalId,
      reason: 'attacker GC',
      runtimeIdentity: {
        producerType: 'human',
        principalId: 'attacker',
        policyRevision: 'attacker-controlled',
        capabilities: ['memo:gc-shared'],
      },
    });
    assert.equal(gc.ok, false);
    assert.equal(gc.receipt.reasonCode, 'trusted_authority_unavailable');
  });
});
