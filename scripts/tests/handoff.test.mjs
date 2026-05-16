import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  normalizeHandoffPacket,
  writeHandoffPacket,
  readHandoffPacket,
  renderHandoffInjection,
} from '../lib/contextdb/handoff.mjs';

test('normalizeHandoffPacket produces valid v2 packet from minimal input', async () => {
  const packet = normalizeHandoffPacket({
    fromSessionId: 'session-123',
    agentType: 'claude-code',
    role: 'implementer',
  });

  assert.equal(packet.schemaVersion, 2);
  assert.equal(packet.fromAgent.sessionId, 'session-123');
  assert.equal(packet.fromAgent.agentType, 'claude-code');
  assert.equal(packet.fromAgent.role, 'implementer');
  assert.equal(packet.confidence, 'medium');
  assert.equal(typeof packet.updatedAt, 'string');
  assert.deepEqual(packet.nextActions, []);
  assert.deepEqual(packet.blockers, []);
  assert.deepEqual(packet.touchedFiles, []);
  assert.deepEqual(packet.workspaceChanges, []);
  assert.deepEqual(packet.pendingWrites, []);
  assert.deepEqual(packet.assumptions, []);
});

test('normalizeHandoffPacket rejects invalid agentType', async () => {
  assert.throws(
    () => normalizeHandoffPacket({
      fromSessionId: 'session-123',
      agentType: 'invalid-agent',
      role: 'implementer',
    }),
    /invalid agentType/
  );
});

test('writeHandoffPacket and readHandoffPacket round-trip', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'handoff-test-'));
  try {
    const sessionId = 'test-session-456';
    const packet = {
      fromSessionId: sessionId,
      agentType: 'codex',
      role: 'planner',
      intent: 'Design new feature',
      progress: 'Analyzed requirements',
      nextActions: ['Create spec', 'Review with team'],
      blockers: ['Waiting for approval'],
      touchedFiles: ['docs/design.md'],
      confidence: 'high',
      assumptions: ['API is stable'],
    };

    await writeHandoffPacket(tmpDir, sessionId, packet);
    const read = await readHandoffPacket(tmpDir, sessionId);

    await stat(path.join(tmpDir, '.aios', 'context-db', 'sessions', sessionId, 'handoff.json'));
    await assert.rejects(() => stat(path.join(tmpDir, 'memory', 'context-db', 'sessions', sessionId, 'handoff.json')));
    assert.equal(read.schemaVersion, 2);
    assert.equal(read.fromAgent.sessionId, sessionId);
    assert.equal(read.fromAgent.agentType, 'codex');
    assert.equal(read.fromAgent.role, 'planner');
    assert.equal(read.intent, 'Design new feature');
    assert.equal(read.progress, 'Analyzed requirements');
    assert.deepEqual(read.nextActions, ['Create spec', 'Review with team']);
    assert.deepEqual(read.blockers, ['Waiting for approval']);
    assert.deepEqual(read.touchedFiles, ['docs/design.md']);
    assert.equal(read.confidence, 'high');
    assert.deepEqual(read.assumptions, ['API is stable']);
  } finally {
    await rm(tmpDir, { recursive: true });
  }
});

test('readHandoffPacket reads legacy memory/context-db handoff when dotdir state is absent', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'handoff-test-legacy-'));
  try {
    const sessionId = 'legacy-session';
    const legacyDir = path.join(tmpDir, 'memory', 'context-db', 'sessions', sessionId);
    await mkdir(legacyDir, { recursive: true });
    await writeFile(path.join(legacyDir, 'handoff.json'), `${JSON.stringify({
      schemaVersion: 2,
      fromAgent: { sessionId, agentType: 'codex', role: 'planner' },
      intent: 'Legacy handoff',
      progress: 'Existing state',
      confidence: 'medium',
      nextActions: [],
      blockers: [],
      touchedFiles: [],
      workspaceChanges: [],
      pendingWrites: [],
      assumptions: [],
      updatedAt: new Date().toISOString(),
    })}\n`, 'utf8');

    const read = await readHandoffPacket(tmpDir, sessionId);
    assert.equal(read.intent, 'Legacy handoff');
  } finally {
    await rm(tmpDir, { recursive: true });
  }
});

test('readHandoffPacket returns null for missing session', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'handoff-test-'));
  try {
    const result = await readHandoffPacket(tmpDir, 'nonexistent-session');
    assert.equal(result, null);
  } finally {
    await rm(tmpDir, { recursive: true });
  }
});

test('renderHandoffInjection produces compact markdown', async () => {
  const packet = {
    fromSessionId: 'session-789',
    agentType: 'gemini',
    role: 'reviewer',
    intent: 'Review implementation',
    progress: 'Checked code quality',
    nextActions: ['Approve PR', 'Merge to main'],
    blockers: ['Tests failing'],
    assumptions: ['Main branch is stable'],
    confidence: 'medium',
  };

  const markdown = renderHandoffInjection(packet);

  assert(markdown.includes('## Handoff from session-789'));
  assert(markdown.includes('- **Role:** reviewer (gemini)'));
  assert(markdown.includes('- **Confidence:** medium'));
  assert(markdown.includes('- **Intent:** Review implementation'));
  assert(markdown.includes('### Progress'));
  assert(markdown.includes('Checked code quality'));
  assert(markdown.includes('### Next Actions'));
  assert(markdown.includes('- Approve PR'));
  assert(markdown.includes('- Merge to main'));
  assert(markdown.includes('### Blockers'));
  assert(markdown.includes('- Tests failing'));
  assert(markdown.includes('### Assumptions to Verify'));
  assert(markdown.includes('- Main branch is stable'));
});

test('renderHandoffInjection returns empty string for null input', async () => {
  const result = renderHandoffInjection(null);
  assert.equal(result, '');
});
