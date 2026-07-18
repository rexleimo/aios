import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { validateCommandEvidence } from '../../../rex-harness/src/index.mjs';
import {
  addPlanEvidence,
  readActivePlan,
} from '../planning/contract.mjs';
import {
  advanceStoredAiosCapabilityActivation,
  readStoredAiosCapabilityActivation,
} from './rex-activation-store.mjs';

export const REX_EVIDENCE_PREFIX = 'AIOS_REX_EVIDENCE=';

const AGENT_HANDOFF_FIELDS = Object.freeze([
  'schemaVersion',
  'agentId',
  'role',
  'status',
  'findings',
  'blockers',
  'evidenceRefs',
  'filesReviewed',
  'recommendedNextSteps',
]);
const AGENT_HANDOFF_STATUSES = new Set(['pass', 'blocked', 'needs-input', 'fail']);
const PLACEHOLDER_REF = /artifact-or-command-ref|placeholder|真实存在|todo|tbd/iu;

function normalizeEnvelopeEvidence(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new TypeError('rex evidence envelope requires a non-empty evidence array');
  }
  if (evidence.length > 64) throw new TypeError('rex evidence envelope exceeds 64 evidence items');

  return Object.freeze(evidence.map((item, index) => {
    if (!item || typeof item !== 'object') throw new TypeError(`evidence ${index} must be an object`);
    const kind = String(item.kind || '').trim();
    const refs = Array.isArray(item.refs)
      ? item.refs.map((ref) => String(ref).trim()).filter(Boolean)
      : [];
    if (!kind) throw new TypeError(`evidence ${index} requires kind`);
    if (refs.length === 0) throw new TypeError(`evidence ${kind} requires refs`);
    if (refs.length > 32) throw new TypeError(`evidence ${kind} exceeds 32 refs`);
    for (const ref of refs) {
      if (PLACEHOLDER_REF.test(ref) || !/^[a-z][a-z0-9+.-]*:.+/iu.test(ref)) {
        throw new Error(`evidence ${kind} contains an invalid or placeholder ref: ${ref}`);
      }
    }
    return Object.freeze({ kind, refs: Object.freeze(refs) });
  }));
}

function normalizeHandoffList(handoff, key, { nonEmpty = false } = {}) {
  if (!Array.isArray(handoff[key])) throw new TypeError(`Agent handoff ${key} must be an array`);
  const values = handoff[key].map((item, index) => {
    if (typeof item !== 'string' || !item.trim()) {
      throw new TypeError(`Agent handoff ${key}[${index}] must be a non-empty string`);
    }
    return item.trim();
  });
  if (nonEmpty && values.length === 0) throw new TypeError(`Agent handoff ${key} must not be empty`);
  return Object.freeze(values);
}

/**
 * Agent Provider 使用自己的 JSON Handoff 协议；这里严格校验身份和状态，
 * 不从普通说明文字中猜测结构化结果。
 */
export function parseAgentProviderHandoff(output, { command } = {}) {
  if (command?.provider?.kind !== 'agent') {
    throw new TypeError('Agent handoff requires an Agent Provider Command');
  }

  const raw = String(output || '').trim();
  let handoff;
  try {
    handoff = JSON.parse(raw);
  } catch {
    throw new Error('Agent Provider output must be a single JSON object');
  }
  if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) {
    throw new TypeError('Agent Provider output must be a single JSON object');
  }
  for (const key of Object.keys(handoff)) {
    if (!AGENT_HANDOFF_FIELDS.includes(key)) throw new Error(`Agent handoff has unknown field: ${key}`);
  }
  for (const key of AGENT_HANDOFF_FIELDS) {
    if (!Object.hasOwn(handoff, key)) throw new Error(`Agent handoff requires ${key}`);
  }
  if (handoff.schemaVersion !== 1) {
    throw new Error(`unsupported Agent handoff schemaVersion: ${handoff.schemaVersion}`);
  }

  const agentId = String(handoff.agentId || '').trim();
  const role = String(handoff.role || '').trim();
  const status = String(handoff.status || '').trim();
  if (agentId !== command.provider.id) {
    throw new Error(`Agent handoff agentId mismatch: expected ${command.provider.id}, received ${agentId || '(empty)'}`);
  }
  if (role !== command.provider.role) {
    throw new Error(`Agent handoff role mismatch: expected ${command.provider.role}, received ${role || '(empty)'}`);
  }
  if (!AGENT_HANDOFF_STATUSES.has(status)) {
    throw new Error(`unsupported Agent handoff status: ${status || '(empty)'}`);
  }

  const normalized = Object.freeze({
    schemaVersion: 1,
    agentId,
    role,
    status,
    findings: normalizeHandoffList(handoff, 'findings', { nonEmpty: status === 'pass' }),
    blockers: normalizeHandoffList(handoff, 'blockers'),
    evidenceRefs: normalizeHandoffList(handoff, 'evidenceRefs', { nonEmpty: true }),
    filesReviewed: normalizeHandoffList(handoff, 'filesReviewed', { nonEmpty: status === 'pass' }),
    recommendedNextSteps: normalizeHandoffList(handoff, 'recommendedNextSteps'),
  });
  if (status === 'pass' && normalized.blockers.length > 0) {
    throw new Error('Agent pass handoff cannot contain blockers');
  }
  if (status !== 'pass' && normalized.blockers.length === 0) {
    throw new Error(`Agent ${status} handoff requires at least one blocker`);
  }
  if (normalized.evidenceRefs.some((ref) => PLACEHOLDER_REF.test(ref))) {
    throw new Error('Agent handoff contains a placeholder evidence ref');
  }
  return normalized;
}

/**
 * 只解析 Provider 最终输出中的单行 Evidence Envelope。
 * 普通自然语言不会被猜测成证据，多条 Envelope 也会被拒绝，避免推进错状态。
 */
export function parseCapabilityEvidenceEnvelope(output, { activationId = '' } = {}) {
  const lines = String(output || '')
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(REX_EVIDENCE_PREFIX));
  if (lines.length === 0) return null;
  if (lines.length > 1) throw new Error('provider output contains multiple rex evidence envelopes');

  const payloadText = lines[0].slice(REX_EVIDENCE_PREFIX.length).trim();
  if (!payloadText) throw new Error('rex evidence envelope payload is empty');
  if (payloadText.length > 65_536) throw new Error('rex evidence envelope payload is too large');

  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch (error) {
    throw new Error(`invalid rex evidence envelope JSON: ${error.message}`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('rex evidence envelope must be an object');
  }
  if (payload.schemaVersion !== 1) {
    throw new Error(`unsupported rex evidence schemaVersion: ${payload.schemaVersion}`);
  }

  const envelopeActivationId = String(payload.activationId || '').trim();
  if (!envelopeActivationId) throw new TypeError('rex evidence envelope requires activationId');
  const expectedActivationId = String(activationId || '').trim();
  if (expectedActivationId && envelopeActivationId !== expectedActivationId) {
    throw new Error(`rex evidence activationId mismatch: expected ${expectedActivationId}, received ${envelopeActivationId}`);
  }

  return Object.freeze({
    schemaVersion: 1,
    activationId: envelopeActivationId,
    evidence: normalizeEnvelopeEvidence(payload.evidence),
  });
}

function syncEvidenceToMatchingPlan({ rootDir, workItemKey, activationId, evidence }) {
  const plan = readActivePlan(rootDir);
  if (!plan || plan.relativePath !== workItemKey) {
    return Object.freeze({ matched: false, recorded: Object.freeze([]) });
  }

  const existing = new Set((plan.evidence || []).map((item) => String(item.value || '')));
  const recorded = [];
  for (const item of evidence) {
    const value = `rex:${activationId}:${item.kind} -> ${item.refs.join(', ')}`;
    if (existing.has(value)) continue;
    addPlanEvidence(rootDir, { kind: 'note', value });
    existing.add(value);
    recorded.push(value);
  }
  return Object.freeze({ matched: true, recorded: Object.freeze(recorded) });
}

/** 已校验 Command 的内部推进边界；Agent 只能从原生 Handoff 适配后进入。 */
function recordValidatedCapabilityEvidence({
  rootDir,
  command,
  evidence = [],
  allowAgent = false,
  now = new Date(),
} = {}) {
  const current = assertStoredProviderCommand({ rootDir, command });
  if (command.provider?.kind === 'agent' && !allowAgent) {
    throw new Error('Agent Provider evidence requires a validated native Handoff');
  }
  // standalone 与 AIOS 共用 rex 公共校验器，避免证据类型、引用协议和占位符规则漂移。
  const normalizedEvidence = validateCommandEvidence(command, evidence);

  const advanced = advanceStoredAiosCapabilityActivation({
    rootDir,
    activationId: command.activationId,
    evidence: normalizedEvidence,
    now,
  });
  const planEvidence = syncEvidenceToMatchingPlan({
    rootDir,
    workItemKey: current.workItemKey,
    activationId: command.activationId,
    evidence: normalizedEvidence,
  });

  return Object.freeze({
    schemaVersion: 1,
    kind: 'aios.rex-capability-result.v1',
    activationId: command.activationId,
    outcome: advanced.outcome,
    activation: advanced.activation,
    missingEvidence: advanced.missingEvidence,
    command: advanced.command,
    nextCapability: advanced.nextCapability,
    planEvidence,
  });
}

/**
 * CLI/MCP 的受限手工证据入口。调用者必须持有当前 Command token，且 Agent 证据禁止从这里提交。
 */
export function recordAiosCapabilityEvidence({
  rootDir,
  activationId,
  commandToken,
  evidence = [],
  now = new Date(),
} = {}) {
  const current = readStoredAiosCapabilityActivation({ rootDir, activationId });
  if (!current) throw new Error(`rex activation not found: ${activationId}`);
  const expectedToken = String(current.command?.executionToken || '');
  if (!expectedToken || String(commandToken || '') !== expectedToken) {
    throw new Error('rex capability evidence requires the current Command token');
  }
  return recordValidatedCapabilityEvidence({
    rootDir,
    command: current.command,
    evidence,
    now,
  });
}

/** Runner 入口：没有结构化 Envelope 时返回未摄取，绝不根据自然语言伪造证据。 */
export function ingestCapabilityEvidenceOutput({ rootDir, command, output, now = new Date() } = {}) {
  assertStoredProviderCommand({ rootDir, command });
  const envelope = parseCapabilityEvidenceEnvelope(output, { activationId: command?.activationId });
  if (!envelope) {
    return Object.freeze({ ingested: false, reason: 'missing-envelope', envelope: null, result: null });
  }
  const result = recordValidatedCapabilityEvidence({
    rootDir,
    command,
    evidence: envelope.evidence,
    now,
  });
  return Object.freeze({ ingested: true, reason: '', envelope, result });
}

function normalizeActivationId(activationId) {
  const value = String(activationId || '').trim();
  if (!/^[a-zA-Z0-9._-]+$/u.test(value)) throw new Error(`invalid activationId: ${value || '(empty)'}`);
  return value;
}

function assertStoredProviderCommand({ rootDir, command, providerKind = '' }) {
  const current = readStoredAiosCapabilityActivation({ rootDir, activationId: command?.activationId });
  const storedCommand = current?.command;
  const kindMatches = !providerKind || storedCommand?.provider?.kind === providerKind;
  // Runner 只接受持久化状态机当前发出的完整 Command，不能让旧阶段或篡改字段回写证据。
  if (!storedCommand || !kindMatches || !isDeepStrictEqual(storedCommand, command)) {
    throw new Error('Provider command does not match stored activation command');
  }
  return current;
}

function writeAgentHandoffArtifact({ rootDir, command, handoff, now }) {
  const activationId = normalizeActivationId(command.activationId);
  const target = path.join(rootDir, '.aios', 'evidence', 'agent-providers', `${activationId}.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const record = Object.freeze({
    schemaVersion: 1,
    kind: 'aios.rex-agent-handoff.v1',
    activationId,
    capabilityId: command.capabilityId,
    stageId: command.stageId,
    provider: command.provider,
    handoff,
    recordedAt: now.toISOString(),
  });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, target);
  return Object.freeze({
    record,
    path: target,
    ref: `artifact:${path.relative(rootDir, target).split(path.sep).join('/')}`,
  });
}

function evidenceFromAgentHandoff(handoff, artifactRef) {
  const refs = Object.freeze([...new Set([artifactRef, ...handoff.evidenceRefs])]);
  const evidence = [Object.freeze({ kind: 'specialist-scope-recorded', refs })];
  // 非 pass 结果仍被落盘，但不能关闭 verdict 门禁，避免失败审查被当成放行证据。
  if (handoff.status === 'pass') {
    evidence.push(Object.freeze({ kind: 'specialist-verdict-recorded', refs }));
  }
  return Object.freeze(evidence);
}

export function ingestAgentProviderHandoffOutput({
  rootDir,
  command,
  output,
  now = new Date(),
} = {}) {
  assertStoredProviderCommand({ rootDir, command, providerKind: 'agent' });

  const handoff = parseAgentProviderHandoff(output, { command });
  const artifact = writeAgentHandoffArtifact({ rootDir, command, handoff, now });
  const evidence = evidenceFromAgentHandoff(handoff, artifact.ref);
  const result = recordValidatedCapabilityEvidence({
    rootDir,
    command,
    evidence,
    allowAgent: true,
    now,
  });
  return Object.freeze({
    ingested: true,
    kind: 'agent-handoff',
    reason: handoff.status === 'pass' ? '' : `agent-status-${handoff.status}`,
    handoff,
    artifact,
    evidence,
    result,
  });
}

/** 根据 Provider kind 分流输出协议，避免 Agent 同时承担 Evidence Envelope。 */
export function ingestCapabilityProviderOutput({ rootDir, command, output, now = new Date() } = {}) {
  if (command?.provider?.kind === 'agent') {
    return ingestAgentProviderHandoffOutput({ rootDir, command, output, now });
  }
  assertStoredProviderCommand({ rootDir, command });
  const ingestion = ingestCapabilityEvidenceOutput({
    rootDir,
    command,
    output,
    now,
  });
  return Object.freeze({ kind: 'evidence-envelope', ...ingestion });
}
