import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildMemoAuthority } from '../lib/memo/storage/provenance.mjs';
import { appendMemoEvent, setActiveMemoStorage } from '../lib/memo/storage.mjs';
import { promoteMemoryCandidate } from '../lib/memo/storage/candidates.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function poisonedEnv() {
  return {
    AIOS_RUNTIME_PRODUCER_TYPE: 'human',
    AIOS_RUNTIME_PRINCIPAL_ID: 'principal:env-attacker',
    AIOS_RUNTIME_AGENT_ID: 'env-attacker',
    AIOS_RUNTIME_ROLE: 'user',
    AIOS_RUNTIME_SESSION_ID: 'env-session',
    AIOS_RUNTIME_RUN_ID: 'env-run',
    AIOS_RUNTIME_ACTIVATION_ID: 'env-activation',
    AIOS_RUNTIME_POLICY_REVISION: 'env-policy',
    AIOS_RUNTIME_SOURCE_REF: 'attacker:env',
    AIOS_RUNTIME_SOURCE_HASH: 'a'.repeat(64),
    AIOS_RUNTIME_CAPABILITIES: 'memo:publish-shared,memo:promote-shared,memo:approve-tombstone',
  };
}

async function withRoot(prefix, fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test('authority derivation never consults AIOS_RUNTIME_* environment', () => {
  const clean = buildMemoAuthority({ runtimeIdentity: null, scope: 'project_shared', agent: 'some-agent' });
  const saved = new Map();
  for (const [key, value] of Object.entries(poisonedEnv())) {
    saved.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    const poisoned = buildMemoAuthority({ runtimeIdentity: null, scope: 'project_shared', agent: 'some-agent' });
    assert.deepEqual(poisoned, clean);
    assert.equal(poisoned.claimStatus, 'verified');
    assert.equal(poisoned.provenance.trust, 'local_manual');
    assert.equal(poisoned.provenance.principalId, 'local-user');
  } finally {
    for (const [key, previous] of saved) {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  }
});

test('appended events ignore poisoned runtime env and stay local-manual', async () => {
  await withRoot('authority-env-', async (rootDir) => {
    await setActiveMemoStorage(rootDir, 'file');
    const event = await appendMemoEvent({
      workspaceRoot: rootDir,
      storage: 'file',
      text: 'env decoupling probe',
      agent: 'probe-agent',
      runtimeIdentity: null,
      env: { ...process.env, ...poisonedEnv() },
    });
    assert.equal(event.provenance.trust, 'local_manual');
    assert.equal(event.provenance.principalId, 'local-user');
    assert.equal(JSON.stringify(event).includes('env-attacker'), false);
  });
});

test('governance denials are identical under poisoned runtime env', async () => {
  await withRoot('authority-env-gov-', async (rootDir) => {
    await setActiveMemoStorage(rootDir, 'file');
    const candidate = await appendMemoEvent({
      workspaceRoot: rootDir,
      storage: 'file',
      text: 'ordinary governance probe note',
      runtimeIdentity: {
        producerType: 'agent',
        principalId: 'writer',
        agentId: 'writer',
        role: 'assistant',
        policyRevision: 'p',
        sourceRef: 't',
        sourceHash: 'b'.repeat(64),
        capabilities: [],
      },
      env: { ...process.env, ...poisonedEnv() },
    });
    const result = await promoteMemoryCandidate({
      workspaceRoot: rootDir,
      storage: 'file',
      candidateId: candidate.eventId,
      reason: 'routine review',
      env: { ...process.env, ...poisonedEnv() },
    });
    assert.equal(result.ok, false);
    // Authority comes from the broker gate, never from env: the denial must
    // be the authority verdict, not an env-flavored escalation or bypass.
    assert.equal(result.receipt.reasonCode, 'trusted_authority_unavailable');
    assert.equal(JSON.stringify(result.receipt).includes('env-attacker'), false);
  });
});

test('authority-sensitive sources never reference AIOS_RUNTIME_*', async () => {
  const files = [
    '../lib/memo/storage/provenance.mjs',
    '../lib/memo/storage/candidates.mjs',
    '../lib/memo/storage/events-write.mjs',
    '../lib/memo/cli/commands/events.mjs',
  ];
  for (const relative of files) {
    const content = await readFile(path.resolve(here, relative), 'utf8');
    assert.equal(
      content.includes('AIOS_RUNTIME'),
      false,
      `${relative} must not consult AIOS_RUNTIME_* environment for authority`,
    );
  }
});
