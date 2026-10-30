// VFC-1 W1 · 探针运行器：headless 派发、operator 回填、--spawn 诊断与宿主结构化事实归因。
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildSubagentContextEvidenceRecord,
  readSubagentContextDeclaration,
  readSubagentContextEvidence,
  writeSubagentContextDeclaration,
} from '../../../lib/foundation/clients/reporting/capability-report/subagent-context.mjs';
import { renderSubagentContextProbeText, runSubagentContextProbeCommand } from '../../../lib/execution/lifecycle/fleet/agents.mjs';

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


test('probe runner: headless path writes evidence and declares the verdict', async (t) => {
  const root = await makeRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const calls = [];
  const report = await runSubagentContextProbeCommand(
    { clientId: 'codex', nonce: NONCE },
    {
      rootDir: root,
      now: () => '2026-10-30T00:00:00.000Z',
      readVersion: () => "test-version",
      runAgent: (runtimeId, prompt) => {
        calls.push({ runtimeId, prompt });
        return {
          output: JSON.stringify({ subagentSpawned: true, childReport: `nonce=${NONCE}` }),
          exitCode: 0,
        };
      },
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].runtimeId, 'codex-cli');
  assert.match(calls[0].prompt, new RegExp(NONCE));
  assert.equal(report.verdict, 'fork');
  assert.equal(report.declaration.contextMode, 'fork');

  const evidence = await readSubagentContextEvidence({ rootDir: root, client: 'codex' });
  assert.equal(evidence.verdict, 'fork');
  assert.equal(evidence.mode, 'headless');
  assert.equal(evidence.measuredAt, '2026-10-30T00:00:00.000Z');
  assert.equal(evidence.clientVersion, 'test-version', 'version comes from the injected reader, never from the answer');

  const declaration = await readSubagentContextDeclaration({ rootDir: root, client: 'codex' });
  assert.equal(declaration.contextMode, 'fork');
  assert.equal(declaration.evidenceRef, '.aios/agents/subagent-context/codex.json',
    'the tracked declaration stores the portable ref, not this machine’s absolute path');
  assert.equal(path.resolve(root, declaration.evidenceRef).split(path.sep).join('/'),
    report.evidencePath.split(path.sep).join('/'), 'and it resolves back to the real evidence file');
});

test('probe runner: operator mode never spawns, and dry-run writes nothing', async (t) => {
  const root = await makeRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  let spawned = 0;
  const operatorReport = await runSubagentContextProbeCommand(
    { clientId: 'codex', nonce: NONCE, recordAnswer: '{"subagentSpawned":true,"childReport":"not told"}' },
    { rootDir: root, runAgent: () => { spawned += 1; return { output: '', exitCode: 0 }; } }
  );
  assert.equal(spawned, 0, 'operator mode must not spawn a client');
  assert.equal(operatorReport.mode, 'operator');
  assert.equal(operatorReport.verdict, 'fresh');

  const dryRoot = await makeRoot();
  t.after(() => rm(dryRoot, { recursive: true, force: true }));
  const dry = await runSubagentContextProbeCommand(
    { clientId: 'codex', dryRun: true },
    { rootDir: dryRoot, runAgent: () => { spawned += 1; return { output: '', exitCode: 0 }; } }
  );
  assert.equal(spawned, 0);
  assert.equal(dry.dryRun, true);
  assert.match(dry.prompt, /AIOS subagent-context probe/);
  assert.equal(
    await readSubagentContextEvidence({ rootDir: dryRoot, client: 'codex' }),
    null,
    'dry-run must not write evidence'
  );
});

test('probe runner: unknown client is a usage error, not a fabricated verdict', async (t) => {
  const root = await makeRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = await runSubagentContextProbeCommand({ clientId: 'not-a-client' }, { rootDir: root });
  assert.equal(report.ok, false);
  assert.match(report.error, /no verified one-shot runtime/);
});

test('probe runner attributes a failed host invocation without faking a verdict', async (t) => {
  const root = await makeRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const report = await runSubagentContextProbeCommand(
    { clientId: 'codex', nonce: NONCE },
    {
      rootDir: root,
      runAgent: () => ({ output: 'Error loading config.toml: duplicate key', exitCode: 1 }),
    }
  );
  assert.equal(report.verdict, 'unknown');
  assert.match(report.reason, /host-invocation-failed \(exit 1\)/);
  assert.equal(report.declaration.contextMode, 'unknown');

  const evidence = await readSubagentContextEvidence({ rootDir: root, client: 'codex' });
  assert.match(evidence.answer, /duplicate key/, 'raw host error stays in evidence for diagnosis');
});

test('probe runner honors a declared "no subagent surface": not-applicable, never unknown', async (t) => {
  const root = await makeRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writeSubagentContextDeclaration({
    rootDir: root,
    client: 'codex',
    surface: 'none',
    contextMode: 'unknown',
    reason: 'declared: upstream has no subagent tool',
    measuredAt: null,
  });

  let spawned = 0;
  const report = await runSubagentContextProbeCommand(
    { clientId: 'codex', nonce: NONCE },
    { rootDir: root, runAgent: () => { spawned += 1; return { output: '', exitCode: 0 }; } }
  );

  assert.equal(spawned, 0, 'a declared no-surface client must not be probed');
  assert.equal(report.verdict, 'not-applicable');
  assert.equal(report.mode, 'declaration');
  assert.equal(report.reason, 'declared-no-subagent-surface');

  const declaration = await readSubagentContextDeclaration({ rootDir: root, client: 'codex' });
  assert.equal(declaration.surface, 'none', 'surface survives the declaration write');
  assert.equal(declaration.contextMode, 'not-applicable');

  const evidence = await readSubagentContextEvidence({ rootDir: root, client: 'codex' });
  assert.equal(evidence.verdict, 'not-applicable');
  assert.equal(evidence.mode, 'declaration');
});

test('a provider failure is attributed, not turned into a fabricated verdict', async () => {
  const root = await makeRoot();
  try {
    const result = await runSubagentContextProbeCommand(
      { clientId: 'codex', nonce: NONCE },
      {
        rootDir: root,
        readVersion: () => 'test-version',
        now: () => '2026-10-30T00:00:00.000Z',
        runAgent: () => ({
          output: '',
          exitCode: 0,
          structured: {
            kind: 'aios.pi-json-stream.v1',
            assistantText: '',
            stopReason: 'error',
            errorMessage: 'Connection error.',
            retryCount: 3,
            sawSettle: true,
            recordCount: 39,
          },
        }),
      }
    );
    assert.equal(result.verdict, 'unknown');
    assert.equal(result.reason, 'host-model-error (Connection error.)');
    const evidence = await readSubagentContextEvidence({ rootDir: root, client: 'codex' });
    assert.equal(evidence.hostStructured.stopReason, 'error');
    assert.equal(evidence.hostStructured.retryCount, 3);
    assert.equal(evidence.answer, '', 'the raw 200KB event stream must never be stored as the answer');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('stored answer is bounded; a giant host stream cannot balloon the evidence file', () => {
  const record = buildSubagentContextEvidenceRecord({ client: 'pi', answer: 'x'.repeat(9000) });
  assert.equal(record.answer.length, 4000);
  assert.equal(record.answerLength, 9000);
  assert.equal(record.answerTruncated, true);
});

test('text report surfaces the host-reported failure, not just the classifier reason', () => {
  const text = renderSubagentContextProbeText({
    ok: true,
    client: 'pi',
    clientRuntimeId: 'pi-coding-agent',
    verdict: 'unknown',
    confidence: 'indirect',
    reason: 'host-model-error (Connection error.)',
    evidencePath: '.aios/pi.json',
    declaration: { contextMode: 'not-applicable', measuredAt: '2026-10-30T00:00:00.000Z' },
    host: { model: 'workbuddy/hy3', stopReason: 'error', errorMessage: 'Connection error.', retryCount: 3 },
  });
  assert.match(text, /reason=host-model-error \(Connection error\.\)/);
  assert.match(text, /host-model=workbuddy\/hy3 stop=error/);
  assert.match(text, /host-error=Connection error\./);
  assert.match(text, /host-retries=3/);

  // 声明路径没有结构化事实：不输出 host-* 行，避免暗示“模型跑过了”。
  const declared = renderSubagentContextProbeText({
    ok: true,
    client: 'pi',
    clientRuntimeId: 'pi-coding-agent',
    verdict: 'not-applicable',
    confidence: 'indirect',
    reason: 'declared-no-subagent-surface',
    evidencePath: '.aios/pi.json',
    declaration: { contextMode: 'not-applicable', measuredAt: '2026-10-30T00:00:00.000Z' },
    host: null,
  });
  assert.equal(declared.includes('host-model='), false);
});

test('a host that confirms "no subagent tool" corroborates a declared surface:none', async () => {
  const root = await makeRoot();
  try {
    await writeSubagentContextDeclaration({
      rootDir: root,
      client: 'codex',
      contextMode: 'not-applicable',
      surface: 'none',
      reason: 'declared-no-subagent-surface',
      evidenceRef: 'declared',
    });
    const result = await runSubagentContextProbeCommand(
      { clientId: 'codex', spawn: true, nonce: NONCE },
      {
        rootDir: root,
        readVersion: () => 'test-version',
        now: () => '2026-10-30T00:00:00.000Z',
        runAgent: () => ({
          output: '{"subagentSpawned": false, "notes": "no Task tool; searched the gateway"}',
          exitCode: 0,
          structured: { assistantText: '{"subagentSpawned": false}', stopReason: 'stop', sawSettle: true },
        }),
      }
    );

    assert.equal(result.verdict, 'not-applicable', 'confirmed absence is not "unknown"');
    assert.equal(result.reason, 'host-reports-no-subagent-tool');
    assert.equal(result.confidence, 'direct', 'the host itself answered, so the evidence is direct');

    const declaration = await readSubagentContextDeclaration({ rootDir: root, client: 'codex' });
    assert.equal(declaration.surface, 'none');
    assert.equal(declaration.contextMode, 'not-applicable');
    assert.equal(declaration.reason, 'host-reports-no-subagent-tool');
    assert.match(declaration.evidenceRef, /codex\.spawn\.json$/, 'the corroborating evidence becomes the reference');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('without a prior declaration, a model self-report never becomes a capability fact', async () => {
  const root = await makeRoot();
  try {
    const result = await runSubagentContextProbeCommand(
      { clientId: 'codex', nonce: NONCE },
      {
        rootDir: root,
        readVersion: () => 'test-version',
        now: () => '2026-10-30T00:00:00.000Z',
        runAgent: () => ({
          output: '{"subagentSpawned": false}',
          exitCode: 0,
          structured: { assistantText: '{"subagentSpawned": false}', stopReason: 'stop', sawSettle: true },
        }),
      }
    );
    assert.equal(result.verdict, 'unknown');
    assert.equal(result.reason, 'no-subagent-spawned');
    assert.equal(result.confidence, 'indirect');

    const declaration = await readSubagentContextDeclaration({ rootDir: root, client: 'codex' });
    assert.notEqual(declaration.surface, 'none', 'AIOS does not declare absence from a model self-report alone');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
