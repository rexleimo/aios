// scripts/lib/clients/mcp/ledger.mjs — MCP 条目的归属账本（ADR 0008 决策 3：只动自己写过的，别人的要显式接管）。
//
// 沿用本仓已有的归属纪律，不另立一套：
//   · `integrations/ledger.mjs:2-3`  —— 「AIOS 只承认自己写过的条目（指纹一致），用户手改过的一律判
//     conflict/external，绝不覆盖、绝不删除」；
//   · `aios-init/headroom-mcp/ownership.mjs:27-34` —— absent / conflict / external / owned 四态判定；
//   · `aios-init/headroom-mcp/lifecycle.mjs:119` —— 条目被改过之后要给的原文理由
//     `entry-changed-after-aios-registration`。
//
// 与本仓另一个指纹的**差别是刻意的**：`integrations/ledger.mjs:31-47` 的归一化只留
// url/type/command/args/env，因为它服务的是「这个 server 还是不是当初那个端点」的核验；
// 本层要担保的是「这条目还是不是我写的那一份」，所以取**全字段**（pi 的 `lifecycle`、
// gemini 的 `timeout`、claude 的 `cwd` 都算）。键序不参与指纹（内容相同即同一份），
// 数组顺序参与（`args` 换序就是换命令）。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { writeFileAtomic } from '../../environment/fs/atomic-write.mjs';

export const MCP_LEDGER_SCHEMA_VERSION = 1;

export function resolveMcpLedgerDir({ env = process.env, homeDir = os.homedir(), ledgerDir = '' } = {}) {
  if (ledgerDir) return ledgerDir;
  const stateHome = env?.AIOS_HOME && path.isAbsolute(env.AIOS_HOME) ? env.AIOS_HOME : path.join(homeDir, '.aios');
  return path.join(stateHome, 'mcp', 'ledger');
}

export function resolveMcpLedgerPath(clientId, options = {}) {
  const key = String(clientId || '').trim().toLowerCase();
  if (!key) throw new Error('mcp ledger requires a client id');
  return path.join(resolveMcpLedgerDir(options), `${key}.json`);
}

export function ledgerKeyFor(scope, serverName) {
  return `${scope}/${serverName}`;
}

function emptyLedger(clientId) {
  return { schemaVersion: MCP_LEDGER_SCHEMA_VERSION, clientId, entries: {}, missing: true, corrupt: '' };
}

/** 全字段归一化：递归按键名排序，去掉 undefined，数组保持原序。 */
export function canonicalizeMcpEntry(entry) {
  if (entry === null || entry === undefined) return null;
  if (Array.isArray(entry)) return entry.map((item) => canonicalizeMcpEntry(item));
  if (typeof entry === 'object') {
    const out = {};
    for (const key of Object.keys(entry).sort()) {
      if (entry[key] === undefined) continue;
      out[key] = canonicalizeMcpEntry(entry[key]);
    }
    return out;
  }
  return entry;
}

export function fingerprintMcpEntry(entry) {
  return createHash('sha256').update(JSON.stringify(canonicalizeMcpEntry(entry) ?? null)).digest('hex');
}

/**
 * 归属四态 + 「磁盘形状与 AIOS 想要形状不一致」的 conflict。
 * `kept-differs` 与 `pending-interactive` 一样是**合法终态**（决策 8），不是待修的错误：
 * 用户手改过的条目归用户，控制台只显示不覆盖。
 */
export function classifyMcpOwnership({ actual, desired, ledgerEntry } = {}) {
  const actualFingerprint = actual ? fingerprintMcpEntry(actual) : '';
  const desiredFingerprint = desired ? fingerprintMcpEntry(desired) : '';
  if (!actual) return { status: 'absent', actualFingerprint, desiredFingerprint };
  if (!ledgerEntry) return { status: 'external', actualFingerprint, desiredFingerprint };
  if (ledgerEntry.fingerprint !== actualFingerprint) {
    return {
      status: 'kept-differs',
      actualFingerprint,
      desiredFingerprint,
      ledgerFingerprint: ledgerEntry.fingerprint,
      reason: 'entry-changed-after-aios-registration',
      origin: ledgerEntry.origin || 'aios',
    };
  }
  if (desiredFingerprint && desiredFingerprint !== actualFingerprint) {
    return { status: 'conflict', actualFingerprint, desiredFingerprint, ledgerFingerprint: ledgerEntry.fingerprint };
  }
  return { status: 'owned', actualFingerprint, desiredFingerprint, origin: ledgerEntry.origin || 'aios' };
}

/** 读账本。文件不存在=空账本；解析失败=空账本但带 `corrupt` 标记，**绝不静默重写**。 */
export async function readMcpLedger(clientId, { readFileImpl = fs.promises.readFile, ...options } = {}) {
  const filePath = resolveMcpLedgerPath(clientId, options);
  let raw;
  try {
    raw = String(await readFileImpl(filePath, 'utf8')).replace(/^﻿/u, '');
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return emptyLedger(clientId);
    throw error;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== MCP_LEDGER_SCHEMA_VERSION || !parsed.entries || typeof parsed.entries !== 'object') {
      return { ...emptyLedger(clientId), missing: false, corrupt: 'schema-version-mismatch' };
    }
    return { schemaVersion: MCP_LEDGER_SCHEMA_VERSION, clientId: String(clientId), entries: parsed.entries, missing: false, corrupt: '' };
  } catch (error) {
    return { ...emptyLedger(clientId), missing: false, corrupt: `unparsable: ${error.message}` };
  }
}

function sanitizeRecord(record) {
  return {
    scope: String(record.scope || ''),
    serverName: String(record.serverName || ''),
    origin: record.origin === 'adopted' ? 'adopted' : 'aios',
    fingerprint: String(record.fingerprint || ''),
    configPath: String(record.configPath || ''),
    entryPath: String(record.entryPath || ''),
    format: String(record.format || ''),
    bucketCreated: record.bucketCreated === true,
    createdAt: record.createdAt || null,
    lastVerifiedAt: record.lastVerifiedAt || null,
    note: String(record.note || ''),
  };
}

/**
 * 写账本：整份覆盖（条目少，且覆盖比增量合并更容易审计）。失败即抛，由策略层回滚配置。
 * `writeImpl` 是可注入的落盘替身（沿用本仓 `readFileImpl` / `io` 那套接缝做法），
 * 测试靠它走「配置已写、账本写失败」这条回滚分支——那不是变态输入，磁盘满和只读挂载每天都发生。
 */
export async function writeMcpLedger(clientId, ledger, options = {}) {
  const filePath = resolveMcpLedgerPath(clientId, options);
  const entries = {};
  for (const [key, record] of Object.entries(ledger?.entries || {})) entries[key] = sanitizeRecord(record);
  const writeImpl = options.writeImpl || writeFileAtomic;
  await writeImpl(filePath, `${JSON.stringify({ schemaVersion: MCP_LEDGER_SCHEMA_VERSION, clientId: String(clientId), entries }, null, 2)}\n`);
  return filePath;
}

export async function readOwnershipRecord({ clientId, scope, serverName }, options = {}) {
  const ledger = await readMcpLedger(clientId, options);
  return { ledger, record: ledger.entries[ledgerKeyFor(scope, serverName)] || null };
}

/** 记一条归属。`origin:'adopted'` 表示这是接管别人的条目，指纹取接管时磁盘上的那份。 */
export async function recordOwnership({ clientId, scope, serverName, entry, configPath, landing, origin = 'aios', bucketCreated = false, note = '' }, options = {}) {
  const ledger = await readMcpLedger(clientId, options);
  const now = new Date().toISOString();
  const key = ledgerKeyFor(scope, serverName);
  const previous = ledger.entries[key];
  ledger.entries[key] = sanitizeRecord({
    scope,
    serverName,
    origin,
    fingerprint: fingerprintMcpEntry(entry),
    configPath,
    entryPath: landing?.entryPath || '',
    format: landing?.format || '',
    bucketCreated: bucketCreated === true || previous?.bucketCreated === true,
    createdAt: previous?.createdAt || now,
    lastVerifiedAt: now,
    note,
  });
  ledger.corrupt = '';
  ledger.missing = false;
  const filePath = await writeMcpLedger(clientId, ledger, options);
  return { record: ledger.entries[key], ledgerPath: filePath, recoveredFromCorrupt: Boolean(previous === null && options.recoveredFromCorrupt) };
}

/** 放一条归属：AIOS 不再声称拥有它，条目变回 external（不删配置里的条目）。 */
export async function releaseOwnership({ clientId, scope, serverName }, options = {}) {
  const ledger = await readMcpLedger(clientId, options);
  const key = ledgerKeyFor(scope, serverName);
  if (!ledger.entries[key]) return { released: false, reason: 'no-ownership-record' };
  delete ledger.entries[key];
  const filePath = await writeMcpLedger(clientId, ledger, options);
  return { released: true, ledgerPath: filePath };
}

/** 核验用：刷新 `lastVerifiedAt`，并把本次看到的指纹记下来（doctor/对象表状态列读它）。 */
export async function touchVerified({ clientId, scope, serverName, fingerprint }, options = {}) {
  const ledger = await readMcpLedger(clientId, options);
  const key = ledgerKeyFor(scope, serverName);
  if (!ledger.entries[key]) return { updated: false, reason: 'no-ownership-record' };
  ledger.entries[key] = { ...ledger.entries[key], lastVerifiedAt: new Date().toISOString(), fingerprint: fingerprint || ledger.entries[key].fingerprint };
  await writeMcpLedger(clientId, ledger, options);
  return { updated: true };
}
