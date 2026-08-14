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

test('explicit intent allowlist keeps implement guarded behind the Rex capability chain', () => {
  const decision = evaluateWorkflowPolicy({
    message: 'Update authentication behavior.',
    explicitIntent: { intent: 'IMPLEMENT' },
    policyMode: 'adaptive',
    client: 'codex',
    sessionId: 'intent-session',
  });

  assert.equal(decision.disposition, 'guarded');
  assert.equal(decision.routeHint, 'implement');
  assert.equal(decision.capabilityDecision.capabilityId, 'software.testing.design');
  assert.equal(decision.requiresPreEditSafety, true);
});

test('explicit tickets intent plans through Planning instead of Requirements', () => {
  const decision = evaluateWorkflowPolicy({
    message: '把登录逻辑改一下。',
    explicitIntent: 'tickets',
    policyMode: 'adaptive',
    client: 'codex',
    sessionId: 'intent-session',
  });

  assert.equal(decision.disposition, 'planned');
  assert.equal(decision.persistence, 'create');
  assert.equal(decision.routeHint, 'planning');
  assert.equal(decision.capabilityDecision.capabilityId, 'software.planning.sequence');
});

test('unknown, review-without-diff, and debug-without-failure intents block fail-closed', () => {
  for (const [explicitIntent, expectedReason] of [
    ['teleport', 'explicit-intent-unknown'],
    ['review', 'review-requires-diff'],
    ['debug', 'debug-requires-reproducible-failure'],
  ]) {
    const decision = evaluateWorkflowPolicy({
      message: 'Explain the current request.',
      explicitIntent,
      policyMode: 'adaptive',
      client: 'codex',
      sessionId: 'intent-session',
    });
    assert.equal(decision.disposition, 'blocked');
    assert.equal(decision.reason, expectedReason);
    assert.equal(decision.persistence, 'none');
  }
});

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
      requiredAgent: null,
      requiresPreEditSafety: false,
      verificationScope: 'none',
      routeHint: 'none',
      executionHost: 'single',
      reason: 'empty-message',
      plan: null,
      capabilityDecision: null,
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

test('extra resume phrases reuse a nonterminal plan', () => {
  for (const message of ['接着做', '下一步', 'keep going', 'next step']) {
    const decision = evaluateWorkflowPolicy({
      message,
      client: 'codex',
      sessionId: 'session-b',
      activePlan: activePlan({ client: 'claude', sessionId: 'session-a' }),
    });
    assert.equal(decision.disposition, 'direct', message);
    assert.equal(decision.continuation, 'explicit-resume', message);
    assert.equal(decision.persistence, 'reuse', message);
  }
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
  assert.deepEqual(decision.requiredSkills, ['rex-test-design']);
  assert.equal(decision.capabilityDecision.capabilityId, 'software.testing.design');
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
  assert.deepEqual(decision.requiredSkills, ['rex-test-design']);
  assert.equal(decision.capabilityDecision.capabilityId, 'software.testing.design');
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
  assert.deepEqual(decision.requiredSkills, ['rex-test-design']);
  assert.equal(decision.capabilityDecision.capabilityId, 'software.testing.design');
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
  assert.deepEqual(decision.requiredSkills, ['rex-planning']);
  assert.equal(decision.capabilityDecision.capabilityId, 'software.planning.sequence');
  assert.equal(decision.requiresPreEditSafety, false);
  assert.equal(decision.verificationScope, 'full');
});

test('ambiguous domain work selects only the current rex requirements provider', () => {
  const decision = evaluateWorkflowPolicy({
    message: 'Clarify the domain vocabulary and acceptance criteria before implementing checkout.',
    activePlan: null,
    client: 'codex',
    sessionId: 'session-a',
  });

  assert.equal(decision.disposition, 'planned');
  assert.equal(decision.routeHint, 'implement');
  assert.equal(decision.requiresPreEditSafety, false);
  assert.deepEqual(decision.requiredSkills, ['rex-requirements']);
  assert.equal(decision.capabilityDecision.capabilityId, 'software.requirements.clarify');
  assert.equal(decision.capabilityDecision.recipeId, 'software.requirements.clarify.recipe');
  assert.equal(decision.capabilityDecision.stageId, 'clarify');
  assert.ok(!decision.requiredSkills.includes('writing-plans'));
  assert.ok(!decision.requiredSkills.includes('using-superpowers'));
});

test('wayfinder is a rex capability under the generic implement host route', () => {
  const decision = evaluateWorkflowPolicy({
    message: 'Map the unknown migration decisions across several future sessions.',
    activePlan: null,
    explicitIntent: 'wayfinder',
    client: 'codex',
    sessionId: 'session-a',
  });

  assert.equal(decision.disposition, 'planned');
  assert.equal(decision.routeHint, 'implement');
  assert.equal(decision.requiresPreEditSafety, false);
  assert.deepEqual(decision.requiredSkills, ['rex-wayfinder']);
  assert.equal(decision.capabilityDecision.capabilityId, 'software.navigation.wayfind');
});

test('agent Provider uses requiredAgent instead of being injected as a Skill', () => {
  const decision = evaluateWorkflowPolicy({
    message: '修改鉴权 token 和 session 校验逻辑。',
    activePlan: null,
    client: 'codex',
    sessionId: 'session-a',
    completedCapabilities: [
      'software.testing.design',
      'software.implementation.execute',
    ],
  });

  assert.equal(decision.capabilityDecision.capabilityId, 'software.review.specialist');
  assert.deepEqual(decision.requiredSkills, []);
  assert.equal(decision.requiredAgent, 'rex-security-reviewer');
});

test('explicit team intent selects an execution host without replacing the rex Provider', () => {
  const decision = evaluateWorkflowPolicy({
    message: '并行实现一个新的支付模块',
    activePlan: null,
    explicitIntent: 'team',
    client: 'codex',
    sessionId: 'session-a',
  });

  assert.equal(decision.disposition, 'planned');
  assert.equal(decision.persistence, 'create');
  assert.equal(decision.routeHint, 'implement');
  assert.equal(decision.executionHost, 'team');
  assert.equal(decision.capabilityDecision.capabilityId, 'software.implementation.minimize');
  assert.deepEqual(decision.requiredSkills, ['rex-minimal-construction']);
  assert.ok(!decision.requiredSkills.includes('using-superpowers'));
});

test('harness execution host preserves a selected Agent Provider', () => {
  const decision = evaluateWorkflowPolicy({
    message: '修改鉴权 token 和 session 校验逻辑。',
    activePlan: null,
    explicitIntent: 'harness',
    client: 'codex',
    sessionId: 'session-a',
    completedCapabilities: [
      'software.testing.design',
      'software.implementation.execute',
    ],
  });

  assert.equal(decision.executionHost, 'harness');
  assert.equal(decision.routeHint, 'verify');
  assert.equal(decision.requiredAgent, 'rex-security-reviewer');
  assert.deepEqual(decision.requiredSkills, []);
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
