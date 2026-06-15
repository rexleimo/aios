import { constants as fsConstants, promises as fs } from 'node:fs';
import os from 'node:os';
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

export async function buildClientCapabilityReport({ rootDir = process.cwd(), env = process.env, nativeStrict = false } = {}) {
  const hostCapabilities = await readHostCapabilities(rootDir);
  const clients = await Promise.all(ALL_CLIENTS.map(async (clientId) => {
    const definition = CLIENT_DEFINITIONS[clientId];
    const status = statusForClient(clientId);
    const gates = gatesForStatus(status);
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
      reasons: reasonsForClient(clientId, { hostCapabilities, env }),
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
    nativeStrict: {
      enabled: Boolean(nativeStrict),
      ok: nativeStrictOk,
      shimDir: resolveNativeShimDir(env),
    },
    clients,
  };
}
