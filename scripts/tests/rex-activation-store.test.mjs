import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { captureStandaloneExecutionReceipt } from '../../rex-harness/src/index.mjs';
import { runAutoGate } from '../lib/planning/auto-gate.mjs';
import {
  advanceStoredAiosCapabilityActivation,
  continueStoredAiosSoftwareWorkflow,
  readStoredAiosCapabilityActivation,
} from '../lib/workflows/rex-activation-store.mjs';

const SCENARIO_GREEN_MARKER = '.rex-scenario-green';
const SCENARIO_ARGS = Object.freeze([
  '-e',
  `const fs = require('node:fs'); process.exit(fs.existsSync('${SCENARIO_GREEN_MARKER}') ? 0 : 7);`,
]);

function scenarioCommand(rootDir) {
  return {
    executable: process.execPath,
    args: SCENARIO_ARGS,
    cwd: rootDir,
  };
}

function captureScenarioReceipt(rootDir) {
  return captureStandaloneExecutionReceipt({
    rootDir,
    ...scenarioCommand(rootDir),
  }).ref;
}

async function markScenarioGreen(rootDir) {
  await writeFile(path.join(rootDir, SCENARIO_GREEN_MARKER), 'green\n', 'utf8');
}

function honestRedDecision(rootDir, receiptRef) {
  return {
    kind: 'behavior-delta',
    decisionRef: 'artifact:testability-decision',
    redCandidate: {
      publicEntry: 'public checkout validation',
      setup: 'A checkout request that requires the requested validation behavior.',
      command: scenarioCommand(rootDir),
      expected: 'The requested validation rejects the invalid checkout.',
      observed: 'The invalid checkout is accepted before implementation.',
      failureReason: 'The requested validation behavior is absent.',
      receiptRef,
    },
  };
}

function completeTestDesign(rootDir, activationId) {
  const designed = advanceStoredAiosCapabilityActivation({
    rootDir,
    activationId,
    evidence: [
      { kind: 'test-scope-contract-recorded', refs: ['artifact:test-design'] },
      { kind: 'acceptance-test-mapping-recorded', refs: ['artifact:test-design'] },
      { kind: 'test-seam-recorded', refs: ['artifact:test-design'] },
    ],
  });
  assert.equal(designed.command.stageId, 'decide-testability');
  const redReceipt = captureScenarioReceipt(rootDir);
  return advanceStoredAiosCapabilityActivation({
    rootDir,
    activationId: designed.activation.activationId,
    evidence: [
      { kind: 'testability-decision-recorded', refs: ['artifact:testability-decision'] },
    ],
    testabilityDecision: honestRedDecision(rootDir, redReceipt),
  });
}

test('auto-gate persists the current rex activation and exposes one executable command', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-activation-'));
  try {
    const result = runAutoGate({
      rootDir,
      message: 'Clarify the domain vocabulary and acceptance criteria before implementing checkout.',
      client: 'codex',
      sessionId: 'session-rex',
    });

    assert.equal(result.capabilityActivation.capabilityId, 'software.requirements.clarify');
    assert.equal(result.capabilityCommand.provider.id, 'rex-requirements');
    assert.equal(result.capabilityCommand.stageId, 'clarify');
    assert.match(result.injection, /rex-requirements/u);
    assert.match(result.injection, /AIOS_REX_EVIDENCE=/u);
    assert.match(result.injection, new RegExp(result.capabilityActivation.activationId, 'u'));
    assert.doesNotMatch(result.injection, /rex-test-design.*rex-tdd/u);

    const stored = readStoredAiosCapabilityActivation({
      rootDir,
      activationId: result.capabilityActivation.activationId,
    });
    assert.equal(stored.activation.stageId, 'clarify');
    assert.equal(stored.command.provider.id, 'rex-requirements');
    assert.equal(stored.workflow.workflowId, 'adaptive-software-delivery');
    assert.equal(stored.workflow.currentCommand.executionToken, stored.command.executionToken);

    const blocked = advanceStoredAiosCapabilityActivation({
      rootDir,
      activationId: result.capabilityActivation.activationId,
      evidence: [
        { kind: 'acceptance-criteria-recorded', refs: ['artifact:requirements'] },
      ],
    });
    assert.equal(blocked.outcome, 'blocked');
    assert.deepEqual(blocked.missingEvidence, ['non-goals-recorded', 'first-slice-identified']);

    const completed = advanceStoredAiosCapabilityActivation({
      rootDir,
      activationId: result.capabilityActivation.activationId,
      evidence: [
        { kind: 'non-goals-recorded', refs: ['artifact:requirements'] },
        { kind: 'first-slice-identified', refs: ['artifact:requirements'] },
      ],
    });
    assert.equal(completed.outcome, 'completed');
    assert.equal(completed.command, null);
    assert.equal(completed.nextCapability.activation.capabilityId, 'software.testing.design');
    assert.equal(completed.nextCapability.command.provider.id, 'rex-test-design');

    const testDesignCompleted = completeTestDesign(
      rootDir,
      completed.nextCapability.activation.activationId,
    );
    assert.equal(testDesignCompleted.nextCapability.activation.capabilityId, 'software.testing.tdd');
    assert.equal(testDesignCompleted.nextCapability.command.provider.id, 'rex-tdd');

    assert.throws(() => advanceStoredAiosCapabilityActivation({
      rootDir,
      activationId: testDesignCompleted.nextCapability.activation.activationId,
      evidence: [
        { kind: 'failing-test-observed', refs: ['command:claimed-red'] },
        { kind: 'red-failure-reason-recorded', refs: ['artifact:test:red-reason'] },
      ],
    }), /requires at least one receipt/u);

    const tddGreen = advanceStoredAiosCapabilityActivation({
      rootDir,
      activationId: testDesignCompleted.nextCapability.activation.activationId,
      evidence: [
        { kind: 'failing-test-observed', refs: [captureScenarioReceipt(rootDir)] },
        { kind: 'red-failure-reason-recorded', refs: ['artifact:test:red-reason'] },
      ],
    });
    assert.equal(tddGreen.command.stageId, 'green');

    await markScenarioGreen(rootDir);
    const tddRefactor = advanceStoredAiosCapabilityActivation({
      rootDir,
      activationId: tddGreen.activation.activationId,
      evidence: [
        { kind: 'passing-test-observed', refs: [captureScenarioReceipt(rootDir)] },
        { kind: 'implementation-diff-recorded', refs: ['diff:working-tree'] },
      ],
    });
    assert.equal(tddRefactor.command.stageId, 'refactor');

    const tddCompleted = advanceStoredAiosCapabilityActivation({
      rootDir,
      activationId: tddRefactor.activation.activationId,
      evidence: [
        { kind: 'refactor-check-recorded', refs: [captureScenarioReceipt(rootDir)] },
        { kind: 'test-diff-review-recorded', refs: ['artifact:test-diff-review'] },
      ],
    });
    assert.equal(tddCompleted.nextCapability.activation.capabilityId, 'software.review.standards-spec');
    assert.equal(tddCompleted.nextCapability.command.provider.id, 'rex-code-review');

    const reviewCompleted = advanceStoredAiosCapabilityActivation({
      rootDir,
      activationId: tddCompleted.nextCapability.activation.activationId,
      evidence: [
        { kind: 'standards-review-recorded', refs: ['artifact:review'] },
        { kind: 'spec-review-recorded', refs: ['artifact:review'] },
      ],
    });
    assert.equal(reviewCompleted.nextCapability, null);

    const recordPath = path.join(
      rootDir,
      '.aios',
      'workflow-activations',
      `${result.capabilityActivation.activationId}.json`,
    );
    const raw = JSON.parse(await readFile(recordPath, 'utf8'));
    assert.equal(raw.activation.status, 'completed');
    assert.ok(raw.workflowActivationId);
    const workflowPath = path.join(
      rootDir,
      '.aios',
      'workflow-activations',
      'workflows',
      `${raw.workflowActivationId}.json`,
    );
    const persistedWorkflow = JSON.parse(await readFile(workflowPath, 'utf8'));
    assert.equal(persistedWorkflow.status, 'completed');
    assert.deepEqual(persistedWorkflow.completedCapabilities, [
      'software.requirements.clarify',
      'software.testing.design',
      'software.testing.tdd',
      'software.review.standards-spec',
    ]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('same-session guarded objectives receive isolated activation ledgers', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-isolation-'));
  try {
    const first = runAutoGate({
      rootDir,
      message: '实现用户搜索过滤器。',
      client: 'codex',
      sessionId: 'session-shared',
    });
    const second = runAutoGate({
      rootDir,
      message: '实现订单导出格式。',
      client: 'codex',
      sessionId: 'session-shared',
    });

    assert.equal(first.decision.disposition, 'guarded');
    assert.equal(second.decision.disposition, 'guarded');
    assert.notEqual(
      first.capabilityActivation.activationId,
      second.capabilityActivation.activationId,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('a corrupted activation ledger fails closed instead of starting a duplicate workflow', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-corrupt-'));
  try {
    const activationDir = path.join(rootDir, '.aios', 'workflow-activations');
    await mkdir(activationDir, { recursive: true });
    await writeFile(path.join(activationDir, 'corrupt.json'), '{not-json', 'utf8');

    assert.throws(() => runAutoGate({
      rootDir,
      message: 'Implement a new checkout module.',
      client: 'codex',
      sessionId: 'session-corrupt',
    }), /invalid rex activation record/u);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('planned continuation restores the active activation and current command', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-resume-'));
  try {
    const first = runAutoGate({
      rootDir,
      message: '澄清结账流程的验收条件和领域词汇。',
      client: 'codex',
      sessionId: 'session-resume',
    });
    const resumed = runAutoGate({
      rootDir,
      message: '继续',
      client: 'codex',
      sessionId: 'session-resume',
    });

    assert.equal(resumed.decision.persistence, 'reuse');
    assert.equal(
      resumed.capabilityActivation.activationId,
      first.capabilityActivation.activationId,
    );
    assert.equal(resumed.capabilityCommand.provider.id, 'rex-requirements');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('blocked testability becomes a terminal replan projection instead of redispatching the old command', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-replan-'));
  try {
    const started = runAutoGate({
      rootDir,
      message: '更新结账校验行为。',
      client: 'codex',
      sessionId: 'session-replan',
    });
    const designed = advanceStoredAiosCapabilityActivation({
      rootDir,
      activationId: started.capabilityActivation.activationId,
      evidence: [
        { kind: 'test-scope-contract-recorded', refs: ['artifact:test-design'] },
        { kind: 'acceptance-test-mapping-recorded', refs: ['artifact:test-design'] },
        { kind: 'test-seam-recorded', refs: ['artifact:test-design'] },
      ],
    });
    const replanned = advanceStoredAiosCapabilityActivation({
      rootDir,
      activationId: designed.activation.activationId,
      evidence: [
        { kind: 'testability-decision-recorded', refs: ['artifact:testability-blocked'] },
      ],
      testabilityDecision: {
        kind: 'blocked',
        decisionRef: 'artifact:testability-blocked',
        reason: 'The requested behavior has no observable public acceptance path.',
        missingAcceptance: 'Provide a user-observable acceptance scenario and expected result.',
      },
    });

    assert.equal(replanned.outcome, 'replan');
    assert.equal(replanned.command, null);
    assert.equal(replanned.nextCapability, null);
    assert.equal(replanned.activation.status, 'completed');
    assert.equal(replanned.workflow.status, 'blocked');
    assert.equal(replanned.workflow.currentCommand, null);
    const stored = readStoredAiosCapabilityActivation({
      rootDir,
      activationId: designed.activation.activationId,
    });
    assert.equal(
      continueStoredAiosSoftwareWorkflow({ rootDir, workItemKey: stored.workItemKey }),
      null,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('planned continuation restores a concrete Agent command without an Evidence Envelope', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-agent-resume-'));
  try {
    const first = runAutoGate({
      rootDir,
      message: '修改鉴权 token 和 session 校验逻辑。',
      client: 'codex',
      sessionId: 'session-agent-resume',
    });
    const testDesignCompleted = completeTestDesign(
      rootDir,
      first.capabilityActivation.activationId,
    );
    const strictGreen = advanceStoredAiosCapabilityActivation({
      rootDir,
      activationId: testDesignCompleted.nextCapability.activation.activationId,
      evidence: [
        { kind: 'failing-test-observed', refs: [captureScenarioReceipt(rootDir)] },
        { kind: 'red-failure-reason-recorded', refs: ['artifact:test:red-reason'] },
      ],
    });
    await markScenarioGreen(rootDir);
    const strictRefactor = advanceStoredAiosCapabilityActivation({
      rootDir,
      activationId: strictGreen.activation.activationId,
      evidence: [
        { kind: 'passing-test-observed', refs: [captureScenarioReceipt(rootDir)] },
        { kind: 'implementation-diff-recorded', refs: ['diff:working-tree'] },
      ],
    });
    const strictCompleted = advanceStoredAiosCapabilityActivation({
      rootDir,
      activationId: strictRefactor.activation.activationId,
      evidence: [
        { kind: 'refactor-check-recorded', refs: [captureScenarioReceipt(rootDir)] },
        { kind: 'test-diff-review-recorded', refs: ['artifact:test-diff-review'] },
      ],
    });
    assert.equal(strictCompleted.nextCapability.command.provider.id, 'rex-security-reviewer');

    const resumed = runAutoGate({
      rootDir,
      message: '继续',
      client: 'codex',
      sessionId: 'session-agent-resume',
    });
    assert.equal(resumed.capabilityCommand.provider.kind, 'agent');
    assert.equal(resumed.capabilityCommand.provider.id, 'rex-security-reviewer');
    assert.match(resumed.injection, /agent: rex-security-reviewer role=security-reviewer/u);
    assert.match(resumed.injection, /one JSON handoff object/u);
    assert.doesNotMatch(resumed.injection, /AIOS_REX_EVIDENCE=/u);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
