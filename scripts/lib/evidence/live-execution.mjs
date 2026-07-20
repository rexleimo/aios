const IDENTIFIER = /^[A-Za-z0-9._-]+$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MANAGED_RUNNER = 'aios.harness.one-shot.v1';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function matchesIdentifier(value) {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

function matchesSha256(value) {
  return typeof value === 'string' && SHA256.test(value);
}

function matchesIdentity(value, { clientId, agentId, sessionId }) {
  return isObject(value)
    && value.clientId === clientId
    && (agentId ? value.agentId === agentId : !value.agentId)
    && value.sessionId === sessionId;
}

function validExecution(execution, identity) {
  return matchesIdentity(execution, identity)
    && execution.runner === MANAGED_RUNNER
    && matchesIdentifier(execution.receiptId)
    && isObject(execution.invocation)
    && typeof execution.invocation.command === 'string'
    && execution.invocation.command.length > 0
    && matchesSha256(execution.invocation.argsSha256)
    && typeof execution.invocation.cwd === 'string'
    && execution.invocation.cwd.length > 0
    && execution.exitCode === 0
    && matchesSha256(execution.stdoutSha256)
    && matchesSha256(execution.stderrSha256)
    && typeof execution.observedAt === 'string'
    && Number.isFinite(Date.parse(execution.observedAt));
}

function validSmoke(smoke, { subject, clientId, agentId }) {
  if (!isObject(smoke)) return null;
  const sessionId = smoke.sessionId;
  const identity = { clientId, agentId, sessionId };
  if (
    smoke.schemaVersion !== 2
    || smoke.kind !== `aios.${subject}-live-smoke.v2`
    || smoke.status !== 'pass'
    || !matchesIdentifier(sessionId)
    || !matchesIdentity(smoke, identity)
    || !validExecution(smoke.execution, identity)
    || !isObject(smoke.metrics)
    || smoke.metrics.sessionId !== sessionId
    || !matchesIdentifier(smoke.metrics.preSendRefId)
    || !matchesIdentifier(smoke.metrics.postReceiveRefId)
  ) {
    return null;
  }
  return identity;
}

function validProvenance(provenance, identity, receiptId) {
  return isObject(provenance)
    && provenance.schemaVersion === 2
    && provenance.kind === 'aios.live-execution-provenance.v2'
    && provenance.status === 'verified'
    && matchesIdentity(provenance, identity)
    && provenance.receiptId === receiptId;
}

function hasMetric(records, identity, eventKind, refId) {
  return records.some((record) => (
    isObject(record)
    && record.session_id === identity.sessionId
    && record.client_id === identity.clientId
    && (identity.agentId ? record.agent_id === identity.agentId : !record.agent_id)
    && record.event_kind === eventKind
    && record.ref_id === refId
    && record.uncontrolled !== true
    && record.policy_violation !== true
    && Number(record.saved_bytes || 0) > 0
    && Number(record.refs_count || 0) > 0
  ));
}

/**
 * Local evidence is not remote attestation, but it must at least be traceable
 * to one managed invocation. Static v1 pass files are deliberately rejected.
 */
export function validateManagedLiveEvidence({
  subject,
  clientId,
  agentId = '',
  smoke,
  provenance,
  metricsRecords = [],
} = {}) {
  if (!['agent', 'client'].includes(subject)) return { valid: false, reason: 'invalid-subject' };
  if (!matchesIdentifier(clientId) || (agentId && !matchesIdentifier(agentId))) {
    return { valid: false, reason: 'invalid-identity' };
  }

  const identity = validSmoke(smoke, { subject, clientId, agentId });
  if (!identity) return { valid: false, reason: 'invalid-smoke' };
  if (!validProvenance(provenance, identity, smoke.execution.receiptId)) {
    return { valid: false, reason: 'invalid-provenance' };
  }
  if (!Array.isArray(metricsRecords)
    || !hasMetric(metricsRecords, identity, 'pre_send', smoke.metrics.preSendRefId)
    || !hasMetric(metricsRecords, identity, 'post_receive', smoke.metrics.postReceiveRefId)) {
    return { valid: false, reason: 'invalid-metrics' };
  }
  return { valid: true, reason: '', identity };
}

export { MANAGED_RUNNER };
