const PRODUCER_TYPES = new Set(['agent', 'human', 'runtime', 'tool', 'manual']);
const ROLES = new Set(['assistant', 'user', 'system', 'tool']);
const CLAIM_STATUSES = new Set(['candidate', 'verified', 'observed', 'legacy_unknown']);

function text(value) {
  return String(value || '').trim();
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter(Boolean))];
}

function normalizeRole(value, producerType) {
  const role = text(value).toLowerCase();
  if (ROLES.has(role)) return role;
  return producerType === 'agent' ? 'assistant' : producerType === 'tool' ? 'tool' : 'user';
}

function normalizeHash(value) {
  const hash = text(value).toLowerCase().replace(/^sha256:/u, '');
  return /^[a-f0-9]{64}$/u.test(hash) ? hash : '';
}

export function normalizeRuntimeIdentity(raw = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const principalId = text(raw.principalId);
  if (!principalId) return null;
  const producerType = PRODUCER_TYPES.has(text(raw.producerType).toLowerCase())
    ? text(raw.producerType).toLowerCase()
    : 'runtime';
  return {
    producerType,
    principalId,
    agentId: text(raw.agentId).toLowerCase(),
    role: normalizeRole(raw.role, producerType),
    sessionId: text(raw.sessionId),
    runId: text(raw.runId),
    activationId: text(raw.activationId),
    policyRevision: text(raw.policyRevision),
    sourceRef: text(raw.sourceRef),
    sourceHash: normalizeHash(raw.sourceHash),
    capabilities: normalizeList(raw.capabilities),
  };
}

export function buildMemoAuthority({ runtimeIdentity, scope = 'project_shared', agent = '' } = {}) {
  const identity = normalizeRuntimeIdentity(runtimeIdentity);
  if (!identity) {
    return {
      role: 'user',
      agent: text(agent).toLowerCase(),
      claimStatus: 'verified',
      provenance: {
        schemaVersion: 1,
        trust: 'local_manual',
        producerType: 'manual',
        principalId: 'local-user',
        agentId: text(agent).toLowerCase(),
        sessionId: '',
        runId: '',
        activationId: '',
        policyRevision: 'memo-manual-v1',
        sourceRef: 'manual:memo-write',
        sourceHash: '',
        capabilities: ['memo:publish-shared'],
      },
    };
  }

  const shared = String(scope || '').trim().toLowerCase().replace(/[-\s]+/gu, '_') === 'project_shared';
  const canPublishShared = identity.producerType === 'human'
    || identity.capabilities.includes('memo:publish-shared')
    || identity.capabilities.includes('memo:promote-shared');
  const claimStatus = shared && !canPublishShared ? 'candidate' : 'verified';
  return {
    role: identity.role,
    agent: identity.agentId || text(agent).toLowerCase(),
    claimStatus,
    provenance: {
      schemaVersion: 1,
      trust: 'runtime_attested',
      producerType: identity.producerType,
      principalId: identity.principalId,
      agentId: identity.agentId,
      sessionId: identity.sessionId,
      runId: identity.runId,
      activationId: identity.activationId,
      policyRevision: identity.policyRevision,
      sourceRef: identity.sourceRef,
      sourceHash: identity.sourceHash,
      capabilities: identity.capabilities,
    },
  };
}

export function normalizeStoredMemoProvenance(raw = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      schemaVersion: 1,
      trust: 'legacy_unknown',
      producerType: 'manual',
      principalId: '',
      agentId: '',
      sessionId: '',
      runId: '',
      activationId: '',
      policyRevision: '',
      sourceRef: '',
      sourceHash: '',
      capabilities: [],
    };
  }
  const trust = ['runtime_attested', 'local_manual', 'legacy_unknown'].includes(text(raw.trust))
    ? text(raw.trust)
    : 'legacy_unknown';
  const producerType = PRODUCER_TYPES.has(text(raw.producerType).toLowerCase())
    ? text(raw.producerType).toLowerCase()
    : 'manual';
  return {
    schemaVersion: 1,
    trust,
    producerType,
    principalId: text(raw.principalId),
    agentId: text(raw.agentId).toLowerCase(),
    sessionId: text(raw.sessionId),
    runId: text(raw.runId),
    activationId: text(raw.activationId),
    policyRevision: text(raw.policyRevision),
    sourceRef: text(raw.sourceRef),
    sourceHash: normalizeHash(raw.sourceHash),
    capabilities: normalizeList(raw.capabilities),
  };
}

export function normalizeClaimStatus(value, provenance) {
  const status = text(value).toLowerCase();
  if (CLAIM_STATUSES.has(status)) return status;
  if (provenance?.trust === 'legacy_unknown') return 'legacy_unknown';
  if (provenance?.trust === 'runtime_attested' && provenance?.producerType === 'agent') return 'candidate';
  return 'verified';
}
