import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateWorkflowPolicy,
  isSameSessionPlan,
  isTerminalPlan,
} from '../lib/planning/workflow-policy.mjs';

function activePlan(overrides = {}) {
  return {
    status: 'executing',
    route: 'implement',
    client: 'codex',
    sessionId: 'session-a',
    relativePath: 'docs/plans/2026-07-14-workflow.md',
    ...overrides,
  };
}

test('planning public index exposes the workflow policy API', async () => {
  const planning = await import('../lib/planning/index.mjs');
  assert.equal(typeof planning.evaluateWorkflowPolicy, 'function');
  assert.equal(typeof planning.isTerminalPlan, 'function');
  assert.equal(typeof planning.evaluateAutoGateDecision, 'function');
  assert.equal(typeof planning.applyWorkflowDecision, 'function');
});

test('blank input is a noop with no persistence', () => {
  for (const policyMode of ['adaptive', 'strict']) {
    const decision = evaluateWorkflowPolicy({
      message: '   ',
      activePlan: activePlan(),
      policyMode,
      client: 'codex',
      sessionId: 'session-a',
    });

    assert.deepEqual(decision, {
      disposition: 'noop',
      continuation: 'none',
      persistence: 'none',
      requiredSkills: [],
      requiresPreEditSafety: false,
      verificationScope: 'none',
      routeHint: 'none',
      reason: 'empty-message',
      plan: null,
      action: 'none',
    });
  }
});

test('read-only questions stay direct without a plan artifact', () => {
  for (const policyMode of ['adaptive', 'strict']) {
    const decision = evaluateWorkflowPolicy({
      message: '为什么当前工作流会出现死循环？',
      activePlan: activePlan(),
      policyMode,
      client: 'codex',
      sessionId: 'session-a',
    });

    assert.equal(decision.disposition, 'direct');
    assert.equal(decision.continuation, 'none');
    assert.equal(decision.persistence, 'none');
    assert.equal(decision.routeHint, 'direct');
    assert.deepEqual(decision.requiredSkills, []);
    assert.equal(decision.requiresPreEditSafety, false);
    assert.equal(decision.verificationScope, 'none');
    assert.equal(decision.plan, null);
    assert.equal(decision.reason, 'read-only-request');
  }
});

test('a same-session acknowledgement reuses one nonterminal active plan', () => {
  const plan = activePlan();
  const decision = evaluateWorkflowPolicy({
    message: '可以',
    activePlan: plan,
    policyMode: 'strict',
    client: 'codex',
    sessionId: 'session-a',
  });

  assert.equal(decision.disposition, 'direct');
  assert.equal(decision.continuation, 'same-session-ack');
  assert.equal(decision.persistence, 'reuse');
  assert.equal(decision.plan, plan);
  assert.equal(decision.routeHint, 'implement');
  assert.deepEqual(decision.requiredSkills, []);
  assert.equal(decision.requiresPreEditSafety, false);
  assert.equal(decision.verificationScope, 'none');
  assert.equal(decision.action, 'reuse');
});

test('a weak acknowledgement cannot reuse a plan from another session', () => {
  const decision = evaluateWorkflowPolicy({
    message: 'yes',
    activePlan: activePlan(),
    client: 'codex',
    sessionId: 'session-b',
  });

  assert.equal(decision.disposition, 'direct');
  assert.equal(decision.continuation, 'missing');
  assert.equal(decision.persistence, 'none');
  assert.equal(decision.plan, null);
  assert.equal(decision.reason, 'acknowledgement-without-same-session-plan');
});

test('an unknown client acknowledgement never uses the sessionless fallback', () => {
  const plan = activePlan({ client: 'unknown', sessionId: undefined });
  const decision = evaluateWorkflowPolicy({
    message: 'yes',
    activePlan: plan,
    client: 'unknown',
    sessionId: undefined,
  });

  assert.equal(isSameSessionPlan(plan, { client: 'unknown', sessionId: undefined }), false);
  assert.equal(decision.disposition, 'direct');
  assert.equal(decision.continuation, 'missing');
  assert.equal(decision.persistence, 'none');
  assert.equal(decision.plan, null);
  assert.equal(decision.reason, 'acknowledgement-without-same-session-plan');
});

test('an explicit resume can reuse a nonterminal plan across clients', () => {
  const plan = activePlan({ client: 'claude', sessionId: 'claude-session', route: 'debug' });
  const decision = evaluateWorkflowPolicy({
    message: '继续',
    activePlan: plan,
    client: 'codex',
    sessionId: 'codex-session',
  });

  assert.equal(decision.disposition, 'direct');
  assert.equal(decision.continuation, 'explicit-resume');
  assert.equal(decision.persistence, 'reuse');
  assert.equal(decision.plan, plan);
  assert.equal(decision.routeHint, 'debug');
  assert.equal(decision.reason, 'explicit-resume');
});

test('a resume with no usable active plan is missing and never creates one', () => {
  const terminal = evaluateWorkflowPolicy({
    message: 'resume',
    activePlan: activePlan({ status: 'done' }),
    client: 'codex',
    sessionId: 'session-a',
  });
  const absent = evaluateWorkflowPolicy({
    message: '继续',
    activePlan: null,
    client: 'codex',
    sessionId: 'session-a',
  });

  for (const decision of [terminal, absent]) {
    assert.equal(decision.disposition, 'direct');
    assert.equal(decision.continuation, 'missing');
    assert.equal(decision.persistence, 'none');
    assert.equal(decision.plan, null);
    assert.equal(decision.reason, 'resume-without-active-plan');
  }
});

test('an acknowledgement with a new actionable objective is new work', () => {
  const decision = evaluateWorkflowPolicy({
    message: '可以，顺便更新一个配置项',
    activePlan: activePlan(),
    client: 'codex',
    sessionId: 'session-a',
  });

  assert.equal(decision.disposition, 'guarded');
  assert.equal(decision.continuation, 'none');
  assert.equal(decision.persistence, 'none');
  assert.equal(decision.plan, null);
  assert.equal(decision.routeHint, 'ops');
  assert.equal(decision.requiresPreEditSafety, true);
  assert.equal(decision.verificationScope, 'focused');
});

test('adaptive mode keeps a small explicit implementation change guarded', () => {
  const decision = evaluateWorkflowPolicy({
    message: '更新一个输入校验规则',
    activePlan: null,
    client: 'codex',
    sessionId: 'session-a',
  });

  assert.equal(decision.disposition, 'guarded');
  assert.equal(decision.persistence, 'none');
  assert.equal(decision.routeHint, 'implement');
  assert.deepEqual(decision.requiredSkills, ['test-driven-development']);
  assert.equal(decision.requiresPreEditSafety, true);
  assert.equal(decision.verificationScope, 'focused');
  assert.equal(decision.action, 'none');
});

test('strict mode plans the same substantive implementation request', () => {
  const decision = evaluateWorkflowPolicy({
    message: '更新一个输入校验规则',
    activePlan: null,
    policyMode: 'strict',
    client: 'codex',
    sessionId: 'session-a',
  });

  assert.equal(decision.disposition, 'planned');
  assert.equal(decision.persistence, 'create');
  assert.equal(decision.routeHint, 'implement');
  assert.deepEqual(decision.requiredSkills, ['writing-plans', 'test-driven-development']);
  assert.equal(decision.requiresPreEditSafety, true);
  assert.equal(decision.verificationScope, 'full');
  assert.equal(decision.action, 'started');
});

test('multi-step work is planned in adaptive mode', () => {
  const decision = evaluateWorkflowPolicy({
    message: '先修改策略层，再接入 CLI 和 MCP，最后补齐回归测试',
    activePlan: null,
    client: 'codex',
    sessionId: 'session-a',
  });

  assert.equal(decision.disposition, 'planned');
  assert.equal(decision.persistence, 'create');
  assert.equal(decision.routeHint, 'implement');
  assert.deepEqual(decision.requiredSkills, ['writing-plans', 'test-driven-development']);
  assert.equal(decision.requiresPreEditSafety, true);
  assert.equal(decision.verificationScope, 'full');
});

test('explicit team intent is planned without a global bootstrap chain', () => {
  const decision = evaluateWorkflowPolicy({
    message: '审核这份工作流方案',
    activePlan: null,
    explicitIntent: 'team',
    client: 'codex',
    sessionId: 'session-a',
  });

  assert.equal(decision.disposition, 'planned');
  assert.equal(decision.persistence, 'create');
  assert.equal(decision.routeHint, 'team');
  assert.deepEqual(decision.requiredSkills, ['writing-plans', 'dispatching-parallel-agents']);
  assert.ok(!decision.requiredSkills.includes('using-superpowers'));
});

test('plan helpers distinguish terminal plans and same-session ownership', () => {
  assert.equal(isTerminalPlan(activePlan({ status: 'blocked' })), true);
  assert.equal(isTerminalPlan(activePlan({ status: 'executing' })), false);
  assert.equal(isSameSessionPlan(activePlan(), { client: 'codex', sessionId: 'session-a' }), true);
  assert.equal(isSameSessionPlan(activePlan(), { client: 'codex', sessionId: 'session-b' }), false);
  assert.equal(
    isSameSessionPlan(
      activePlan({ sessionId: undefined }),
      { client: 'codex', sessionId: undefined },
    ),
    true,
  );
  assert.equal(
    isSameSessionPlan(
      activePlan({ sessionId: undefined }),
      { client: 'codex', sessionId: 'session-a' },
    ),
    false,
  );
  assert.equal(isSameSessionPlan(activePlan({ status: 'done' }), { client: 'codex', sessionId: 'session-a' }), false);
});
