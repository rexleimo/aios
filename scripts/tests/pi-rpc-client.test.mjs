import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createJsonlFramer,
  createPiRpcSession,
  defaultUiApprover,
} from '../lib/pi/rpc-client.mjs';

test('framer splits on LF only and tolerates CRLF', () => {
  const records = [];
  const errors = [];
  const framer = createJsonlFramer({ onRecord: (r) => records.push(r), onParseError: (e) => errors.push(e) });
  framer.push('{"a":1}\r\n{"b":"x y"}\n{"c":');
  assert.deepEqual(records, [{ a: 1 }, { b: 'x y' }]);
  framer.push('3}\nnot-json\n');
  assert.deepEqual(records[2], { c: 3 });
  assert.equal(errors.length, 1);
  framer.flush();
});

test('default UI approver fails closed', async () => {
  assert.deepEqual(await defaultUiApprover({ method: 'confirm' }), { cancelled: true });
});

class FakeStdout extends EventEmitter {}
class FakeStdin {
  constructor() {
    this.writes = [];
  }

  write(chunk) {
    this.writes.push(String(chunk));
  }
}
class FakeProcess extends EventEmitter {
  constructor() {
    super();
    this.stdout = new FakeStdout();
    this.stdin = new FakeStdin();
    this.killed = false;
  }

  kill() {
    this.killed = true;
  }
}

function makeSession({ onEvent, approver, responseTimeoutMs = 1000 } = {}) {
  const events = [];
  let proc = null;
  const session = createPiRpcSession({
    spawnImpl: () => {
      proc = new FakeProcess();
      return proc;
    },
    command: 'pi-stub',
    args: ['--mode', 'rpc'],
    onEvent: (record) => {
      events.push(record);
      onEvent?.(record);
    },
    ...(approver ? { approver } : {}),
    responseTimeoutMs,
  });
  session.start();
  const emit = (obj, chunked = false) => {
    const line = `${JSON.stringify(obj)}\n`;
    if (chunked) {
      const half = Math.floor(line.length / 2);
      proc.stdout.emit('data', line.slice(0, half));
      proc.stdout.emit('data', line.slice(half));
    } else {
      proc.stdout.emit('data', line);
    }
  };
  const sent = () => proc.stdin.writes.map((line) => JSON.parse(line));
  return { session, proc: () => proc, emit, sent, events };
}

test('prompt flow resolves acceptance, settles, and returns last text', async () => {
  const { session, emit, sent } = makeSession();
  const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
  try {
    const flow = session.runPromptFlow('hello', { timeoutMs: 1000 });
    emit({ id: 'aios-1', type: 'response', command: 'prompt', success: true });
    await sleep(10);
    emit({ type: 'agent_start' });
    emit({ type: 'agent_settled' });
    await sleep(10);
    emit({ id: 'aios-2', type: 'response', command: 'get_last_assistant_text', success: true, data: { text: 'hi' } });
    const result = await flow;
    assert.equal(result.text, 'hi');
    assert.deepEqual(sent().map((s) => s.type), ['prompt', 'get_last_assistant_text']);
    assert.equal(sent()[0].id, 'aios-1');
  } finally {
    await session.close();
  }
});

test('rejected prompt fails the flow closed', async () => {
  const { session, emit } = makeSession();
  try {
    const flow = session.runPromptFlow('x', { timeoutMs: 500 });
    emit({ id: 'aios-1', type: 'response', command: 'prompt', success: false, error: 'streaming' });
    await assert.rejects(flow, /prompt rejected: streaming/iu);
  } finally {
    await session.close();
  }
});

test('confirm dialogs auto-cancel and notify UI is ignored', async () => {
  const { session, emit, sent } = makeSession();
  try {
    const pending = session.prompt('do it');
    emit({ id: 'aios-1', type: 'response', command: 'prompt', success: true });
    await pending;
    emit({ type: 'extension_ui_request', id: 'ui-1', method: 'confirm', title: 'Allow?', message: 'rm?' });
    emit({ type: 'extension_ui_request', id: 'ui-2', method: 'notify', message: 'hi', notifyType: 'info' });
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    const uiResponses = sent().filter((s) => s.type === 'extension_ui_response');
    assert.equal(uiResponses.length, 1);
    assert.deepEqual(uiResponses[0], { type: 'extension_ui_response', id: 'ui-1', cancelled: true });
  } finally {
    await session.close();
  }
});

test('explicit approver can allow a dialog', async () => {
  const { session, emit, sent } = makeSession({ approver: async () => ({ confirmed: true }) });
  try {
    const pending = session.prompt('do it');
    emit({ id: 'aios-1', type: 'response', command: 'prompt', success: true });
    await pending;
    emit({ type: 'extension_ui_request', id: 'ui-9', method: 'confirm', title: 'T', message: 'M' });
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    assert.deepEqual(
      sent().filter((s) => s.type === 'extension_ui_response'),
      [{ type: 'extension_ui_response', id: 'ui-9', confirmed: true }],
    );
  } finally {
    await session.close();
  }
});

test('settled timeout and process close fail pending work', async () => {
  const { session, proc } = makeSession({ responseTimeoutMs: 50 });
  try {
    await assert.rejects(session.waitSettled({ timeoutMs: 20 }), /settled timeout/iu);
    const late = session.getState();
    proc().emit('close', 1);
    await assert.rejects(late, /closed/iu);
  } finally {
    await session.close();
  }
  assert.equal(proc().killed, true);
});

// Regression: the RPC transport must resolve argv through the shared platform
// spawn spec. On Windows `pi` ships as an extensionless npm shim beside
// pi.cmd, and a raw spawn('pi', ...) there dies with ENOENT before the JSONL
// protocol ever starts (observed as `spawn pi ENOENT` in the solo journal).
test('start() resolves argv through the platform spawn spec', () => {
  const calls = [];
  const session = createPiRpcSession({
    spawnImpl: (command, args, options) => {
      calls.push({ command, args, options });
      return new FakeProcess();
    },
    spawnSpecImpl: (command, args, options) => {
      assert.deepEqual(options.platform, 'win32');
      return { command: 'node.exe', args: ['C:/pi/cli.mjs', ...args], shell: false };
    },
    platform: 'win32',
    command: 'pi',
  });
  session.start();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'node.exe');
  assert.deepEqual(calls[0].args, ['C:/pi/cli.mjs', '--mode', 'rpc', '--no-session']);
  assert.equal(calls[0].options.shell, false);
});

test('start() never spawns a bare extensionless shim on win32', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-pi-shim-'));
  fs.writeFileSync(path.join(dir, 'pi'), '#!/bin/sh\nexit 0\n');
  fs.writeFileSync(path.join(dir, 'pi.cmd'), '@echo off\r\n');
  const calls = [];
  const session = createPiRpcSession({
    spawnImpl: (command, args, options) => {
      calls.push({ command, args, options });
      return new FakeProcess();
    },
    platform: 'win32',
    env: { ...process.env, PATH: dir, PATHEXT: '.COM;.EXE;.BAT;.CMD' },
    command: 'pi',
  });
  try {
    session.start();
  } finally {
    session.close();
  }
  assert.equal(calls.length, 1);
  const { command, options } = calls[0];
  const resolvedWithoutShell = command === 'pi' && options.shell !== true;
  assert.equal(
    resolvedWithoutShell,
    false,
    `win32 must route the pi shim through a resolved target or cmd.exe shell, got command=${command} shell=${options.shell}`,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});
