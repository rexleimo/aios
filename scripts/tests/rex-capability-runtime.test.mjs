import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runAutoGate } from '../lib/planning/auto-gate.mjs';
import {
  ingestCapabilityProviderOutput,
  ingestCapabilityEvidenceOutput,
  parseAgentProviderHandoff,
  parseCapabilityEvidenceEnvelope,
  recordAiosCapabilityEvidence,
} from '../lib/workflows/rex-capability-runtime.mjs';
import { evaluateAiosSoftwareRequest } from '../lib/workflows/rex-harness-adapter.mjs';
import {
  readStoredAiosCapabilityActivation,
  startStoredAiosCapabilityActivation,
} from '../lib/workflows/rex-activation-store.mjs';
import { captureStandaloneExecutionReceipt } from '../../rex-harness/src/index.mjs';
import { REQUIREMENTS_DECISION_FIXTURE } from '../../rex-harness/tests/fixtures/requirements-decision.mjs';

test('provider output parser accepts one typed evidence envelope and ignores ordinary prose', () => {
  const activationId = 'activation-envelope';
  const output = [
    '已经完成需求澄清，并把产物写入需求文档。',
    `AIOS_REX_EVIDENCE=${JSON.stringify({
      schemaVersion: 1,
      activationId,
      evidence: [
        { kind: 'acceptance-criteria-recorded', refs: ['artifact:requirements'] },
      ],
    })}`,
  ].join('\n');

  const envelope = parseCapabilityEvidenceEnvelope(output, { activationId });
  assert.equal(envelope.activationId, activationId);
  assert.equal(envelope.evidence[0].kind, 'acceptance-criteria-recorded');
  assert.equal(parseCapabilityEvidenceEnvelope('普通 Provider 输出', { activationId }), null);
});

test('provider output parser rejects evidence for a different activation', () => {
  const output = `AIOS_REX_EVIDENCE=${JSON.stringify({
    schemaVersion: 1,
    activationId: 'activation-other',
    evidence: [{ kind: 'focused-tests-pass', refs: ['command:test'] }],
  })}`;

  assert.throws(
    () => parseCapabilityEvidenceEnvelope(output, { activationId: 'activation-current' }),
    /activationId mismatch/u,
  );
});

test('provider output parser rejects unknown envelope fields', () => {
  const output = `AIOS_REX_EVIDENCE=${JSON.stringify({
    schemaVersion: 1,
    activationId: 'activation-current',
    evidence: [{ kind: 'focused-tests-pass', refs: ['receipt:known'] }],
    claimedSuccess: true,
  })}`;

  assert.throws(
    () => parseCapabilityEvidenceEnvelope(output, { activationId: 'activation-current' }),
    /unknown field: claimedSuccess/u,
  );
});

test('provider output parser rejects unknown nested evidence fields', () => {
  const output = `AIOS_REX_EVIDENCE=${JSON.stringify({
    schemaVersion: 1,
    activationId: 'activation-current',
    evidence: [{ kind: 'focused-tests-pass', refs: ['receipt:known'], claimedSuccess: true }],
  })}`;

  assert.throws(
    () => parseCapabilityEvidenceEnvelope(output, { activationId: 'activation-current' }),
    /evidence 0 contains an unknown field/u,
  );
});

test('AIOS Requirements envelope persists the typed decision and advances the workflow', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-requirements-envelope-'));
  try {
    const started = runAutoGate({
      rootDir,
      message: '把用户登录改一下',
      client: 'codex',
      sessionId: 'requirements-envelope',
    });
    assert.equal(started.capabilityActivation.capabilityId, 'software.requirements.clarify');

    const ingested = ingestCapabilityEvidenceOutput({
      rootDir,
      command: started.capabilityCommand,
      output: `AIOS_REX_EVIDENCE=${JSON.stringify({
        schemaVersion: 1,
        activationId: started.capabilityCommand.activationId,
        evidence: [
          { kind: 'acceptance-criteria-recorded', refs: ['artifact:requirements'] },
          { kind: 'non-goals-recorded', refs: ['artifact:requirements'] },
          { kind: 'first-slice-identified', refs: ['artifact:requirements'] },
          { kind: 'requirements-decision-recorded', refs: [REQUIREMENTS_DECISION_FIXTURE.decisionRef] },
        ],
        requirementsDecision: REQUIREMENTS_DECISION_FIXTURE,
      })}`,
    });

    assert.equal(ingested.ingested, true);
    assert.equal(ingested.result.outcome, 'completed');
    assert.equal(ingested.result.nextCapability.command.provider.id, 'rex-test-design');
    assert.deepEqual(ingested.result.activation.evidence.at(-1), {
      kind: 'requirements-decision-recorded',
      refs: [REQUIREMENTS_DECISION_FIXTURE.decisionRef],
    });
    const nextStored = readStoredAiosCapabilityActivation({
      rootDir,
      activationId: ingested.result.nextCapability.activation.activationId,
    });
    assert.equal(nextStored.workflow.requirementsDecision.decisionRef, REQUIREMENTS_DECISION_FIXTURE.decisionRef);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('AIOS envelope accepts an honest typed decision and rejects a claimed RED', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-envelope-testability-'));
  try {
    const software = evaluateAiosSoftwareRequest({
      message: 'Update checkout validation behavior.',
      completedCapabilities: ['software.requirements.clarify'],
    });
    const started = startStoredAiosCapabilityActivation({
      rootDir,
      decision: software.decision,
      activationId: 'activation-envelope-testability',
      workItemKey: 'work-item:envelope-testability',
      request: { message: 'Update checkout validation behavior.' },
    });
    assert.equal(started.command.provider.id, 'rex-test-design');

    const scoped = ingestCapabilityEvidenceOutput({
      rootDir,
      command: started.command,
      output: `AIOS_REX_EVIDENCE=${JSON.stringify({
        schemaVersion: 1,
        activationId: started.command.activationId,
        evidence: [
          { kind: 'test-scope-contract-recorded', refs: ['artifact:test-design'] },
          { kind: 'acceptance-test-mapping-recorded', refs: ['artifact:test-design'] },
          { kind: 'test-seam-recorded', refs: ['artifact:test-design'] },
        ],
      })}`,
    });
    assert.equal(scoped.result.command.stageId, 'decide-testability');

    const receipt = captureStandaloneExecutionReceipt({
      rootDir,
      executable: process.execPath,
      args: ['-e', 'process.exit(7)'],
    });
    const selected = ingestCapabilityEvidenceOutput({
      rootDir,
      command: scoped.result.command,
      output: `AIOS_REX_EVIDENCE=${JSON.stringify({
        schemaVersion: 1,
        activationId: scoped.result.command.activationId,
        evidence: [
          { kind: 'testability-decision-recorded', refs: ['artifact:testability-decision'] },
        ],
        testabilityDecision: {
          kind: 'behavior-delta',
          decisionRef: 'artifact:testability-decision',
          redCandidate: {
            publicEntry: 'checkout validation endpoint',
            setup: 'Submit an invalid checkout request.',
            command: {
              executable: process.execPath,
              args: ['-e', 'process.exit(7)'],
              cwd: rootDir,
            },
            expected: 'The invalid checkout is rejected.',
            observed: 'The invalid checkout is accepted before implementation.',
            failureReason: 'The requested validation behavior is absent.',
            receiptRef: receipt.ref,
          },
        },
      })}`,
    });
    const tddCommand = selected.result.nextCapability.command;
    assert.equal(tddCommand.provider.id, 'rex-tdd');

    assert.throws(
      () => ingestCapabilityEvidenceOutput({
        rootDir,
        command: tddCommand,
        output: `AIOS_REX_EVIDENCE=${JSON.stringify({
          schemaVersion: 1,
          activationId: tddCommand.activationId,
          evidence: [
            { kind: 'failing-test-observed', refs: ['command:claimed-red'] },
            { kind: 'red-failure-reason-recorded', refs: ['artifact:test:red-reason'] },
          ],
        })}`,
      }),
      /requires at least one receipt/u,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runner evidence ingestion advances only when a valid envelope is present', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-runtime-'));
  try {
    const started = runAutoGate({
      rootDir,
      message: 'Clarify the domain vocabulary and acceptance criteria before implementation.',
      client: 'codex',
      sessionId: 'runtime-evidence',
    });
    const activationId = started.capabilityActivation.activationId;

    assert.throws(
      () => ingestCapabilityProviderOutput({
        rootDir,
        command: {
          ...started.capabilityCommand,
          stageId: 'forged-stage',
        },
        output: `AIOS_REX_EVIDENCE=${JSON.stringify({
          schemaVersion: 1,
          activationId,
          evidence: [
            { kind: 'acceptance-criteria-recorded', refs: ['artifact:requirements'] },
          ],
        })}`,
      }),
      /does not match stored activation command/u,
    );

    const missing = ingestCapabilityEvidenceOutput({
      rootDir,
      command: started.capabilityCommand,
      output: '没有结构化证据行。',
    });
    assert.equal(missing.ingested, false);
    assert.equal(missing.reason, 'missing-envelope');

    const ingested = ingestCapabilityEvidenceOutput({
      rootDir,
      command: started.capabilityCommand,
      output: `AIOS_REX_EVIDENCE=${JSON.stringify({
        schemaVersion: 1,
        activationId,
        evidence: [
          { kind: 'acceptance-criteria-recorded', refs: ['artifact:requirements'] },
        ],
      })}`,
    });
    assert.equal(ingested.ingested, true);
    assert.equal(ingested.result.outcome, 'blocked');
    assert.deepEqual(ingested.result.missingEvidence, [
      'non-goals-recorded',
      'first-slice-identified',
      'requirements-decision-recorded',
    ]);

    assert.throws(() => recordAiosCapabilityEvidence({
      rootDir,
      activationId,
      evidence: [{ kind: 'non-goals-recorded', refs: ['artifact:requirements'] }],
    }), /current Command token/u);

    const currentCommand = ingested.result.command;
    assert.throws(() => recordAiosCapabilityEvidence({
      rootDir,
      activationId,
      commandToken: currentCommand.executionToken,
      evidence: [{ kind: 'specialist-verdict-recorded', refs: ['artifact:forged-review'] }],
    }), /unexpected rex evidence kind/u);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

function specialistCommand() {
  return {
    schemaVersion: 1,
    type: 'provider.invoke',
    activationId: 'activation-agent-handoff',
    capabilityId: 'software.review.specialist',
    recipeId: 'software.review.specialist.recipe',
    stageId: 'review-risk',
    reasonCode: 'specialist-review-required',
    triggerEvidenceRefs: ['risk-domain:security'],
    provider: {
      kind: 'agent',
      id: 'rex-security-reviewer',
      role: 'security-reviewer',
    },
    objective: '执行安全专项审查。',
    expectedEvidence: ['specialist-scope-recorded', 'specialist-verdict-recorded'],
  };
}

function passingHandoff(overrides = {}) {
  return {
    schemaVersion: 1,
    agentId: 'rex-security-reviewer',
    role: 'security-reviewer',
    status: 'pass',
    findings: ['scripts/lib/auth.mjs 未发现 token 泄露。'],
    blockers: [],
    evidenceRefs: ['command:test:security'],
    filesReviewed: ['scripts/lib/auth.mjs'],
    recommendedNextSteps: ['继续标准与规格审查。'],
    ...overrides,
  };
}

test('Agent Provider parser accepts exactly one native JSON handoff and validates identity', () => {
  const command = specialistCommand();
  const parsed = parseAgentProviderHandoff(JSON.stringify(passingHandoff()), { command });
  assert.equal(parsed.agentId, command.provider.id);
  assert.equal(parsed.role, command.provider.role);

  assert.throws(
    () => parseAgentProviderHandoff(
      JSON.stringify(passingHandoff({ agentId: 'rex-react-reviewer' })),
      { command },
    ),
    /agentId mismatch/u,
  );
  assert.throws(
    () => parseAgentProviderHandoff(
      JSON.stringify(passingHandoff({ role: 'react-reviewer' })),
      { command },
    ),
    /role mismatch/u,
  );
  assert.throws(
    () => parseAgentProviderHandoff(
      JSON.stringify(passingHandoff({ status: 'pass', blockers: ['仍有阻塞项'] })),
      { command },
    ),
    /pass handoff cannot contain blockers/u,
  );
  assert.throws(
    () => parseAgentProviderHandoff(`说明文字\n${JSON.stringify(passingHandoff())}`, { command }),
    /single JSON object/u,
  );
  assert.throws(
    () => parseAgentProviderHandoff(
      JSON.stringify(passingHandoff({ evidenceRefs: ['artifact-or-command-ref'] })),
      { command },
    ),
    /placeholder evidence ref/u,
  );
});

test('AIOS persists an Agent handoff artifact and adapts pass status into rex typed evidence', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-agent-runtime-'));
  try {
    const software = evaluateAiosSoftwareRequest({
      message: '修改鉴权 token 和 session 校验逻辑。',
      completedCapabilities: [
        'software.testing.design',
        'software.implementation.execute',
      ],
    });
    const stored = startStoredAiosCapabilityActivation({
      rootDir,
      decision: software.decision,
      activationId: 'activation-agent-handoff',
      workItemKey: 'work-item:security-review',
      request: null,
    });

    const wrongCommand = {
      ...stored.command,
      provider: {
        kind: 'agent',
        id: 'rex-react-reviewer',
        role: 'react-reviewer',
      },
    };
    assert.throws(
      () => ingestCapabilityProviderOutput({
        rootDir,
        command: wrongCommand,
        output: JSON.stringify(passingHandoff({
          agentId: 'rex-react-reviewer',
          role: 'react-reviewer',
        })),
      }),
      /does not match stored activation command/u,
    );

    assert.throws(() => recordAiosCapabilityEvidence({
      rootDir,
      activationId: stored.activation.activationId,
      commandToken: stored.command.executionToken,
      evidence: [
        { kind: 'specialist-scope-recorded', refs: ['artifact:forged-review'] },
        { kind: 'specialist-verdict-recorded', refs: ['artifact:forged-review'] },
      ],
    }), /validated native Handoff/u);

    assert.throws(
      () => ingestCapabilityProviderOutput({
        rootDir,
        command: {
          ...stored.command,
          recipeId: 'forged.recipe',
        },
        output: JSON.stringify(passingHandoff()),
      }),
      /does not match stored activation command/u,
    );

    const ingestion = ingestCapabilityProviderOutput({
      rootDir,
      command: stored.command,
      output: JSON.stringify(passingHandoff()),
    });

    assert.equal(ingestion.ingested, true);
    assert.equal(ingestion.kind, 'agent-handoff');
    assert.equal(ingestion.result.outcome, 'completed');
    assert.deepEqual(
      ingestion.result.activation.evidence.map((item) => item.kind),
      ['specialist-scope-recorded', 'specialist-verdict-recorded'],
    );

    const artifactPath = path.join(
      rootDir,
      '.aios',
      'evidence',
      'agent-providers',
      'activation-agent-handoff.json',
    );
    const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
    assert.equal(artifact.kind, 'aios.rex-agent-handoff.v1');
    assert.equal(artifact.handoff.agentId, 'rex-security-reviewer');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
