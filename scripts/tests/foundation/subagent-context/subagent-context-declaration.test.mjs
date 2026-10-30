// VFC-1 W1/W4 · 能力声明侧：写回、新鲜度、可移植证据引用与报告面（report-only，不默认红）。
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildSubagentContextEvidenceRecord,
  evaluateDeclarationFreshness,
  portableEvidenceRef,
  readSubagentContextDeclaration,
  writeSubagentContextDeclaration,
} from '../../../lib/foundation/clients/reporting/capability-report/subagent-context.mjs';

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


test('declaration roundtrip: unknown is preserved and unknown keys are not dropped', async (t) => {
  const root = await makeRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const before = await readSubagentContextDeclaration({ rootDir: root, client: 'codex' });
  assert.equal(before.declared, false);
  assert.equal(before.contextMode, 'unknown');
  assert.equal(before.reason, 'no-subagent-context-declaration');

  await writeSubagentContextDeclaration({
    rootDir: root,
    client: 'codex',
    contextMode: 'unknown',
    reason: 'not probed yet',
    measuredAt: null,
  });
  const after = await readSubagentContextDeclaration({ rootDir: root, client: 'codex' });
  assert.equal(after.declared, true);
  assert.equal(after.contextMode, 'unknown', 'unknown must survive a roundtrip');

  const config = JSON.parse(await readFile(path.join(root, 'config', 'host-capabilities.json'), 'utf8'));
  assert.deepEqual(Object.keys(config.clients.codex), [
    'targetLevel', 'capabilities', 'limits', 'requiredEntrypoint', 'directHostBypassAllowed', 'subagents',
  ], 'existing key order is preserved and the block is appended');
});

test('declaration freshness: undeclared, unknown, aged, and version drift are all stale', () => {
  const now = Date.parse('2026-10-30T00:00:00.000Z');
  assert.equal(evaluateDeclarationFreshness({ declaration: { declared: false }, now }).state, 'undeclared');
  assert.equal(
    evaluateDeclarationFreshness({ declaration: { declared: true, contextMode: 'unknown' }, now }).state,
    'unknown'
  );
  assert.equal(
    evaluateDeclarationFreshness({
      declaration: { declared: true, contextMode: 'fresh', measuredAt: '2026-01-01T00:00:00.000Z' },
      now,
    }).state,
    'stale'
  );
  assert.equal(
    evaluateDeclarationFreshness({
      declaration: { declared: true, contextMode: 'fresh', measuredAt: '2026-10-29T00:00:00.000Z', clientVersion: '1.0.0' },
      currentClientVersion: '1.1.0',
      now,
    }).state,
    'stale'
  );
  assert.equal(
    evaluateDeclarationFreshness({
      declaration: { declared: true, contextMode: 'fresh', measuredAt: '2026-10-29T00:00:00.000Z', clientVersion: '1.0.0' },
      currentClientVersion: '1.0.0',
      now,
    }).state,
    'current'
  );
});

test('subagent-context summary is report-only and never turns unknown into a blocker', async (t) => {
  const { buildSubagentContextSummary } = await import('../../../lib/execution/lifecycle/fleet/status.mjs');

  const emptyRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-subagent-summary-empty-'));
  t.after(() => rm(emptyRoot, { recursive: true, force: true }));
  const unavailable = await buildSubagentContextSummary({ rootDir: emptyRoot });
  assert.equal(unavailable.status, 'unavailable');
  assert.match(unavailable.reason, /host-capabilities\.json is not readable/);

  const root = await makeRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writeSubagentContextDeclaration({
    rootDir: root,
    client: 'codex',
    contextMode: 'unknown',
    reason: 'not probed yet',
    measuredAt: null,
  });
  const unmeasured = await buildSubagentContextSummary({ rootDir: root });
  assert.equal(unmeasured.status, 'incomplete');
  assert.deepEqual(unmeasured.unknownClientIds, ['codex']);
  assert.deepEqual(unmeasured.staleClientIds, []);

  await writeSubagentContextDeclaration({
    rootDir: root,
    client: 'codex',
    contextMode: 'fresh',
    reason: 'child-could-not-report-parent-nonce',
    evidenceRef: '.aios/agents/subagent-context/codex.json',
    measuredAt: '2026-10-30T00:00:00.000Z',
  });
  const current = await buildSubagentContextSummary({ rootDir: root, now: Date.parse('2026-10-31T00:00:00.000Z') });
  assert.equal(current.status, 'current');
  assert.deepEqual(current.unknownClientIds, []);
  assert.equal(current.clients[0].contextMode, 'fresh');

  const stale = await buildSubagentContextSummary({ rootDir: root, now: Date.parse('2027-01-30T00:00:00.000Z') });
  assert.equal(stale.status, 'incomplete');
  assert.deepEqual(stale.staleClientIds, ['codex']);
});

test('summary counts not-applicable as measured and keeps it out of unknown/stale', async (t) => {
  const { buildSubagentContextSummary } = await import('../../../lib/execution/lifecycle/fleet/status.mjs');
  const root = await makeRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writeSubagentContextDeclaration({
    rootDir: root,
    client: 'codex',
    surface: 'none',
    contextMode: 'not-applicable',
    reason: 'declared-no-subagent-surface',
    measuredAt: '2026-10-30T00:00:00.000Z',
  });
  const summary = await buildSubagentContextSummary({ rootDir: root, now: Date.parse('2026-11-15T00:00:00.000Z') });
  assert.equal(summary.status, 'current');
  assert.deepEqual(summary.unknownClientIds, []);
  assert.deepEqual(summary.staleClientIds, []);
  assert.deepEqual(summary.notApplicableClientIds, ['codex']);

  // “上游没有这个工具”核对周期更长，但不是永远有效。
  const old = await buildSubagentContextSummary({ rootDir: root, now: Date.parse('2027-06-30T00:00:00.000Z') });
  assert.equal(old.status, 'incomplete');
  assert.deepEqual(old.staleClientIds, ['codex']);
});

test('evidence keeps a bounded summary of host-reported structured facts', () => {
  const record = buildSubagentContextEvidenceRecord({
    client: 'pi',
    clientRuntimeId: 'pi-coding-agent',
    nonce: NONCE,
    answer: '{"subagentSpawned":false}',
    verdict: 'unknown',
    reason: 'no-subagent-spawned',
    hostStructured: {
      kind: 'aios.pi-json-stream.v1',
      sessionId: 'sess-1',
      recordCount: 12,
      unparsedLineCount: 0,
      assistantText: 'short',
      toolCalls: ['bash', 'read'],
      usage: { input: 10, output: 5, totalTokens: 15 },
      model: 'openai/gpt-5',
      stopReason: 'stop',
      aborted: false,
      sawSettle: true,
    },
  });
  assert.equal(record.hostStructured.kind, 'aios.pi-json-stream.v1');
  assert.equal(record.hostStructured.assistantTextLength, 5);
  assert.equal(record.hostStructured.toolCallCount, 2);
  assert.equal(record.hostStructured.usage.totalTokens, 15);
  assert.equal(record.hostStructured.sawSettle, true);
  assert.equal(record.hostStructured.assistantText, undefined, 'raw text is not duplicated into the summary');

  // 无结构化事实时是 null，不是伪造的空对象。
  assert.equal(buildSubagentContextEvidenceRecord({}).hostStructured, null);
});

// 声明里的证据引用必须可移植。实测踩过的形状：写回时用 path.join(rootDir, ...) 得到
// `E:\coding\...\.aios\agents\subagent-context\codex.json` 并落进跟踪文件——本机目录形状
// 进了公开仓库，而且换机器后引用悬空，声明里的「证据在盘」就成了假话。
test('portableEvidenceRef stores a root-relative posix path for any in-root ref', async () => {
  const root = await makeRoot();
  try {
    const abs = path.join(root, '.aios', 'agents', 'subagent-context', 'codex.json');
    assert.equal(portableEvidenceRef({ rootDir: root, ref: abs }),
      '.aios/agents/subagent-context/codex.json');
    assert.equal(portableEvidenceRef({ rootDir: root, ref: '.aios/agents/subagent-context/codex.json' }),
      '.aios/agents/subagent-context/codex.json', 'an already-relative ref stays stable');
    assert.equal(portableEvidenceRef({ rootDir: root, ref: '' }), null);
    assert.equal(portableEvidenceRef({ rootDir: root, ref: null }), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// 跳出根目录不是「降级成 null」的理由，而是编码错误：无证据的声明比报错更难查。
test('portableEvidenceRef refuses a ref that escapes the project root', async () => {
  const root = await makeRoot();
  try {
    assert.throws(
      () => portableEvidenceRef({ rootDir: root, ref: path.join(path.dirname(root), 'elsewhere.json') }),
      /must live under the project root/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('writeSubagentContextDeclaration normalizes an absolute evidence path', async () => {
  const root = await makeRoot();
  try {
    const written = await writeSubagentContextDeclaration({
      rootDir: root,
      client: 'codex',
      contextMode: 'fork',
      surface: 'host-tool',
      reason: 'child-reported-parent-nonce',
      evidenceRef: path.join(root, '.aios', 'agents', 'subagent-context', 'codex.json'),
    });
    assert.equal(written.evidenceRef, '.aios/agents/subagent-context/codex.json');
    const declaration = await readSubagentContextDeclaration({ rootDir: root, client: 'codex' });
    assert.equal(declaration.evidenceRef, '.aios/agents/subagent-context/codex.json');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// 这条是对**已提交状态**的门，不只是对函数：跟踪文件里不允许出现机器形状的证据路径。
test('the shipped host-capabilities declarations carry no machine-absolute evidence paths', async () => {
  const { readFile: read } = await import('node:fs/promises');
  const configUrl = new URL('../../../../config/host-capabilities.json', import.meta.url);
  const config = JSON.parse(await read(configUrl, 'utf8'));
  const absolute = /^[a-zA-Z]:[\/]|^\//u;
  const offenders = Object.entries(config.clients || {})
    .filter(([, entry]) => absolute.test(String(entry?.subagents?.evidenceRef || '')))
    .map(([client]) => client);
  assert.deepEqual(offenders, [],
    `evidenceRef must be root-relative so a clone on another machine can still resolve it: ${offenders.join(' ')}`);
});
