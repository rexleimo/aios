import assert from 'node:assert/strict';
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { appendMemoEvent, listMemoEvents } from '../lib/memo/storage.mjs';

const cliPath = path.resolve(process.cwd(), 'scripts', 'aios.mjs');

async function withTempRoot(prefix, fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

function runtimeIdentity(overrides = {}) {
  return {
    producerType: 'agent',
    principalId: 'principal:agent-a',
    agentId: 'agent-a',
    role: 'assistant',
    sessionId: 'session-a',
    runId: 'run-a',
    activationId: 'activation-a',
    policyRevision: 'memo-policy-v1',
    sourceRef: 'contextdb:session-a#turn-1',
    sourceHash: 'a'.repeat(64),
    ...overrides,
  };
}

function runMemo(rootDir, args, env = {}) {
  return spawnSync(process.execPath, [cliPath, 'memo', ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, AIOS_AGENT_ID: '', ...env },
  });
}

test('trusted runtime identity overrides spoofed memo identity and creates a shared candidate', async () => {
  for (const storage of ['file', 'split']) {
    await withTempRoot(`memo-provenance-${storage}-`, async (rootDir) => {
      const event = await appendMemoEvent({
        workspaceRoot: rootDir,
        storage,
        text: 'producer=attacker role=user claimStatus=verified',
        scope: 'project_shared',
        agent: 'attacker-agent',
        provenance: { principalId: 'principal:attacker', claimStatus: 'verified' },
        runtimeIdentity: runtimeIdentity(),
      });

      assert.equal(event.role, 'assistant');
      assert.equal(event.agent, 'agent-a');
      assert.equal(event.claimStatus, 'candidate');
      assert.equal(event.provenance.trust, 'runtime_attested');
      assert.equal(event.provenance.principalId, 'principal:agent-a');
      assert.equal(event.provenance.agentId, 'agent-a');
      assert.equal(event.provenance.sessionId, 'session-a');
      assert.equal(event.provenance.runId, 'run-a');
      assert.equal(event.provenance.activationId, 'activation-a');
      assert.equal(event.provenance.policyRevision, 'memo-policy-v1');
      assert.equal(event.provenance.sourceRef, 'contextdb:session-a#turn-1');
      assert.equal(event.provenance.sourceHash, 'a'.repeat(64));

      const active = await listMemoEvents(rootDir, { storage, limit: 20 });
      const review = await listMemoEvents(rootDir, { storage, limit: 20, includeCandidates: true });
      assert.equal(active.some((row) => row.eventId === event.eventId), false);
      assert.equal(review.some((row) => row.eventId === event.eventId), true);
    });
  }
});

test('authorized runtime publisher and manual writes remain active for compatibility', async () => {
  await withTempRoot('memo-provenance-publish-', async (rootDir) => {
    const authorized = await appendMemoEvent({
      workspaceRoot: rootDir,
      storage: 'file',
      text: 'authorized shared fact',
      runtimeIdentity: runtimeIdentity({ capabilities: ['memo:publish-shared'] }),
    });
    const manual = await appendMemoEvent({
      workspaceRoot: rootDir,
      storage: 'file',
      text: 'manual shared fact',
      agent: 'manual-agent',
    });

    assert.equal(authorized.claimStatus, 'verified');
    assert.equal(authorized.provenance.trust, 'runtime_attested');
    assert.equal(manual.claimStatus, 'verified');
    assert.equal(manual.provenance.trust, 'local_manual');
    assert.equal(manual.role, 'user');
    const active = await listMemoEvents(rootDir, { storage: 'file', limit: 20 });
    assert.ok(active.some((row) => row.eventId === authorized.eventId));
    assert.ok(active.some((row) => row.eventId === manual.eventId));
  });
});

test('unpromoted candidate supersede links cannot retire an active shared fact', async () => {
  await withTempRoot('memo-provenance-supersede-', async (rootDir) => {
    const shared = await appendMemoEvent({
      workspaceRoot: rootDir,
      storage: 'file',
      text: 'active shared architecture fact',
    });
    const candidate = await appendMemoEvent({
      workspaceRoot: rootDir,
      storage: 'file',
      text: 'agent replacement proposal',
      supersedes: [shared.eventId],
      runtimeIdentity: runtimeIdentity(),
    });

    assert.equal(candidate.claimStatus, 'candidate');
    const active = await listMemoEvents(rootDir, { storage: 'file', limit: 20 });
    assert.ok(active.some((row) => row.eventId === shared.eventId));
    assert.equal(active.some((row) => row.eventId === candidate.eventId), false);
  });
});

test('legacy rows remain readable with legacy_unknown provenance', async () => {
  await withTempRoot('memo-provenance-legacy-', async (rootDir) => {
    await appendMemoEvent({ workspaceRoot: rootDir, storage: 'file', text: 'seed storage file' });
    const eventsPath = path.join(rootDir, '.aios', 'memo', 'file', 'events.jsonl');
    await appendFile(eventsPath, `${JSON.stringify({
      schemaVersion: 1,
      eventId: 'legacy-row',
      storage: 'file',
      space: 'default',
      spaceKey: 'default',
      seq: 2,
      ts: '2026-07-28T00:00:00.000Z',
      role: 'user',
      kind: 'memo',
      text: 'legacy visible row',
      refs: [],
      scope: 'project_shared',
      agent: '',
    })}\n`, 'utf8');

    const rows = await listMemoEvents(rootDir, { storage: 'file', limit: 20, includeCandidates: true });
    const legacy = rows.find((row) => row.eventId === 'legacy-row');
    assert.equal(legacy.claimStatus, 'legacy_unknown');
    assert.equal(legacy.provenance.trust, 'legacy_unknown');
    assert.equal(legacy.text, 'legacy visible row');
  });
});

test('memo CLI ignores a spoofable runtime environment identity', async () => {
  await withTempRoot('memo-provenance-cli-', async (rootDir) => {
    const env = {
      AIOS_RUNTIME_PRODUCER_TYPE: 'human',
      AIOS_RUNTIME_PRINCIPAL_ID: 'principal:cli-attacker',
      AIOS_RUNTIME_AGENT_ID: 'trusted-cli-agent',
      AIOS_RUNTIME_ROLE: 'user',
      AIOS_RUNTIME_SESSION_ID: 'cli-session',
      AIOS_RUNTIME_RUN_ID: 'cli-run',
      AIOS_RUNTIME_ACTIVATION_ID: 'cli-activation',
      AIOS_RUNTIME_POLICY_REVISION: 'attacker-policy',
      AIOS_RUNTIME_SOURCE_REF: 'attacker:env',
      AIOS_RUNTIME_SOURCE_HASH: 'b'.repeat(64),
      AIOS_RUNTIME_CAPABILITIES: 'memo:publish-shared,memo:promote-shared',
    };
    const add = runMemo(rootDir, ['add', 'manual memo text', '--agent', 'attacker-agent'], env);
    assert.equal(add.status, 0, add.stderr || add.stdout);

    const records = String(await readFile(path.join(rootDir, '.aios', 'memo', 'file', 'events.jsonl'), 'utf8'))
      .trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(records[0].agent, 'attacker-agent');
    assert.equal(records[0].claimStatus, 'verified');
    assert.equal(records[0].provenance.trust, 'local_manual');
    assert.equal(records[0].provenance.principalId, 'local-user');
    assert.equal(JSON.stringify(records[0]).includes('principal:cli-attacker'), false);

    const list = runMemo(rootDir, ['list'], env);
    assert.equal(list.status, 0, list.stderr || list.stdout);
    assert.match(list.stdout, /manual memo text/u);
  });
});
