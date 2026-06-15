import { constants as fsConstants, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ALL_CLIENTS,
  CLIENT_DEFINITIONS,
  getClientMcpTarget,
  getClientRuntimeId,
} from './registry.mjs';
import { buildAgentCatalogue } from '../agents/catalogue.mjs';
import { listWorkflowRecipes } from '../workflows/recipes.mjs';

const PENDING_SMOKE_CLIENTS = new Set(['antigravity', 'crush']);
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
const NATIVE_SHIM_MARK = 'AIOS_NATIVE_SHIM managed';

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

function gatesForStatus(status, verification, readiness) {
  if (status === 'pending-smoke' || status === 'compatibility') return STATIC_ONLY_ALLOWED;
  return verification?.status === 'verified' && readiness?.agentsReady && readiness?.workflowsReady
    ? VERIFIED_ALLOWED
    : STATIC_ONLY_ALLOWED;
}

function resolveNativeShimDir(env = process.env) {
  const explicit = String(env.AIOS_NATIVE_SHIM_DIR || '').trim();
  if (explicit && path.isAbsolute(explicit)) return explicit;
  const home = String(env.HOME || env.USERPROFILE || '').trim();
  return path.join(path.isAbsolute(home) ? home : os.homedir(), '.aios', 'bin');
}

function pathEntries(env = process.env) {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  return String(env[pathKey] || '').split(path.delimiter).filter(Boolean);
}

function samePath(left, right) {
  const a = path.resolve(String(left || ''));
  const b = path.resolve(String(right || ''));
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function pathExtEntries(env = process.env) {
  const pathExtKey = Object.keys(env).find((key) => key.toLowerCase() === 'pathext') || 'PATHEXT';
  return String(env[pathExtKey] || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (entry.startsWith('.') ? entry : `.${entry}`).toLowerCase());
}

function buildPathEnvWithoutShim(env, shimDir) {
  const next = { ...env };
  const pathKeys = Object.keys(next).filter((key) => key.toLowerCase() === 'path');
  for (const key of pathKeys.length > 0 ? pathKeys : ['PATH']) {
    const entries = String(next[key] || '').split(path.delimiter);
    next[key] = entries.filter((entry) => entry && !samePath(entry, shimDir)).join(path.delimiter);
  }
  return next;
}

async function fileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) return false;
    if (process.platform !== 'win32') {
      await fs.access(filePath, fsConstants.X_OK);
    }
    return true;
  } catch (error) {
    if (['EACCES', 'ENOENT', 'ENOTDIR'].includes(error?.code)) return false;
    throw error;
  }
}

async function findCommandInPath(commandName, env = process.env) {
  const entries = pathEntries(env);
  const names = process.platform === 'win32' && !path.extname(commandName)
    ? pathExtEntries(env).map((ext) => `${commandName}${ext}`)
    : [commandName];

  for (const entry of entries) {
    for (const name of names) {
      const candidate = path.join(entry, name);
      if (await fileExists(candidate)) return candidate;
    }
  }
  return '';
}

async function inspectNativeShim(clientId, { env = process.env } = {}) {
  const definition = CLIENT_DEFINITIONS[clientId];
  const shimDir = resolveNativeShimDir(env);
  if (!definition?.commandName) {
    return {
      required: false,
      shimDir,
      expectedPath: '',
      installed: false,
      inPath: false,
      pathPrecedence: false,
      realCommandAvailable: false,
      realCommandPath: '',
      error: `unknown client: ${clientId}`,
    };
  }
  const fileName = process.platform === 'win32' ? `${definition.commandName}.cmd` : definition.commandName;
  const shimPath = path.join(shimDir, fileName);
  const entries = pathEntries(env);
  let managed = false;
  try {
    const content = await fs.readFile(shimPath, 'utf8');
    managed = content.includes(NATIVE_SHIM_MARK);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const realCommandPath = await findCommandInPath(definition.commandName, buildPathEnvWithoutShim(env, shimDir));
  return {
    required: false,
    shimDir,
    expectedPath: shimPath,
    installed: managed,
    inPath: entries.some((entry) => samePath(entry, shimDir)),
    pathPrecedence: entries.length > 0 && samePath(entries[0], shimDir),
    realCommandAvailable: Boolean(realCommandPath),
    realCommandPath,
  };
}

export async function buildClientCapabilityReport({
  rootDir = process.cwd(),
  evidenceRoot = rootDir,
  env = process.env,
  nativeStrict = false,
} = {}) {
  const hostCapabilities = await readHostCapabilities(rootDir);
  const agentCatalogueReport = await buildAgentCatalogue({ rootDir, evidenceRoot });
  const workflowRecipeReport = await listWorkflowRecipes({ rootDir, evidenceRoot });
  const readiness = {
    agentsReady: agentCatalogueReport.strict.blocked === false,
    workflowsReady: workflowRecipeReport.summary.blockedWorkflowIds.length === 0,
  };
  const clients = await Promise.all(ALL_CLIENTS.map(async (clientId) => {
    const definition = CLIENT_DEFINITIONS[clientId];
    const status = statusForClient(clientId);
    const verification = await readClientVerification(clientId, { rootDir, evidenceRoot });
    const gates = gatesForStatus(status, verification, readiness);
    const hostEntry = hostCapabilities?.clients?.[clientId] || null;
    const nativeShim = await inspectNativeShim(clientId, { env });
    nativeShim.required = Boolean(nativeStrict);
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
      nativeShim,
      ...gates,
      verification,
      reasons: reasonsForClient(clientId, {
        hostCapabilities,
        env,
        verification,
        agentCatalogueReport,
        workflowRecipeReport,
      }),
    };
  }));
  const nativeStrictOk = !nativeStrict || clients.every((client) => (
    client.nativeShim.installed
    && client.nativeShim.pathPrecedence
    && client.nativeShim.realCommandAvailable
  ));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    policy: 'strict-verification-first',
    claimPolicy: 'No ECC-inspired capability claim may be marked verified without agent, workflow, smoke, metrics, and evidence manifest coverage.',
    agentCatalogue: {
      kind: agentCatalogueReport.kind,
      totalAgents: agentCatalogueReport.summary.totalAgents,
      byLifecycle: agentCatalogueReport.summary.byLifecycle,
      blocked: agentCatalogueReport.strict.blocked,
      blockedAgentIds: agentCatalogueReport.strict.blockedAgentIds,
    },
    workflowRecipes: {
      kind: workflowRecipeReport.kind,
      totalRecipes: workflowRecipeReport.summary.totalRecipes,
      blockedWorkflowIds: workflowRecipeReport.summary.blockedWorkflowIds,
    },
    nativeStrict: {
      enabled: Boolean(nativeStrict),
      ok: nativeStrictOk,
      shimDir: resolveNativeShimDir(env),
    },
    clients,
  };
}
