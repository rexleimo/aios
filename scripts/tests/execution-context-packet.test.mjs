import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assembleExecutionContext,
  buildExecutionContextPacket,
  evaluateExecutionContextPreflight,
  projectContextItems,
  resolveExecutionContextPaths,
  updateExecutionContextExpectedHash,
} from '../lib/contextdb/execution-context.mjs';
import { buildStructuredPlanState } from '../lib/planning/schema.mjs';

async function withTempRoot(prefix, fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

async function writeFixture(rootDir, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, 'utf8');
  }
}

function makePlan() {
  return buildStructuredPlanState({
    title: 'Auth context plan',
    objective: 'Update login with required policy context.',
    sessionId: 'auth-session',
    relativePath: 'docs/plans/auth.md',
    tasks: [{
      id: 'auth-task',
      title: 'Update login',
      status: 'pending',
      acceptance: 'Auth tests pass',
      dependsOn: [],
      targets: ['src/auth/login.mjs'],
      allowedWrites: ['src/auth/**', 'tests/auth/**'],
      contextRequirements: [
        { ref: 'src/auth/policy.mjs', reason: 'Policy controls login', required: true },
        { ref: 'tests/auth/login.test.mjs', reason: 'Regression coverage', required: true },
        'AGENTS.md',
      ],
      interfaces: ['login(credentials)'],
      verification: ['node --test tests/auth/login.test.mjs'],
    }],
  });
}

test('planning v3 normalizes task context fields and shorthand requirements', () => {
  const plan = makePlan();
  const task = plan.tasks[0];

  assert.equal(plan.schemaVersion, 3);
  assert.deepEqual(task.targets, ['src/auth/login.mjs']);
  assert.deepEqual(task.allowedWrites, ['src/auth/**', 'tests/auth/**']);
  assert.deepEqual(task.interfaces, ['login(credentials)']);
  assert.deepEqual(task.verification, ['node --test tests/auth/login.test.mjs']);
  assert.equal(task.contextRequirements.length, 3);
  assert.deepEqual(task.contextRequirements[2], {
    ref: 'AGENTS.md',
    reason: 'Declared required context',
    required: true,
    verification: [],
  });
});

test('ExecutionContextPacket rejects caller-asserted read evidence without copying source text', async () => {
  await withTempRoot('execution-context-packet-', async (rootDir) => {
    const files = {
      'src/auth/login.mjs': 'export const login = "target";\n',
      'src/auth/policy.mjs': 'SECRET_POLICY_CONTENT\n',
      'tests/auth/login.test.mjs': 'SECRET_TEST_CONTENT\n',
      'AGENTS.md': 'SECRET_PROJECT_RULES\n',
    };
    await writeFixture(rootDir, files);
    const plan = makePlan();
    const result = await buildExecutionContextPacket({
      rootDir,
      plan,
      taskId: 'auth-task',
      readRefs: ['src/auth/policy.mjs', 'tests/auth/login.test.mjs', 'AGENTS.md'],
      readEvidenceSource: 'broker_verified',
      mode: 'observe',
      persist: true,
      now: new Date('2026-07-28T00:00:00.000Z'),
    });

    assert.equal(result.persisted, true);
    assert.equal(result.packet.kind, 'contextdb.execution-context-packet');
    assert.equal(result.receipt.kind, 'contextdb.context-receipt');
    assert.equal(result.receipt.admissionChanged, false);
    assert.equal(Object.hasOwn(result.receipt, 'wouldBlock'), false);
    assert.deepEqual(result.receipt.summary, { required: 3, read: 0, unread: 3, missing: 0 });
    assert.equal(result.packet.items.length, 3);
    assert.ok(result.packet.items.every((item) => item.ref && item.reason && item.sourceHash));
    assert.ok(result.packet.items.every((item) => !Object.hasOwn(item, 'content')));
    assert.equal(result.receipt.included.length, 0);
    assert.equal(result.receipt.excluded.length, 3);
    assert.ok(result.receipt.excluded.every((item) => item.reason === 'required_context_unread'));
    assert.equal(result.receipt.evidenceBoundary.readEvidenceSource, 'none');
    assert.equal(result.receipt.evidenceBoundary.brokerVerified, false);

    const preflight = await evaluateExecutionContextPreflight({
      rootDir,
      packet: result.packet,
      receipt: result.receipt,
      mutationRefs: ['src/auth/login.mjs'],
    });
    assert.ok(preflight.wouldBlockReasons.includes('required_context_unread'));

    const packetRaw = await readFile(result.paths.packetPath, 'utf8');
    const receiptRaw = await readFile(result.paths.receiptPath, 'utf8');
    for (const secret of ['SECRET_POLICY_CONTENT', 'SECRET_TEST_CONTENT', 'SECRET_PROJECT_RULES']) {
      assert.doesNotMatch(packetRaw, new RegExp(secret, 'u'));
      assert.doesNotMatch(receiptRaw, new RegExp(secret, 'u'));
    }
    assert.doesNotMatch(receiptRaw, /broker_verified/u);
    assert.deepEqual(JSON.parse(packetRaw), result.packet);
    assert.deepEqual(JSON.parse(receiptRaw), result.receipt);

    const repeat = await buildExecutionContextPacket({
      rootDir,
      plan,
      taskId: 'auth-task',
      readRefs: ['src/auth/policy.mjs'],
      mode: 'observe',
      persist: false,
      now: new Date('2026-07-29T00:00:00.000Z'),
    });
    assert.equal(repeat.receipt.decisionDigest, result.receipt.decisionDigest);
    assert.deepEqual(repeat.receipt.decisions, result.receipt.decisions);
  });
});

test('ExecutionContextPacket rejects an external source reached through a workspace symlink', async (t) => {
  const externalDir = await mkdtemp(path.join(os.tmpdir(), 'execution-context-external-source-'));
  try {
    await withTempRoot('execution-context-symlink-source-', async (rootDir) => {
      const externalPath = path.join(externalDir, 'secret-policy.md');
      const linkPath = path.join(rootDir, 'docs', 'policy.md');
      const sentinel = 'EXTERNAL_EXECUTION_CONTEXT_SENTINEL';
      await writeFile(externalPath, sentinel, 'utf8');
      await mkdir(path.dirname(linkPath), { recursive: true });
      try {
        await symlink(externalPath, linkPath, 'file');
      } catch (error) {
        if (['EACCES', 'EPERM', 'ENOTSUP'].includes(error?.code)) {
          t.skip(`symlink unavailable in this test environment: ${error.code}`);
          return;
        }
        throw error;
      }
      const plan = buildStructuredPlanState({
        title: 'Symlink containment',
        tasks: [{
          id: 'symlink-task',
          title: 'Reject external source link',
          targets: ['src/target.mjs'],
          contextRequirements: [{ ref: 'docs/policy.md', reason: 'Required policy' }],
        }],
      });

      const direct = await buildExecutionContextPacket({ rootDir, plan, taskId: 'symlink-task', persist: false });
      const assembled = await assembleExecutionContext({ rootDir, plan, taskId: 'symlink-task', persist: false });

      assert.equal(direct.packet.items[0].exists, false);
      assert.equal(direct.packet.items[0].sourceHash, '');
      assert.deepEqual(direct.receipt.excluded.map((item) => item.reason), ['invalid_ref']);
      assert.deepEqual(assembled.receipt.excluded.map((item) => item.reason), ['invalid_ref']);
      assert.equal(assembled.assembly.contextText.includes(sentinel), false);
    });
  } finally {
    await rm(externalDir, { recursive: true, force: true });
  }
});

test('ExecutionContextPacket rejects an external directory symlink and keeps internal symlinks deliverable', async (t) => {
  const externalDir = await mkdtemp(path.join(os.tmpdir(), 'execution-context-external-directory-'));
  try {
    await withTempRoot('execution-context-directory-link-', async (rootDir) => {
      const externalPolicy = path.join(externalDir, 'policy.md');
      const externalLink = path.join(rootDir, 'docs', 'external');
      const internalSource = path.join(rootDir, 'sources', 'internal.md');
      const internalLink = path.join(rootDir, 'docs', 'internal.md');
      const externalSentinel = 'EXTERNAL_DIRECTORY_CONTEXT_SENTINEL';
      const internalSentinel = 'INTERNAL_SYMLINK_CONTEXT_SENTINEL';
      await writeFile(externalPolicy, externalSentinel, 'utf8');
      await mkdir(path.dirname(internalSource), { recursive: true });
      await writeFile(internalSource, internalSentinel, 'utf8');
      await mkdir(path.dirname(externalLink), { recursive: true });
      try {
        await symlink(externalDir, externalLink, process.platform === 'win32' ? 'junction' : 'dir');
        await symlink(internalSource, internalLink, 'file');
      } catch (error) {
        if (['EACCES', 'EPERM', 'ENOTSUP'].includes(error?.code)) {
          t.skip(`symlink unavailable in this test environment: ${error.code}`);
          return;
        }
        throw error;
      }
      const externalPlan = buildStructuredPlanState({
        title: 'External directory link',
        tasks: [{
          id: 'external-directory-task',
          title: 'Reject external directory link',
          contextRequirements: [{ ref: 'docs/external/policy.md', reason: 'External policy' }],
        }],
      });
      const internalPlan = buildStructuredPlanState({
        title: 'Internal symlink',
        tasks: [{
          id: 'internal-link-task',
          title: 'Accept internal source link',
          contextRequirements: [{ ref: 'docs/internal.md', reason: 'Internal policy' }],
        }],
      });

      const external = await assembleExecutionContext({ rootDir, plan: externalPlan, taskId: 'external-directory-task', persist: false });
      const internal = await assembleExecutionContext({ rootDir, plan: internalPlan, taskId: 'internal-link-task', persist: false });

      assert.deepEqual(external.receipt.excluded.map((item) => item.reason), ['invalid_ref']);
      assert.equal(external.assembly.contextText.includes(externalSentinel), false);
      assert.equal(internal.receipt.included.length, 1);
      assert.equal(internal.assembly.contextText.includes(internalSentinel), true);
    });
  } finally {
    await rm(externalDir, { recursive: true, force: true });
  }
});

test('expected-hash persistence cannot use a caller-selected external packet path', async () => {
  const externalDir = await mkdtemp(path.join(os.tmpdir(), 'execution-context-external-persist-'));
  try {
    await withTempRoot('execution-context-persist-path-', async (rootDir) => {
      await writeFixture(rootDir, { 'src/policy.mjs': 'export const policy = 1;\n' });
      const plan = buildStructuredPlanState({
        title: 'Persisted hash update',
        sessionId: 'persisted-hash-session',
        tasks: [{
          id: 'persisted-hash-task',
          title: 'Update expected hash safely',
          contextRequirements: [{ ref: 'src/policy.mjs', reason: 'Policy' }],
        }],
      });
      const built = await buildExecutionContextPacket({ rootDir, plan, taskId: 'persisted-hash-task', persist: false });
      const externalPacketPath = path.join(externalDir, 'overwritten-packet.json');

      const updated = await updateExecutionContextExpectedHash({
        rootDir,
        packet: built.packet,
        ref: 'src/policy.mjs',
        persist: true,
        packetPath: externalPacketPath,
      });

      await assert.rejects(access(externalPacketPath), (error) => error?.code === 'ENOENT');
      assert.deepEqual(JSON.parse(await readFile(built.paths.packetPath, 'utf8')), updated);
    });
  } finally {
    await rm(externalDir, { recursive: true, force: true });
  }
});

test('expected-hash persistence fails closed for legacy packets and honors a custom state root', async () => {
  await withTempRoot('execution-context-persist-legacy-', async (rootDir) => {
    const env = { ...process.env, AIOS_PROJECT_STATE_DIR: 'custom-context-state' };
    await writeFixture(rootDir, { 'src/policy.mjs': 'export const policy = 1;\n' });
    const plan = buildStructuredPlanState({
      title: 'Controlled persistence metadata',
      sessionId: 'controlled-persist-session',
      tasks: [{
        id: 'controlled-persist-task',
        title: 'Persist only under controlled root',
        contextRequirements: [{ ref: 'src/policy.mjs', reason: 'Policy' }],
      }],
    });
    const built = await buildExecutionContextPacket({ rootDir, plan, taskId: 'controlled-persist-task', persist: false, env });
    const legacy = { ...built.packet };
    delete legacy.storage;

    await assert.rejects(
      () => updateExecutionContextExpectedHash({ rootDir, packet: legacy, ref: 'src/policy.mjs', persist: true, env }),
      /controlled packet storage metadata/u,
    );
    const inMemory = await updateExecutionContextExpectedHash({ rootDir, packet: legacy, ref: 'src/policy.mjs', persist: false, env });
    assert.equal(inMemory.items[0].expectedHash, built.packet.items[0].sourceHash);

    const persisted = await updateExecutionContextExpectedHash({ rootDir, packet: built.packet, ref: 'src/policy.mjs', persist: true, env });
    assert.ok(built.paths.packetPath.startsWith(path.join(rootDir, 'custom-context-state', 'context-db')));
    assert.deepEqual(JSON.parse(await readFile(built.paths.packetPath, 'utf8')), persisted);
  });
});

test('missing and unsafe required refs are observed without accessing outside workspace', async () => {
  await withTempRoot('execution-context-missing-', async (rootDir) => {
    const plan = buildStructuredPlanState({
      title: 'Missing context',
      tasks: [{
        id: 'missing-task',
        title: 'Observe missing refs',
        contextRequirements: [
          { ref: 'missing.md', reason: 'Missing source', required: true },
          { ref: '../outside.md', reason: 'Unsafe source', required: true },
        ],
      }],
    });
    const result = await buildExecutionContextPacket({
      rootDir,
      plan,
      taskId: 'missing-task',
      mode: 'observe',
      persist: false,
    });

    assert.deepEqual(result.receipt.summary, { required: 2, read: 0, unread: 0, missing: 2 });
    assert.deepEqual(result.receipt.excluded.map((item) => item.reason), ['missing_source', 'invalid_ref']);
    assert.equal(result.packet.items[0].reason, 'Missing source');
    assert.equal(result.packet.items[1].reason, 'Unsafe source');
    assert.ok(result.receipt.excluded.every((item) => !Object.hasOwn(item, 'content')));
  });
});

test('mode off writes no execution-context sidecar', async () => {
  await withTempRoot('execution-context-off-', async (rootDir) => {
    const plan = makePlan();
    const paths = resolveExecutionContextPaths({ rootDir, plan, taskId: 'auth-task' });
    const result = await buildExecutionContextPacket({
      rootDir,
      plan,
      taskId: 'auth-task',
      mode: 'off',
      persist: true,
    });

    assert.deepEqual(result, { mode: 'off', packet: null, receipt: null, persisted: false, paths: null });
    await assert.rejects(access(paths.packetPath), (error) => error?.code === 'ENOENT');
    await assert.rejects(access(paths.receiptPath), (error) => error?.code === 'ENOENT');
  });
});

test('execution-context sidecars honor a custom AIOS state root', async () => {
  await withTempRoot('execution-context-custom-root-', async (rootDir) => {
    await writeFixture(rootDir, {
      'src/auth/policy.mjs': 'policy\n',
      'tests/auth/login.test.mjs': 'test\n',
      'AGENTS.md': 'rules\n',
    });
    const env = { ...process.env, AIOS_PROJECT_STATE_DIR: 'custom-aios-state' };
    const result = await buildExecutionContextPacket({
      rootDir,
      plan: makePlan(),
      taskId: 'auth-task',
      mode: 'observe',
      persist: true,
      env,
    });

    assert.ok(result.paths.packetPath.startsWith(path.join(rootDir, 'custom-aios-state', 'context-db')));
    await access(result.paths.packetPath);
    await access(result.paths.receiptPath);
  });
});

test('budget projection assigns every item once and preserves hard constraints', async () => {
  await withTempRoot('execution-context-budget-', async (rootDir) => {
    const files = {
      'refs/recoverable.md': 'recoverable context '.repeat(12),
      'rules/hard.md': 'hard acceptance constraint '.repeat(12),
    };
    await writeFixture(rootDir, files);
    const items = [
      {
        id: 'recoverable',
        ref: 'refs/recoverable.md',
        content: files['refs/recoverable.md'],
        summary: 'short summary',
      },
      {
        id: 'no-ref',
        content: 'ephemeral context without a recoverable source '.repeat(6),
        summary: 'ephemeral summary',
      },
      {
        id: 'hard-rule',
        ref: 'rules/hard.md',
        content: files['rules/hard.md'],
        summary: 'hard rule summary',
        required: true,
        hardConstraint: true,
      },
    ];
    const result = await projectContextItems({ rootDir, items, budgetUnits: 40 });
    const repeat = await projectContextItems({ rootDir, items, budgetUnits: 40 });

    assert.equal(result.decisions.length, 3);
    assert.equal(result.included.length + result.degraded.length + result.excluded.length, 3);
    assert.equal(new Set(result.decisions.map((item) => item.id)).size, 3);
    assert.equal(result.degraded[0].id, 'recoverable');
    assert.equal(result.degraded[0].representation, 'summary+ref');
    assert.ok(result.degraded[0].sourceHash);
    assert.equal(result.excluded[0].id, 'no-ref');
    assert.equal(result.excluded[0].reason, 'no_recoverable_ref');
    const hardRule = result.included.find((item) => item.id === 'hard-rule');
    assert.equal(hardRule.representation, 'full');
    assert.equal(hardRule.budgetOverflow, true);
    assert.ok(result.decisions.every((item) => !Object.hasOwn(item, 'content') && !Object.hasOwn(item, 'summary')));
    assert.equal(repeat.decisionDigest, result.decisionDigest);
    assert.deepEqual(repeat.decisions, result.decisions);
  });
});

test('assembled delivery budget charges the exact context text sent to runtime', async () => {
  await withTempRoot('execution-context-delivery-budget-', async (rootDir) => {
    await writeFixture(rootDir, {
      'docs/required.md': 'Required rule.\n',
      'docs/optional.md': 'Optional context '.repeat(28),
    });
    const plan = buildStructuredPlanState({
      title: 'Delivery accounting',
      tasks: [{
        id: 'delivery-accounting',
        title: 'Account for rendered context',
        contextRequirements: [
          { ref: 'docs/required.md', reason: 'Required rule', required: true },
          { ref: 'docs/optional.md', reason: 'Optional reference', required: false },
        ],
      }],
    });
    const assembled = await assembleExecutionContext({
      rootDir,
      plan,
      taskId: 'delivery-accounting',
      budgetUnits: 600,
      persist: false,
    });

    assert.equal(assembled.assembly.contextText.length, assembled.assembly.deliveryUnits);
    assert.equal(assembled.assembly.contextText.length, assembled.packet.assembly.budget.usedUnits);
    assert.equal(assembled.assembly.contextText.length, assembled.receipt.assembly.budget.usedUnits);
    assert.equal(assembled.assembly.deliveryDigest, assembled.receipt.assembly.deliveryDigest);
    assert.equal(assembled.receipt.assembly.budget.overflow, false);
    assert.ok(assembled.assembly.deliveryUnits <= assembled.receipt.assembly.budget.limitUnits);
  });
});
