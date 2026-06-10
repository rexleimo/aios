/* 中文注释：Agent turn gateway 回归测试确保每次 AIOS 托管调用都先压缩发送、再压缩接收，并留下跨客户端指标。 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  TURN_COMPRESSION_CLIENT_IDS,
  compressPostReceiveTurn,
  compressPreSendTurn,
  formatTurnCompressionLog,
  readRawRef,
  recordUncontrolledTurn,
  requireTurnCompression,
  runTurnCompressionMatrixProof,
} from '../lib/interception/index.mjs';
import { CLIENT_ORDER } from '../lib/interception/clients/capabilities.mjs';
import { readMetricsRecords } from '../lib/interception/metrics/metrics-sink.mjs';
import { ALL_CLIENTS } from '../lib/clients/core/definitions.mjs';

const PRE_SEND_SENTINEL = 'UNIQUE_PRE_SEND_AGENT_PROMPT_SENTINEL';
const POST_RECEIVE_SENTINEL = 'UNIQUE_POST_RECEIVE_AGENT_OUTPUT_SENTINEL';

const REQUIRED_CLIENT_IDS = CLIENT_ORDER;

test('turn gateway compresses pre-send prompts before they enter the target client', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-turn-pre-send-'));
  try {
    const rawPrompt = [
      'You are an AIOS worker. Follow the objective and include exact paths.',
      'Relevant file: scripts/lib/lifecycle/harness/execute-turn.mjs:42',
      PRE_SEND_SENTINEL.repeat(50),
      'Next action: implement the missing turn gateway.',
    ].join('\n');

    const packet = await compressPreSendTurn({
      workspaceRoot,
      cwd: workspaceRoot,
      sessionId: 'turn-session',
      clientId: 'codex',
      hostLevel: 'L2',
      prompt: rawPrompt,
      mode: 'tight',
      now: () => new Date('2026-06-05T00:00:00.000Z'),
      thresholds: { minRawBytes: 64 },
      metrics: { enabled: true },
    });

    assert.equal(packet.type, 'aios.compact_packet');
    assert.equal(packet.source, 'agent');
    assert.equal(packet.event_kind, 'pre_send');
    assert.equal(packet.client_id, 'codex');
    assert.equal(packet.host_level, 'L2');
    assert.equal(packet.mode, 'tight');
    assert.equal(packet.refs.length, 1);
    assert.equal(JSON.stringify(packet).includes(PRE_SEND_SENTINEL), false);
    assert.equal(packet.metrics.saved_bytes > 0, true);

    const recalled = await readRawRef({ workspaceRoot, sessionId: 'turn-session', refId: packet.refs[0].ref_id });
    assert.equal(recalled.raw.includes(PRE_SEND_SENTINEL), true);

    const records = await readMetricsRecords({ workspaceRoot, sessionId: 'turn-session' });
    assert.equal(records.length, 1);
    assert.equal(records[0].event_kind, 'pre_send');
    assert.equal(records[0].client_id, 'codex');
    assert.equal(records[0].host_level, 'L2');
    assert.equal(records[0].mode, 'tight');
    assert.equal(records[0].saved_bytes, packet.metrics.saved_bytes);
    assert.equal(records[0].uncontrolled, false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('turn gateway compresses post-receive assistant output before it is accepted by AIOS', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-turn-post-receive-'));
  try {
    const rawOutput = [
      'Agent result: reviewed interception runtime.',
      'ERROR actionable issue at scripts/lib/interception/core/engine.mjs:77',
      POST_RECEIVE_SENTINEL.repeat(50),
      'Handoff: wire metrics event kinds next.',
    ].join('\n');

    const packet = await compressPostReceiveTurn({
      workspaceRoot,
      cwd: workspaceRoot,
      sessionId: 'turn-session',
      clientId: 'aios-harness',
      hostLevel: 'L3',
      output: rawOutput,
      mode: 'tight',
      now: () => new Date('2026-06-05T00:00:00.000Z'),
      thresholds: { minRawBytes: 64 },
      metrics: { enabled: true },
    });

    assert.equal(packet.source, 'agent');
    assert.equal(packet.event_kind, 'post_receive');
    assert.equal(packet.client_id, 'aios-harness');
    assert.equal(packet.host_level, 'L3');
    assert.equal(JSON.stringify(packet).includes(POST_RECEIVE_SENTINEL), false);
    assert.match(packet.errors.join('\n'), /ERROR actionable issue/);
    assert.equal(packet.metrics.saving_ratio > 0.5, true);

    const recalled = await readRawRef({ workspaceRoot, sessionId: 'turn-session', refId: packet.refs[0].ref_id });
    assert.equal(recalled.raw.includes(POST_RECEIVE_SENTINEL), true);

    const records = await readMetricsRecords({ workspaceRoot, sessionId: 'turn-session' });
    assert.equal(records[0].event_kind, 'post_receive');
    assert.equal(records[0].client_id, 'aios-harness');
    assert.equal(records[0].host_level, 'L3');
    assert.equal(records[0].uncontrolled, false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('turn coverage includes every registered client plus AIOS-owned virtual clients', () => {
  for (const clientId of REQUIRED_CLIENT_IDS) {
    assert.equal(TURN_COMPRESSION_CLIENT_IDS.includes(clientId), true, `${clientId} must be covered`);
  }
});

test('turn compression log formatter emits a readable execution line', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-turn-log-format-'));
  try {
    const packet = await compressPreSendTurn({
      workspaceRoot,
      cwd: workspaceRoot,
      sessionId: 'turn-log',
      clientId: 'codex',
      hostLevel: 'L2',
      prompt: PRE_SEND_SENTINEL.repeat(40),
      mode: 'tight',
      now: () => new Date('2026-06-05T00:00:00.000Z'),
      thresholds: { minRawBytes: 64 },
      metrics: { enabled: false },
    });

    const line = formatTurnCompressionLog(packet);
    assert.match(line, /pre_send/);
    assert.match(line, /client=codex/);
    assert.match(line, /strategy=/);
    assert.match(line, /saved=/);
    assert.match(line, /ref=/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});


test('turn matrix proof emits aligned pre-send and post-receive metrics for every client', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-turn-matrix-'));
  try {
    const proof = await runTurnCompressionMatrixProof({
      workspaceRoot,
      sessionId: 'turn-matrix',
      now: () => new Date('2026-06-05T00:00:00.000Z'),
      thresholds: { minRawBytes: 64 },
    });

    assert.equal(proof.ok, true);
    assert.deepEqual(proof.clients.map((client) => client.client_id), REQUIRED_CLIENT_IDS);
    for (const client of proof.clients) {
      assert.equal(client.required_entrypoint, 'aios-managed-runner');
      assert.equal(client.direct_host_bypass_allowed, false);
      assert.equal(client.compliance_status, 'compliant');
      for (const eventKind of ['pre_send', 'post_receive']) {
        const metric = client[eventKind];
        assert.equal(metric.event_kind, eventKind);
        assert.equal(metric.client_id, client.client_id);
        assert.equal(metric.saved_bytes > 0, true, `${client.client_id} ${eventKind} must save bytes`);
        assert.equal(metric.saving_ratio > 0.5, true, `${client.client_id} ${eventKind} must exceed proof ratio`);
        assert.equal(metric.raw_sentinel_leaked, false);
        assert.equal(metric.ref_id.length > 0, true);
      }
    }

    const records = await readMetricsRecords({ workspaceRoot, sessionId: 'turn-matrix' });
    assert.equal(records.length, REQUIRED_CLIENT_IDS.length * 2);
    assert.equal(records.every((record) => record.saved_bytes > 0), true);
    assert.equal(records.some((record) => record.event_kind === 'pre_send'), true);
    assert.equal(records.some((record) => record.event_kind === 'post_receive'), true);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('uncontrolled host output is recorded without fake savings', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-turn-uncontrolled-'));
  try {
    const record = await recordUncontrolledTurn({
      workspaceRoot,
      sessionId: 'direct-host',
      clientId: 'cursor',
      hostLevel: 'L1',
      rawBytes: 4096,
      fallbackReason: 'host has no verified pre-send/post-receive mutation surface',
      now: () => new Date('2026-06-05T00:00:00.000Z'),
    });

    assert.equal(record.event_kind, 'uncontrolled_host_output');
    assert.equal(record.client_id, 'cursor');
    assert.equal(record.host_level, 'L1');
    assert.equal(record.uncontrolled, true);
    assert.equal(record.raw_bytes, 4096);
    assert.equal(record.compact_bytes, 4096);
    assert.equal(record.saved_bytes, 0);
    assert.equal(record.saving_ratio, 0);
    assert.equal(record.policy_violation, true);
    assert.equal(record.compliance_status, 'non_compliant');
    assert.equal(record.fallback_reason.includes('no verified'), true);

    const records = await readMetricsRecords({ workspaceRoot, sessionId: 'direct-host' });
    assert.deepEqual(records[0], record);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('required turn compression records a policy violation and fails closed when hook execution breaks', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-turn-required-'));
  try {
    await assert.rejects(
      requireTurnCompression({
        workspaceRoot,
        cwd: workspaceRoot,
        sessionId: 'required-turn',
        clientId: 'codex',
        hostLevel: 'L2',
        mode: 'tight',
        eventKind: 'pre_send',
        text: PRE_SEND_SENTINEL.repeat(40),
        run: async () => {
          throw new Error('compress boom');
        },
      }),
      /required pre_send failed for codex: compress boom/u
    );

    const records = await readMetricsRecords({ workspaceRoot, sessionId: 'required-turn' });
    assert.equal(records.length, 1);
    assert.equal(records[0].event_kind, 'uncontrolled_host_output');
    assert.equal(records[0].client_id, 'codex');
    assert.equal(records[0].policy_violation, true);
    assert.match(records[0].fallback_reason, /missing pre_send turn compression/i);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
