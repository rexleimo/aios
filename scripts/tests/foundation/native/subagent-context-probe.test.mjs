// VFC-1 W1 · 探针答案判定：nonce 匹配、噪声容忍与分类器护栏。
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildSubagentContextEvidenceRecord,
  buildSubagentContextProbe,
  classifyProbeAnswer,
  createProbeNonce,
  writeSubagentContextDeclaration,
} from '../../../lib/foundation/clients/reporting/capability-report/subagent-context.mjs';
import { runSubagentContextProbeCommand } from '../../../lib/execution/lifecycle/fleet/agents.mjs';

const NONCE = 'AIOS-NONCE-ABCDEF0123456789';

async function makeRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-subagent-context-'));
  const { mkdir } = await import('node:fs/promises');
  await mkdir(path.join(root, 'config'), { recursive: true });
  await writeFile(
    path.join(root, 'config', 'host-capabilities.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      clients: {
        codex: {
          targetLevel: 'L2',
          capabilities: ['mcpProxy'],
          limits: [],
          requiredEntrypoint: 'aios-managed-runner',
          directHostBypassAllowed: false,
        },
      },
    }, null, 2)}
`,
    'utf8'
  );
  return root;
}


test('classifyProbeAnswer: child reporting the parent nonce means fork', () => {
  const answer = JSON.stringify({
    subagentSpawned: true,
    subagentTool: 'Task',
    childReport: `The value is ${NONCE}`,
  });
  assert.deepEqual(classifyProbeAnswer({ answer, nonce: NONCE }), {
    verdict: 'fork',
    reason: 'child-reported-parent-nonce',
    matched: true,
  });
});

test('classifyProbeAnswer: nonce match is case-insensitive', () => {
  const answer = JSON.stringify({
    subagentSpawned: true,
    childReport: `value: ${NONCE.toLowerCase()}`,
  });
  assert.equal(classifyProbeAnswer({ answer, nonce: NONCE }).verdict, 'fork');
});

test('classifyProbeAnswer: child that cannot report the nonce means fresh', () => {
  const answer = JSON.stringify({
    subagentSpawned: true,
    childReport: 'I was not given any nonce and cannot see one.',
  });
  assert.deepEqual(classifyProbeAnswer({ answer, nonce: NONCE }), {
    verdict: 'fresh',
    reason: 'child-could-not-report-parent-nonce',
    matched: false,
  });
});

test('classifyProbeAnswer: every ambiguous shape degrades to unknown, never a guess', () => {
  const cases = [
    { answer: 'I could not run a subagent.', reason: 'answer-not-structured' },
    { answer: '{"subagentSpawned":false}', reason: 'no-subagent-spawned' },
    { answer: '{"subagentSpawned":true,"childReport":""}', reason: 'empty-child-report' },
    { answer: '{"subagentSpawned": tru}', reason: 'answer-not-json' },
  ];
  for (const { answer, reason } of cases) {
    assert.deepEqual(classifyProbeAnswer({ answer, nonce: NONCE }), {
      verdict: 'unknown', reason, matched: false,
    }, reason);
  }
  assert.equal(classifyProbeAnswer({ answer: '{}', nonce: '' }).reason, 'missing-nonce');
});

test('buildSubagentContextProbe embeds the nonce and refuses a missing one', () => {
  const probe = buildSubagentContextProbe({ client: 'codex', nonce: NONCE });
  assert.match(probe.prompt, /AIOS_SUBAGENT_CONTEXT_NONCE=AIOS-NONCE-ABCDEF0123456789/);
  assert.match(probe.prompt, /"subagentSpawned": true/);
  assert.throws(() => buildSubagentContextProbe({ client: 'codex', nonce: '' }), /requires a nonce/);
});

test('createProbeNonce is shaped and unique per call', () => {
  const a = createProbeNonce();
  const b = createProbeNonce();
  assert.match(a, /^AIOS-NONCE-[0-9A-F]{16}$/);
  assert.notEqual(a, b);
});

test('evidence record keeps an indirect-confidence envelope and hashes', () => {
  const record = buildSubagentContextEvidenceRecord({
    client: 'codex',
    clientRuntimeId: 'codex-cli',
    nonce: NONCE,
    answer: 'hello',
    verdict: 'fresh',
    reason: 'child-could-not-report-parent-nonce',
    measuredAt: '2026-10-30T00:00:00.000Z',
  });
  assert.equal(record.kind, 'aios.subagent-context-probe.v1');
  assert.equal(record.verdict, 'fresh');
  assert.equal(record.confidence, 'indirect');
  assert.match(record.nonceHash, /^sha256:[0-9a-f]{64}$/);
  assert.match(record.answerSha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(record.answer, 'hello');
  // 非法 verdict 一律回落 unknown，而不是透传。
  assert.equal(buildSubagentContextEvidenceRecord({ verdict: 'probably-fork' }).verdict, 'unknown');
});

test('spawn path classifies only the assistant text, never the echoed prompt stream', async () => {
  const root = await makeRoot();
  try {
    // 宿主声明 surface:none，但带 --spawn 强制复测：证明复测不会用事件流判定。
    await writeSubagentContextDeclaration({
      rootDir: root,
      client: 'codex',
      contextMode: 'not-applicable',
      surface: 'none',
      reason: 'declared-no-subagent-surface',
      evidenceRef: 'declared',
    });
    // 事件流里回显了 prompt（含 nonce），但 assistant 文本里没有。
    const rawStream = [
      JSON.stringify({ type: 'session', version: 3, id: 's1' }),
      JSON.stringify({ type: 'message_start', message: { role: 'user', content: `echo ${NONCE}` } }),
    ].join('\n');

    const result = await runSubagentContextProbeCommand(
      { clientId: 'codex', spawn: true, nonce: NONCE },
      {
        rootDir: root,
        readVersion: () => 'test-version',
        now: () => '2026-10-30T00:00:00.000Z',
        runAgent: () => ({
          output: rawStream,
          exitCode: 0,
          structured: {
            kind: 'aios.pi-json-stream.v1',
            assistantText: '{"subagentSpawned":true,"subagentTool":"Task","childReport":"No such value available."}',
            stopReason: 'stop',
            sawSettle: true,
            recordCount: 2,
          },
        }),
      }
    );

    assert.equal(result.verdict, 'fresh', 'echoed prompt must not be mistaken for a child report');
    assert.equal(result.spawned !== false, true, 'spawn path actually spawns');
    assert.match(result.evidencePath, /codex\.spawn\.json$/, 'diagnostic evidence is written separately');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('classifyProbeAnswer ignores a trailing host banner around the answer object', () => {
  // 真实 codex 输出形态：答案 JSON 之后还跟着 banner + 提示词回显（里面也有花括号）。
  const answer = [
    '{"subagentSpawned":true,"subagentTool":"collaboration.spawn_agent","childReport":"no nonce here","notes":""}',
    'OpenAI Codex v0.152.0',
    '--------',
    'workdir: E:\\coding\\harness-cli',
    'model: gpt-5.6-terra',
    '--------',
    'user',
    'Reply with one JSON object and nothing else:',
    '{',
    '  "subagentSpawned": true,',
    '  "childReport": "<the child response, verbatim>",',
    '}',
  ].join('\n');

  const judgment = classifyProbeAnswer({ answer, nonce: NONCE });
  assert.equal(judgment.verdict, 'fresh', 'must classify the answer object, not the banner template');
  assert.equal(judgment.reason, 'child-could-not-report-parent-nonce');
});

test('classifyProbeAnswer picks the contract object even when unrelated JSON comes first', () => {
  const answer = '{"diagnostics":{"nested":{"a":1}}}\n{"subagentSpawned":true,"childReport":"saw ' + NONCE + '"}';
  const judgment = classifyProbeAnswer({ answer, nonce: NONCE });
  assert.equal(judgment.verdict, 'fork');
  assert.equal(judgment.reason, 'child-reported-parent-nonce');
});

test('classifyProbeAnswer: an echoed prompt is not evidence of a fork', () => {
  // 探针提示词本身就带着 nonce；宿主回显提示词不等于 subagent 看见了它。
  const answer = '{"subagentSpawned":true,"childReport":"I was asked about AIOS_SUBAGENT_CONTEXT_NONCE but got no value"}';
  assert.equal(classifyProbeAnswer({ answer, nonce: 'AIOS-NONCE-FFFFFFFFFFFFFFFF' }).verdict, 'fresh');
});

test('classifyProbeAnswer distinguishes "no JSON at all" from "unparseable JSON"', () => {
  assert.equal(classifyProbeAnswer({ answer: 'plain prose, no braces', nonce: NONCE }).reason, 'answer-not-structured');
  assert.equal(classifyProbeAnswer({ answer: '{"subagentSpawned": tru', nonce: NONCE }).reason, 'answer-not-json');
});

test('fork is surfaced as the risk case, never absorbed into a neutral "measured" count', async () => {
  const { buildSubagentContextSummary, renderStatusText } = await import('../../../lib/execution/lifecycle/fleet/status.mjs');
  const root = await makeRoot();
  try {
    await writeSubagentContextDeclaration({
      rootDir: root,
      client: 'codex',
      surface: 'host-tool',
      contextMode: 'fork',
      reason: 'child-reported-parent-nonce',
      evidenceRef: '.aios/agents/subagent-context/codex.json',
      measuredAt: '2026-10-30T00:00:00.000Z',
    });
    await writeSubagentContextDeclaration({
      rootDir: root,
      client: 'codex',
      surface: 'none',
      contextMode: 'not-applicable',
      reason: 'host-reports-no-subagent-tool',
      measuredAt: '2026-10-30T00:00:00.000Z',
    });

    const summary = await buildSubagentContextSummary({ rootDir: root, now: Date.parse('2026-10-31T00:00:00.000Z') });
    assert.deepEqual(summary.forkClientIds, [], 'not-applicable must not be counted as fork');

    await writeSubagentContextDeclaration({
      rootDir: root,
      client: 'codex',
      surface: 'host-tool',
      contextMode: 'fork',
      reason: 'child-reported-parent-nonce',
      evidenceRef: '.aios/agents/subagent-context/codex.json',
      measuredAt: '2026-10-30T00:00:00.000Z',
    });
    const forked = await buildSubagentContextSummary({ rootDir: root, now: Date.parse('2026-10-31T00:00:00.000Z') });
    assert.deepEqual(forked.forkClientIds, ['codex']);

    // 中文注释：状态行必须把 fork 说出来；只报 "measured=1/1" 会让人以为测到的是干净结果。
    const line = renderStatusText({
      policy: 'default',
      overallStatus: 'incomplete',
      agentCatalogue: { totalAgents: 1, byLifecycle: { candidate: 0 } },
      workflowRecipes: { totalRecipes: 1, blockedWorkflowIds: [] },
      clientCapabilities: { totalClients: 1, pendingSmokeClientIds: [] },
      blockers: [],
      subagentContext: forked,
    });
    assert.match(line, /fork=1\(codex\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
