import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  advanceSoftwareWorkflow,
  createRexCapabilityPack,
  startSoftwareWorkflow,
  supportedClients,
} from '../../rex-harness/src/index.mjs';
import { resolveClientsWithCapability } from '../lib/clients/capabilities/index.mjs';
import {
  AIOS_REX_PROVIDER_BINDINGS,
  advanceAiosSoftwareWorkflow,
  buildRexWorkflowDefinitions,
  evaluateAiosSoftwareRequest,
  startAiosCapabilityActivation,
  startAiosSoftwareWorkflow,
} from '../lib/workflows/rex-harness-adapter.mjs';
import { REQUIREMENTS_DECISION_FIXTURE } from '../../rex-harness/tests/fixtures/requirements-decision.mjs';

const ADAPTER_PARITY_SCENARIO = Object.freeze({
  executable: 'node',
  args: ['--test', 'scripts/tests/rex-harness-adapter.test.mjs'],
  cwd: '/tmp/rex-adapter-parity',
});

function sequentialIds(prefix) {
  let index = 0;
  return () => `${prefix}-${index++}`;
}

function parityReceipt(ref) {
  return {
    receiptId: ref.slice('receipt:'.length),
    command: ADAPTER_PARITY_SCENARIO,
    exitCode: 1,
    stdoutSha256: 'a'.repeat(64),
    stderrSha256: 'b'.repeat(64),
    observedAt: '2026-07-22T00:00:00.000Z',
  };
}

function prepareTddWorkflow(started, advance, createActivationId) {
  const designed = advance(started, [
    { kind: 'test-scope-contract-recorded', refs: ['artifact:test-design'] },
    { kind: 'acceptance-test-mapping-recorded', refs: ['artifact:test-design'] },
    { kind: 'test-seam-recorded', refs: ['artifact:test-design'] },
  ], { createActivationId });
  const tdd = advance(designed.workflow, [
    { kind: 'testability-decision-recorded', refs: ['artifact:testability-decision'] },
  ], {
    createActivationId,
    resolveReceipt: (ref) => ref === 'receipt:adapter-red' ? parityReceipt(ref) : null,
    testabilityDecision: {
      kind: 'behavior-delta',
      decisionRef: 'artifact:testability-decision',
      redCandidate: {
        publicEntry: 'checkout validation endpoint',
        setup: 'Submit an invalid checkout request.',
        command: ADAPTER_PARITY_SCENARIO,
        expected: 'The invalid checkout is rejected.',
        observed: 'The invalid checkout is accepted before implementation.',
        failureReason: 'The requested validation behavior is absent.',
        receiptRef: 'receipt:adapter-red',
      },
    },
  });
  return tdd.workflow;
}

function rexOwnedBlockedSemantics(result) {
  const workflow = result.workflow;
  const command = workflow.currentCommand;
  return {
    outcome: result.outcome,
    blockedReason: result.blockedReason,
    status: workflow.status,
    workflowActivationId: workflow.workflowActivationId,
    workItemKey: workflow.workItemKey,
    command: {
      activationId: command.activationId,
      executionToken: command.executionToken,
      capabilityId: command.capabilityId,
      stageId: command.stageId,
    },
    missingEvidence: result.missingEvidence,
  };
}

test('rex client projections stay aligned with the AIOS Skill-capable client registry', () => {
  assert.deepEqual(
    supportedClients(),
    resolveClientsWithCapability('skills', 'all'),
    'AIOS 新增 Skill 客户端时必须同步 rex-harness 投影目录',
  );
});

test('AIOS owns an explicit executable Provider binding for every enabled rex Capability', () => {
  const pack = createRexCapabilityPack();
  const capabilityIds = AIOS_REX_PROVIDER_BINDINGS.map((binding) => binding.capabilityId);

  assert.equal(new Set(capabilityIds).size, capabilityIds.length, 'AIOS Provider bindings must be unique');
  assert.deepEqual(
    new Set(capabilityIds),
    new Set(pack.profile.enabledCapabilities),
    'AIOS must not fall back to an implicit rex Provider binding',
  );
});

test('AIOS adapter keeps the selected rex-native Provider by default', () => {
  const result = evaluateAiosSoftwareRequest({
    message: 'Clarify the domain vocabulary and acceptance criteria before implementation.',
    explicitIntent: 'grill',
  });

  assert.equal(result.decision.capabilityId, 'software.requirements.clarify');
  assert.equal(result.decision.provider.id, 'rex-requirements');

  const started = startAiosCapabilityActivation(result.decision, {
    activationId: 'activation:aios-1',
  });
  assert.equal(started.command.provider.id, 'rex-requirements');
  assert.equal(started.command.stageId, 'clarify');
});

test('AIOS adapter binds minimization to the bundled rex Provider by default', () => {
  const result = evaluateAiosSoftwareRequest({
    message: '实现一个新的支付模块。',
  });

  assert.equal(result.decision.capabilityId, 'software.implementation.minimize');
  assert.equal(result.decision.provider.id, 'rex-minimal-construction');

  const started = startAiosCapabilityActivation(result.decision, {
    activationId: 'activation:ponytail-1',
  });
  assert.equal(started.command.provider.id, 'rex-minimal-construction');
  assert.equal(started.command.stageId, 'minimize');
});

test('AIOS adapter enhances the abstract rex specialist with a concrete risk-domain agent', () => {
  const result = evaluateAiosSoftwareRequest({
    message: '修改鉴权 token 和 session 校验逻辑。',
    completedCapabilities: [
      'software.testing.design',
      'software.implementation.execute',
    ],
  });

  assert.equal(result.decision.capabilityId, 'software.review.specialist');
  assert.deepEqual(result.decision.provider, {
    kind: 'agent',
    id: 'rex-security-reviewer',
    role: 'security-reviewer',
    abstractId: 'rex-specialist-review',
    selector: 'risk-domain',
    selectedBy: 'risk-domain:security',
  });

  const started = startAiosCapabilityActivation(result.decision, {
    activationId: 'activation:specialist-security',
  });
  assert.equal(started.command.provider.id, 'rex-security-reviewer');
  assert.equal(started.command.provider.role, 'security-reviewer');
  assert.deepEqual(started.command.triggerEvidenceRefs, [
    'activation:software.implementation.execute:completed',
    'risk-domain:security',
  ]);
});

test('AIOS adapter advances the rex-owned workflow runtime with rex-native Providers', () => {
  const request = {
    message: 'Clarify acceptance criteria before implementing checkout.',
    explicitIntent: 'grill',
  };
  const started = startAiosSoftwareWorkflow({
    workflowActivationId: 'workflow-aios-runtime',
    workItemKey: 'checkout',
    request,
    createActivationId: () => 'activation-aios-requirements',
  });

  assert.equal(started.currentCommand.provider.id, 'rex-requirements');
  const advanced = advanceAiosSoftwareWorkflow(started, [
    { kind: 'acceptance-criteria-recorded', refs: ['artifact:requirements'] },
    { kind: 'non-goals-recorded', refs: ['artifact:requirements'] },
    { kind: 'first-slice-identified', refs: ['artifact:requirements'] },
    { kind: 'requirements-decision-recorded', refs: [REQUIREMENTS_DECISION_FIXTURE.decisionRef] },
  ], {
    createActivationId: () => 'activation-aios-test-design',
    requirementsDecision: REQUIREMENTS_DECISION_FIXTURE,
  });

  assert.equal(advanced.workflow.currentCapabilityId, 'software.testing.design');
  assert.equal(advanced.workflow.currentCommand.provider.id, 'rex-test-design');
  assert.equal(advanced.workflow.activationHistory.length, 1);
});

test('AIOS adapter preserves Rex-owned blocked workflow semantics', () => {
  const request = { message: 'Update checkout validation behavior.' };
  const directIds = sequentialIds('direct');
  const aiosIds = sequentialIds('direct');
  const directWorkflow = prepareTddWorkflow(startSoftwareWorkflow({
    workflowActivationId: 'workflow-adapter-parity',
    workItemKey: 'adapter-parity',
    request,
    createActivationId: directIds,
  }), advanceSoftwareWorkflow, directIds);
  const aiosWorkflow = prepareTddWorkflow(startAiosSoftwareWorkflow({
    workflowActivationId: 'workflow-adapter-parity',
    workItemKey: 'adapter-parity',
    request,
    createActivationId: aiosIds,
  }), advanceAiosSoftwareWorkflow, aiosIds);
  const evidence = [
    { kind: 'failing-test-observed', refs: ['command:claimed-red'] },
    { kind: 'red-failure-reason-recorded', refs: ['artifact:red-reason'] },
  ];
  const directBlocked = advanceSoftwareWorkflow(directWorkflow, evidence, { createActivationId: directIds });
  const aiosBlocked = advanceAiosSoftwareWorkflow(aiosWorkflow, evidence, { createActivationId: aiosIds });

  assert.deepEqual(rexOwnedBlockedSemantics(aiosBlocked), rexOwnedBlockedSemantics(directBlocked));
  assert.equal(aiosBlocked.workflow.currentCommand.provider.id, 'rex-tdd');
});

test('AIOS team or harness promotion does not replace the current rex Provider', () => {
  for (const [explicitIntent, target] of [['team', 'team'], ['harness', 'harness']]) {
    const started = startAiosSoftwareWorkflow({
      workflowActivationId: `workflow-aios-${target}`,
      workItemKey: `checkout-${target}`,
      request: {
        message: '修改结账校验行为。',
        explicitIntent,
      },
      createActivationId: () => `activation-aios-${target}`,
    });

    assert.equal(started.promotion.target, target);
    assert.equal(started.currentCapabilityId, 'software.testing.design');
    assert.equal(started.currentCommand.provider.id, 'rex-test-design');
  }
});

test('AIOS workflow definitions project rex semantics into agent roles without reordering stages', () => {
  const definitions = buildRexWorkflowDefinitions();
  const [adaptive] = definitions;

  assert.equal(definitions.length, 1);
  assert.equal(adaptive.workflowId, 'adaptive-software-delivery');
  assert.equal(adaptive.runtimeManaged, true);
  assert.equal(adaptive.source, 'rex-harness');
  assert.ok(adaptive.stages.every((stage) => stage.mode === 'conditional'));
  assert.equal(
    adaptive.stages.find((stage) => stage.capabilityId === 'software.review.specialist').agentRole,
    'risk-selected-specialist',
  );
});

test('default AIOS Provider skills come from the packaged rex-harness sources', async () => {
  const providerIds = [...new Set(AIOS_REX_PROVIDER_BINDINGS
    .filter((binding) => binding.provider.kind === 'skill')
    .map((binding) => binding.provider.id))];

  for (const providerId of providerIds) {
    const skillPath = path.join(process.cwd(), 'rex-harness', 'skill-sources', providerId, 'SKILL.md');
    const content = await readFile(skillPath, 'utf8');

    const descriptionLine = content.split('\n').find((line) => line.startsWith('description:'));
    // rex-requirements 使用双触发 description（LLM 语义自助触发 + rex-harness 激活）；
    // 其余 rex-* skill 保持"仅 rex-harness 激活"格式。
    if (providerId === 'rex-requirements') {
      assert.match(descriptionLine, /Use when a request is vague, underspecified/u);
      assert.match(descriptionLine, /Also use after rex-harness selects software requirements clarification/u);
    } else {
      assert.match(descriptionLine, /^description: Use only after rex-harness selects .+ and supplies the current Command\.$/u);
    }
    assert.match(content, /AIOS_REX_EVIDENCE/u);
    assert.match(content, /恰好一个.*信封/u);
    assert.match(content, /真实.*引用/u);
    assert.match(content, /不要.*下一个 (?:Provider|Capability)|停止.*等待.*下一条.*Command/u);
    if (providerId === 'rex-implement') {
      assert.match(content, /Self-check gate/u);
      assert.match(content, /不要.*第二条工作流/u);
    }
    assert.doesNotMatch(content, /Fast\s*\|\s*Balanced\s*\|\s*Deep/iu);
  }
});

test('AIOS ignores legacy compatibility options and remains rex-native', () => {
  const result = evaluateAiosSoftwareRequest({
    message: 'Clarify the domain vocabulary and acceptance criteria before implementation.',
    explicitIntent: 'grill',
    compatibilityMode: true,
  });

  assert.equal(result.providerMode, 'rex-native');
  assert.equal(result.decision.provider.id, 'rex-requirements');
  assert.ok(AIOS_REX_PROVIDER_BINDINGS.every((binding) => binding.provider.id.startsWith('rex-')));
});
