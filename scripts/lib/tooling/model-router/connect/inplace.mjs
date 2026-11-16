// 中文注释：先预检全部客户端编辑，再持久化恢复日志，最后按所有权检查原子写回。
// disconnect 只还原托管字段；原本不存在且没有用户新增内容的文件才删除。
// 单一事实源：路径来自 editors.clientConfigPaths，改写/还原来自 editors，本层只管 fs/原子写/备份存取。
// 所有 fs 可注入，测试用临时 HOME 夹具，绝不碰用户真实配置；真正写入只由用户在 GUI 点「接入」触发。
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import {
  editClaude, restoreClaude,
  editCodex, restoreCodex,
  editPiSettings, restorePiSettings,
  editPiModels, restorePiModels,
  clientConfigPaths,
} from './editors.mjs';

const BACKUP_FILE = 'connect-backup.json';
const DEFAULT_CLIENTS = Object.freeze(['claude', 'codex', 'pi']);

export function inplaceBackupPath(stateDir) {
  return path.join(stateDir, BACKUP_FILE);
}

// (client, role) → 编辑器/还原器。pi 有两个文件（settings + models），其余各一个。
const EDITORS = {
  'claude/main': (text, { gatewayUrl }) => editClaude(text, gatewayUrl),
  'codex/main': (text, { gatewayUrl }) => editCodex(text, gatewayUrl),
  'pi/settings': (text, { modelId }) => editPiSettings(text, modelId),
  'pi/models': (text, { gatewayUrl, modelId }) => editPiModels(text, gatewayUrl, modelId),
};
const RESTORERS = {
  'claude/main': restoreClaude,
  'codex/main': restoreCodex,
  'pi/settings': restorePiSettings,
  'pi/models': restorePiModels,
};

function clientFiles(home, client) {
  const paths = clientConfigPaths(home)[client];
  if (client === 'pi') return [{ file: paths[0], role: 'settings' }, { file: paths[1], role: 'models' }];
  return [{ file: paths[0], role: 'main' }];
}

function staleConfig(file) {
  return Object.assign(new Error(`client config changed outside connect: ${file}; preserve the recovery backup and reconcile before retrying`), { code: 'CLIENT_CONFIG_STALE' });
}

function readFileState(fsImpl, file) {
  try {
    return { existed: true, text: fsImpl.readFileSync(file, 'utf8') };
  } catch (error) {
    if (error?.code === 'ENOENT') return { existed: false, text: '' };
    throw error;
  }
}

function assertUnchanged(fsImpl, file, expected) {
  const current = readFileState(fsImpl, file);
  if (current.existed !== expected.existed || current.text !== expected.text) throw staleConfig(file);
}

function atomicWrite(fsImpl, file, text, expected) {
  if (expected) assertUnchanged(fsImpl, file, expected);
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.aios-tmp-${process.pid}-${randomUUID()}`;
  try {
    fsImpl.writeFileSync(tmp, text, { mode: 0o600, flag: 'wx', flush: true });
    if (expected) assertUnchanged(fsImpl, file, expected);
    fsImpl.renameSync(tmp, file);
  } finally {
    try { fsImpl.rmSync(tmp); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
}

const hash = (text) => createHash('sha256').update(text).digest('hex');

function managedHash(backup) {
  // 容器是否存在不代表字段所有权；用户可在 env/providers 中添加无关配置。
  const { hadEnv, hadProviders, ...managed } = backup;
  return hash(JSON.stringify(managed));
}

function configSnapshot(state, backup) {
  return { existed: state.existed, hash: hash(state.text), managed: managedHash(backup) };
}

function readBackup(fsImpl, stateDir) {
  const state = readFileState(fsImpl, inplaceBackupPath(stateDir));
  return state.existed ? JSON.parse(state.text) : null;
}

const sameManaged = (a, b) => a && b && a.existed === b.existed && a.managed === b.managed;
const sameFile = (a, b) => a && b && a.existed === b.existed && a.hash === b.hash;
const isOriginal = (entry, current) => (current.existed || !entry.existed) && current.managed === managedHash(entry.backup);

function appliedSnapshots(entry, document) {
  if (entry.applied || entry.pending) return [entry.applied, entry.pending?.before, entry.pending?.after].filter(Boolean);
  // 兼容旧备份：从旧接入参数重建托管字段，不把当前外部值认领为网关所有。
  const key = `${entry.client}/${entry.role}`;
  const params = { gatewayUrl: document.gatewayUrl, modelId: document.modelId || 'gateway-default' };
  const { text } = EDITORS[key]('', params);
  return [configSnapshot({ existed: true, text }, EDITORS[key](text, params).backup)];
}

function assertOwned(entry, current, document) {
  if (!isOriginal(entry, current) && !appliedSnapshots(entry, document).some((known) => sameManaged(current, known))) throw staleConfig(entry.file);
}

// 原值备份始终不变。pending 同时记录写前/写后指纹，覆盖 rename 成功后进程退出的恢复窗口。
export function connectInplace(options = {}) {
  const {
    home, gatewayUrl, stateDir, modelId = 'gateway-default',
    clients = DEFAULT_CLIENTS, fsImpl = fs,
  } = options;
  if (!home || !gatewayUrl || !stateDir) throw new Error('connectInplace requires home, gatewayUrl, stateDir');
  const backupPath = inplaceBackupPath(stateDir);
  const backupState = readFileState(fsImpl, backupPath);
  const existing = backupState.existed ? JSON.parse(backupState.text) : null;
  const entries = (existing?.entries || []).map((entry) => entry.applied || entry.pending ? entry : { ...entry, applied: appliedSnapshots(entry, existing)[0] });
  const plans = [];
  const params = { gatewayUrl, modelId };
  for (const client of new Set(clients)) {
    for (const { file, role } of clientFiles(home, client)) {
      const key = `${client}/${role}`;
      const before = readFileState(fsImpl, file);
      const { text, backup, changedKeys } = EDITORS[key](before.text, params);
      const beforeSnapshot = configSnapshot(before, backup);
      const index = entries.findIndex((entry) => entry.client === client && entry.role === role);
      const prior = entries[index];
      if (prior) {
        if (prior.file !== file) throw staleConfig(file);
        assertOwned(prior, beforeSnapshot, existing);
      }
      const after = configSnapshot({ existed: true, text }, EDITORS[key](text, params).backup);
      const entry = { ...(prior || { client, role, file, existed: before.existed, backup }), pending: { before: beforeSnapshot, after } };
      if (index === -1) entries.push(entry);
      else entries[index] = entry;
      plans.push({ entry, before, text, changedKeys });
    }
  }
  const document = {
    schemaVersion: 2, gatewayUrl, modelId,
    connectedAt: existing?.connectedAt || new Date().toISOString(),
    entries,
  };
  const journal = { existed: true, text: `${JSON.stringify(document, null, 2)}\n` };
  atomicWrite(fsImpl, backupPath, journal.text, backupState);
  for (const plan of plans) {
    assertUnchanged(fsImpl, backupPath, journal);
    atomicWrite(fsImpl, plan.entry.file, plan.text, plan.before);
  }
  const completed = new Set(plans.map((plan) => plan.entry));
  document.entries = entries.map((entry) => {
    if (!completed.has(entry)) return entry;
    const { pending, ...rest } = entry;
    return { ...rest, applied: pending.after };
  });
  atomicWrite(fsImpl, backupPath, `${JSON.stringify(document, null, 2)}\n`, journal);
  const results = plans.map(({ entry: { client, role, file }, changedKeys }) => ({ client, role, file, changedKeys }));
  return { ok: true, connected: [...new Set(clients)], backupPath, results };
}

// 还原前也预检全部目标。已恢复/未写入的条目不改文件，使中途失败后的 disconnect 可安全重试。
// 无备份/无匹配 → not-connected。部分还原时保留剩余客户端的备份；全部还原才删备份文件。
export function disconnectInplace(options = {}) {
  const { stateDir, clients, fsImpl = fs } = options;
  if (!stateDir) throw new Error('disconnectInplace requires stateDir');
  const backupPath = inplaceBackupPath(stateDir);
  const backupState = readFileState(fsImpl, backupPath);
  const document = backupState.existed ? JSON.parse(backupState.text) : null;
  if (!document) return { ok: true, disconnected: false, reason: 'not-connected', restored: [] };
  const target = clients ? document.entries.filter((entry) => clients.includes(entry.client)) : document.entries;
  if (!target.length) return { ok: true, disconnected: false, reason: 'not-connected', restored: [] };
  const plans = target.map((entry) => {
    const key = `${entry.client}/${entry.role}`;
    const before = readFileState(fsImpl, entry.file);
    const params = { gatewayUrl: document.gatewayUrl, modelId: document.modelId };
    const current = configSnapshot(before, EDITORS[key](before.text, params).backup);
    assertOwned(entry, current, document);
    const unchanged = isOriginal(entry, current);
    const text = unchanged ? null : RESTORERS[key](before.text, entry.backup);
    // 重试接入不能把用户新增内容升级成可整文件删除的所有权；仅在还原后确实为空时删除。
    const empty = text !== null && (key === 'codex/main' ? !text.trim() : Object.keys(JSON.parse(text)).length === 0);
    const remove = !entry.existed && empty && appliedSnapshots(entry, document).some((known) => sameFile(current, known));
    return { entry, before, unchanged, remove, text };
  });
  const restored = [];
  for (const { entry, before, unchanged, remove, text } of plans) {
    assertUnchanged(fsImpl, backupPath, backupState);
    assertUnchanged(fsImpl, entry.file, before);
    if (!unchanged) {
      if (remove) fsImpl.rmSync(entry.file);
      else atomicWrite(fsImpl, entry.file, text, before);
    }
    restored.push({ client: entry.client, role: entry.role, file: entry.file, removed: remove || !before.existed });
  }
  const remaining = document.entries.filter((entry) => !target.includes(entry));
  if (remaining.length) atomicWrite(fsImpl, backupPath, `${JSON.stringify({ ...document, entries: remaining }, null, 2)}\n`, backupState);
  else {
    assertUnchanged(fsImpl, backupPath, backupState);
    fsImpl.rmSync(backupPath);
  }
  return { ok: true, disconnected: true, restored, remainingClients: [...new Set(remaining.map((entry) => entry.client))] };
}

// 就地接入状态：哪些客户端已接入（以备份为准，客观事实）。供 GUI/gateway-status 展示。
export function inplaceStatus(options = {}) {
  const { stateDir, fsImpl = fs } = options;
  const document = readBackup(fsImpl, stateDir);
  const connectedClients = document ? [...new Set(document.entries.map((entry) => entry.client))] : [];
  return {
    connected: connectedClients.length > 0,
    clients: DEFAULT_CLIENTS.map((client) => ({ client, connected: connectedClients.includes(client) })),
    gatewayUrl: document?.gatewayUrl || null,
  };
}
