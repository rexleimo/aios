import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  TOOLS,
  handleCapabilityEvidence,
  handlePlanAutoGate,
  handlePlanStart,
} from '../aios-mcp-server.mjs';
import { parsePlanArgs } from '../lib/cli/parse-args/plan.mjs';
import { runPlanCommand } from '../lib/planning/cli.mjs';
import { captureStandaloneExecutionReceipt } from '../../rex-harness/src/index.mjs';
import { evaluateAiosSoftwareRequest } from '../lib/workflows/rex-harness-adapter.mjs';
import {
  advanceStoredAiosCapabilityActivation,
  startStoredAiosCapabilityActivation,
} from '../lib/workflows/rex-activation-store.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function makeIo() {
  let stdoutText = '';
  let stderrText = '';
  return {
    stdout: { write(chunk) { stdoutText += String(chunk); } },
    stderr: { write(chunk) { stderrText += String(chunk); } },
    read() { return { stdoutText, stderrText }; },
  };
}

test('plan CLI parses policy mode, session, and dry-run separately from injection format', () => {
  const parsed = parsePlanArgs([
    'plan',
    'auto-gate',
    '--task',
    '/plan ship policy adapter',
    '--policy-mode',
    'strict',
    '--session',
    'cli-turn',
    '--dry-run',
    '--format',
    'json',
  ]);

  assert.equal(parsed.mode, 'command');
  assert.equal(parsed.options.policyMode, 'strict');
  assert.equal(parsed.options.sessionId, 'cli-turn');
  assert.equal(parsed.options.dryRun, true);
  assert.equal(parsed.options.format, 'json');
});

test('plan CLI parses the typed rex capability evidence contract', () => {
  const parsed = parsePlanArgs([
    'plan',
    'capability-evidence',
    '--activation',
    'activation-1',
    '--command-token',
    'command-token-1',
    '--evidence-kind',
    'acceptance-criteria-recorded',
    '--evidence-ref',
    'artifact:requirements',
    '--testability-file',
    'testability.json',
    '--json',
  ]);

  assert.equal(parsed.mode, 'command');
  assert.equal(parsed.options.subcommand, 'capability-evidence');
  assert.equal(parsed.options.activationId, 'activation-1');
  assert.equal(parsed.options.commandToken, 'command-token-1');
  assert.equal(parsed.options.evidenceKind, 'acceptance-criteria-recorded');
  assert.equal(parsed.options.evidenceRef, 'artifact:requirements');
  assert.equal(parsed.options.testabilityFile, 'testability.json');
});

test('plan CLI submits a typed testability decision from a file with a real receipt', async () => {
  const root = await makeTemp('aios-plan-testability-');
  try {
    const software = evaluateAiosSoftwareRequest({
      message: 'Update checkout validation behavior.',
      completedCapabilities: ['software.requirements.clarify'],
    });
    const started = startStoredAiosCapabilityActivation({
      rootDir: root,
      decision: software.decision,
      activationId: 'activation-plan-testability',
      workItemKey: 'work-item:plan-testability',
      request: { message: 'Update checkout validation behavior.' },
    });
    const designed = advanceStoredAiosCapabilityActivation({
      rootDir: root,
      activationId: started.activation.activationId,
      evidence: [
        { kind: 'test-scope-contract-recorded', refs: ['artifact:test-design'] },
        { kind: 'acceptance-test-mapping-recorded', refs: ['artifact:test-design'] },
        { kind: 'test-seam-recorded', refs: ['artifact:test-design'] },
      ],
    });
    assert.equal(designed.command.stageId, 'decide-testability');

    const receipt = captureStandaloneExecutionReceipt({
      rootDir: root,
      executable: process.execPath,
      args: ['-e', 'process.exit(7)'],
    });
    await writeFile(path.join(root, 'testability.json'), `${JSON.stringify({
      kind: 'behavior-delta',
      decisionRef: 'artifact:testability-decision',
      redCandidate: {
        publicEntry: 'checkout validation endpoint',
        setup: 'Submit an invalid checkout request.',
        command: {
          executable: process.execPath,
          args: ['-e', 'process.exit(7)'],
          cwd: root,
        },
        expected: 'The invalid checkout is rejected.',
        observed: 'The invalid checkout is accepted before implementation.',
        failureReason: 'The requested validation behavior is absent.',
        receiptRef: receipt.ref,
      },
    })}\n`, 'utf8');

    const io = makeIo();
    const submitted = await runPlanCommand({
      subcommand: 'capability-evidence',
      activationId: designed.activation.activationId,
      commandToken: designed.command.executionToken,
      evidenceKind: 'testability-decision-recorded',
      evidenceRef: 'artifact:testability-decision',
      testabilityFile: 'testability.json',
      json: true,
    }, { rootDir: root, ...io });

    assert.equal(submitted.exitCode, 0);
    assert.equal(submitted.result.nextCapability.command.provider.id, 'rex-tdd');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('MCP publishes the typed rex capability evidence tool', () => {
  const tool = TOOLS.find((item) => item.name === 'aios_capability_evidence');
  assert.ok(tool);
  assert.deepEqual(tool.inputSchema.required, ['activationId', 'commandToken', 'evidence']);
});

test('CLI auto-gate leaves a planned dry-run and pure injection without artifacts', async () => {
  const root = await makeTemp('aios-workflow-cli-');
  try {
    const io = makeIo();
    const result = await runPlanCommand({
      subcommand: 'auto-gate',
      task: '/plan ship policy adapter',
      client: 'codex',
      sessionId: 'cli-dry-run',
      policyMode: 'strict',
      dryRun: true,
      json: true,
    }, { rootDir: root, ...io });

    assert.equal(result.exitCode, 0);
    assert.equal(result.result.decision.disposition, 'planned');
    assert.equal(result.result.created, false);
    assert.equal(fs.existsSync(path.join(root, '.aios', 'planning', 'active.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'docs', 'plans')), false);

    const injected = await runPlanCommand({ subcommand: 'inject' }, { rootDir: root, ...io });
    assert.equal(injected.exitCode, 0);
    assert.equal(fs.existsSync(path.join(root, '.aios', 'planning', 'active.json')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('MCP auto-gate returns the structured decision without forcing a direct plan', async () => {
  const root = await makeTemp('aios-workflow-mcp-');
  try {
    const response = await handlePlanAutoGate({
      workspace: root,
      message: 'Explain the active workflow state.',
      client: 'codex',
      sessionId: 'mcp-direct',
      policyMode: 'strict',
    });
    const payload = JSON.parse(response.content[0].text);

    assert.equal(payload.ok, true);
    assert.equal(payload.decision.disposition, 'direct');
    assert.equal(payload.policy.mode, 'strict');
    assert.equal(fs.existsSync(path.join(root, '.aios', 'planning', 'active.json')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('MCP auto-gate does not masquerade as Hermes when the caller omits a client', async () => {
  const root = await makeTemp('aios-workflow-mcp-client-');
  try {
    const response = await handlePlanAutoGate({
      workspace: root,
      message: '/plan persist one work item',
      sessionId: 'mcp-client-default',
    });
    const payload = JSON.parse(response.content[0].text);

    assert.equal(payload.plan.client, 'unknown');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('MCP plan start preserves the caller session for acknowledgement matching', async () => {
  const root = await makeTemp('aios-workflow-mcp-start-session-');
  try {
    const response = await handlePlanStart({
      workspace: root,
      title: 'Persist the caller session',
      client: 'codex',
      sessionId: 'mcp-start-session',
    });
    const plan = JSON.parse(response.content[0].text);

    assert.equal(plan.client, 'codex');
    assert.equal(plan.sessionId, 'mcp-start-session');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI and MCP evidence adapters advance the same persisted rex contract', async () => {
  const root = await makeTemp('aios-capability-evidence-');
  try {
    const io = makeIo();
    const started = await runPlanCommand({
      subcommand: 'auto-gate',
      task: 'Clarify the domain vocabulary and acceptance criteria before implementation.',
      client: 'codex',
      sessionId: 'evidence-session',
      json: true,
    }, { rootDir: root, ...io });
    const activationId = started.result.capabilityActivation.activationId;
    const commandToken = started.result.capabilityCommand.executionToken;

    const partial = await runPlanCommand({
      subcommand: 'capability-evidence',
      activationId,
      commandToken,
      evidenceKind: 'acceptance-criteria-recorded',
      evidenceRef: 'artifact:requirements',
      json: true,
    }, { rootDir: root, ...io });
    assert.equal(partial.exitCode, 0);
    assert.equal(partial.result.outcome, 'blocked');

    const replayed = await handleCapabilityEvidence({
      workspace: root,
      activationId,
      commandToken,
      evidence: [
        { kind: 'non-goals-recorded', refs: ['artifact:requirements'] },
      ],
    });
    assert.match(replayed.content[0].text, /requires the current Command token/u);

    const response = await handleCapabilityEvidence({
      workspace: root,
      activationId,
      commandToken: partial.result.command.executionToken,
      evidence: [
        { kind: 'non-goals-recorded', refs: ['artifact:requirements'] },
        { kind: 'first-slice-identified', refs: ['artifact:requirements'] },
      ],
    });
    const completed = JSON.parse(response.content[0].text);
    assert.equal(completed.outcome, 'completed');
    assert.equal(completed.nextCapability.command.provider.id, 'rex-test-design');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
