import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildPlanMarkdown,
  formatActivePlanInjection,
  readActivePlan,
  setPlanStatus,
  startPlan,
} from '../lib/planning/contract.mjs';
import {
  buildAlwaysOnPlanningDirective,
  ensurePlanForMessage,
  runAutoGate,
  runClaudeUserPromptSubmitHook,
} from '../lib/planning/auto-gate.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test('buildPlanMarkdown includes contract markers', () => {
  const md = buildPlanMarkdown({ title: 'Auth refactor', objective: 'fix login', client: 'claude' });
  assert.match(md, /AIOS Planning Contract/);
  assert.match(md, /schema v3/);
  assert.match(md, /Verification evidence/);
  assert.match(md, /Auth refactor/);
});

test('startPlan writes docs/plans artifact and active pointer', async () => {
  const root = await makeTemp('aios-plan-start-');
  try {
    const state = startPlan({
      rootDir: root,
      title: 'Ship planning bridge',
      objective: 'Make clients use AIOS plans',
      client: 'hermes',
      source: 'test',
      now: new Date('2026-07-09T12:00:00.000Z'),
    });
    assert.equal(state.status, 'active');
    assert.equal(state.schemaVersion, 3);
    assert.ok(Array.isArray(state.tasks) && state.tasks.length >= 3);
    assert.ok(state.route);
    assert.ok(state.relativePath.startsWith('docs/plans/'));
    assert.ok(fs.existsSync(path.join(root, state.relativePath)));
    const body = await readFile(path.join(root, state.relativePath), 'utf8');
    assert.match(body, /Ship planning bridge/);
    assert.match(body, /schema v3/);
    const active = readActivePlan(root);
    assert.equal(active.title, 'Ship planning bridge');
    assert.equal(active.client, 'hermes');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('startPlan persists task targets, required context, and verification in v3', async () => {
  const root = await makeTemp('aios-plan-context-v3-');
  try {
    const state = startPlan({
      rootDir: root,
      title: 'Auth context',
      tasks: [{
        id: 'auth',
        title: 'Update login',
        targets: ['src/auth/login.mjs'],
        allowedWrites: ['src/auth/**'],
        contextRequirements: [{ ref: 'src/auth/policy.mjs', reason: 'Policy dependency' }],
        verification: ['node --test tests/auth.test.mjs'],
      }],
    });
    const task = state.tasks[0];
    assert.deepEqual(task.targets, ['src/auth/login.mjs']);
    assert.deepEqual(task.allowedWrites, ['src/auth/**']);
    assert.equal(task.contextRequirements[0].ref, 'src/auth/policy.mjs');
    assert.deepEqual(task.verification, ['node --test tests/auth.test.mjs']);

    const body = await readFile(path.join(root, state.relativePath), 'utf8');
    assert.match(body, /targets: src\/auth\/login\.mjs/u);
    assert.match(body, /context \(required\): src\/auth\/policy\.mjs/u);
    assert.match(body, /verification: node --test tests\/auth\.test\.mjs/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readActivePlan preserves v2 until an explicit write upgrades it to v3', async () => {
  const root = await makeTemp('aios-plan-v2-compat-');
  try {
    const statePath = path.join(root, '.aios', 'planning', 'active.json');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify({
      schemaVersion: 2,
      title: 'Legacy v2',
      objective: 'Keep readable',
      status: 'active',
      tasks: [{ id: 'legacy', title: 'Legacy task', status: 'pending', acceptance: '', dependsOn: [] }],
      evidence: [],
    }, null, 2)}\n`, 'utf8');

    const legacy = readActivePlan(root);
    assert.equal(legacy.schemaVersion, 2);
    assert.equal(Object.hasOwn(legacy.tasks[0], 'targets'), false);

    const upgraded = setPlanStatus(root, 'approved');
    assert.equal(upgraded.schemaVersion, 3);
    assert.deepEqual(upgraded.tasks[0].targets, []);
    assert.deepEqual(upgraded.tasks[0].contextRequirements, []);
    assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).schemaVersion, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('startPlan disambiguates same-title artifacts and leaves a valid active pointer', async () => {
  const root = await makeTemp('aios-plan-collision-');
  try {
    const now = new Date('2026-07-14T12:00:00.000Z');
    const first = startPlan({ rootDir: root, title: 'Same title', client: 'codex', now });
    const second = startPlan({ rootDir: root, title: 'Same title', client: 'codex', now });

    assert.notEqual(first.relativePath, second.relativePath);
    assert.ok(fs.existsSync(path.join(root, first.relativePath)));
    assert.ok(fs.existsSync(path.join(root, second.relativePath)));
    const activeRaw = await readFile(path.join(root, '.aios', 'planning', 'active.json'), 'utf8');
    assert.equal(JSON.parse(activeRaw).relativePath, second.relativePath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('startPlan preserves an explicit team or harness route', async () => {
  const root = await makeTemp('aios-plan-orchestration-route-');
  try {
    const team = startPlan({ rootDir: root, title: 'Team review', route: 'team', client: 'codex' });
    const harness = startPlan({ rootDir: root, title: 'Harness run', route: 'harness', client: 'codex' });

    assert.equal(team.route, 'team');
    assert.equal(harness.route, 'harness');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('setPlanStatus updates active pointer', async () => {
  const root = await makeTemp('aios-plan-status-');
  try {
    startPlan({ rootDir: root, title: 'Gate test', client: 'codex' });
    const next = setPlanStatus(root, 'approved', { note: 'ready' });
    assert.equal(next.status, 'approved');
    assert.equal(readActivePlan(root).status, 'approved');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('plan done requires tasks complete + evidence', async () => {
  const root = await makeTemp('aios-plan-done-gate-');
  try {
    const { updatePlanTask, addPlanEvidence } = await import('../lib/planning/contract.mjs');
    startPlan({ rootDir: root, title: 'Done gate', objective: 'fix bug in auth', client: 'cli' });
    assert.throws(() => setPlanStatus(root, 'done'), /cannot mark plan done/);
    const plan = readActivePlan(root);
    for (const t of plan.tasks) {
      updatePlanTask(root, t.id, { status: 'done' });
    }
    assert.throws(() => setPlanStatus(root, 'done'), /evidence/);
    addPlanEvidence(root, { kind: 'command', value: 'npm test → pass' });
    const done = setPlanStatus(root, 'done');
    assert.equal(done.status, 'done');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('formatActivePlanInjection returns null when no plan', async () => {
  const root = await makeTemp('aios-plan-inject-');
  try {
    assert.equal(formatActivePlanInjection(root), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('auto-gate keeps direct messages and plan injection read-only', async () => {
  const root = await makeTemp('aios-plan-always-');
  try {
    const direct = runAutoGate({
      rootDir: root,
      message: '为什么会死循环？',
      client: 'codex',
      sessionId: 'turn-direct',
    });
    assert.equal(direct.ok, true);
    assert.equal(direct.decision.disposition, 'direct');
    assert.equal(direct.decision.persistence, 'none');
    assert.equal(direct.created, false);
    assert.equal(readActivePlan(root), null);
    assert.equal(fs.existsSync(path.join(root, 'docs', 'plans')), false);

    const injection = buildAlwaysOnPlanningDirective({
      rootDir: root,
      message: '只读分析当前状态',
      client: 'codex',
      mode: 'lean',
    });
    assert.equal(injection.plan, null);
    assert.equal(injection.created, false);
    assert.equal(readActivePlan(root), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('auto-gate reports an explicit non-writing continuation decision without an active plan', async () => {
  const root = await makeTemp('aios-plan-continuation-missing-');
  try {
    const result = runAutoGate({
      rootDir: root,
      message: '继续',
      client: 'codex',
      sessionId: 'turn-continuation',
    });
    assert.equal(result.decision.continuation, 'missing');
    assert.equal(result.decision.action, 'none');
    assert.equal(result.decision.persistence, 'none');
    assert.equal(result.created, false);
    assert.equal(readActivePlan(root), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('/single keeps substantive changes behind the workflow safety decision', async () => {
  const root = await makeTemp('aios-plan-single-safety-');
  try {
    const result = runAutoGate({
      rootDir: root,
      message: '/single update one parser rule',
      client: 'codex',
      sessionId: 'turn-single',
      policyMode: 'adaptive',
    });
    assert.equal(result.decision.disposition, 'guarded');
    assert.equal(result.decision.requiresPreEditSafety, true);
    assert.equal(result.created, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('/subagent is an explicit planned work-item route', async () => {
  const root = await makeTemp('aios-plan-subagent-route-');
  try {
    const result = runAutoGate({
      rootDir: root,
      message: '/subagent repair two isolated workflow modules',
      client: 'codex',
      sessionId: 'turn-subagent',
    });

    assert.equal(result.decision.disposition, 'planned');
    assert.equal(result.decision.routeHint, 'implement');
    assert.equal(result.decision.executionHost, 'team');
    assert.equal(result.created, true);
    assert.equal(result.plan.route, 'team');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('explicit plan requests persist once and same-session continuation reuses without rewriting it', async () => {
  const root = await makeTemp('aios-plan-continuation-reuse-');
  try {
    const first = runAutoGate({
      rootDir: root,
      message: '/plan 重构工作流策略',
      client: 'codex',
      sessionId: 'turn-plan',
    });
    assert.equal(first.decision.disposition, 'planned');
    assert.equal(first.created, true);
    assert.ok(first.plan?.relativePath);
    assert.deepEqual(first.plan.skills, ['rex-planning']);
    assert.ok(!first.plan.skills.includes('writing-plans'));
    assert.ok(!first.plan.skills.includes('using-superpowers'));
    const activePath = path.join(root, '.aios', 'planning', 'active.json');
    const before = await readFile(activePath, 'utf8');

    const continuation = runAutoGate({
      rootDir: root,
      message: '继续',
      client: 'codex',
      sessionId: 'turn-plan',
    });
    assert.equal(continuation.created, false);
    assert.equal(continuation.plan.relativePath, first.plan.relativePath);
    assert.equal(await readFile(activePath, 'utf8'), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Claude UserPromptSubmit hook exposes the policy decision without forcing a direct plan', async () => {
  const root = await makeTemp('aios-plan-hook-');
  try {
    const { exitCode, output } = await runClaudeUserPromptSubmitHook({
      rootDir: root,
      stdinText: JSON.stringify({ prompt: '解释当前计划状态', cwd: root }),
      client: 'claude',
    });
    assert.equal(exitCode, 0);
    assert.equal(output.decision.disposition, 'direct');
    assert.equal(readActivePlan(root), null);
    assert.doesNotMatch(output.additionalContext, /writing-plans/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('runAutoGate retains legacy fields and adds a structured policy decision', async () => {
  const root = await makeTemp('aios-plan-autogate-');
  try {
    const result = runAutoGate({
      rootDir: root,
      message: '/plan ship workflow policy',
      client: 'grok',
      sessionId: 'turn-legacy',
      policyMode: 'strict',
    });
    assert.equal(result.ok, true);
    assert.equal(result.policy.mode, 'strict');
    assert.ok(result.plan?.relativePath);
    assert.equal(result.action, result.decision.action);
    assert.equal(result.created, true);
    assert.equal(result.decision.disposition, 'planned');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
