import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  expectedScenarioCommandForWorkflow,
  findStandaloneWorkflow,
  persistStandaloneWorkflow,
  resolveStandaloneExecutionReceipt,
  validateCommandEvidence,
} from '../../../rex-harness/src/index.mjs';

import {
  advanceAiosSoftwareWorkflow,
  startAiosSoftwareWorkflow,
} from './rex-harness-adapter.mjs';

const ACTIVATION_DIR = path.join('.rex-harness');
const STORE_LOCK_FILE = path.join(ACTIVATION_DIR, '.state.lock');
const STORE_LOCK_STALE_MS = 120_000;
const STORE_LOCK_WAIT_MS = 5_000;
const STORE_LOCK_SLEEP = new Int32Array(new SharedArrayBuffer(4));

function normalizeActivationId(activationId) {
  const value = String(activationId || '').trim();
  if (!/^[a-zA-Z0-9._-]+$/u.test(value)) throw new Error(`invalid activationId: ${value || '(empty)'}`);
  return value;
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

/**
 * 创建 AIOS 执行投影。软件工作流本身由 rex-harness 创建并持久化在 record.workflow，
 * AIOS 只签发 Command token 和保存宿主元数据。
 */
function lookupStandalone(rootDir, query) {
  try {
    return findStandaloneWorkflow({ rootDir, ...query });
  } catch (error) {
    if (/not found/iu.test(String(error?.message || ''))) return null;
    throw error;
  }
}

function artifactsPath(rootDir, activationId) {
  return path.join(rootDir, ACTIVATION_DIR, 'artifacts', `${normalizeActivationId(activationId)}.json`);
}

function readArtifacts(rootDir, activationId) {
  if (!activationId) return null;
  const target = artifactsPath(rootDir, activationId);
  if (!fs.existsSync(target)) return null;
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function writeArtifacts(rootDir, activationId, artifacts) {
  if (!artifacts || !activationId) return;
  atomicWrite(artifactsPath(rootDir, activationId), artifacts);
}

function projectStandalone(presented, {
  rootDir = '',
  workItemKey = '',
  request = null,
  artifacts = null,
} = {}) {
  const workflow = presented.workflow;
  const activationId = workflow.currentActivation?.activationId
    || workflow.activationHistory?.at(-1)?.activationId;
  return Object.freeze({
    schemaVersion: 1,
    kind: 'aios.rex-activation.v1',
    outcome: presented.outcome,
    activation: workflow.currentActivation,
    command: presented.command,
    workflowActivationId: workflow.workflowActivationId,
    missingEvidence: Object.freeze([...(presented.missingEvidence || [])]),
    artifacts: artifacts || (rootDir ? readArtifacts(rootDir, activationId) : null),
    workItemKey: workItemKey || workflow.workItemKey,
    request,
    updatedAt: workflow.updatedAt,
    workflow,
    stateRoot: presented.stateRoot,
  });
}

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
    const existing = lookupStandalone(rootDir, { workItemKey: resolvedWorkItemKey });
    if (existing && existing.workflow?.status === 'active') {
      return projectStandalone(existing, {
        rootDir,
        workItemKey: resolvedWorkItemKey,
        request,
      });
    }

    const workflow = sealWorkflowCommand(startAiosSoftwareWorkflow({
      workflowActivationId,
      workItemKey: resolvedWorkItemKey,
      request: request || {},
      decision,
      createActivationId: () => activationId,
      now,
    }));
    persistStandaloneWorkflow({ rootDir, workflow });
    return projectStandalone({
      outcome: 'started',
      workflow,
      command: workflow.currentCommand,
      missingEvidence: [],
      stateRoot: path.join(rootDir, '.rex-harness'),
    }, { rootDir, workItemKey: resolvedWorkItemKey, request });
  });
}

export function readStoredAiosCapabilityActivation({ rootDir, activationId } = {}) {
  return withStoreLock(rootDir, () => {
    const presented = lookupStandalone(rootDir, { activationId });
    if (!presented) return null;
    return projectStandalone(presented, {
      rootDir,
      workItemKey: presented.workflow.workItemKey,
      artifacts: readArtifacts(rootDir, activationId),
    });
  });
}

/** 按工作项恢复最近一条仍在执行的 Capability 投影和完整 rex Workflow。 */
export function findStoredAiosCapabilityActivation({ rootDir, workItemKey } = {}) {
  const key = String(workItemKey || '').trim();
  if (!rootDir || !key) return null;
  return withStoreLock(rootDir, () => {
    const presented = lookupStandalone(rootDir, { workItemKey: key });
    if (!presented
      || presented.workflow?.status !== 'active'
      || !presented.command
      || presented.workflow.currentActivation?.status === 'completed') {
      return null;
    }
    return projectStandalone(presented, { rootDir, workItemKey: key });
  });
}

function advanceStoredUnlocked({
  rootDir,
  activationId,
  evidence = [],
  testabilityDecision,
  requirementsDecision,
  artifacts = null,
  expectedCommand = null,
  now = new Date(),
} = {}) {
  const currentPresented = lookupStandalone(rootDir, { activationId });
  if (!currentPresented) throw new Error(`rex activation not found: ${activationId}`);
  const current = projectStandalone(currentPresented, {
    rootDir,
    workItemKey: currentPresented.workflow.workItemKey,
  });
  if (expectedCommand && !isDeepStrictEqual(current.command, expectedCommand)) {
    throw new Error('Provider command does not match stored activation command');
  }
  if (current.workflow.currentActivation?.activationId !== current.activation.activationId) {
    throw new Error(`rex activation does not match current software workflow command: ${activationId}`);
  }

  const receiptResolver = ((ref) => resolveStandaloneExecutionReceipt({ rootDir, ref }));
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
  persistStandaloneWorkflow({ rootDir, workflow });
  if (artifacts) writeArtifacts(rootDir, activationId, artifacts);
  const completed = advanced.outcome === 'completed';
  const terminal = completed || advanced.outcome === 'replan';
  const projectedActivation = terminal
    ? advanced.completedActivation
    : workflow.currentActivation;
  const projectedCommand = terminal ? null : workflow.currentCommand;
  let nextCapability = null;
  if (completed && workflow.currentActivation) {
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
