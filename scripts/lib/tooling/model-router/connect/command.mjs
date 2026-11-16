// 中文注释：一键接入命令——默认「就地接入」(magpie 式)：把网关地址外科改写进客户端真实配置（只动网关需要的 key，
// 备份原值，disconnect 还原），普通 claude/codex/pi 命令即走网关，无需特殊启动命令/env。--isolated 退回旧隔离工件模式。
// 两种模式都把 codex 的 openai-response 默认模型写进单一配置源 registry.clientDefaults（disconnect 还原）。密钥不落明文。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { atomicTempPath, writeFileAtomic } from '../../../environment/fs/atomic-write.mjs';
import { claudeSettings, codexConfig, connectLaunchCommand, piModels } from './artifacts.mjs';
import { connectInplace, disconnectInplace, inplaceBackupPath } from './inplace.mjs';
import { withRegistryWriteLock } from '../entry/registry.mjs';
import { resolveGatewayRoute } from '../gateway/router.mjs';
import { GATEWAY_DEFAULT_PORT } from '../lifecycle/daemon.mjs';
import { getProviderForModel, listGatewayModels } from '../routing/providers.mjs';

const STATE_FILE = 'connect-state.json';
const DEFAULT_CLIENTS = Object.freeze(['claude', 'codex', 'pi']);
const CLIENT_PROTOCOLS = Object.freeze({ claude: 'claude', codex: 'openai-response', pi: 'claude' });
// Keep aligned with gateway/proxy.mjs translators; Pi uses anthropic-messages too.
const GATEWAY_TARGET_PROTOCOLS = Object.freeze({ claude: ['claude', 'openai-chat', 'gemini'], 'openai-response': ['openai-response'] });
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

function buildArtifact(client, gatewayUrl, options) {
  if (client === 'claude') return claudeSettings(gatewayUrl);
  if (client === 'codex') return codexConfig(gatewayUrl, options.codexModel);
  if (client === 'pi') return piModels(gatewayUrl, options.piModel);
  return null;
}

function readConnectState(stateDir) {
  const statePath = path.join(stateDir, STATE_FILE);
  if (!fs.existsSync(statePath)) return null;
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return null; }
}

const codexDefaultApplied = (state) => state?.codexDefaultApplied ?? state?.clients?.includes('codex') ?? false;
const withConnectRegistryLock = (file, action) => file ? withRegistryWriteLock(file, action) : action();

// codex 说 openai-response，必须给它一个同协议默认模型，否则网关 fail-closed。备份原值供 disconnect 还原；幂等沿用已有备份。
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
  if (state?.codexDefaultStatus === 'pending' && document.clientDefaults?.codex !== prior?.codex
    && document.clientDefaults?.codex !== state.appliedCodexModel
    && !(Object.hasOwn(state, 'codexDefaultBefore') && (document.clientDefaults?.codex ?? null) === state.codexDefaultBefore)) {
    throw Object.assign(new Error('registry changed during pending connect; disk state and recovery metadata preserved'), { code: 'REGISTRY_STALE' });
  }
  const priorClientDefaults = applied ? prior : (document.clientDefaults ?? null);
  const next = { ...document, clientDefaults: { ...(document.clientDefaults || {}), codex: codexModel } };
  const defaults = { priorClientDefaults, codexDefaultApplied: true, appliedCodexModel: codexModel, codexDefaultBefore: document.clientDefaults?.codex ?? null };
  // Persist ownership before the registry mutation; the final state write may fail.
  writeConnectState(stateDir, { ...nextState, ...defaults, codexDefaultStatus: 'pending' });
  await writeRegistryDocument(registryFile, next, applied ? null : path.join(stateDir, 'registry-backup.json'));
  return { ...defaults, codexDefaultStatus: 'applied' };
}

async function restoreCodexDefault(registryFile, priorClientDefaults, state) {
  if (!registryFile || !fs.existsSync(registryFile)) return;
  const document = readRegistryDocument(registryFile, null);
  if (state?.codexDefaultStatus === 'pending') {
    const current = document.clientDefaults?.codex;
    if (current === priorClientDefaults?.codex) return;
    if (current !== state.appliedCodexModel
      && !(Object.hasOwn(state, 'codexDefaultBefore') && (current ?? null) === state.codexDefaultBefore)) {
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

function connectReadiness({ registryFile, baseRegistry, selected, codexModel, piModel, env = process.env }) {
  const document = readRegistryDocument(registryFile, baseRegistry);
  const routes = {};
  const issues = [];
  const warnings = [];
  try {
    const eligible = listGatewayModels(document, { env });
    for (const client of selected) {
      const protocol = CLIENT_PROTOCOLS[client];
      const compatible = eligible.filter((id) => GATEWAY_TARGET_PROTOCOLS[protocol].includes(getProviderForModel(id, document).protocol));
      const requested = String((client === 'codex' ? codexModel : client === 'pi' ? piModel : '') || '').trim();
      const explicit = requested === CLIENT_MODEL_ALIAS ? '' : requested;
      let modelId = explicit;
      let projected = document;
      if (client === 'codex') {
        const configured = String(document.clientDefaults?.codex || '').trim();
        const active = String(document.activeModel || '').trim();
        modelId ||= configured || (compatible.includes(active) ? active : '')
          || (compatible.length === 1 ? compatible[0] : '');
        if (!modelId) {
          issues.push(`${client}: no unambiguous eligible ${protocol} route`);
          continue;
        }
        if (registryFile) projected = { ...document, clientDefaults: { ...document.clientDefaults, codex: modelId } };
      }
      if (modelId && !compatible.includes(modelId)) {
        issues.push(`${client}: model "${modelId}" is not an eligible ${protocol} route`);
        continue;
      }
      // Only Codex sends x-gateway-client; Claude/Pi use the anonymous runtime default.
      let route;
      try {
        route = resolveGatewayRoute({ clientId: client === 'codex' ? client : '', registry: projected, env, clientProtocol: protocol });
      } catch {
        issues.push(`${client}: no eligible runtime default route; configure activeModel${client === 'codex' ? ' or clientDefaults.codex' : ''}`);
        continue;
      }
      if (!compatible.includes(route.modelId)) {
        issues.push(`${client}: runtime model "${route.modelId}" is not an eligible ${protocol} route`);
      } else if (modelId && modelId !== route.modelId) {
        issues.push(`${client}: requested model "${modelId}" differs from runtime default "${route.modelId}"; configure the gateway route explicitly`);
      } else {
        routes[client] = route.modelId;
        if (route.targetProtocol === 'gemini') warnings.push(`${client}: Gemini translation supports non-streaming requests only`);
      }
    }
  } catch {
    issues.push('invalid provider/model configuration');
  }
  return { ready: issues.length === 0, routes, issues, warnings };
}

function previewOrReject(readiness, { dryRun, io }) {
  if (!readiness.ready) {
    const message = `Gateway not ready: ${readiness.issues.join('; ')}. Register an explicit compatible provider/model and configure credentials (or authMode: none). No client configs were changed.`;
    (dryRun ? io.log : io.error).call(io, `connect: ${message}`);
    return { exitCode: 1, ok: false, error: 'gateway_not_ready', message, dryRun: Boolean(dryRun), ...readiness };
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
  const temporary = atomicTempPath(target);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx', mode: 0o600, flush: true });
    fs.renameSync(temporary, target);
  } finally {
    try { fs.rmSync(temporary); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
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
  const result = connectInplace({ home, gatewayUrl, stateDir, modelId: piModel, clients: selected });
  const nextState = { mode: 'inplace', gatewayUrl, clients: selected, registryFile: registryFile || null, codexModel, piModel, at: new Date().toISOString() };
  const defaults = await applyCodexDefault({ registryFile, baseRegistry, stateDir, codexModel, selected, nextState });
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
  const buildOptions = { codexModel, piModel };
  const priorState = readConnectState(stateDir);
  const artifactClients = [...new Set([...(priorState?.mode !== 'inplace' ? priorState?.clients || [] : []), ...selected])];
  fs.mkdirSync(stateDir, { recursive: true });
  const nextState = { mode: 'isolated', gatewayUrl, clients: artifactClients, registryFile: registryFile || null, codexModel, piModel, at: new Date().toISOString() };
  const defaults = await applyCodexDefault({ registryFile, baseRegistry, stateDir, codexModel, selected, nextState });

  const artifacts = [];
  for (const client of selected) {
    const artifact = buildArtifact(client, gatewayUrl, buildOptions);
    const target = path.join(stateDir, artifact.relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, artifact.content);
    artifacts.push({ client, file: target, launch: connectLaunchCommand(client, stateDir, buildOptions) });
  }
  writeConnectState(stateDir, { ...nextState, ...defaults });

  const snippet = ['# AIOS gateway connect (isolated) — source this file; reversible via `aios model-router disconnect`.',
    ...artifacts.map((a) => `alias ${a.client}-gw='${a.launch}'`)].join('\n');
  fs.writeFileSync(path.join(stateDir, 'connect.sh'), `${snippet}\n`);

  io.log(`AIOS gateway connect (isolated) → ${gatewayUrl}`);
  io.log(`State dir: ${stateDir}`);
  for (const a of artifacts) io.log(`  ${a.client}: ${a.launch}`);
  io.log(`\nSource the aliases:  source ${path.join(stateDir, 'connect.sh')}`);
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

// 只清理已接入客户端的已知工件；目录只能删空目录，保留 pid、日志与未知用户文件。
function cleanupIsolatedArtifacts(stateDir, state) {
  if (!state) return;
  for (const client of state.clients || []) {
    const artifact = buildArtifact(client, state.gatewayUrl, state);
    if (!artifact) continue;
    const file = path.join(stateDir, artifact.relPath);
    removeOwnedFile(file);
    pruneEmptyDirectories(path.dirname(file), stateDir);
  }
  removeOwnedFile(path.join(stateDir, 'connect.sh'));
  if (codexDefaultApplied(state)) removeOwnedFile(path.join(stateDir, 'registry-backup.json'));
  removeOwnedFile(path.join(stateDir, STATE_FILE));
  pruneEmptyDirectories(stateDir, stateDir);
}

// 还原：自动识别就地/隔离模式，两种模式均保留网关生命周期与未知状态。
export async function runDisconnect(options = {}) {
  const targetRegistry = options.registryFile || readConnectState(options.stateDir)?.registryFile;
  // Acquire before consuming client backups, so a timeout leaves the whole operation retryable.
  return withConnectRegistryLock(targetRegistry, () => disconnectUnderLock(options));
}

async function disconnectUnderLock(options) {
  const { stateDir, registryFile, clients, io = console } = options;
  const statePath = path.join(stateDir, STATE_FILE);
  const state = readConnectState(stateDir);
  const targetRegistry = registryFile || state?.registryFile;
  const inplace = state?.mode === 'inplace' || fs.existsSync(inplaceBackupPath(stateDir));
  if (inplace) {
    const result = disconnectInplace({ stateDir, clients });
    const fullyDone = !fs.existsSync(inplaceBackupPath(stateDir));
    if (fullyDone) {
      if (codexDefaultApplied(state) && targetRegistry) await restoreCodexDefault(targetRegistry, state.priorClientDefaults, state);
      if (codexDefaultApplied(state)) removeOwnedFile(path.join(stateDir, 'registry-backup.json'));
      try { fs.rmSync(statePath); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    }
    const names = [...new Set((result.restored || []).map((item) => item.client))].join(', ');
    io.log(`AIOS gateway disconnect (in-place): ${result.disconnected ? `restored ${names}` : 'nothing connected'}${fullyDone && state ? ' and prior clientDefaults' : ''}.`);
    return { exitCode: 0, mode: 'inplace', ...result };
  }
  if (codexDefaultApplied(state) && targetRegistry) await restoreCodexDefault(targetRegistry, state.priorClientDefaults, state);
  cleanupIsolatedArtifacts(stateDir, state);
  io.log(`AIOS gateway disconnect: ${state ? 'removed owned connect artifacts' : 'nothing connected'}${codexDefaultApplied(state) ? ' and restored prior clientDefaults' : ''}.`);
  return { exitCode: 0, mode: 'isolated' };
}
