import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertSoftwareWorkflowCommandContract,
  expectedScenarioCommandForWorkflow,
  resolveStandaloneExecutionReceipt,
  validateCommandEvidence,
} from '../../../rex-harness/src/index.mjs';

import {
  advanceAiosSoftwareWorkflow,
  startAiosSoftwareWorkflow,
} from './rex-harness-adapter.mjs';

const ACTIVATION_DIR = path.join('.aios', 'workflow-activations');
const WORKFLOW_DIR = path.join(ACTIVATION_DIR, 'workflows');

function normalizeActivationId(activationId) {
  const value = String(activationId || '').trim();
  if (!/^[a-zA-Z0-9._-]+$/u.test(value)) throw new Error(`invalid activationId: ${value || '(empty)'}`);
  return value;
}

function activationPath(rootDir, activationId) {
  if (!rootDir) throw new Error('activation store requires rootDir');
  return path.join(rootDir, ACTIVATION_DIR, `${normalizeActivationId(activationId)}.json`);
}

function workflowPath(rootDir, workflowActivationId) {
  if (!rootDir) throw new Error('workflow store requires rootDir');
  return path.join(rootDir, WORKFLOW_DIR, `${normalizeActivationId(workflowActivationId)}.json`);
}

function atomicWrite(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, target);
}

function writeWorkflow(rootDir, workflow) {
  atomicWrite(workflowPath(rootDir, workflow.workflowActivationId), workflow);
  return workflow;
}

function writeRecord(rootDir, record, workflow) {
  const target = activationPath(rootDir, record.activation.activationId);
  atomicWrite(target, record);
  return Object.freeze({ ...record, workflow });
}

function sealWorkflowCommand(workflow) {
  if (!workflow.currentCommand) return workflow;
  // executionToken 属于 AIOS 宿主安全边界；rex Workflow 只持有并续转语义 Command。
  return Object.freeze({
    ...workflow,
    currentCommand: Object.freeze({
      ...workflow.currentCommand,
      executionToken: randomUUID(),
    }),
  });
}

function buildRecord({
  workflow,
  activation,
  command,
  outcome = 'started',
  missingEvidence = [],
  updatedAt,
  workItemKey = '',
  request = null,
}) {
  return Object.freeze({
    schemaVersion: 1,
    kind: 'aios.rex-activation.v1',
    outcome,
    // activation/command 是兼容旧消费者的当前 Capability 投影；workflow 才是续转事实源。
    activation,
    command,
    workflowActivationId: workflow.workflowActivationId,
    missingEvidence: Object.freeze([...missingEvidence]),
    workItemKey,
    request,
    updatedAt,
  });
}

function parseWorkflow(target) {
  let workflow;
  try {
    workflow = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (error) {
    throw new Error(`invalid rex workflow record: ${target}: ${error.message}`, { cause: error });
  }
  if (workflow?.kind !== 'rex.software-workflow-activation.v1') {
    throw new Error(`invalid rex workflow record: ${target}`);
  }
  try {
    assertSoftwareWorkflowCommandContract(workflow);
  } catch (error) {
    throw new Error(`invalid rex workflow command contract: ${target}: ${error.message}`, { cause: error });
  }
  return workflow;
}

function parseRecord(rootDir, target) {
  let record;
  try {
    record = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (error) {
    // 状态损坏必须显式阻塞，不能静默创建一条重复 Workflow 掩盖证据链断裂。
    throw new Error(`invalid rex activation record: ${target}: ${error.message}`, { cause: error });
  }
  if (record?.kind !== 'aios.rex-activation.v1') {
    throw new Error(`invalid rex activation record: ${target}`);
  }
  const workflow = record.workflow || (record.workflowActivationId
    ? parseWorkflow(workflowPath(rootDir, record.workflowActivationId))
    : null);
  if (!workflow) throw new Error(`invalid rex activation record: ${target}: missing workflow reference`);
  try {
    assertSoftwareWorkflowCommandContract(workflow);
  } catch (error) {
    throw new Error(`invalid rex activation workflow contract: ${target}: ${error.message}`, { cause: error });
  }
  return Object.freeze({ ...record, workflow });
}

function listRecords(rootDir) {
  const directory = path.join(rootDir, ACTIVATION_DIR);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => parseRecord(rootDir, path.join(directory, entry.name)));
}

/**
 * 创建 AIOS 执行投影。软件工作流本身由 rex-harness 创建并持久化在 record.workflow，
 * AIOS 只签发 Command token 和保存宿主元数据。
 */
export function startStoredAiosCapabilityActivation({
  rootDir,
  decision,
  activationId = randomUUID(),
  workflowActivationId = `aios-${randomUUID()}`,
  workItemKey = '',
  request = null,
  now = new Date(),
} = {}) {
  const resolvedWorkItemKey = workItemKey || `activation:${activationId}`;
  const existing = listRecords(rootDir).find((record) => (
    record.workItemKey === resolvedWorkItemKey
    && record.activation?.capabilityId === decision?.capabilityId
    && record.activation?.status !== 'completed'
  ));
  if (existing) return existing;

  const workflow = sealWorkflowCommand(startAiosSoftwareWorkflow({
    workflowActivationId,
    workItemKey: resolvedWorkItemKey,
    request: request || {},
    decision,
    createActivationId: () => activationId,
    now,
  }));
  writeWorkflow(rootDir, workflow);
  return writeRecord(rootDir, buildRecord({
    workflow,
    activation: workflow.currentActivation,
    command: workflow.currentCommand,
    workItemKey: resolvedWorkItemKey,
    request,
    updatedAt: now.toISOString(),
  }), workflow);
}

export function readStoredAiosCapabilityActivation({ rootDir, activationId } = {}) {
  const target = activationPath(rootDir, activationId);
  if (!fs.existsSync(target)) return null;
  return parseRecord(rootDir, target);
}

/** 按工作项恢复最近一条仍在执行的 Capability 投影和完整 rex Workflow。 */
export function findStoredAiosCapabilityActivation({ rootDir, workItemKey } = {}) {
  const key = String(workItemKey || '').trim();
  if (!rootDir || !key) return null;
  return listRecords(rootDir)
    .filter((record) => (
      record.workItemKey === key
      && record.activation?.status !== 'completed'
      && record.command
      && record.workflow?.status === 'active'
    ))
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))[0]
    || null;
}

export function advanceStoredAiosCapabilityActivation({
  rootDir,
  activationId,
  evidence = [],
  testabilityDecision,
  requirementsDecision,
  resolveReceipt,
  now = new Date(),
} = {}) {
  const current = readStoredAiosCapabilityActivation({ rootDir, activationId });
  if (!current) throw new Error(`rex activation not found: ${activationId}`);
  if (!current.workflow) {
    throw new Error(`rex activation is missing its software workflow state: ${activationId}`);
  }
  if (current.workflow.currentActivation?.activationId !== current.activation.activationId) {
    throw new Error(`rex activation does not match current software workflow command: ${activationId}`);
  }

  const receiptResolver = resolveReceipt
    || ((ref) => resolveStandaloneExecutionReceipt({ rootDir, ref }));
  const normalizedEvidence = validateCommandEvidence(current.command, evidence, {
    resolveReceipt: receiptResolver,
    expectedScenarioCommand: expectedScenarioCommandForWorkflow(current.workflow),
  });
  const advanced = advanceAiosSoftwareWorkflow(current.workflow, normalizedEvidence, {
    now,
    testabilityDecision,
    requirementsDecision,
    resolveReceipt: receiptResolver,
  });
  const workflow = advanced.blockedReason === undefined
    ? sealWorkflowCommand(advanced.workflow)
    : advanced.workflow;
  writeWorkflow(rootDir, workflow);
  const completed = advanced.outcome === 'completed';
  const terminal = completed || advanced.outcome === 'replan';
  const projectedActivation = terminal
    ? advanced.completedActivation
    : workflow.currentActivation;
  const projectedCommand = terminal ? null : workflow.currentCommand;
  const record = buildRecord({
    workflow,
    activation: projectedActivation,
    command: projectedCommand,
    outcome: advanced.outcome,
    missingEvidence: advanced.missingEvidence,
    workItemKey: current.workItemKey,
    request: current.request,
    updatedAt: now.toISOString(),
  });
  writeRecord(rootDir, record, workflow);

  let nextCapability = null;
  if (completed && workflow.currentActivation) {
    const nextRecord = buildRecord({
      workflow,
      activation: workflow.currentActivation,
      command: workflow.currentCommand,
      outcome: 'started',
      workItemKey: current.workItemKey,
      request: current.request,
      updatedAt: now.toISOString(),
    });
    writeRecord(rootDir, nextRecord, workflow);
    nextCapability = Object.freeze({
      decision: advanced.nextCapability?.decision || null,
      activation: workflow.currentActivation,
      command: workflow.currentCommand,
      promotion: advanced.nextCapability?.promotion || workflow.promotion,
    });
  }

  return Object.freeze({
    outcome: advanced.outcome,
    activation: projectedActivation,
    command: projectedCommand,
    missingEvidence: advanced.missingEvidence,
    nextCapability,
    workflow,
  });
}

/**
 * 兼容旧调用名：续转不再重新推导 Capability，而是读取 rex Workflow 已经发出的当前 Command。
 */
export function continueStoredAiosSoftwareWorkflow({ rootDir, workItemKey } = {}) {
  const record = findStoredAiosCapabilityActivation({ rootDir, workItemKey });
  if (!record) return null;
  return Object.freeze({
    decision: null,
    activation: record.activation,
    command: record.command,
    promotion: record.workflow?.promotion || null,
    workflow: record.workflow,
  });
}
