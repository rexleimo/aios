import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  prepareAiosAgentProviderExecution,
  resolveAiosAgentProvider,
} from '../lib/workflows/rex-agent-provider.mjs';

const ABSTRACT_SPECIALIST = Object.freeze({
  kind: 'agent',
  id: 'rex-specialist-review',
  role: 'specialist-reviewer',
  selector: 'risk-domain',
});

test('risk-domain selector deterministically maps security, React, and TypeScript agents', () => {
  const cases = [
    ['risk-domain:security', 'rex-security-reviewer', 'security-reviewer'],
    ['risk-domain:react', 'rex-react-reviewer', 'react-reviewer'],
    ['risk-domain:typescript', 'rex-typescript-reviewer', 'typescript-reviewer'],
  ];

  for (const [riskRef, agentId, role] of cases) {
    const provider = resolveAiosAgentProvider(ABSTRACT_SPECIALIST, [riskRef]);
    assert.equal(provider.id, agentId);
    assert.equal(provider.role, role);
    assert.equal(provider.selectedBy, riskRef);
  }

  const prioritized = resolveAiosAgentProvider(ABSTRACT_SPECIALIST, [
    'risk-domain:typescript',
    'risk-domain:react',
    'risk-domain:security',
  ]);
  assert.equal(prioritized.id, 'rex-security-reviewer');
});

test('unknown risk domains fail closed instead of falling back to a generic reviewer', () => {
  assert.throws(
    () => resolveAiosAgentProvider(ABSTRACT_SPECIALIST, ['risk-domain:database']),
    /unsupported specialist risk domain/u,
  );
});

test('legacy ECC abstract id remains available only as an explicit compatibility input', () => {
  const resolved = resolveAiosAgentProvider({
    kind: 'agent',
    id: 'ecc-specialist',
    selector: 'risk-domain',
  }, ['risk-domain:security']);
  assert.equal(resolved.id, 'rex-security-reviewer');
  assert.equal(resolved.abstractId, 'ecc-specialist');
});

async function writePromotionEvidence(rootDir, agentId) {
  const smokeDir = path.join(rootDir, '.aios', 'agents', 'smoke');
  const provenanceDir = path.join(rootDir, '.aios', 'agents', 'provenance');
  const metricsDir = path.join(rootDir, '.aios', 'interception', 'metrics');
  await Promise.all([
    mkdir(smokeDir, { recursive: true }),
    mkdir(provenanceDir, { recursive: true }),
    mkdir(metricsDir, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      path.join(smokeDir, `${agentId}.json`),
      `${JSON.stringify({ agentId, status: 'pass' })}\n`,
      'utf8',
    ),
    writeFile(
      path.join(provenanceDir, `${agentId}.json`),
      `${JSON.stringify({ agentId, status: 'verified' })}\n`,
      'utf8',
    ),
    writeFile(
      path.join(metricsDir, 'agent-provider.jsonl'),
      [
        JSON.stringify({ agent_id: agentId, event_kind: 'pre_send', saved_bytes: 1 }),
        JSON.stringify({ agent_id: agentId, event_kind: 'post_receive', saved_bytes: 1 }),
      ].join('\n'),
      'utf8',
    ),
  ]);
}

function securityCommand() {
  return {
    schemaVersion: 1,
    type: 'provider.invoke',
    activationId: 'activation-agent-provider',
    capabilityId: 'software.review.specialist',
    recipeId: 'software.review.specialist.recipe',
    stageId: 'review-risk',
    reasonCode: 'specialist-review-required',
    triggerEvidenceRefs: ['risk-domain:security'],
    provider: resolveAiosAgentProvider(ABSTRACT_SPECIALIST, ['risk-domain:security']),
    objective: '执行安全专项审查。',
    expectedEvidence: ['specialist-scope-recorded', 'specialist-verdict-recorded'],
  };
}

test('agent execution requires promotion evidence and includes the canonical role card', async () => {
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-agent-provider-'));
  try {
    await assert.rejects(
      () => prepareAiosAgentProviderExecution({
        command: securityCommand(),
        evidenceRoot,
        userRequest: '审查当前变更。',
      }),
      /is not workflow-enabled/u,
    );

    await writePromotionEvidence(evidenceRoot, 'rex-security-reviewer');
    const prepared = await prepareAiosAgentProviderExecution({
      command: securityCommand(),
      evidenceRoot,
      workflowDirective: '## AIOS WORKFLOW',
      userRequest: '审查当前变更。',
    });

    assert.equal(prepared.agent.agentId, 'rex-security-reviewer');
    assert.equal(prepared.agent.workflowEnabled, true);
    assert.match(prepared.prompt, /# Security Review Agent/u);
    assert.match(prepared.prompt, /"agentId":"rex-security-reviewer"/u);
    assert.match(prepared.prompt, /Return one JSON handoff object only/u);
    assert.doesNotMatch(prepared.prompt, /AIOS_REX_EVIDENCE=/u);
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});
