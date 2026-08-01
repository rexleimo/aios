import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { MANAGED_RUNNER } from '../lib/evidence/live-execution.mjs';
import {
  prepareAiosAgentProviderExecution,
  resolveAiosAgentProvider,
} from '../lib/workflows/rex-agent-provider.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

/**
 * Test-only synthetic records for a temporary evidenceRoot. They never attest
 * a live client run and must not be written under the repository's .aios tree.
 */
async function writePromotionEvidenceFixture(rootDir, agentId, {
  provenanceReceiptId = 'test-receipt',
} = {}) {
  const smokeDir = path.join(rootDir, '.aios', 'agents', 'smoke');
  const provenanceDir = path.join(rootDir, '.aios', 'agents', 'provenance');
  const metricsDir = path.join(rootDir, '.aios', 'interception', 'metrics');
  await Promise.all([
    mkdir(smokeDir, { recursive: true }),
    mkdir(provenanceDir, { recursive: true }),
    mkdir(metricsDir, { recursive: true }),
  ]);
  const clientId = 'test-client';
  const sessionId = 'test-session';
  const receiptId = 'test-receipt';
  const preSendRefId = 'test-pre-send';
  const postReceiveRefId = 'test-post-receive';
  const hash = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
  const execution = {
    runner: MANAGED_RUNNER,
    receiptId,
    clientId,
    agentId,
    sessionId,
    invocation: {
      command: 'test-client',
      argsSha256: hash('[]'),
      cwd: rootDir,
    },
    exitCode: 0,
    stdoutSha256: hash('test output'),
    stderrSha256: hash(''),
    observedAt: '2026-07-19T00:00:00.000Z',
  };
  const metrics = [
    ['pre_send', preSendRefId],
    ['post_receive', postReceiveRefId],
  ].map(([eventKind, refId]) => JSON.stringify({
    session_id: sessionId,
    client_id: clientId,
    agent_id: agentId,
    event_kind: eventKind,
    ref_id: refId,
    saved_bytes: 1,
    refs_count: 1,
  })).join('\n');
  await Promise.all([
    writeFile(
      path.join(smokeDir, `${agentId}.json`),
      `${JSON.stringify({
        schemaVersion: 2,
        kind: 'aios.agent-live-smoke.v2',
        status: 'pass',
        clientId,
        agentId,
        sessionId,
        execution,
        metrics: { sessionId, preSendRefId, postReceiveRefId },
      })}\n`,
      'utf8',
    ),
    writeFile(
      path.join(provenanceDir, `${agentId}.json`),
      `${JSON.stringify({
        schemaVersion: 2,
        kind: 'aios.live-execution-provenance.v2',
        status: 'verified',
        clientId,
        agentId,
        sessionId,
        receiptId: provenanceReceiptId,
      })}\n`,
      'utf8',
    ),
    writeFile(path.join(metricsDir, 'agent-provider.jsonl'), `${metrics}\n`, 'utf8'),
  ]);
}

async function writeLegacyPromotionEvidenceFixture(rootDir, agentId) {
  const smokeDir = path.join(rootDir, '.aios', 'agents', 'smoke');
  const provenanceDir = path.join(rootDir, '.aios', 'agents', 'provenance');
  const metricsDir = path.join(rootDir, '.aios', 'interception', 'metrics');
  await Promise.all([
    mkdir(smokeDir, { recursive: true }),
    mkdir(provenanceDir, { recursive: true }),
    mkdir(metricsDir, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(smokeDir, `${agentId}.json`), `${JSON.stringify({ agentId, status: 'pass' })}\n`, 'utf8'),
    writeFile(path.join(provenanceDir, `${agentId}.json`), `${JSON.stringify({ agentId, status: 'verified' })}\n`, 'utf8'),
    writeFile(
      path.join(metricsDir, 'agent-provider.jsonl'),
      `${JSON.stringify({ agent_id: agentId, event_kind: 'pre_send', saved_bytes: 1 })}\n`,
      'utf8',
    ),
  ]);
}

async function copyCanonicalAgentFixture(rootDir) {
  const canonicalRoot = path.join(rootDir, 'agent-sources');
  await mkdir(canonicalRoot, { recursive: true });
  await cp(path.join(REPO_ROOT, 'agent-sources', 'manifest.json'), path.join(canonicalRoot, 'manifest.json'));
  await cp(path.join(REPO_ROOT, 'agent-sources', 'roles'), path.join(canonicalRoot, 'roles'), { recursive: true });
  return canonicalRoot;
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

test('agent execution rejects legacy or tampered evidence before accepting an isolated v2 fixture', async () => {
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-agent-provider-fixture-'));
  const aiosRoot = path.join(evidenceRoot, 'aios-root');
  try {
    await copyCanonicalAgentFixture(aiosRoot);
    assert.ok(!path.relative(os.tmpdir(), evidenceRoot).startsWith('..'));
    await assert.rejects(
      () => prepareAiosAgentProviderExecution({
        command: securityCommand(),
        aiosRoot,
        evidenceRoot,
        userRequest: '审查当前变更。',
      }),
      /is not workflow-enabled/u,
    );

    await writeLegacyPromotionEvidenceFixture(evidenceRoot, 'rex-security-reviewer');
    await assert.rejects(
      () => prepareAiosAgentProviderExecution({
        command: securityCommand(),
        aiosRoot,
        evidenceRoot,
        userRequest: '审查当前变更。',
      }),
      /is not workflow-enabled/u,
    );

    await writePromotionEvidenceFixture(evidenceRoot, 'rex-security-reviewer');
    const prepared = await prepareAiosAgentProviderExecution({
      command: securityCommand(),
      aiosRoot,
      evidenceRoot,
      workflowDirective: '## AIOS WORKFLOW',
      userRequest: '审查当前变更。',
    });

    assert.equal(prepared.agent.agentId, 'rex-security-reviewer');
    assert.equal(prepared.agent.workflowEnabled, true);
    assert.match(prepared.agent.verification.refs.smoke, /\.aios[\\/\\\\]agents[\\/\\\\]smoke/u);
    assert.match(prepared.prompt, /# Security Review Agent/u);
    assert.match(prepared.prompt, /"agentId":"rex-security-reviewer"/u);
    assert.match(prepared.prompt, /Return one JSON handoff object only/u);
    assert.doesNotMatch(prepared.prompt, /AIOS_REX_EVIDENCE=/u);

    await writePromotionEvidenceFixture(evidenceRoot, 'rex-security-reviewer', {
      provenanceReceiptId: 'tampered-receipt',
    });
    await assert.rejects(
      () => prepareAiosAgentProviderExecution({
        command: securityCommand(),
        aiosRoot,
        evidenceRoot,
        userRequest: '审查当前变更。',
      }),
      /is not workflow-enabled/u,
    );
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});
