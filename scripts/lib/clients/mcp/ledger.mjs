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

import { readFileSnapshot, writeFileChecked } from '../../environment/fs/checked-atomic-write.mjs';

export const MCP_LEDGER_SCHEMA_VERSION = 1;
// Keep exact read bytes out of projected/serialized ownership records.
const snapshots = new WeakMap();

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

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function validOwnershipRecord(record) {
  if (!isRecord(record) || typeof record.fingerprint !== 'string' || !/^[a-f0-9]{64}$/u.test(record.fingerprint)) return false;
  const strings = ['scope', 'serverName', 'configPath', 'entryPath', 'format', 'note'];
  return strings.every((key) => record[key] === undefined || typeof record[key] === 'string')
    && (record.origin === undefined || ['aios', 'adopted'].includes(record.origin))
    && ['createdAt', 'lastVerifiedAt'].every((key) => record[key] == null || typeof record[key] === 'string')
    && (record.bucketCreated === undefined || typeof record.bucketCreated === 'boolean')
    && (record.rootKeysCreated === undefined || (Array.isArray(record.rootKeysCreated) && record.rootKeysCreated.every((key) => typeof key === 'string')))
    && (record.rootKeyValues === undefined || isRecord(record.rootKeyValues));
}

function ledgerProblem(ledger) {
  if (!isRecord(ledger) || ledger.schemaVersion !== MCP_LEDGER_SCHEMA_VERSION) return 'schema-version-mismatch';
  if (!isRecord(ledger.entries)) return 'invalid-entries';
  return Object.values(ledger.entries).every(validOwnershipRecord) ? '' : 'invalid-ownership-record';
}

function decodeLedger(clientId, bytes) {
  if (bytes === null) return emptyLedger(clientId);
  try {
    const parsed = JSON.parse(String(bytes).replace(/^\uFEFF/u, ''));
    const corrupt = ledgerProblem(parsed);
    return { ...emptyLedger(clientId), missing: false, corrupt, entries: corrupt ? {} : parsed.entries };
  } catch (error) {
    return { ...emptyLedger(clientId), missing: false, corrupt: `unparsable: ${error.message}` };
  }
}

function assertWritableLedger(ledger) {
  // A caller clearing the public diagnostic cannot turn an invalid read into ownership.
  if (snapshots.get(ledger)?.corrupt || ledger?.corrupt || ledgerProblem(ledger)) {
    throw Object.assign(new Error('MCP ledger is unreadable or unsupported; preserve it for manual recovery'), { code: 'MCP_LEDGER_INVALID' });
  }
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
  let bytes;
  try {
    bytes = Buffer.from(await readFileImpl(filePath));
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error?.code)) throw error;
    bytes = null;
  }
  const ledger = decodeLedger(String(clientId), bytes);
  snapshots.set(ledger, { filePath, bytes, corrupt: ledger.corrupt });
  return ledger;
}

/**
 * 根键默认值的留底拷贝：值来自补表声明的 `createWith` 常量（不是用户配置里的值），
 * 深拷贝只是防着调用方之后改自己的对象导致账本跟着变。不可序列化即 `undefined`=不记，
 * 宁可不回收那个键，也不把一条读不准的 provenance 写进账本。
 */
function cloneRootKeyValue(value) {
  try {
    return structuredClone(value);
  } catch {
    return undefined;
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
    // 桶外根键的 provenance：`rootKeysCreated` 是本次写入补出来的点路径，`rootKeyValues` 存补进去的那个默认值。
    // 存值的唯一用途是卸载时的「还是不是我写的那个值」判定——值被改过就不回收（那是别人的配置了）。
    // 这里不会放大隐私面：进来的只有补表自己声明的 `createWith` 常量（如 opencode 的 90000），
    // 配置文件的既有值一概不写进账本（`landingFor()` 只取声明，不读文件）。
    rootKeysCreated: Object.freeze((Array.isArray(record.rootKeysCreated) ? record.rootKeysCreated : []).map((key) => String(key))),
    rootKeyValues: Object.freeze(Object.fromEntries(
      Object.entries(record.rootKeyValues || {})
        .filter(([key, value]) => typeof key === 'string' && value !== undefined)
        .map(([key, value]) => [key, cloneRootKeyValue(value)]),
    )),
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
  assertWritableLedger(ledger);
  const filePath = resolveMcpLedgerPath(clientId, options);
  const snapshot = snapshots.get(ledger);
  const original = snapshot?.filePath === filePath ? snapshot.bytes : readFileSnapshot(filePath);
  // Direct saves without a read snapshot must not overwrite an unsupported destination.
  assertWritableLedger(decodeLedger(clientId, original));
  const entries = {};
  for (const [key, record] of Object.entries(ledger?.entries || {})) entries[key] = sanitizeRecord(record);
  const text = `${JSON.stringify({ schemaVersion: MCP_LEDGER_SCHEMA_VERSION, clientId: String(clientId), entries }, null, 2)}\n`;
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  if (options.writeImpl) await options.writeImpl(filePath, text);
  else if (!await writeFileChecked(filePath, text, { original })) {
    throw Object.assign(new Error('MCP ledger changed before save'), { code: 'MCP_LEDGER_CHANGED' });
  }
  snapshots.set(ledger, { filePath, bytes: Buffer.from(text), corrupt: '' });
  return filePath;
}

export async function readOwnershipRecord({ clientId, scope, serverName }, options = {}) {
  const ledger = await readMcpLedger(clientId, options);
  return { ledger, record: ledger.entries[ledgerKeyFor(scope, serverName)] || null };
}

/**
 * 记一条归属。`origin:'adopted'` 表示这是接管别人的条目，指纹取接管时磁盘上的那份。
 * 这里的解构是**白名单**：调用方传了而签名没列的字段会静默消失（`rootKeysCreated` 第一次就踩了这个坑——
 * 写路径报出来的桶外根键一路传到这儿被吃掉，卸载时就没东西可回收了）。加字段必须两处一起加，
 * 下面的用例把「传进来的 provenance 一定落进账本」钉住。
 */
export async function recordOwnership({ clientId, scope, serverName, entry, configPath, landing, origin = 'aios', bucketCreated = false, rootKeysCreated = [], rootKeyValues = {}, note = '' }, options = {}) {
  const ledger = await readMcpLedger(clientId, options);
  assertWritableLedger(ledger);
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
    rootKeysCreated,
    rootKeyValues,
    createdAt: previous?.createdAt || now,
    lastVerifiedAt: now,
    note,
  });
  ledger.missing = false;
  const filePath = await writeMcpLedger(clientId, ledger, options);
  return { record: ledger.entries[key], ledgerPath: filePath, recoveredFromCorrupt: Boolean(previous === null && options.recoveredFromCorrupt) };
}

/** 放一条归属：AIOS 不再声称拥有它，条目变回 external（不删配置里的条目）。 */
export async function releaseOwnership({ clientId, scope, serverName }, options = {}) {
  const ledger = await readMcpLedger(clientId, options);
  assertWritableLedger(ledger);
  const key = ledgerKeyFor(scope, serverName);
  if (!ledger.entries[key]) return { released: false, reason: 'no-ownership-record' };
  delete ledger.entries[key];
  const filePath = await writeMcpLedger(clientId, ledger, options);
  return { released: true, ledgerPath: filePath };
}

/** 核验用：刷新 `lastVerifiedAt`，并把本次看到的指纹记下来（doctor/对象表状态列读它）。 */
export async function touchVerified({ clientId, scope, serverName, fingerprint }, options = {}) {
  const ledger = await readMcpLedger(clientId, options);
  assertWritableLedger(ledger);
  const key = ledgerKeyFor(scope, serverName);
  if (!ledger.entries[key]) return { updated: false, reason: 'no-ownership-record' };
  ledger.entries[key] = { ...ledger.entries[key], lastVerifiedAt: new Date().toISOString(), fingerprint: fingerprint || ledger.entries[key].fingerprint };
  await writeMcpLedger(clientId, ledger, options);
  return { updated: true };
}
