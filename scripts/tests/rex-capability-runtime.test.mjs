import assert from 'node:assert/strict';
import fs from 'node:fs';
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

const WAYFINDER_ARTIFACT = Object.freeze({
  schemaVersion: 1,
  kind: 'rex.wayfinding-artifact.v1',
  status: 'complete',
  destination: {
    name: 'activation recovery',
    successSignal: 'one resumable checkpoint is identified',
    scope: ['workflow runtime'],
    evidenceRefs: ['artifact:destination'],
  },
  decisionGraph: {
    nodes: [{
      id: 'node-start',
      question: 'where is the checkpoint?',
      fact: 'checkpoint is persisted',
      decision: 'inspect the activation store',
      evidenceRefs: ['artifact:decision-graph'],
    }],
    edges: [],
  },
  unknowns: [{
    id: 'unknown-owner',
    question: 'who owns the checkpoint?',
    impact: 'resume must not duplicate work',
    evidenceRefs: ['artifact:unknowns'],
  }],
  decisionTicket: {
    ticketId: 'decision-activation-recovery',
    facts: ['fact:checkpoint-persisted'],
    decision: 'use the stored activation as the resume source',
    consequences: ['resume remains bounded to one command'],
    evidenceRefs: ['artifact:decision-ticket'],
  },
  nextSlice: {
    id: 'slice-resume-command',
    outcome: 'return one compact resume command',
    verification: 'node --test scripts/tests/rex-capability-runtime.test.mjs',
    evidenceRefs: ['artifact:next-slice'],
  },
});

const PLANNING_ARTIFACT = Object.freeze({
  schemaVersion: 1,
  kind: 'rex.delivery-ticket.v1',
  status: 'ready',
  objective: 'persist a bounded activation artifact',
  decisionTicketRef: 'artifact:decision-ticket:activation-recovery',
  workItems: [{
    id: 'work-store-artifact',
    title: 'store artifact',
    outcome: 'activation record contains the typed artifact',
    completionCriteria: ['artifact is readable after restart'],
    verification: ['node --test scripts/tests/rex-capability-runtime.test.mjs'],
    evidenceRefs: ['artifact:delivery-ticket'],
    dependsOn: [],
  }],
  frontier: { ready: ['work-store-artifact'], blocked: [] },
  parallelGroups: [['work-store-artifact']],
  convergenceGate: {
    requiredEvidenceRefs: ['artifact:delivery-ticket'],
    verification: 'read the persisted activation record',
    joinCondition: 'all ready work items have evidence',
  },
  completionClaim: 'soft',
  runtimeArtifactContract: null,
});

test('provider output parser validates capability-specific Wayfinder and Planning artifacts', () => {
  const wayfinderOutput = `AIOS_REX_EVIDENCE=${JSON.stringify({
    schemaVersion: 1,
    activationId: 'activation-wayfinder-artifact',
    evidence: [{ kind: 'destination-recorded', refs: ['artifact:destination'] }],
    wayfinderArtifact: WAYFINDER_ARTIFACT,
  })}`;
  const wayfinder = parseCapabilityEvidenceEnvelope(wayfinderOutput, {
    activationId: 'activation-wayfinder-artifact',
    capabilityId: 'software.navigation.wayfind',
  });
  assert.equal(wayfinder.wayfinderArtifact.nextSlice.id, 'slice-resume-command');

  const planningOutput = `AIOS_REX_EVIDENCE=${JSON.stringify({
    schemaVersion: 1,
    activationId: 'activation-planning-artifact',
    evidence: [{ kind: 'dependency-graph-recorded', refs: ['artifact:delivery-ticket'] }],
    planningArtifact: PLANNING_ARTIFACT,
  })}`;
  const planning = parseCapabilityEvidenceEnvelope(planningOutput, {
    activationId: 'activation-planning-artifact',
    capabilityId: 'software.planning.sequence',
  });
  assert.equal(planning.planningArtifact.workItems[0].id, 'work-store-artifact');
});

test('provider output parser rejects missing, partial, and mismatched capability artifacts', () => {
  const base = {
    schemaVersion: 1,
    activationId: 'activation-artifact-boundary',
    evidence: [{ kind: 'destination-recorded', refs: ['artifact:destination'] }],
  };
  assert.throws(
    () => parseCapabilityEvidenceEnvelope(`AIOS_REX_EVIDENCE=${JSON.stringify(base)}`, {
      activationId: base.activationId,
      capabilityId: 'software.navigation.wayfind',
    }),
    /requires wayfinderArtifact/u,
  );
  assert.throws(
    () => parseCapabilityEvidenceEnvelope(`AIOS_REX_EVIDENCE=${JSON.stringify({
      ...base,
      wayfinderArtifact: { ...WAYFINDER_ARTIFACT, status: 'partial', decisionTicket: null, nextSlice: null },
    })}`, {
      activationId: base.activationId,
      capabilityId: 'software.navigation.wayfind',
    }),
    /requires a complete artifact/u,
  );
  assert.throws(
    () => parseCapabilityEvidenceEnvelope(`AIOS_REX_EVIDENCE=${JSON.stringify({
      ...base,
      planningArtifact: PLANNING_ARTIFACT,
    })}`, {
      activationId: base.activationId,
      capabilityId: 'software.navigation.wayfind',
    }),
    /requires wayfinderArtifact|cannot include planningArtifact/u,
  );
});


test('AIOS persists normalized Wayfinder and Planning artifacts on completed activations', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-artifact-persistence-'));
  try {
    const wayfinderDecision = evaluateAiosSoftwareRequest({
      message: 'Map the unknown execution path.',
      explicitIntent: 'wayfinder',
    }).decision;
    const wayfinder = startStoredAiosCapabilityActivation({
      rootDir,
      decision: wayfinderDecision,
      activationId: 'activation-wayfinder-persisted',
      workItemKey: 'work-item:wayfinder-persisted',
      request: { message: 'Map the unknown execution path.', explicitIntent: 'wayfinder' },
    });
    const wayfinderResult = recordAiosCapabilityEvidence({
      rootDir,
      activationId: wayfinder.activation.activationId,
      commandToken: wayfinder.command.executionToken,
      evidence: [
        { kind: 'destination-recorded', refs: ['artifact:destination'] },
        { kind: 'decision-map-recorded', refs: ['artifact:decision-graph'] },
        { kind: 'next-slice-identified', refs: ['artifact:next-slice'] },
      ],
      wayfinderArtifact: WAYFINDER_ARTIFACT,
    });
    assert.equal(wayfinderResult.outcome, 'completed');
    const storedWayfinder = readStoredAiosCapabilityActivation({
      rootDir,
      activationId: wayfinder.activation.activationId,
    });
    assert.equal(storedWayfinder.artifacts.wayfinderArtifact.kind, 'rex.wayfinding-artifact.v1');
    assert.equal(storedWayfinder.artifacts.wayfinderArtifact.nextSlice.id, 'slice-resume-command');

    const planningDecision = evaluateAiosSoftwareRequest({
      message: 'Split the confirmed objective into delivery tickets.',
      explicitIntent: 'tickets',
    }).decision;
    const planning = startStoredAiosCapabilityActivation({
      rootDir,
      decision: planningDecision,
      activationId: 'activation-planning-persisted',
      workItemKey: 'work-item:planning-persisted',
      request: { message: 'Split the confirmed objective into delivery tickets.', explicitIntent: 'tickets' },
    });
    const planningResult = recordAiosCapabilityEvidence({
      rootDir,
      activationId: planning.activation.activationId,
      commandToken: planning.command.executionToken,
      evidence: [
        { kind: 'dependency-graph-recorded', refs: ['artifact:delivery-ticket'] },
        { kind: 'step-verification-recorded', refs: ['artifact:delivery-ticket'] },
      ],
      planningArtifact: PLANNING_ARTIFACT,
    });
    assert.equal(planningResult.outcome, 'completed');
    const storedPlanning = readStoredAiosCapabilityActivation({
      rootDir,
      activationId: planning.activation.activationId,
    });
    assert.equal(storedPlanning.artifacts.planningArtifact.kind, 'rex.delivery-ticket.v1');
    assert.equal(storedPlanning.artifacts.planningArtifact.workItems[0].id, 'work-store-artifact');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

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
      explicitIntent: 'grill',
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
      // 北极星原则：行为变更由显式声明给出，不再由文本正则猜。
      explicitIntent: 'implement',
      completedCapabilities: ['software.requirements.clarify'],
    });
    const started = startStoredAiosCapabilityActivation({
      rootDir,
      decision: software.decision,
      activationId: 'activation-envelope-testability',
      workItemKey: 'work-item:envelope-testability',
      // 北极星原则：intent 必须随 request 持久化，workflow 推进时重新
      // 评估事实依赖它（而非从消息文本猜）。
      request: { message: 'Update checkout validation behavior.', explicitIntent: 'implement' },
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
      explicitIntent: 'grill',
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
      { anyOf: ['non-goals-recorded', 'assumptions-recorded'] },
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

test('AIOS serializes evidence writes so one Command token cannot advance twice', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-token-race-'));
  try {
    const started = runAutoGate({
      rootDir,
      message: 'Clarify the acceptance criteria before implementation.',
      explicitIntent: 'grill',
      client: 'codex',
      sessionId: 'token-race',
    });
    const activationId = started.capabilityActivation.activationId;
    const commandToken = started.capabilityCommand.executionToken;
    const originalRename = fs.renameSync;
    let nestedError = null;
    let triggered = false;
    fs.renameSync = (source, destination) => {
      const isTransaction = path.basename(path.dirname(destination)) === 'activations'
        && path.extname(destination) === '.json';
      if (!triggered && isTransaction) {
        triggered = true;
        try {
          recordAiosCapabilityEvidence({
            rootDir,
            activationId,
            commandToken,
            evidence: [{ kind: 'non-goals-recorded', refs: ['artifact:requirements'] }],
          });
        } catch (error) {
          nestedError = error;
        }
      }
      return originalRename(source, destination);
    };

    let outer;
    try {
      outer = recordAiosCapabilityEvidence({
        rootDir,
        activationId,
        commandToken,
        evidence: [{ kind: 'acceptance-criteria-recorded', refs: ['artifact:requirements'] }],
      });
    } finally {
      fs.renameSync = originalRename;
    }

    assert.equal(outer.outcome, 'blocked');
    assert.equal(nestedError?.code, 'AIOS_REX_STORE_BUSY');
    const stored = readStoredAiosCapabilityActivation({ rootDir, activationId });
    assert.deepEqual(stored.activation.evidence, [
      { kind: 'acceptance-criteria-recorded', refs: ['artifact:requirements'] },
    ]);
    assert.notEqual(stored.command.executionToken, commandToken);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('AIOS reports plan evidence mirror failures without hiding committed Rex state', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-plan-mirror-'));
  try {
    const started = runAutoGate({
      rootDir,
      message: 'Clarify the acceptance criteria before implementation.',
      explicitIntent: 'grill',
      client: 'codex',
      sessionId: 'plan-mirror',
    });
    const activationId = started.capabilityActivation.activationId;
    const originalRename = fs.renameSync;
    let injected = false;
    fs.renameSync = (source, destination) => {
      const isActivePlan = path.basename(destination) === 'active.json'
        && path.basename(path.dirname(destination)) === 'planning';
      if (!injected && isActivePlan) {
        injected = true;
        const error = new Error('injected plan evidence write failure');
        error.code = 'EIO';
        throw error;
      }
      return originalRename(source, destination);
    };

    let result;
    try {
      result = recordAiosCapabilityEvidence({
        rootDir,
        activationId,
        commandToken: started.capabilityCommand.executionToken,
        evidence: [{ kind: 'acceptance-criteria-recorded', refs: ['artifact:requirements'] }],
      });
    } finally {
      fs.renameSync = originalRename;
    }

    assert.equal(result.outcome, 'blocked');
    assert.equal(result.planEvidence.status, 'failed');
    assert.equal(result.planEvidence.error.code, 'EIO');
    const stored = readStoredAiosCapabilityActivation({ rootDir, activationId });
    assert.deepEqual(stored.activation.evidence, [
      { kind: 'acceptance-criteria-recorded', refs: ['artifact:requirements'] },
    ]);
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
      // 北极星原则：specialist 审查由显式 observation 声明（含风险域 refs），
      // 不再由 "鉴权/security" 文本关键词触发。
      observations: [
        { kind: 'review.specialist-required', evidenceRefs: ['risk-domain:security'] },
      ],
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
