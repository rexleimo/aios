import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

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
const TRANSACTION_DIR = path.join(ACTIVATION_DIR, 'transactions');
const TRANSACTION_KIND = 'aios.rex-state-transaction.v1';
const STORE_LOCK_FILE = path.join(ACTIVATION_DIR, '.state.lock');
const STORE_LOCK_STALE_MS = 120_000;
const STORE_LOCK_WAIT_MS = 5_000;
const STORE_LOCK_SLEEP = new Int32Array(new SharedArrayBuffer(4));

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

function transactionPath(rootDir, transactionId) {
  if (!rootDir) throw new Error('transaction store requires rootDir');
  return path.join(rootDir, TRANSACTION_DIR, `${normalizeActivationId(transactionId)}.json`);
}

function sleepSync(milliseconds) {
  Atomics.wait(STORE_LOCK_SLEEP, 0, 0, milliseconds);
}

function storeLockPath(rootDir) {
  if (!rootDir) throw new Error('activation store requires rootDir');
  return path.join(rootDir, STORE_LOCK_FILE);
}

function staleStoreLock(lockPath) {
  let stats;
  try {
    stats = fs.lstatSync(lockPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`invalid rex activation store lock: ${lockPath}`);
  }
  if ((Date.now() - stats.mtimeMs) <= STORE_LOCK_STALE_MS) return false;
  fs.rmSync(lockPath, { force: true });
  return true;
}

function storeBusyError() {
  const busy = new Error('rex activation store is busy');
  busy.code = 'AIOS_REX_STORE_BUSY';
  return busy;
}

function lockOwnedByCurrentProcess(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'))?.pid === process.pid;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    return false;
  }
}

function acquireStoreLock(rootDir) {
  const target = storeLockPath(rootDir);
  const ownerToken = randomUUID();
  const deadline = Date.now() + STORE_LOCK_WAIT_MS;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  while (true) {
    let descriptor;
    try {
      descriptor = fs.openSync(target, 'wx', 0o600);
      fs.writeFileSync(descriptor, `${JSON.stringify({
        schemaVersion: 1,
        kind: 'aios.rex-state-lock.v1',
        ownerToken,
        pid: process.pid,
        acquiredAt: new Date().toISOString(),
      })}\n`, 'utf8');
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      break;
    } catch (error) {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (error?.code !== 'EEXIST') throw error;
      if (staleStoreLock(target)) continue;
      if (lockOwnedByCurrentProcess(target) || Date.now() >= deadline) {
        throw storeBusyError();
      }
      sleepSync(10);
    }
  }
  return () => {
    try {
      const owner = JSON.parse(fs.readFileSync(target, 'utf8'));
      if (owner?.ownerToken === ownerToken) fs.rmSync(target, { force: true });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  };
}

function withStoreLock(rootDir, operation) {
  const release = acquireStoreLock(rootDir);
  try {
    recoverPendingTransactions(rootDir);
    return operation();
  } finally {
    release();
  }
}

function atomicWrite(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, target);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
}

function transactionWriteTarget(rootDir, write) {
  if (!write || typeof write !== 'object' || Array.isArray(write)) {
    throw new Error('invalid rex state transaction write');
  }
  if (write.kind === 'workflow') return workflowPath(rootDir, write.id);
  if (write.kind === 'activation') return activationPath(rootDir, write.id);
  throw new Error(`invalid rex state transaction write kind: ${String(write.kind || '(empty)')}`);
}

function parseStateTransaction(rootDir, target) {
  let transaction;
  try {
    transaction = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (error) {
    throw new Error(`invalid rex state transaction: ${target}: ${error.message}`, { cause: error });
  }
  if (transaction?.schemaVersion !== 1
    || transaction?.kind !== TRANSACTION_KIND
    || !Array.isArray(transaction.writes)
    || transaction.writes.length < 2) {
    throw new Error(`invalid rex state transaction: ${target}`);
  }
  const transactionId = normalizeActivationId(transaction.transactionId);
  if (path.basename(target) !== `${transactionId}.json`
    || Number.isNaN(Date.parse(transaction.createdAt))) {
    throw new Error(`invalid rex state transaction: ${target}: transaction identity mismatch`);
  }
  const workflowWrites = transaction.writes.filter((write) => write?.kind === 'workflow');
  if (workflowWrites.length !== 1) throw new Error(`invalid rex state transaction: ${target}: workflow write count`);
  const workflow = workflowWrites[0].value;
  const workflowActivationId = normalizeActivationId(transaction.workflowActivationId);
  if (workflow?.workflowActivationId !== workflowActivationId || workflowWrites[0].id !== workflowActivationId) {
    throw new Error(`invalid rex state transaction: ${target}: workflow identity mismatch`);
  }
  try {
    assertSoftwareWorkflowCommandContract(workflow);
  } catch (error) {
    throw new Error(`invalid rex state transaction: ${target}: ${error.message}`, { cause: error });
  }
  const activationIds = new Set();
  for (const write of transaction.writes) {
    transactionWriteTarget(rootDir, write);
    if (write.kind !== 'activation') continue;
    const activationId = normalizeActivationId(write.id);
    const record = write.value;
    if (activationIds.has(activationId)
      || record?.kind !== 'aios.rex-activation.v1'
      || record?.workflowActivationId !== workflowActivationId
      || record?.activation?.activationId !== activationId) {
      throw new Error(`invalid rex state transaction: ${target}: activation identity mismatch`);
    }
    activationIds.add(activationId);
    const isCurrent = workflow.currentActivation?.activationId === activationId;
    const expectedActivation = isCurrent
      ? workflow.currentActivation
      : workflow.activationHistory?.find((activation) => activation.activationId === activationId);
    const expectedCommand = isCurrent ? workflow.currentCommand : null;
    if (!expectedActivation
      || !isDeepStrictEqual(record.activation, expectedActivation)
      || !isDeepStrictEqual(record.command, expectedCommand)) {
      throw new Error(`invalid rex state transaction: ${target}: activation projection mismatch`);
    }
  }
  return transaction;
}

function applyStateTransaction(rootDir, transaction) {
  for (const write of transaction.writes) {
    atomicWrite(transactionWriteTarget(rootDir, write), write.value);
  }
}

function recoverPendingTransactions(rootDir) {
  const directory = path.join(rootDir, TRANSACTION_DIR);
  if (!fs.existsSync(directory)) return;
  const pending = fs.readdirSync(directory, { withFileTypes: true })
    .filter((candidate) => candidate.isFile() && candidate.name.endsWith('.json'))
    .map((entry) => {
      const target = path.join(directory, entry.name);
      return Object.freeze({ target, transaction: parseStateTransaction(rootDir, target) });
    })
    .sort((left, right) => (
      Date.parse(left.transaction.createdAt) - Date.parse(right.transaction.createdAt)
      || left.transaction.transactionId.localeCompare(right.transaction.transactionId)
    ));
  for (const { target, transaction } of pending) {
    applyStateTransaction(rootDir, transaction);
    fs.rmSync(target, { force: true });
  }
}

function commitStateTransaction(rootDir, workflow, records, now = new Date()) {
  const transactionId = randomUUID();
  const transaction = Object.freeze({
    schemaVersion: 1,
    kind: TRANSACTION_KIND,
    transactionId,
    workflowActivationId: workflow.workflowActivationId,
    createdAt: now.toISOString(),
    writes: Object.freeze([
      Object.freeze({ kind: 'workflow', id: workflow.workflowActivationId, value: workflow }),
      ...records.map((record) => Object.freeze({
        kind: 'activation',
        id: record.activation.activationId,
        value: record,
      })),
    ]),
  });
  const target = transactionPath(rootDir, transactionId);
  atomicWrite(target, transaction);
  applyStateTransaction(rootDir, parseStateTransaction(rootDir, target));
  fs.rmSync(target, { force: true });
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
  artifacts = null,
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
    artifacts,
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

function assertRecordWorkflowProjection(record, workflow, target) {
  const activationId = record?.activation?.activationId;
  const isCurrent = workflow.currentActivation?.activationId === activationId;
  const expectedActivation = isCurrent
    ? workflow.currentActivation
    : workflow.activationHistory?.find((activation) => activation.activationId === activationId);
  const expectedCommand = isCurrent ? workflow.currentCommand : null;
  if (record?.workflowActivationId !== workflow.workflowActivationId
    || !expectedActivation
    || !isDeepStrictEqual(record.activation, expectedActivation)
    || !isDeepStrictEqual(record.command, expectedCommand)) {
    throw new Error(`invalid rex activation projection against workflow: ${target}`);
  }
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
  assertRecordWorkflowProjection(record, workflow, target);
  return Object.freeze({ ...record, workflow });
}

function readRecord(rootDir, activationId) {
  const target = activationPath(rootDir, activationId);
  if (!fs.existsSync(target)) return null;
  return parseRecord(rootDir, target);
}

function listRecordsUnlocked(rootDir) {
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
  return withStoreLock(rootDir, () => {
    const resolvedWorkItemKey = workItemKey || `activation:${activationId}`;
    const existing = listRecordsUnlocked(rootDir).find((record) => (
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
    const record = buildRecord({
      workflow,
      activation: workflow.currentActivation,
      command: workflow.currentCommand,
      workItemKey: resolvedWorkItemKey,
      request,
      updatedAt: now.toISOString(),
    });
    commitStateTransaction(rootDir, workflow, [record], now);
    return Object.freeze({ ...record, workflow });
  });
}

export function readStoredAiosCapabilityActivation({ rootDir, activationId } = {}) {
  return withStoreLock(rootDir, () => readRecord(rootDir, activationId));
}

/** 按工作项恢复最近一条仍在执行的 Capability 投影和完整 rex Workflow。 */
export function findStoredAiosCapabilityActivation({ rootDir, workItemKey } = {}) {
  const key = String(workItemKey || '').trim();
  if (!rootDir || !key) return null;
  return withStoreLock(rootDir, () => listRecordsUnlocked(rootDir)
    .filter((record) => (
      record.workItemKey === key
      && record.activation?.status !== 'completed'
      && record.command
      && record.workflow?.status === 'active'
    ))
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))[0]
    || null);
}

function advanceStoredUnlocked({
  rootDir,
  activationId,
  evidence = [],
  testabilityDecision,
  requirementsDecision,
  artifacts = null,
  expectedCommand = null,
  resolveReceipt,
  now = new Date(),
} = {}) {
  const current = readRecord(rootDir, activationId);
  if (!current) throw new Error(`rex activation not found: ${activationId}`);
  if (expectedCommand && !isDeepStrictEqual(current.command, expectedCommand)) {
    throw new Error('Provider command does not match stored activation command');
  }
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
    artifacts,
    workItemKey: current.workItemKey,
    request: current.request,
    updatedAt: now.toISOString(),
  });

  let nextCapability = null;
  const records = [record];
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
    records.push(nextRecord);
    nextCapability = Object.freeze({
      decision: advanced.nextCapability?.decision || null,
      activation: workflow.currentActivation,
      command: workflow.currentCommand,
      promotion: advanced.nextCapability?.promotion || workflow.promotion,
    });
  }
  commitStateTransaction(rootDir, workflow, records, now);

  return Object.freeze({
    outcome: advanced.outcome,
    activation: projectedActivation,
    command: projectedCommand,
    missingEvidence: advanced.missingEvidence,
    artifacts,
    nextCapability,
    workflow,
  });
}

export function advanceStoredAiosCapabilityActivation(options = {}) {
  return withStoreLock(options.rootDir, () => advanceStoredUnlocked(options));
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
