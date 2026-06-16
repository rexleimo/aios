/* 中文注释：Agent turn gateway 在 AIOS 托管边界同时压缩“发给模型”和“收到模型”的大文本。 */
import { createInterceptionEngine } from '../core/engine.mjs';
import { INTERCEPTION_PACKET_TYPE } from '../core/types.mjs';
import { buildCapabilityMatrix, CLIENT_ORDER } from '../clients/capabilities.mjs';
import { estimateTokensFromBytes } from '../metrics/token-estimator.mjs';
import { writeMetricsRecord } from '../metrics/metrics-sink.mjs';
import { ALL_CLIENTS } from '../../clients/core/definitions.mjs';

export const TURN_COMPRESSION_CLIENT_IDS = Object.freeze(unique([
  ...CLIENT_ORDER,
  ...ALL_CLIENTS,
]));

export async function compressPreSendTurn(options = {}) {
  return compressTurn({
    ...options,
    eventKind: 'pre_send',
    text: options.prompt ?? options.input ?? options.text ?? '',
  });
}

export async function compressPostReceiveTurn(options = {}) {
  return compressTurn({
    ...options,
    eventKind: 'post_receive',
    text: options.output ?? options.response ?? options.text ?? '',
  });
}

export async function compressTurn(options = {}) {
  const eventKind = normalizeEventKind(options.eventKind);
  const clientId = normalizeClientId(options.clientId);
  const workspaceRoot = options.workspaceRoot || options.cwd || process.cwd();
  const sessionId = String(options.sessionId || 'default');
  const engine = createInterceptionEngine({
    workspaceRoot,
    now: options.now,
    thresholds: options.thresholds ?? (eventKind === 'pre_send' ? { maxKeyLines: 24 } : undefined),
    metrics: options.metrics ?? { enabled: true },
  });

  return engine.interceptToolResult({
    kind: `agent.${eventKind}`,
    host: clientId,
    sessionId,
    cwd: options.cwd || workspaceRoot,
    payload: {
      stdout: String(options.text ?? ''),
      stderr: '',
      exitCode: 0,
      command: options.command || `agent.${eventKind}`,
      toolName: options.toolName || 'aios-turn-gateway',
    },
    capabilities: {
      targetLevel: options.hostLevel || '',
      effectiveLevel: options.hostLevel || '',
    },
    metadata: {
      eventKind,
      clientId,
      agentId: normalizeAgentId(options.agentId),
      hostLevel: options.hostLevel || '',
      mode: options.mode || 'tight',
      uncontrolled: false,
    },
  });
}

export async function runTurnCompressionMatrixProof(options = {}) {
  const workspaceRoot = options.workspaceRoot || options.cwd || process.cwd();
  const rootDir = options.rootDir || process.cwd();
  const sessionId = String(options.sessionId || options.session || `turn-compression-${Date.now()}`);
  const capabilities = buildCapabilityMatrix(rootDir, { clients: TURN_COMPRESSION_CLIENT_IDS });
  const clients = [];

  for (const capability of capabilities) {
    const clientId = capability.client;
    const common = {
      workspaceRoot,
      cwd: options.cwd || workspaceRoot,
      sessionId,
      clientId,
      hostLevel: capability.targetLevel,
      mode: capability.turnCompression?.mode || options.mode || 'tight',
      now: options.now,
      thresholds: options.thresholds ?? { minRawBytes: 64 },
      metrics: options.metrics ?? { enabled: true },
    };
    const preSendPacket = await compressPreSendTurn({
      ...common,
      prompt: buildProofText({ clientId, eventKind: 'pre_send', sessionId }),
    });
    const postReceivePacket = await compressPostReceiveTurn({
      ...common,
      output: buildProofText({ clientId, eventKind: 'post_receive', sessionId }),
    });

    clients.push({
      client_id: clientId,
      host_level: capability.targetLevel,
      required_entrypoint: capability.requiredEntrypoint,
      direct_host_bypass_allowed: capability.directHostBypassAllowed,
      compliance_status: capability.directHostBypassAllowed === false
        && capability.turnCompression?.preSendRequired === true
        && capability.turnCompression?.postReceiveRequired === true
        ? 'compliant'
        : 'non_compliant',
      pre_send: summarizeProofPacket(preSendPacket, 'pre_send'),
      post_receive: summarizeProofPacket(postReceivePacket, 'post_receive'),
    });
  }

  return {
    ok: clients.every((client) => (
      client.compliance_status === 'compliant'
      && client.pre_send.saved_bytes > 0
      && client.pre_send.saving_ratio > 0.5
      && client.post_receive.saved_bytes > 0
      && client.post_receive.saving_ratio > 0.5
      && client.pre_send.raw_sentinel_leaked === false
      && client.post_receive.raw_sentinel_leaked === false
    )),
    session_id: sessionId,
    clients,
  };
}

export async function recordUncontrolledTurn(options = {}) {
  const clientId = normalizeClientId(options.clientId);
  const workspaceRoot = options.workspaceRoot || options.cwd || process.cwd();
  const sessionId = String(options.sessionId || 'default');
  const rawBytes = Math.max(0, Number.parseInt(String(options.rawBytes ?? 0), 10) || 0);
  const tokenEstimate = estimateTokensFromBytes(rawBytes);
  const now = options.now ?? (() => new Date());
  const packet = {
    type: INTERCEPTION_PACKET_TYPE,
    version: 1,
    source: 'agent',
    host: clientId,
    sessionId,
    event_kind: 'uncontrolled_host_output',
    client_id: clientId,
    host_level: options.hostLevel || '',
    mode: options.mode || 'uncontrolled',
    fallback_reason: options.fallbackReason || 'host output is outside an AIOS-controlled turn boundary',
    uncontrolled: true,
    policy_violation: true,
    compliance_status: 'non_compliant',
    summary: 'uncontrolled host output; no token savings claimed',
    key_lines: [],
    errors: [],
    refs: [],
    metrics: {
      raw_bytes: rawBytes,
      compact_bytes: rawBytes,
      saved_bytes: 0,
      saving_ratio: 0,
      raw_tokens_estimate: tokenEstimate,
      compact_tokens_estimate: tokenEstimate,
      strategy: 'uncontrolled-host-output',
    },
    recall: [],
    safety: {
      redacted: false,
      requires_human: false,
    },
  };

  return writeMetricsRecord({
    workspaceRoot,
    sessionId,
    packet,
    request: {
      kind: 'agent.uncontrolled_host_output',
      metadata: {
        eventKind: 'uncontrolled_host_output',
        clientId,
        hostLevel: options.hostLevel || '',
        mode: options.mode || 'uncontrolled',
        fallbackReason: packet.fallback_reason,
        uncontrolled: true,
        policyViolation: true,
        complianceStatus: 'non_compliant',
      },
    },
    now,
  });
}

export async function requireTurnCompression(options = {}) {
  const {
    workspaceRoot = options.cwd || process.cwd(),
    cwd = workspaceRoot,
    sessionId = 'default',
    clientId,
    hostLevel = '',
    mode = 'tight',
    eventKind,
    text = '',
    run,
  } = options;

  if (typeof run !== 'function') {
    throw new TypeError('requireTurnCompression requires a run function');
  }

  try {
    const packet = await run();
    if (!packet || packet.type !== INTERCEPTION_PACKET_TYPE) {
      throw new Error('compression hook did not return an AIOS compact packet');
    }
    return packet;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await recordUncontrolledTurn({
      workspaceRoot,
      cwd,
      sessionId,
      clientId,
      hostLevel,
      mode,
      rawBytes: Buffer.byteLength(String(text || ''), 'utf8'),
      fallbackReason: `missing ${eventKind} turn compression: ${reason}`,
    });
    throw new Error(`required ${eventKind} failed for ${clientId}: ${reason}`);
  }
}

export function formatTurnCompressionLog(packet) {
  if (!packet || typeof packet !== 'object') return '';
  const metrics = packet.metrics || {};
  const refId = packet.refs?.[0]?.ref_id || 'inline';
  const ratio = Number.isFinite(metrics.saving_ratio) ? metrics.saving_ratio.toFixed(4) : '0.0000';
  return [
    packet.event_kind || 'unknown',
    `client=${packet.client_id || packet.host || 'unknown'}`,
    `host=${packet.host_level || '-'}`,
    `strategy=${metrics.strategy || 'unknown'}`,
    `raw=${metrics.raw_bytes ?? 0}`,
    `compact=${metrics.compact_bytes ?? 0}`,
    `saved=${metrics.saved_bytes ?? 0}`,
    `ratio=${ratio}`,
    `ref=${refId}`,
  ].join(' ');
}

export function emitTurnCompressionLog(packet, { env = process.env, write = null } = {}) {
  if (String(env?.AIOS_INTERCEPTION_LOG ?? '1') === '0') return;
  const line = formatTurnCompressionLog(packet);
  if (!line) return;
  const logger = typeof write === 'function' ? write : (msg) => console.error(msg);
  logger(`[aios][turn-compression] ${line}`);
}

function normalizeClientId(value) {
  const clientId = String(value || '').trim();
  if (!clientId) throw new TypeError('turn compression clientId is required');
  return clientId;
}

function normalizeAgentId(value) {
  return String(value || '').trim();
}

function normalizeEventKind(value) {
  const eventKind = String(value || '').trim();
  if (!['pre_send', 'post_receive'].includes(eventKind)) {
    throw new TypeError(`unsupported turn compression event kind: ${eventKind || '<empty>'}`);
  }
  return eventKind;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildProofText({ clientId, eventKind, sessionId }) {
  const sentinel = `AIOS_TURN_${eventKind}_${clientId}_${sessionId}`.replace(/[^a-zA-Z0-9_]/g, '_');
  return [
    `AIOS turn compression proof for ${clientId} ${eventKind}.`,
    'Preserve actionable path scripts/lib/interception/turn/turn-gateway.mjs:1',
    sentinel.repeat(120),
    `Next: verify ${eventKind} compact packet metrics for ${clientId}.`,
  ].join('\n');
}

function summarizeProofPacket(packet, eventKind) {
  return {
    event_kind: eventKind,
    client_id: packet.client_id,
    host_level: packet.host_level,
    ref_id: packet.refs?.[0]?.ref_id || '',
    raw_bytes: packet.metrics.raw_bytes,
    compact_bytes: packet.metrics.compact_bytes,
    saved_bytes: packet.metrics.saved_bytes,
    saving_ratio: packet.metrics.saving_ratio,
    raw_tokens_estimate: packet.metrics.raw_tokens_estimate,
    compact_tokens_estimate: packet.metrics.compact_tokens_estimate,
    raw_sentinel_leaked: JSON.stringify(packet).includes('AIOS_TURN_'),
  };
}
