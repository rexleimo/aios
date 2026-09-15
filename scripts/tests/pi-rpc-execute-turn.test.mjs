import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildPiRpcExecuteTurn } from '../lib/lifecycle/harness/execute-turn-pi-rpc.mjs';

const VALID_CONTRACT = JSON.stringify({
  outcome: 'done',
  summary: 'iteration finished',
  keyChanges: ['a'],
  keyLearnings: ['b'],
  nextAction: 'continue',
  shouldStop: false,
});

function fakeSession({ flowText = VALID_CONTRACT, flowError = null } = {}) {
  const calls = { start: 0, newSession: 0, runPromptFlow: [], abort: 0, close: 0 };
  return {
    calls,
    start() {
      calls.start += 1;
    },
    async newSession() {
      calls.newSession += 1;
    },
    async runPromptFlow(message, opts) {
      calls.runPromptFlow.push({ message, opts });
      if (flowError) throw flowError;
      return { text: flowText };
    },
    async abort() {
      calls.abort += 1;
    },
    async close() {
      calls.close += 1;
    },
  };
}

async function withWorkspace(prefix, fn) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await fn(workspaceRoot);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

test('pi rpc executeTurn starts lazily, isolates context per turn, passes JSON contracts', async () => {
  await withWorkspace('aios-pi-rpc-turn-', async (rootDir) => {
    const session = fakeSession();
    const executor = buildPiRpcExecuteTurn({
      rootDir,
      sessionId: 's1',
      objective: 'ship the fix',
      sessionImpl: () => session,
    });

    const turn1 = await executor.executeTurn({ iteration: 1 });
    assert.equal(session.calls.start, 1, 'session starts on first turn only');
    assert.equal(session.calls.newSession, 1, 'fresh context before the turn');
    assert.equal(turn1.outcome, 'done');
    assert.equal(turn1.summary, 'iteration finished');
    assert.match(turn1.prompt, /ship the fix/u);
    assert.equal(session.calls.runPromptFlow[0].opts.timeoutMs, 30 * 60 * 1000, 'settled wait bounded by turn timeout');
    assert.match(session.calls.runPromptFlow[0].message, /ship the fix/u);

    await executor.executeTurn({ iteration: 2 });
    assert.equal(session.calls.start, 1, 'process is reused across turns');
    assert.equal(session.calls.newSession, 2, 'each turn gets a fresh pi context');

    await executor.dispose();
    assert.equal(session.calls.close, 1, 'dispose closes the managed session');
  });
});

test('pi rpc executeTurn maps non-JSON output to infra-retry runtime-error', async () => {
  await withWorkspace('aios-pi-rpc-nonjson-', async (rootDir) => {
    const session = fakeSession({ flowText: 'the agent replied in prose without any contract' });
    const executor = buildPiRpcExecuteTurn({
      rootDir,
      sessionId: 's1',
      objective: 'obj',
      sessionImpl: () => session,
    });
    const turn = await executor.executeTurn({ iteration: 1 });
    assert.equal(turn.outcome, 'infra-retry');
    assert.equal(turn.shouldStop, false);
    assert.equal(turn.failureClass, 'runtime-error');
    assert.deepEqual(turn.evidence, ['transport=pi-rpc', 'turnTimeoutMs=1800000']);
  });
});

test('pi rpc executeTurn discards a broken session and rebuilds on the next turn', async () => {
  await withWorkspace('aios-pi-rpc-broken-', async (rootDir) => {
    const session1 = fakeSession({ flowError: new Error('pi RPC settled timeout') });
    const session2 = fakeSession();
    const sessions = [session1, session2];
    const executor = buildPiRpcExecuteTurn({
      rootDir,
      sessionId: 's1',
      objective: 'obj',
      sessionImpl: () => sessions.shift() ?? fakeSession(),
    });

    const failed = await executor.executeTurn({ iteration: 1 });
    assert.equal(failed.outcome, 'infra-retry');
    assert.match(failed.summary, /settled timeout/u);
    assert.equal(session1.calls.close, 1, 'broken session is closed, never carried into the next turn');

    const recovered = await executor.executeTurn({ iteration: 2 });
    assert.equal(recovered.outcome, 'done');
    assert.equal(session2.calls.start, 1, 'next turn rebuilt a fresh managed session');
    await executor.dispose();
    assert.equal(session2.calls.close, 1);
  });
});

test('pi rpc executeTurn honors a pre-aborted stop signal without starting a session', async () => {
  await withWorkspace('aios-pi-rpc-abort-', async (rootDir) => {
    let created = 0;
    const executor = buildPiRpcExecuteTurn({
      rootDir,
      sessionId: 's1',
      objective: 'obj',
      sessionImpl: () => {
        created += 1;
        return fakeSession();
      },
    });
    const controller = new AbortController();
    controller.abort();
    const turn = await executor.executeTurn({ iteration: 1, abortSignal: controller.signal });
    assert.equal(turn.outcome, 'stopped');
    assert.equal(turn.shouldStop, true);
    assert.equal(turn.failureClass, 'stop-requested');
    assert.equal(created, 0, 'no pi process is spawned for an already-aborted turn');
  });
});
