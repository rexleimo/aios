// scripts/lib/clients/capability-report/evidence.mjs — 客户端证据验证辅助函数
// 从 capability-report.mjs 拆分出的独立模块

import { constants as fsConstants, promises as fs } from 'node:fs';
import path from 'node:path';

import { CLIENT_DEFINITIONS } from '../registry.mjs';

const PENDING_SMOKE_CLIENTS = new Set([]);
const SUPPORTED_CANDIDATES = new Set(['codex', 'claude', 'opencode']);
const REQUIRED_CLIENT_EVIDENCE = Object.freeze(['smoke', 'metrics', 'provenance']);

const VERIFIED_ALLOWED = Object.freeze({
  staticProjectionAllowed: true,
  liveExecutionAllowed: true,
  skillTrainingAllowed: true,
  qualityGateRunnerAllowed: true,
  harnessLiveAllowed: true,
});

const STATIC_ONLY_ALLOWED = Object.freeze({
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

export { PENDING_SMOKE_CLIENTS, SUPPORTED_CANDIDATES, REQUIRED_CLIENT_EVIDENCE, VERIFIED_ALLOWED, STATIC_ONLY_ALLOWED, REQUIRED_TURN_COMPRESSION, COMPRESSION_METRIC };

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

export { readHostCapabilities };

function statusForClient(clientId) {
  if (PENDING_SMOKE_CLIENTS.has(clientId)) return 'pending-smoke';
  if (CLIENT_DEFINITIONS[clientId]?.deprecated) return 'compatibility';
  if (SUPPORTED_CANDIDATES.has(clientId)) return 'supported-candidate';
  return 'compatibility';
}

export { statusForClient };

async function regularFileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return false;
    throw error;
  }
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return null;
    return null;
  }
}

async function findLatestMatchingFile(dirPath, predicate) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(entries
      .filter((entry) => entry.isFile() && predicate(entry.name))
      .map(async (entry) => {
        const filePath = path.join(dirPath, entry.name);
        const stat = await fs.stat(filePath);
        return { filePath, mtimeMs: stat.mtimeMs };
      }));
    files.sort((left, right) => right.mtimeMs - left.mtimeMs);
    return files[0]?.filePath || '';
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return '';
    throw error;
  }
}

async function findLatestValidMatchingFile(dirPath, predicate, validator) {
  const candidates = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !predicate(entry.name)) continue;
      const filePath = path.join(dirPath, entry.name);
      const stat = await fs.stat(filePath);
      candidates.push({ filePath, mtimeMs: stat.mtimeMs });
    }
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return '';
    throw error;
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  for (const candidate of candidates) {
    if (await validator(candidate.filePath)) return candidate.filePath;
  }
  return '';
}

async function isPassingSmokeFile(filePath, clientId) {
  const parsed = await readJsonFile(filePath);
  const evidenceClient = parsed?.client || parsed?.clientId;
  return evidenceClient === clientId && parsed?.status === 'pass';
}

async function isValidProvenanceFile(filePath, clientId) {
  const parsed = await readJsonFile(filePath);
  const evidenceClient = parsed?.clientId || parsed?.client;
  return evidenceClient === clientId && ['verified', 'pass'].includes(parsed?.status);
}

async function hasBidirectionalMetrics(filePath, clientId) {
  let raw = '';
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return false;
    throw error;
  }
  const seen = new Set();
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (
      parsed.client_id === clientId
      && parsed.uncontrolled !== true
      && parsed.policy_violation !== true
      && Number(parsed.saved_bytes || 0) > 0
      && ['pre_send', 'post_receive'].includes(parsed.event_kind)
    ) {
      seen.add(parsed.event_kind);
    }
  }
  return seen.has('pre_send') && seen.has('post_receive');
}

async function readClientVerification(clientId, { rootDir, evidenceRoot }) {
  const roots = [...new Set([evidenceRoot || rootDir].filter(Boolean).map((item) => path.resolve(item)))];
  const refs = {};

  for (const root of roots) {
    if (!refs.smoke) {
      const smokePath = await findLatestValidMatchingFile(
        path.join(root, '.aios', 'clients', 'smoke'),
        (name) => name.startsWith(`${clientId}-`) && name.endsWith('.json'),
        (filePath) => isPassingSmokeFile(filePath, clientId)
      );
      if (smokePath) refs.smoke = path.relative(rootDir, smokePath);
    }

    if (!refs.metrics) {
      const metricsPath = await findLatestValidMatchingFile(
        path.join(root, '.aios', 'interception', 'metrics'),
        (name) => name.endsWith('.jsonl'),
        (filePath) => hasBidirectionalMetrics(filePath, clientId)
      );
      if (metricsPath) refs.metrics = path.relative(rootDir, metricsPath);
    }

    if (!refs.provenance) {
      const provenancePath = path.join(root, '.aios', 'clients', 'provenance', `${clientId}.json`);
      if (await regularFileExists(provenancePath) && await isValidProvenanceFile(provenancePath, clientId)) {
        refs.provenance = path.relative(rootDir, provenancePath);
      }
    }
  }

  const missing = REQUIRED_CLIENT_EVIDENCE.filter((kind) => !refs[kind]);
  return {
    status: missing.length === 0 ? 'verified' : 'blocked',
    required: [...REQUIRED_CLIENT_EVIDENCE],
    refs,
    missing,
  };
}

export { readClientVerification };

function reasonsForClient(clientId, {
  hostCapabilities,
  verification,
  agentCatalogueReport,
  workflowRecipeReport,
}) {
  const reasons = [];
  const hostEntry = hostCapabilities?.clients?.[clientId];
  const status = statusForClient(clientId);
  if (status === 'pending-smoke') {
    reasons.push('live execution is blocked until one-shot runner, CLI arguments, MCP config, and smoke evidence are verified');
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
  if (verification?.status !== 'verified') {
    reasons.push(`live gates blocked until local evidence exists: ${verification?.missing?.join(', ') || 'unknown'}`);
  }
  if (agentCatalogueReport?.strict?.blocked) {
    reasons.push(`live gates blocked until agent catalogue evidence is complete: ${agentCatalogueReport.strict.blockedAgentIds.length} agents blocked`);
  }
  const blockedWorkflowIds = workflowRecipeReport?.summary?.blockedWorkflowIds || [];
  if (blockedWorkflowIds.length > 0) {
    reasons.push(`live gates blocked until workflow recipes are evidence-ready: ${blockedWorkflowIds.join(', ')}`);
  }
  return reasons;
}

export { reasonsForClient };

function gatesForStatus(status, verification, readiness) {
  if (status === 'pending-smoke' || status === 'compatibility') return STATIC_ONLY_ALLOWED;
  return verification?.status === 'verified' && readiness?.agentsReady && readiness?.workflowsReady
    ? VERIFIED_ALLOWED
    : STATIC_ONLY_ALLOWED;
}

export { gatesForStatus };
