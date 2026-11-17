// 中文注释：一键接入命令——默认「就地接入」(magpie 式)：把网关地址外科改写进客户端真实配置（只动网关需要的 key，
// 备份原值，disconnect 还原），普通 claude/codex/pi 命令即走网关，无需特殊启动命令/env。--isolated 退回旧隔离工件模式。
// Canonical selections travel on the wire. Retain recovery for old Codex registry mutations.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

import { atomicTempPath, writeFileAtomic } from '../../../environment/fs/atomic-write.mjs';
import { claudeSettings, codexConfig, connectLaunchCommand, piModels, shellQuote } from './artifacts.mjs';
import { connectInplace, disconnectInplace, inplaceBackupPath } from './inplace.mjs';
import { withRegistryWriteLock } from '../entry/registry.mjs';
import { GATEWAY_DEFAULT_PORT } from '../lifecycle/daemon.mjs';
import { artifactModelForClient, connectTargetReadiness, persistedConnectTarget, requestModelForTarget } from './targets.mjs';
import { assertIsolatedOwned, contentHash, fileHash, isolatedStale, isolatedArtifactPath, legacyArtifactHash } from './isolated.mjs';
import { parseConnectState } from './config/journals.mjs';

const STATE_FILE = 'connect-state.json';
const DEFAULT_CLIENTS = Object.freeze(['claude', 'codex', 'pi']);
const CLIENT_MODEL_ALIAS = 'gateway-default';

function readRegistryDocument(registryFile, baseRegistry) {
  if (!registryFile) return structuredClone(baseRegistry || {});
  try {
    return JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return structuredClone(baseRegistry || {});
    throw error;
  }
}

// 中文注释：原子写 + 写后复parse，与 GUI route.ts 的守卫一致；写前备份到状态目录。
async function writeRegistryDocument(registryFile, document, backupFile) {
  if (fs.existsSync(registryFile) && backupFile) fs.copyFileSync(registryFile, backupFile);
  const text = `${JSON.stringify(document, null, 2)}\n`;
  JSON.parse(text);
  await writeFileAtomic(registryFile, text);
  if (fs.readFileSync(registryFile, 'utf8') !== text) {
    throw Object.assign(new Error('registry changed during connect/disconnect; disk state preserved, reload before retrying'), { code: 'REGISTRY_STALE' });
  }
}

function buildArtifact(client, gatewayUrl, options = {}) {
  const ref = options.targets?.[client];
  const model = ref ? requestModelForTarget(persistedConnectTarget(ref, options.targetRefVersion)) : 'aios-auto';
  const catalog = options.catalogs?.[client] || [];
  if (client === 'claude') return claudeSettings(gatewayUrl, model, catalog);
  if (client === 'codex') return codexConfig(gatewayUrl, model);
  if (client === 'pi') return piModels(gatewayUrl, model, catalog);
  return null;
}

function launchOptions(state) {
  return { piModel: artifactModelForClient(state, 'pi') };
}

function nextConnectState(stateDir, selected, values) {
  const prior = readConnectState(stateDir);
  if (prior && prior.mode !== values.mode && prior.clients?.length) {
    throw Object.assign(new Error('disconnect the existing connection mode before switching modes'), { code: 'CONNECT_MODE_CONFLICT' });
  }
  return { ...prior, ...values, targetRefVersion: 1,
    clients: [...new Set([...(prior?.clients || []), ...selected])],
    targets: { ...Object.fromEntries(Object.entries(prior?.targets || {}).map(([client, ref]) => [client, persistedConnectTarget(ref, prior.targetRefVersion)])), ...values.targets },
    catalogs: { ...prior?.catalogs, ...values.catalogs },
    artifactModels: { ...Object.fromEntries((prior?.clients || []).map((client) => [client, artifactModelForClient(prior, client)])),
      ...Object.fromEntries(selected.map((client) => [client, requestModelForTarget(values.targets[client])])) },
    // Freeze reconstructed legacy ownership before the global reference-version upgrade.
    artifactHashes: { ...(prior?.mode === 'isolated' && prior.targetRefVersion === undefined
      ? Object.fromEntries((prior.clients || []).map((client) => [client, legacyArtifactHash(client, prior)])) : {}), ...prior?.artifactHashes },
    gatewayUrls: { ...prior?.gatewayUrls, ...Object.fromEntries(selected.map((client) => [client, values.gatewayUrl])) },
    resolvedModels: { ...prior?.resolvedModels, ...values.resolvedModels }, at: new Date().toISOString() };
}

function readConnectState(stateDir) {
  const statePath = path.join(stateDir, STATE_FILE);
  try {
    return parseConnectState(fs.readFileSync(statePath, 'utf8'));
  } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

const codexDefaultApplied = (state) => state?.codexDefaultApplied ?? Boolean(state?.appliedCodexModel || state?.codexModel);
const withConnectRegistryLock = (file, action) => file ? withRegistryWriteLock(file, action) : action();

// Codex sends Responses, but its explicit gateway default may use any translatable protocol. Preserve restoration ownership across reconnects.
async function applyCodexDefault({ registryFile, baseRegistry, stateDir, codexModel, selected, nextState }) {
  const state = readConnectState(stateDir);
  const applied = codexDefaultApplied(state);
  const prior = applied ? state.priorClientDefaults : null;
  if (!registryFile || !selected.includes('codex')) return {
    priorClientDefaults: prior, codexDefaultApplied: applied,
    ...(state?.codexDefaultStatus ? { codexDefaultStatus: state.codexDefaultStatus, appliedCodexModel: state.appliedCodexModel,
      ...(Object.hasOwn(state, 'codexDefaultBefore') ? { codexDefaultBefore: state.codexDefaultBefore } : {}) } : {}),
  };
  const document = readRegistryDocument(registryFile, baseRegistry);
  if (applied && document.clientDefaults?.codex !== prior?.codex
    && document.clientDefaults?.codex !== (state.appliedCodexModel || state.codexModel)
    && !(state?.codexDefaultStatus === 'pending' && Object.hasOwn(state, 'codexDefaultBefore') && (document.clientDefaults?.codex ?? null) === state.codexDefaultBefore)) {
    throw Object.assign(new Error('registry changed during pending connect; disk state and recovery metadata preserved'), { code: 'REGISTRY_STALE' });
  }
  const priorClientDefaults = applied ? prior : (document.clientDefaults ?? null);
  const assignment = document.targetRefVersion === 1 ? `model:${encodeURIComponent(codexModel)}` : codexModel;
  const next = { ...document, clientDefaults: { ...(document.clientDefaults || {}), codex: assignment } };
  const defaults = { priorClientDefaults, codexDefaultApplied: true, appliedCodexModel: assignment, codexDefaultBefore: document.clientDefaults?.codex ?? null };
  // Persist ownership before the registry mutation; the final state write may fail.
  writeConnectState(stateDir, { ...nextState, ...defaults, codexDefaultStatus: 'pending' });
  await writeRegistryDocument(registryFile, next, applied ? null : path.join(stateDir, 'registry-backup.json'));
  return { ...defaults, codexDefaultStatus: 'applied' };
}

async function restoreCodexDefault(registryFile, priorClientDefaults, state) {
  if (!registryFile || !fs.existsSync(registryFile)) return;
  const document = readRegistryDocument(registryFile, null);
  {
    const current = document.clientDefaults?.codex;
    if (current === priorClientDefaults?.codex) return;
    if (current !== (state.appliedCodexModel || state.codexModel)
      && !(state?.codexDefaultStatus === 'pending' && Object.hasOwn(state, 'codexDefaultBefore') && (current ?? null) === state.codexDefaultBefore)) {
      throw Object.assign(new Error('registry changed during pending connect; disk state and recovery metadata preserved'), { code: 'REGISTRY_STALE' });
    }
  }
  const restored = { ...document, clientDefaults: { ...document.clientDefaults } };
  if (priorClientDefaults?.codex === undefined) delete restored.clientDefaults.codex;
  else restored.clientDefaults.codex = priorClientDefaults.codex;
  if (!Object.keys(restored.clientDefaults).length) delete restored.clientDefaults;
  await writeRegistryDocument(registryFile, restored, null);
}

function validateConnect(gatewayUrl, clients, io) {
  if (!/^https?:\/\/.+/u.test(String(gatewayUrl || ''))) {
    io.error(`connect: invalid gateway URL: ${gatewayUrl || '(empty)'}`);
    return null;
  }
  const selected = clients.filter((client) => DEFAULT_CLIENTS.includes(client));
  if (!selected.length) {
    io.error(`connect: no supported clients in ${JSON.stringify(clients)} (use claude|codex|pi)`);
    return null;
  }
  return selected;
}

function connectReadiness(options) {
  const document = readRegistryDocument(options.registryFile, options.baseRegistry);
  if (options.expectedRevision !== undefined) {
    if (typeof options.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/u.test(options.expectedRevision)) {
      throw Object.assign(new Error('expectedRevision must be a SHA-256 revision'), { code: 'INVALID_EXPECTED_REVISION' });
    }
    let text;
    if (options.registryFile) try { text = fs.readFileSync(options.registryFile, 'utf8'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    const revision = text === undefined ? options.baseRegistryRevision : createHash('sha256').update(text).digest('hex');
    if (revision !== options.expectedRevision) throw Object.assign(new Error('the registry changed; refresh before connecting'), { code: 'REGISTRY_STALE' });
  }
  return connectTargetReadiness({ ...options, document });
}

function previewOrReject(readiness, { dryRun, io }) {
  if (!readiness.ready) {
    const message = `Gateway not ready: ${readiness.issues.join('; ')}. Register an explicit compatible provider/model and configure credentials (or authMode: none). No client configs were changed.`;
    (dryRun ? io.log : io.error).call(io, `connect: ${message}`);
    return { exitCode: 1, ok: false, error: readiness.error || 'gateway_not_ready', message, dryRun: Boolean(dryRun), ...readiness };
  }
  for (const warning of readiness.warnings) io.log(`connect: ${warning}.`);
  if (dryRun) {
    io.log(`connect: dry run ready (${Object.entries(readiness.routes).map(([client, model]) => `${client}: ${model}`).join(', ')}). No files changed.`);
    return { exitCode: 0, ok: true, dryRun: true, ...readiness };
  }
  return null;
}

function writeConnectState(stateDir, state) {
  const target = path.join(stateDir, STATE_FILE);
  writeOwnedText(target, `${JSON.stringify(state, null, 2)}\n`);
}

function writeOwnedText(target, text) {
  const temporary = atomicTempPath(target);
  try {
    fs.writeFileSync(temporary, text, { flag: 'wx', mode: 0o600, flush: true });
    fs.renameSync(temporary, target);
  } finally {
    try { fs.rmSync(temporary); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
}

function writeIsolatedSnippet(stateDir, state) {
  const text = ['# AIOS gateway connect (isolated) - source this file; reversible via `aios model-router disconnect`.',
    ...(state.clients || []).map((client) => `alias ${client}-gw=${shellQuote(connectLaunchCommand(client, stateDir, launchOptions(state)))}`)].join('\n');
  writeOwnedText(path.join(stateDir, 'connect.sh'), `${text}\n`);
}

// 就地接入（默认）：外科改写客户端真实配置 + 备份原值。普通命令即走网关。
export async function runConnectInplace(options = {}) {
  if (options.dryRun) return connectInplaceUnderLock(options);
  return withConnectRegistryLock(options.registryFile, () => connectInplaceUnderLock(options));
}

async function connectInplaceUnderLock(options) {
  const {
    home = os.homedir(), gatewayUrl, stateDir, registryFile, baseRegistry = null,
    clients = DEFAULT_CLIENTS, codexModel: requestedCodexModel = '', piModel = CLIENT_MODEL_ALIAS, io = console,
  } = options;
  const selected = validateConnect(gatewayUrl, clients, io);
  if (!selected) return { exitCode: 1 };
  const readiness = connectReadiness({ ...options, selected, codexModel: requestedCodexModel, piModel });
  const preview = previewOrReject(readiness, { dryRun: options.dryRun, io });
  if (preview) return preview;
  const codexModel = readiness.routes.codex || '';
  const nextState = nextConnectState(stateDir, selected, { mode: 'inplace', gatewayUrl, registryFile: registryFile || null,
    resolvedModels: readiness.routes, targets: readiness.targets, catalogs: readiness.catalogs });
  const result = connectInplace({ home, gatewayUrl, stateDir, targets: readiness.targets, catalogs: readiness.catalogs, clients: selected });
  // Deprecated --codex-model retains its recoverable registry write. Canonical targets need no registry mutation.
  const defaults = await applyCodexDefault({ registryFile, baseRegistry, stateDir, codexModel,
    selected: options.target === undefined && requestedCodexModel ? selected : [], nextState });
  writeConnectState(stateDir, { ...nextState, ...defaults });
  io.log(`AIOS gateway connect (in-place) → ${gatewayUrl}`);
  for (const item of result.results) io.log(`  ${item.client}: ${item.file} (${item.changedKeys.join(', ')})`);
  io.log(`Your normal claude/codex/pi now route through the gateway. Start it:  aios model-router gateway --port ${GATEWAY_DEFAULT_PORT}`);
  io.log('Restore anytime:  aios model-router disconnect');
  return { exitCode: 0, stateDir, mode: 'inplace', ...readiness, ...result };
}

// 隔离工件模式（--isolated 兜底）：生成隔离配置 + 启动别名，不碰真实配置。
export async function runConnect(options = {}) {
  if (options.dryRun) return connectIsolatedUnderLock(options);
  return withConnectRegistryLock(options.registryFile, () => connectIsolatedUnderLock(options));
}

async function connectIsolatedUnderLock(options) {
  const {
    gatewayUrl, stateDir, registryFile, baseRegistry = null,
    clients = DEFAULT_CLIENTS, codexModel: requestedCodexModel = '', piModel = CLIENT_MODEL_ALIAS, io = console,
  } = options;
  const selected = validateConnect(gatewayUrl, clients, io);
  if (!selected) return { exitCode: 1 };
  const readiness = connectReadiness({ ...options, selected, codexModel: requestedCodexModel, piModel });
  const preview = previewOrReject(readiness, { dryRun: options.dryRun, io });
  if (preview) return preview;
  const codexModel = readiness.routes.codex || '';
  const nextState = nextConnectState(stateDir, selected, { mode: 'isolated', gatewayUrl, registryFile: registryFile || null,
    resolvedModels: readiness.routes, targets: readiness.targets, catalogs: readiness.catalogs });
  const prior = readConnectState(stateDir);
  const plans = selected.map((client) => {
    const artifact = buildArtifact(client, gatewayUrl, nextState);
    const file = path.join(stateDir, artifact.relPath);
    assertIsolatedOwned(file, client, prior);
    return { client, artifact, file, before: fileHash(file), after: contentHash(artifact.content) };
  });
  fs.mkdirSync(stateDir, { recursive: true });
  const pendingArtifacts = { ...prior?.pendingArtifacts, ...Object.fromEntries(plans.map((plan) => [plan.client, { before: plan.before, after: plan.after }])) };
  const pendingState = { ...nextState, artifactStatus: 'pending', pendingArtifacts };
  const defaults = await applyCodexDefault({ registryFile, baseRegistry, stateDir, codexModel,
    selected: options.target === undefined && requestedCodexModel ? selected : [], nextState: pendingState });
  writeConnectState(stateDir, { ...pendingState, ...defaults });
  const artifacts = [];
  for (const { client, artifact, file, before } of plans) {
    if (fileHash(file) !== before) throw isolatedStale(file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await writeFileAtomic(file, artifact.content, { mode: 0o600 });
    artifacts.push({ client, file, launch: connectLaunchCommand(client, stateDir, launchOptions(nextState)) });
  }
  writeIsolatedSnippet(stateDir, nextState);
  const remainingPending = Object.fromEntries(Object.entries(pendingArtifacts).filter(([client]) => !selected.includes(client)));
  writeConnectState(stateDir, { ...nextState, ...defaults, pendingArtifacts: remainingPending, artifactStatus: Object.keys(remainingPending).length ? 'pending' : 'applied',
    artifactHashes: { ...nextState.artifactHashes, ...Object.fromEntries(plans.map((plan) => [plan.client, plan.after])) } });

  io.log(`AIOS gateway connect (isolated) → ${gatewayUrl}`);
  io.log(`State dir: ${stateDir}`);
  for (const a of artifacts) io.log(`  ${a.client}: ${a.launch}`);
  io.log(`\nSource the aliases:  source ${shellQuote(path.join(stateDir, 'connect.sh'))}`);
  io.log(`Then start the gateway:  aios model-router gateway --port ${GATEWAY_DEFAULT_PORT}`);
  return { exitCode: 0, ok: true, stateDir, mode: 'isolated', artifacts, ...readiness };
}

function removeOwnedFile(file) {
  try { fs.rmSync(file); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

function pruneEmptyDirectories(directory, stateDir) {
  const root = path.resolve(stateDir);
  for (let current = path.resolve(directory); current === root || current.startsWith(`${root}${path.sep}`); current = path.dirname(current)) {
    try { fs.rmdirSync(current); } catch (error) {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error?.code)) throw error;
      break;
    }
    if (current === root) break;
  }
}

function remainingState(state, selected, restoredCodex) {
  const next = { ...state, clients: (state?.clients || []).filter((client) => !selected.includes(client)) };
  for (const key of ['targets', 'catalogs', 'resolvedModels', 'gatewayUrls', 'artifactModels', 'artifactHashes', 'pendingArtifacts']) {
    if (state?.[key]) next[key] = Object.fromEntries(Object.entries(state[key]).filter(([client]) => !selected.includes(client)));
  }
  if (restoredCodex) {
    next.codexDefaultApplied = false;
    for (const key of ['codexDefaultStatus', 'appliedCodexModel', 'codexDefaultBefore', 'priorClientDefaults', 'codexModel']) delete next[key];
  }
  return next;
}

// Acquire the registry lock before consuming client backups, including on retries.
export async function runDisconnect(options = {}) {
  const targetRegistry = options.registryFile || readConnectState(options.stateDir)?.registryFile;
  return withConnectRegistryLock(targetRegistry, () => disconnectUnderLock(options));
}

async function disconnectUnderLock(options) {
  const { stateDir, registryFile, clients, io = console } = options;
  const state = readConnectState(stateDir);
  const selected = clients || DEFAULT_CLIENTS;
  const restoreCodex = codexDefaultApplied(state) && selected.includes('codex');
  const targetRegistry = registryFile || state?.registryFile;
  const inplace = state?.mode === 'inplace' || fs.existsSync(inplaceBackupPath(stateDir));
  if (inplace) {
    // Restore first: a failed/stale registry write must not consume its recovery journal.
    if (restoreCodex) await restoreCodexDefault(targetRegistry, state.priorClientDefaults, state);
    const result = disconnectInplace({ stateDir, clients });
    const next = remainingState(state, selected, restoreCodex);
    if (result.remainingClients) next.clients = result.remainingClients;
    if (restoreCodex) removeOwnedFile(path.join(stateDir, 'registry-backup.json'));
    if (next.clients.length) writeConnectState(stateDir, next);
    else removeOwnedFile(path.join(stateDir, STATE_FILE));
    const names = [...new Set((result.restored || []).map((item) => item.client))].join(', ');
    io.log(`AIOS gateway disconnect (in-place): ${result.disconnected ? `restored ${names}` : 'nothing connected'}.`);
    return { exitCode: 0, mode: 'inplace', ...result };
  }
  if (!state) return { exitCode: 0, mode: 'isolated', disconnected: false, remainingClients: [] };
  const plans = (state.clients || []).filter((client) => selected.includes(client)).map((client) => {
    const file = isolatedArtifactPath(stateDir, client);
    assertIsolatedOwned(file, client, state, { allowMissing: true });
    return { file, before: fileHash(file) };
  });
  if (restoreCodex) await restoreCodexDefault(targetRegistry, state.priorClientDefaults, state);
  for (const { file, before } of plans) {
    if (fileHash(file) !== before) throw isolatedStale(file);
    removeOwnedFile(file);
    pruneEmptyDirectories(path.dirname(file), stateDir);
  }
  const next = remainingState(state, selected, restoreCodex);
  if (restoreCodex) removeOwnedFile(path.join(stateDir, 'registry-backup.json'));
  if (next.clients.length) {
    writeIsolatedSnippet(stateDir, next);
    writeConnectState(stateDir, next);
  } else {
    removeOwnedFile(path.join(stateDir, 'connect.sh'));
    removeOwnedFile(path.join(stateDir, STATE_FILE));
    pruneEmptyDirectories(stateDir, stateDir);
  }
  io.log(`AIOS gateway disconnect: removed owned connect artifacts${restoreCodex ? ' and restored prior Codex default' : ''}.`);
  return { exitCode: 0, mode: 'isolated', disconnected: plans.length > 0, remainingClients: next.clients };
}
