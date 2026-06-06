import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  ALL_CLIENTS,
  CLIENT_DEFINITIONS,
  getClientMcpTarget,
  getClientRuntimeId,
} from './registry.mjs';

const PENDING_SMOKE_CLIENTS = new Set(['antigravity', 'crush']);
const SUPPORTED_CANDIDATES = new Set(['codex', 'claude', 'opencode']);

const LIVE_ALLOWED = Object.freeze({
  staticProjectionAllowed: true,
  liveExecutionAllowed: true,
  skillTrainingAllowed: true,
  qualityGateRunnerAllowed: true,
  harnessLiveAllowed: true,
});

const PENDING_ALLOWED = Object.freeze({
  staticProjectionAllowed: true,
  liveExecutionAllowed: false,
  skillTrainingAllowed: false,
  qualityGateRunnerAllowed: false,
  harnessLiveAllowed: false,
});

const REQUIRED_TURN_COMPRESSION = Object.freeze({
  preSendRequired: true,
  postReceiveRequired: true,
  mode: 'tight',
  uncontrolledHostOutput: 'policy-violation',
});

const COMPRESSION_METRIC = 'bidirectional-turn-compression';

async function readHostCapabilities(rootDir) {
  const filePath = path.join(rootDir, 'config', 'host-capabilities.json');
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/u, ''));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { clients: {}, missing: true };
    }
    throw error;
  }
}

function statusForClient(clientId) {
  if (PENDING_SMOKE_CLIENTS.has(clientId)) return 'pending-smoke';
  if (CLIENT_DEFINITIONS[clientId]?.deprecated) return 'compatibility';
  if (SUPPORTED_CANDIDATES.has(clientId)) return 'supported-candidate';
  return 'compatibility';
}

function reasonsForClient(clientId, { hostCapabilities }) {
  const reasons = [];
  const hostEntry = hostCapabilities?.clients?.[clientId];
  const status = statusForClient(clientId);
  if (status === 'pending-smoke') {
    reasons.push('live execution is blocked until one-shot runner, CLI arguments, MCP config, and smoke evidence are verified');
  }
  if (clientId === 'antigravity') {
    reasons.push('Antigravity currently inherits Gemini paths and must remain pending-smoke until install verification');
  }
  if (clientId === 'crush') {
    reasons.push('Crush has static projections, but live one-shot and unattended arguments need smoke verification');
  }
  if (!hostEntry) {
    reasons.push('host-capabilities entry is missing; treating advanced interception as unverified');
  }
  if (hostEntry?.directHostBypassAllowed !== false) {
    reasons.push('direct host bypass is not compliant; launch through the AIOS-managed runner so pre_send and post_receive compression are enforced');
  }
  if (CLIENT_DEFINITIONS[clientId]?.deprecated) {
    reasons.push('client is compatibility-tier/deprecated; keep syncing but avoid new live-only features');
  }
  return reasons;
}

function gatesForStatus(status) {
  return status === 'pending-smoke' ? PENDING_ALLOWED : LIVE_ALLOWED;
}

export async function buildClientCapabilityReport({ rootDir = process.cwd(), env = process.env } = {}) {
  const hostCapabilities = await readHostCapabilities(rootDir);
  const clients = ALL_CLIENTS.map((clientId) => {
    const definition = CLIENT_DEFINITIONS[clientId];
    const status = statusForClient(clientId);
    const gates = gatesForStatus(status);
    const hostEntry = hostCapabilities?.clients?.[clientId] || null;
    const turnCompression = {
      ...REQUIRED_TURN_COMPRESSION,
      ...(hostEntry?.turnCompression && typeof hostEntry.turnCompression === 'object' ? hostEntry.turnCompression : {}),
    };
    return {
      clientId,
      runtimeId: getClientRuntimeId(clientId),
      commandName: definition.commandName,
      status,
      hostLevel: hostEntry?.targetLevel || 'unverified',
      capabilities: [...definition.capabilities],
      instructionFileName: definition.instructionFileName,
      projectSkillRoot: definition.projectSkillRoot,
      mcpTarget: getClientMcpTarget(clientId),
      requiredEntrypoint: hostEntry?.requiredEntrypoint || 'aios-managed-runner',
      directHostBypassAllowed: hostEntry?.directHostBypassAllowed === true,
      turnCompression,
      compressionCompliance: {
        status: 'required',
        metric: COMPRESSION_METRIC,
        requiredEntrypoint: hostEntry?.requiredEntrypoint || 'aios-managed-runner',
        directHostBypassAllowed: hostEntry?.directHostBypassAllowed === true,
        preSendMetricRequired: turnCompression.preSendRequired === true,
        postReceiveMetricRequired: turnCompression.postReceiveRequired === true,
        uncontrolledHostOutputPolicy: turnCompression.uncontrolledHostOutput,
      },
      ...gates,
      reasons: reasonsForClient(clientId, { hostCapabilities, env }),
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    policy: 'strict-verification-first',
    clients,
  };
}
