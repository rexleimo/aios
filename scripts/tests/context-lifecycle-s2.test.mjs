import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildExecutionContextPacket,
  evaluateExecutionContextPreflight,
  updateExecutionContextExpectedHash,
} from '../lib/contextdb/execution-context.mjs';
import {
  evaluateHandoffLineage,
  normalizeHandoffPacket,
  renderHandoffInjection,
} from '../lib/contextdb/handoff.mjs';
import { evaluateContextReconciliation } from '../lib/lifecycle/context-reconciliation.mjs';
import { buildStructuredPlanState } from '../lib/planning/schema.mjs';
import { readSessionChangedFiles, recordSessionChangedFile } from '../lib/session/changed-files.mjs';

async function withRoot(prefix, fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

async function writeFixture(rootDir, relativePath, content) {
  const absolutePath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf8');
}

function authPlan() {
  return buildStructuredPlanState({
    title: 'Auth S2',
    tasks: [{
      id: 'auth',
      title: 'Update auth',
      targets: ['src/auth/login.mjs'],
      allowedWrites: ['src/auth/**'],
      contextRequirements: [{ ref: 'src/auth/policy.mjs', reason: 'Policy dependency' }],
    }],
  });
}

test('shadow preflight reports stale/unread/undeclared and keeps direct packets fail-closed', async () => {
  await withRoot('context-s2-preflight-', async (rootDir) => {
    await writeFixture(rootDir, 'src/auth/login.mjs', 'export const login = 1;\n');
    await writeFixture(rootDir, 'src/auth/policy.mjs', 'export const policy = 1;\n');
    const observed = await buildExecutionContextPacket({
      rootDir,
      plan: authPlan(),
      taskId: 'auth',
      readRefs: ['src/auth/policy.mjs'],
      persist: false,
    });
    const originalHash = observed.packet.items[0].sourceHash;
    await writeFile(path.join(rootDir, 'src/auth/policy.mjs'), 'export const policy = 2;\n', 'utf8');

    const stale = await evaluateExecutionContextPreflight({
      rootDir,
      packet: observed.packet,
      receipt: observed.receipt,
      mutationRefs: ['src/auth/login.mjs'],
    });
    assert.deepEqual(stale.wouldBlockReasons, ['required_context_unread', 'required_context_stale']);
    assert.equal(stale.admissionChanged, false);
    await assert.rejects(() => updateExecutionContextExpectedHash({
      rootDir,
      packet: observed.packet,
      ref: 'src/auth/policy.mjs',
      expectedHash: originalHash,
    }), /must match the current source hash/u);

    const refreshed = await updateExecutionContextExpectedHash({
      rootDir,
      packet: observed.packet,
      ref: 'src/auth/policy.mjs',
    });
    const ready = await evaluateExecutionContextPreflight({
      rootDir,
      packet: refreshed,
      receipt: observed.receipt,
      mutationRefs: ['src/auth/login.mjs'],
    });
    assert.deepEqual(ready.wouldBlockReasons, ['required_context_unread']);

    const unread = await buildExecutionContextPacket({
      rootDir,
      plan: authPlan(),
      taskId: 'auth',
      readRefs: [],
      persist: false,
    });
    const constrained = await evaluateExecutionContextPreflight({
      rootDir,
      packet: unread.packet,
      receipt: unread.receipt,
      mutationRefs: ['src/payment/charge.mjs'],
    });
    assert.ok(constrained.wouldBlockReasons.includes('required_context_unread'));
    assert.ok(constrained.wouldBlockReasons.includes('undeclared_target'));
  });
});

test('reconciliation uses the conservative union of ledger and Git without reverting files', async () => {
  await withRoot('context-s2-reconcile-', async (rootDir) => {
    await writeFixture(rootDir, 'src/auth/login.mjs', 'export const login = 1;\n');
    await writeFixture(rootDir, 'src/payment/charge.mjs', 'export const charge = 1;\n');
    for (const args of [
      ['init'],
      ['config', 'user.email', 'context-test@example.invalid'],
      ['config', 'user.name', 'Context Test'],
      ['add', '.'],
      ['commit', '-m', 'baseline'],
    ]) {
      const result = spawnSync('git', args, { cwd: rootDir, encoding: 'utf8', windowsHide: true });
      assert.equal(result.status, 0, result.stderr);
    }
    const packet = (await buildExecutionContextPacket({
      rootDir,
      plan: authPlan(),
      taskId: 'auth',
      persist: false,
    })).packet;
    await writeFile(path.join(rootDir, 'src/auth/login.mjs'), 'export const login = 2;\n', 'utf8');
    await writeFile(path.join(rootDir, 'src/payment/charge.mjs'), 'export const charge = 2;\n', 'utf8');
    await recordSessionChangedFile({ rootDir, sessionId: 'reconcile', filePath: 'src/auth/login.mjs' });

    const result = await evaluateContextReconciliation({ rootDir, sessionId: 'reconcile', packet });
    assert.deepEqual(result.ledgerPaths, ['src/auth/login.mjs']);
    assert.ok(result.gitPaths.includes('src/auth/login.mjs'));
    assert.ok(result.gitPaths.includes('src/payment/charge.mjs'));
    assert.deepEqual(result.undeclaredPaths, ['src/payment/charge.mjs']);
    assert.ok(result.wouldBlockReasons.includes('undeclared_target'));
    assert.equal(result.admissionChanged, false);
    assert.match(await readFile(path.join(rootDir, 'src/payment/charge.mjs'), 'utf8'), /charge = 2/u);
  });
});

test('changed-files and CJK packet sidecars honor a custom state root', async () => {
  await withRoot('context-s2-custom-', async (rootDir) => {
    const env = { ...process.env, AIOS_PROJECT_STATE_DIR: '自定义状态' };
    await writeFixture(rootDir, '资料/规则.md', '# 规则\n校验租户。\n');
    const plan = buildStructuredPlanState({
      title: '中文计划',
      tasks: [{
        id: 'task-cjk',
        title: '更新登录',
        targets: ['源码/登录.mjs'],
        allowedWrites: ['源码/**'],
        contextRequirements: [{ ref: '资料/规则.md', reason: '认证规则' }],
      }],
    });
    const observed = await buildExecutionContextPacket({
      rootDir,
      plan,
      taskId: 'task-cjk',
      readRefs: ['资料/规则.md'],
      env,
    });
    await recordSessionChangedFile({
      rootDir,
      sessionId: 'session-cjk',
      filePath: '源码/登录.mjs',
      env,
    });
    const ledger = await readSessionChangedFiles({ rootDir, sessionId: 'session-cjk', env });
    assert.equal(observed.packet.items[0].ref, '资料/规则.md');
    assert.ok(observed.paths.packetPath.includes(path.join('自定义状态', 'context-db')));
    assert.ok(ledger.files.some((file) => file.path === '源码/登录.mjs'));
    await access(path.join(rootDir, '自定义状态', 'sessions', 'session-cjk', 'changed-files.jsonl'));
    await assert.rejects(() => access(path.join(rootDir, '.aios')));
  });
});

test('handoff v3 carries lineage while legacy v2 rendering remains compatible', () => {
  const legacy = normalizeHandoffPacket({
    fromSessionId: 'legacy-session',
    agentType: 'codex',
    role: 'implementer',
  });
  const v3 = normalizeHandoffPacket({
    fromSessionId: 'lineage-session',
    agentType: 'codex',
    role: 'implementer',
    baseRevision: 'base-1',
    contextRevision: 'context-1',
    packetRef: 'contextdb:packet',
    receiptRef: 'contextdb:receipt',
    verificationRefs: ['receipt:test'],
  });
  assert.equal(legacy.schemaVersion, 2);
  assert.match(renderHandoffInjection(legacy), /## Handoff from legacy-session/u);
  assert.equal(v3.schemaVersion, 3);
  assert.equal(evaluateHandoffLineage(v3, { currentContextRevision: 'context-1' }).revalidationRequired, false);
  assert.deepEqual(
    evaluateHandoffLineage(v3, { currentContextRevision: 'context-2' }).reasons,
    ['context_revision_mismatch'],
  );
});
