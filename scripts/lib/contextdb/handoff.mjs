import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveContextDbRoot } from '../aios/state-root.mjs';
import {
  resolveClientCommandNames,
  resolveClientRuntimeIds,
} from '../clients/registry.mjs';

const VALID_AGENT_TYPES = [
  ...new Set([
    ...resolveClientRuntimeIds('all'),
    ...resolveClientCommandNames('all'),
  ]),
];

const VALID_ROLES = ['planner', 'implementer', 'reviewer', 'orchestrator'];
const VALID_CONFIDENCE = ['high', 'medium', 'low'];

import { normalizeText } from '../../../src/shared/normalize.mjs';

function normalizeStringArray(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split('|')
      : [];
  return Array.from(new Set(raw
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)));
}

function sessionDir(workspaceRoot, sessionId) {
  return path.join(
    resolveContextDbRoot(path.resolve(workspaceRoot || process.cwd()), { preferLegacyExisting: true }),
    'sessions',
    normalizeText(sessionId)
  );
}

async function writeAtomicFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp.${process.pid}.${crypto.randomUUID().slice(0, 8)}`
  );
  await fs.writeFile(tmpPath, content, 'utf8');
  try {
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

export function normalizeHandoffPacket(input = {}) {
  // Handle both input formats: raw (fromSessionId) and normalized (fromAgent.sessionId)
  let fromSessionId = normalizeText(input.fromSessionId);
  let agentType = normalizeText(input.agentType);
  let role = normalizeText(input.role);

  if (!fromSessionId && input.fromAgent) {
    fromSessionId = normalizeText(input.fromAgent.sessionId);
    agentType = normalizeText(input.fromAgent.agentType);
    role = normalizeText(input.fromAgent.role);
  }

  if (!fromSessionId) {
    throw new Error('handoff packet requires fromSessionId');
  }

  if (!VALID_AGENT_TYPES.includes(agentType)) {
    throw new Error(`invalid agentType: ${agentType}`);
  }

  if (!VALID_ROLES.includes(role)) {
    throw new Error(`invalid role: ${role}`);
  }

  const confidence = normalizeText(input.confidence, 'medium');
  if (!VALID_CONFIDENCE.includes(confidence)) {
    throw new Error(`invalid confidence: ${confidence}`);
  }

  const baseRevision = normalizeText(input.baseRevision, '');
  const contextRevision = normalizeText(input.contextRevision, '');
  const packetRef = normalizeText(input.packetRef, '');
  const receiptRef = normalizeText(input.receiptRef, '');
  const verificationRefs = normalizeStringArray(input.verificationRefs);
  const hasLineage = Number(input.schemaVersion) >= 3
    || Boolean(baseRevision || contextRevision || packetRef || receiptRef || verificationRefs.length > 0);
  const packet = {
    schemaVersion: hasLineage ? 3 : 2,
    fromAgent: {
      sessionId: fromSessionId,
      agentType,
      role,
    },
    intent: normalizeText(input.intent, ''),
    progress: normalizeText(input.progress, ''),
    nextActions: normalizeStringArray(input.nextActions),
    blockers: normalizeStringArray(input.blockers),
    touchedFiles: normalizeStringArray(input.touchedFiles),
    workspaceChanges: Array.isArray(input.workspaceChanges)
      ? input.workspaceChanges.map((change) => ({
          file: normalizeText(change.file),
          operation: normalizeText(change.operation),
          summary: normalizeText(change.summary),
        }))
      : [],
    pendingWrites: normalizeStringArray(input.pendingWrites),
    confidence,
    assumptions: normalizeStringArray(input.assumptions),
    updatedAt: normalizeText(input.updatedAt, new Date().toISOString()),
  };
  if (!hasLineage) return packet;
  return {
    ...packet,
    baseRevision,
    contextRevision,
    packetRef,
    receiptRef,
    verificationRefs,
  };
}

export async function writeHandoffPacket(workspaceRoot, sessionId, packet) {
  const normalized = normalizeHandoffPacket({
    ...packet,
    fromSessionId: packet.fromSessionId || sessionId,
    agentType: packet.agentType || packet.fromAgent?.agentType || '',
    role: packet.role || packet.fromAgent?.role || '',
  });
  const dir = sessionDir(workspaceRoot, sessionId);
  const filePath = path.join(dir, 'handoff.json');
  await writeAtomicFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`);
  return { ...normalized, filePath };
}

export async function readHandoffPacket(workspaceRoot, sessionId) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) return null;
  const dir = sessionDir(workspaceRoot, normalizedSessionId);
  const filePath = path.join(dir, 'handoff.json');
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeHandoffPacket(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function evaluateHandoffLineage(packet, {
  currentBaseRevision = '',
  currentContextRevision = '',
  requiredVerificationRefs = [],
} = {}) {
  const normalized = normalizeHandoffPacket(packet);
  const reasons = [];
  if (normalized.schemaVersion < 3) reasons.push('legacy_handoff_requires_revalidation');
  if (normalized.schemaVersion >= 3 && !normalized.contextRevision) reasons.push('missing_context_revision');
  if (normalized.schemaVersion >= 3 && !normalized.packetRef) reasons.push('missing_packet_ref');
  if (normalized.schemaVersion >= 3 && !normalized.receiptRef) reasons.push('missing_receipt_ref');
  if (currentBaseRevision && normalized.baseRevision && currentBaseRevision !== normalized.baseRevision) {
    reasons.push('base_revision_mismatch');
  }
  if (currentContextRevision
      && normalized.contextRevision
      && currentContextRevision !== normalized.contextRevision) {
    reasons.push('context_revision_mismatch');
  }
  const verificationRefs = new Set(normalized.verificationRefs || []);
  if (normalizeStringArray(requiredVerificationRefs).some((ref) => !verificationRefs.has(ref))) {
    reasons.push('missing_verification_ref');
  }
  const decisionDigest = crypto.createHash('sha256').update(JSON.stringify({
    baseRevision: normalized.baseRevision || '',
    contextRevision: normalized.contextRevision || '',
    packetRef: normalized.packetRef || '',
    receiptRef: normalized.receiptRef || '',
    verificationRefs: normalized.verificationRefs || [],
    currentBaseRevision,
    currentContextRevision,
    requiredVerificationRefs: normalizeStringArray(requiredVerificationRefs),
    reasons,
  })).digest('hex');
  return {
    schemaVersion: 1,
    kind: 'contextdb.handoff-lineage-verdict',
    mode: 'shadow',
    revalidationRequired: reasons.length > 0,
    reasons,
    admissionChanged: false,
    decisionDigest,
  };
}

export function renderHandoffInjection(packet) {
  if (!packet) return '';

  const normalized = normalizeHandoffPacket(packet);
  const { fromAgent, intent, progress, nextActions, blockers, assumptions } = normalized;

  const nextActionsText = nextActions.length > 0
    ? nextActions.map((action) => `- ${action}`).join('\n')
    : '';

  const blockersText = blockers.length > 0
    ? blockers.map((blocker) => `- ${blocker}`).join('\n')
    : '';

  const assumptionsText = assumptions.length > 0
    ? assumptions.map((assumption) => `- ${assumption}`).join('\n')
    : '';

  const parts = [
    `## Handoff from ${fromAgent.sessionId}`,
    '',
    `- **Role:** ${fromAgent.role} (${fromAgent.agentType})`,
    `- **Confidence:** ${normalized.confidence}`,
    `- **Intent:** ${intent}`,
    '',
    '### Progress',
    progress,
    '',
    '### Next Actions',
    nextActionsText,
  ];

  if (normalized.schemaVersion >= 3) {
    const lineage = [
      normalized.baseRevision ? `- **Base Revision:** ${normalized.baseRevision}` : '',
      normalized.contextRevision ? `- **Context Revision:** ${normalized.contextRevision}` : '',
      normalized.packetRef ? `- **Packet:** ${normalized.packetRef}` : '',
      normalized.receiptRef ? `- **Receipt:** ${normalized.receiptRef}` : '',
    ].filter(Boolean);
    parts.splice(5, 0, ...lineage);
  }

  if (blockersText) {
    parts.push('', '### Blockers', blockersText);
  }

  if (assumptionsText) {
    parts.push('', '### Assumptions to Verify', assumptionsText);
  }

  parts.push('');
  return parts.join('\n');
}
