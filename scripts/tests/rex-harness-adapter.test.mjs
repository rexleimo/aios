import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { createRexCapabilityPack, supportedClients } from '../../rex-harness/src/index.mjs';
import { resolveClientsWithCapability } from '../lib/clients/capabilities/index.mjs';
import {
  AIOS_REX_PROVIDER_BINDINGS,
  advanceAiosSoftwareWorkflow,
  buildRexWorkflowDefinitions,
  evaluateAiosSoftwareRequest,
  startAiosCapabilityActivation,
  startAiosSoftwareWorkflow,
} from '../lib/workflows/rex-harness-adapter.mjs';

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
  ], {
    createActivationId: () => 'activation-aios-test-design',
  });

  assert.equal(advanced.workflow.currentCapabilityId, 'software.testing.design');
  assert.equal(advanced.workflow.currentCommand.provider.id, 'rex-test-design');
  assert.equal(advanced.workflow.activationHistory.length, 1);
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

    assert.match(content, /^description: Use only after rex-harness selects .+ and supplies the current Command\.$/mu);
    assert.match(content, /AIOS_REX_EVIDENCE/u);
    assert.match(content, /恰好一个.*信封/u);
    assert.match(content, /真实.*引用/u);
    assert.match(content, /不要.*下一个 Provider/u);
    assert.doesNotMatch(content, /Fast\s*\|\s*Balanced\s*\|\s*Deep/iu);
  }
});

test('AIOS ignores legacy compatibility options and remains rex-native', () => {
  const result = evaluateAiosSoftwareRequest({
    message: 'Clarify the domain vocabulary and acceptance criteria before implementation.',
    compatibilityMode: true,
  });

  assert.equal(result.providerMode, 'rex-native');
  assert.equal(result.decision.provider.id, 'rex-requirements');
  assert.ok(AIOS_REX_PROVIDER_BINDINGS.every((binding) => binding.provider.id.startsWith('rex-')));
});
