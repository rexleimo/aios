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

test('read-only routing is driven by explicit intent, not by guessing from question text', () => {
  // 北极星原则：程序不从"为什么/是否"等疑问文本猜只读。无显式 intent 时统一
  // 走确定性兜底（adaptive→guarded，strict→planned），绝不因疑问句式自动降级
  // 为 direct。capability 判定对纯疑问句不选中任何 capability（capabilityDecision 为 null）。
  const adaptive = evaluateWorkflowPolicy({
    message: '为什么当前工作流会出现死循环？',
    activePlan: activePlan(),
    policyMode: 'adaptive',
    client: 'codex',
    sessionId: 'session-a',
  });
  assert.equal(adaptive.disposition, 'guarded');
  assert.equal(adaptive.routeHint, 'implement');
  assert.equal(adaptive.requiresPreEditSafety, true);
  assert.equal(adaptive.capabilityDecision, null);

  const strict = evaluateWorkflowPolicy({
    message: '为什么当前工作流会出现死循环？',
    activePlan: activePlan(),
    policyMode: 'strict',
    client: 'codex',
    sessionId: 'session-a',
  });
  assert.equal(strict.disposition, 'planned');
  assert.equal(strict.persistence, 'create');

  // 显式 read-only intent 才走 direct，且不创建计划。
  const direct = evaluateWorkflowPolicy({
    message: '为什么当前工作流会出现死循环？',
    activePlan: activePlan(),
    explicitIntent: 'read-only',
    policyMode: 'adaptive',
    client: 'codex',
    sessionId: 'session-a',
  });
  assert.equal(direct.disposition, 'direct');
  assert.equal(direct.continuation, 'none');
  assert.equal(direct.persistence, 'none');
  assert.equal(direct.routeHint, 'direct');
  assert.deepEqual(direct.requiredSkills, []);
  assert.equal(direct.requiresPreEditSafety, false);
  assert.equal(direct.verificationScope, 'none');
  assert.equal(direct.plan, null);
  assert.equal(direct.reason, 'explicit-direct-intent');
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

test('complete resume phrases reuse a nonterminal plan', () => {
  // 北极星原则：仅当协议前缀（RESUME_PREFIX）整体消费整条消息（tail 为空）
  // 时才视为纯恢复；tail 非空一律视为新目标，程序不猜"接着做/下一步"这类
  // 语义上究竟是恢复还是新目标。
  for (const message of ['继续', 'continue', 'resume', '接着', '下一步']) {
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

test('a resume prefix with a non-empty tail is treated as a new objective', () => {
  // "接着做/keep going/下一步做" 之类带尾巴的短语：协议前缀后仍有非空 tail，
  // 按确定性规则视为新目标，进入 capability 判定而非复用计划。是否建计划由
  // capability 显式声明决定（software.testing.design 默认 planned）。
  for (const message of ['接着做', 'keep going on auth']) {
    const decision = evaluateWorkflowPolicy({
      message,
      client: 'codex',
      sessionId: 'session-b',
      activePlan: activePlan({ client: 'claude', sessionId: 'session-a' }),
    });
    assert.equal(decision.disposition, 'guarded', message);
    assert.equal(decision.continuation, 'none', message);
    assert.equal(decision.persistence, 'none', message);
    assert.equal(decision.capabilityDecision, null, message);
  }

  // 显式 implement 声明进入 capability 判定 → test-design 默认 planned。
  const planned = evaluateWorkflowPolicy({
    message: '下一步更新配置',
    client: 'codex',
    sessionId: 'session-b',
    explicitIntent: 'implement',
    activePlan: activePlan({ client: 'claude', sessionId: 'session-a' }),
  });
  assert.equal(planned.disposition, 'guarded');
  assert.equal(planned.continuation, 'none');
  assert.equal(planned.persistence, 'none');
  assert.equal(planned.capabilityDecision.capabilityId, 'software.testing.design');
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
  // 无显式声明时程序不猜 capability：ack 前缀 + 非空 tail → 新目标，但
  // 不建计划（guardable 确定性回退）；显式 implement 才进入 test-design。
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
  assert.equal(decision.capabilityDecision, null);

  const declared = evaluateWorkflowPolicy({
    message: '可以，顺便更新一个配置项',
    activePlan: activePlan(),
    explicitIntent: 'implement',
    client: 'codex',
    sessionId: 'session-a',
  });
  assert.equal(declared.disposition, 'guarded');
  assert.equal(declared.capabilityDecision.capabilityId, 'software.testing.design');
});

test('adaptive mode keeps un-declared requests guarded; explicit implement selects test-design', () => {
  // 北极星原则：无显式声明时程序不猜 capability → guarded(确定性回退)；
  // 显式 implement 声明才进入 capability 判定 → test-design（guarded 不建计划，
  // 因 implement 属显式非计划意图，用户声明直接实施）。
  const undeclared = evaluateWorkflowPolicy({
    message: '更新一个输入校验规则',
    activePlan: null,
    client: 'codex',
    sessionId: 'session-a',
  });
  assert.equal(undeclared.disposition, 'guarded');
  assert.equal(undeclared.persistence, 'none');
  assert.equal(undeclared.capabilityDecision, null);

  const explicit = evaluateWorkflowPolicy({
    message: '更新一个输入校验规则',
    activePlan: null,
    explicitIntent: 'implement',
    client: 'codex',
    sessionId: 'session-a',
  });
  assert.equal(explicit.disposition, 'guarded');
  assert.equal(explicit.persistence, 'none');
  assert.equal(explicit.routeHint, 'implement');
  assert.equal(explicit.capabilityDecision.capabilityId, 'software.testing.design');
  assert.equal(explicit.requiresPreEditSafety, true);
  assert.equal(explicit.verificationScope, 'focused');
  assert.equal(explicit.action, 'none');
});

test('strict mode plans the same substantive implementation request', () => {
  // strict 模式始终计划；显式 implement 声明让 capability 判定选中 test-design。
  const decision = evaluateWorkflowPolicy({
    message: '更新一个输入校验规则',
    activePlan: null,
    policyMode: 'strict',
    explicitIntent: 'implement',
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
  // 多步由显式 plan 声明（DEPENDENT_WORK_ITEMS 事实），程序不猜文本。
  const decision = evaluateWorkflowPolicy({
    message: '先修改策略层，再接入 CLI 和 MCP，最后补齐回归测试',
    activePlan: null,
    explicitIntent: 'plan',
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
    explicitIntent: 'grill',
    activePlan: null,
    client: 'codex',
    sessionId: 'session-a',
  });

  assert.equal(decision.disposition, 'planned');
  assert.equal(decision.routeHint, 'requirements');
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
    explicitIntent: 'implement',
    observations: [
      { kind: 'review.specialist-required', evidenceRefs: ['risk-domain:security'] },
    ],
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
    observations: [
      { kind: 'change.new-construct-proposed', evidenceRefs: ['observation:new-payment-module'] },
    ],
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
    observations: [
      { kind: 'review.specialist-required', evidenceRefs: ['risk-domain:security'] },
    ],
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
