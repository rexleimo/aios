// scripts/lib/clients/mcp/server-writer.mjs — MCP 落点的通用写入门（w2）。
//
// 三层分工，谁都不越界：
//   · `landing-schema.mjs`        回答「这个 (client, scope) 的桶在哪、哪些字段允许、能不能写」；
//   · `formats/*-editor.mjs`      回答「怎么在不动其余字节的前提下增删一个条目」（json/toml/yaml 三种文本手术）；
//   · 本文件把两者接起来，并保证四件事：白名单先过、`--dry-run` 真的不写盘、写盘前留原文备份、
//     **卸掉自己装的条目后文件其余字节与安装前逐字节相同**（ADR 0008 验收 2）。
//
// 为什么要文本手术而不是 `JSON.parse → 改 → stringify`：现成的 `writeJsonConfig` 整份
// `JSON.stringify(parsed, null, 2)` 重排（`codemap/targets/mcp-targets/json.mjs:38`），
// 会把别人手写的条目换行、缩进、键序全改掉——那是以「管理」为名的格式化破坏。
// YAML 族用 `yaml` 的 Document API（未改动节点保留原风格），TOML 族走行定位，同理。
//
// 还没接的落点如实返回 `format-not-wired`：只有 `format: 'none'` 这类没有文本形态的声明会走到这里，
// 状态是机器可读的，不是注释里的自述——ADR 0008 不许把未验证的落点标绿。
// 归属判定（谁的名字允许删）是 w3 账本的职责，本层只提供机械能力，不做所有权裁断。
// 每客户端的字段归一化（gemini 的 startupTimeoutSec→timeout、zcode 的丢条目策略）属于 w5 收编时
// 从各家私有写入器带上来的策略，本层只按 `landing-schema` 的白名单拒绝越界字段。
import fs from 'node:fs';
import path from 'node:path';

import { isDeepStrictEqual } from 'node:util';

import { writeFileAtomic } from '../../environment/fs/atomic-write.mjs';
import { assertEntryAllowed, resolveLanding } from './landing-schema.mjs';
import { familyFor, listFormatFamilies } from './formats/families.mjs';

export function landingFile(landing, { clientHome = '', projectRoot = '' } = {}) {
  if (landing.scope === 'project') {
    if (!projectRoot) throw new Error('project landing needs projectRoot');
    return path.join(projectRoot, landing.file);
  }
  if (!clientHome) throw new Error('home landing needs clientHome');
  return path.join(clientHome, landing.file);
}

function notWired(landing, action) {
  return {
    status: 'format-not-wired',
    reason: `landing-format-not-wired:${landing.format}`,
    clientId: landing.clientId,
    scope: landing.scope,
    action,
    wiredFormats: listFormatFamilies(),
  };
}

/** 落点解析 + 家族判定 + 白名单门禁，一次做完，失败即返回机器可读理由。 */
function gate({ clientId, scope, entry, action, targets }) {
  const landing = resolveLanding(clientId, scope, { targets });
  const family = familyFor(landing);
  if (!family) return { ok: false, notWired: notWired(landing, action), landing };
  if (!landing.writable) return { ok: false, landing, verdict: { reason: 'landing-not-writable', unknownFields: [], missingFields: [] } };
  if (entry) {
    const verdict = assertEntryAllowed(clientId, scope, entry, { targets });
    if (!verdict.ok) return { ok: false, landing, verdict };
  }
  return { ok: true, landing, family };
}

function describe(landing, extra = {}) {
  return {
    clientId: landing.clientId,
    scope: landing.scope,
    format: landing.format,
    entryPath: landing.entryPath,
    ...extra,
  };
}

/** 只读：列出桶里的条目名与值，用于状态显示与指纹比对。不碰磁盘之外的任何东西。 */
export function readServers({ clientId, scope, filePath, targets }) {
  const gated = gate({ clientId, scope, entry: null, action: 'read', targets });
  if (!gated.ok) return gated.notWired || { status: 'rejected', reason: gated.verdict.reason, ...describe(gated.landing) };
  if (!fs.existsSync(filePath)) return { status: 'absent', entries: {}, ...describe(gated.landing) };
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return { status: 'error', reason: `read-failed: ${error.message}`, ...describe(gated.landing) };
  }
  try {
    const { found, entries } = gated.family.read(raw, gated.landing.entryPath.split('.'));
    return { status: 'ok', bucketFound: found, entries, rawBytes: raw.length, ...describe(gated.landing) };
  } catch (error) {
    return { status: 'error', reason: error.message, ...describe(gated.landing) };
  }
}

/**
 * 文本级 upsert（**纯函数**，不碰磁盘）：缺则插、同则 unchanged、异则按 mode 处理。
 * `mode: 'insert'` 是「同名不同值即 conflict」（安装语义）；`mode: 'upsert'` 是同名不同值就原地替换
 * （`doctor --fix` / 迁移语义）。插入时同时消费落点的桶外根键声明。
 */
function planUpsertOnText({ family, landing, entryPath, raw, exists, serverName, entry, mode = 'insert' }) {
  let current;
  try {
    current = exists ? family.read(raw, entryPath) : { entries: {} };
  } catch (error) {
    return { status: 'rejected', reason: `landing-unparsable: ${error.message}` };
  }
  if (Object.prototype.hasOwnProperty.call(current.entries, serverName)) {
    if (isDeepStrictEqual(current.entries[serverName], entry)) return { status: 'unchanged' };
    if (mode === 'insert') return { status: 'conflict', reason: 'entry-exists-differs', serverName };
    try {
      return { status: 'upserted', text: family.replace(raw, entryPath, serverName, entry).text };
    } catch (error) {
      return { status: 'rejected', reason: `replace-failed: ${error.message}` };
    }
  }

  let text;
  let createdBucket = false;
  let createdRootKeys = [];
  try {
    const inserted = family.insert(raw, entryPath, serverName, entry);
    text = inserted.text;
    createdBucket = Boolean(inserted.createdBucket);
    // 桶外根键：`landing.requiresRootKeys` 真的被消费（w1 只声明、只有测试引用它）。
    // 缺了且补表给了 `createWith` → 补上并回报 provenance；缺了又没默认值 → 拒，不猜一个值写进别人的配置。
    if (landing && landing.requiresRootKeys && landing.requiresRootKeys.length > 0) {
      if (!family.rootKeys) {
        return { status: 'rejected', reason: `root-keys-unsupported-family:${landing.format}` };
      }
      const ensured = family.rootKeys.ensure(text, landing.requiresRootKeys);
      text = ensured.text;
      createdRootKeys = ensured.filled;
      const stillMissing = landing.requiresRootKeys
        .filter((key) => !family.rootKeys.has(text, key.path))
        .map((key) => key.path);
      if (stillMissing.length > 0) {
        return { status: 'rejected', reason: 'root-keys-missing', missingRootKeys: stillMissing };
      }
    }
  } catch (error) {
    return { status: 'rejected', reason: `insert-failed: ${error.message}` };
  }
  // 落盘前必过：家族自己负责把新文本再解析一遍（json/yaml 解析失败即抛），条目必须在桶里。
  try {
    if (!family.validate(text, entryPath, serverName)) return { status: 'rejected', reason: 'post-write-verify-failed' };
    if (family.parseable) family.parseable(text);
  } catch (error) {
    return { status: 'rejected', reason: `post-write-invalid: ${error.message}` };
  }
  return { status: 'inserted', text, createdBucket, createdRootKeys };
}

/** 文本级移除（**纯函数**）：只有真删掉了才返回新文本，其余字节必须原样。 */
function planRemoveOnText({ family, landing, entryPath, raw, serverName, dropEmptyBucket = false, dropRootKeyPaths = [], rootKeyValues = {} }) {
  let result;
  try {
    result = family.remove(raw, entryPath, serverName);
  } catch (error) {
    return { status: 'rejected', reason: `remove-failed: ${error.message}` };
  }
  if (!result.changed) return { status: 'not-found', reason: result.reason };
  let text = result.text;
  let residue = result.residue || '';
  // 空桶是卸载后被我们掏空的外壳。只有调用方授权（账本证明桶由 AIOS 创建 / 迁移路径的显式声明）
  // 才连桶一起收掉，否则保留并如实报 `empty-bucket`——删别人写过的键不属于「卸掉我装的东西」。
  if (residue === 'empty-bucket' && dropEmptyBucket) {
    const dropped = family.remove(text, entryPath.slice(0, -1), entryPath[entryPath.length - 1]);
    if (dropped.changed) {
      text = dropped.text;
      residue = '';
    }
  }
  // 本次卸载还要带走「当初由 AIOS 补的桶外根键」——前提是调用方证明是它建的、且值仍是当初那个默认值。
  // 放在桶处理之后：桶里最后一条被收掉时文本才定型，根键的删除不该早于它。
  let droppedRootKeys = [];
  if (dropRootKeyPaths.length > 0) {
    if (!family.rootKeys) return { status: 'rejected', reason: `root-keys-unsupported-family:${landing?.format || ''}` };
    const dropped = family.rootKeys.drop(text, dropRootKeyPaths, rootKeyValues);
    text = dropped.text;
    droppedRootKeys = dropped.dropped;
  }
  try {
    if (family.parseable) family.parseable(text);
    const after = family.read(text, entryPath);
    if (Object.prototype.hasOwnProperty.call(after.entries, serverName)) {
      return { status: 'rejected', reason: 'post-remove-still-present' };
    }
  } catch (error) {
    return { status: 'rejected', reason: `post-remove-invalid: ${error.message}` };
  }
  return { status: 'removed', text, residue, droppedRootKeys };
}

/**
 * **先算后写**：把一组编辑作用在文本上，返回最终文本与逐条结果，**绝不碰磁盘**。
 *
 * 为什么需要这一层：browser 家族（`browser/mcp/formats/*`）与它的 `applyMcpConfigMigration` 是
 * 「先算 → 汇总 created/updated/unchanged/errors → 再写一次」的两段式契约：算的时候要知道整份文本
 * 长什么样，写的时候只写一次（多条目落到同一个文件时不产生中间态）。把写盘塞进计算里就会毁掉这条契约。
 *
 * `shape` 显式给出时用它（`{format, entryPath, allowedFields, requiresRootKeys}`），否则由
 * `(clientId, scope)` 从落点表解析。两者都没有 → 拒绝：未知落点绝不当 JSON 写。
 * `allowedFields` 为 `null` 表示调用方自己就是白名单的 owner（迁移写入器按自己的 builder 构造条目）。
 */
export function planServerEdits({ clientId, scope, filePath, edits = [], shape = null, targets } = {}) {
  let resolved = shape;
  if (!resolved) {
    if (!clientId || !scope) return { status: 'rejected', reason: 'landing-shape-missing' };
    try {
      const landing = resolveLanding(clientId, scope, { targets });
      resolved = {
        format: landing.format,
        entryPath: landing.entryPath,
        allowedFields: landing.allowedFields,
        requiresRootKeys: landing.requiresRootKeys,
        createIfMissing: landing.createIfMissing,
      };
    } catch (error) {
      return { status: 'rejected', reason: `landing-unresolved: ${error.message}` };
    }
  }
  const family = familyFor({ format: resolved.format });
  if (!family) return { status: 'rejected', reason: `landing-format-not-wired:${resolved.format}` };
  const entryPath = String(resolved.entryPath).split('.');

  const exists = fs.existsSync(filePath);
  if (!exists && resolved.createIfMissing === false) {
    return { status: 'rejected', reason: 'landing-file-missing', filePath };
  }
  const originalText = exists ? fs.readFileSync(filePath, 'utf8') : '';
  let text = originalText;
  let hasText = exists;
  const outcomes = [];
  let createdBucket = false;
  const createdRootKeys = [];

  for (const edit of edits) {
    if (edit.action === 'ensure-root-keys') {
      // 只补齐「缺了且声明了默认值」的桶外根键，已存在的值一概不碰（与 CLI / 迁移写入器同一条规则）。
      // 单独成一个编辑动作，是因为它必须在**不插入任何条目**的轮次也能生效：
      // 旧的 opencode 写入器每趟都保证 mcp_timeout 在，哪怕三个条目全 unchanged。
      const keys = edit.keys || resolved.requiresRootKeys || [];
      if (keys.length === 0) continue;
      if (!family.rootKeys) return { status: 'rejected', reason: 'root-keys-unsupported-family:' + resolved.format, outcomes };
      const ensured = family.rootKeys.ensure(text, keys);
      text = ensured.text;
      hasText = true;
      createdRootKeys.push(...ensured.filled);
      outcomes.push({ action: 'ensure-root-keys', status: ensured.filled.length ? 'inserted' : 'unchanged', filled: ensured.filled });
      const missing = keys.filter((key) => !family.rootKeys.has(text, key.path)).map((key) => key.path);
      if (missing.length > 0) return { status: 'rejected', reason: 'root-keys-missing', missingRootKeys: missing, outcomes };
      continue;
    }
    if (edit.action === 'remove') {
      const planned = planRemoveOnText({
        family, landing: resolved, entryPath, raw: text, serverName: edit.serverName,
        dropEmptyBucket: edit.dropEmptyBucket === true, dropRootKeyPaths: edit.dropRootKeys || [], rootKeyValues: edit.rootKeyValues || {},
      });
      outcomes.push({ action: 'remove', serverName: edit.serverName, status: planned.status });
      if (planned.status === 'rejected') return { status: 'rejected', reason: planned.reason, outcomes };
      if (planned.status === 'removed') { text = planned.text; hasText = true; }
      continue;
    }
    if (resolved.allowedFields && edit.entry && typeof edit.entry === 'object') {
      const unknown = Object.keys(edit.entry).filter((key) => !resolved.allowedFields.includes(key));
      if (unknown.length > 0) return { status: 'rejected', reason: 'unknown-field', unknownFields: unknown, outcomes };
    }
    const planned = planUpsertOnText({
      family, landing: resolved, entryPath, raw: text, exists: hasText,
      serverName: edit.serverName, entry: edit.entry, mode: edit.mode || 'upsert',
    });
    outcomes.push({ action: 'upsert', serverName: edit.serverName, status: planned.status });
    if (planned.status === 'rejected') return { status: 'rejected', reason: planned.reason, outcomes };
    if (planned.status === 'conflict') return { status: 'rejected', reason: planned.reason, outcomes };
    if (planned.status === 'inserted' || planned.status === 'upserted') {
      text = planned.text;
      hasText = true;
      if (planned.createdBucket) createdBucket = true;
      createdRootKeys.push(...(planned.createdRootKeys || []));
    }
  }
  // 「算完发现字节没变」就是 unchanged——不按“有没有执行过编辑”判：
  // remove + insert 同一段（浏览器 TOML 的 upsert 就是这么做）会把文本恢复原样，那不算改动。
  const changed = text !== originalText;
  return { status: changed ? 'planned' : 'unchanged', text, outcomes, createdBucket, createdRootKeys, changed };
}

/**
 * 安装一个条目。`dryRun: true` 时**保证不落盘**（测试同时断言 mtime 与原文）。
 * 同名条目已存在且形状相同 → `unchanged`（幂等）；形状不同 → `conflict`（等 w3 的归属裁断，不覆盖）。
 * 写盘只是「先算后写」的后半段：计算全在 `planUpsertOnText`，本函数负责备份与原子写。
 */
export async function writeServer({ clientId, scope, serverName, entry, filePath, dryRun = false, backupDir = '', targets } = {}) {
  const gated = gate({ clientId, scope, entry, action: 'write', targets });
  if (!gated.ok) {
    if (gated.notWired) return gated.notWired;
    return {
      status: 'rejected',
      reason: gated.verdict.reason,
      unknownFields: gated.verdict.unknownFields,
      missingFields: gated.verdict.missingFields,
      ...describe(gated.landing),
    };
  }
  const { landing, family } = gated;
  const entryPath = landing.entryPath.split('.');
  const exists = fs.existsSync(filePath);
  if (!exists && !landing.createIfMissing) {
    return { status: 'rejected', reason: 'landing-file-missing', filePath, ...describe(landing) };
  }
  const raw = exists ? fs.readFileSync(filePath, 'utf8') : '';
  const planned = planUpsertOnText({ family, landing, entryPath, raw, exists, serverName, entry, mode: 'insert' });
  if (planned.status === 'unchanged') return { status: 'unchanged', dryRun, ...describe(landing) };
  if (planned.status === 'conflict') return { status: 'conflict', reason: planned.reason, serverName, ...describe(landing) };
  if (planned.status !== 'inserted') {
    return { status: 'rejected', reason: planned.reason, missingRootKeys: planned.missingRootKeys, ...describe(landing) };
  }
  if (dryRun) {
    return { status: 'planned', serverName, bytes: planned.text.length, createdBucket: planned.createdBucket, createdRootKeys: planned.createdRootKeys, ...describe(landing) };
  }
  const backupPath = exists ? await backupOriginal(filePath, raw, backupDir) : '';
  if (!exists) await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await writeFileAtomic(filePath, planned.text);
  // `createdBucket` 回传给调用方：w3 账本据此决定卸载最后一条时能不能连桶一起收掉。
  // `createdRootKeys` 同理——本次补的桶外根键（opencode 的 `experimental.mcp_timeout`）也要有 provenance，
  // 否则「卸载回到原字节」这条门在一个原本没有 `experimental` 的文件上永远过不去。
  return { status: exists ? 'updated' : 'created', serverName, backupPath, createdBucket: planned.createdBucket, createdRootKeys: planned.createdRootKeys, ...describe(landing) };
}

/**
 * 原地替换一个已存在的条目（非托管字节不动、条目留在原位置）。
 * 与 `writeServer` 的区别只有一件事：同名不同形状时它是**替换**而不是 `conflict`。
 * 因此「谁允许被替换」不能由本层裁断——`install-policy` 先做完归属判定（只覆盖 AIOS 登记过的
 * `kept-differs`/`conflict` + `restore`），才允许走到这里。条目不存在即 `not-found`，不顺手插入。
 */
export async function replaceServer({ clientId, scope, serverName, entry, filePath, dryRun = false, backupDir = '', targets } = {}) {
  const gated = gate({ clientId, scope, entry, action: 'replace', targets });
  if (!gated.ok) {
    if (gated.notWired) return gated.notWired;
    return { status: 'rejected', reason: gated.verdict.reason, unknownFields: gated.verdict.unknownFields, missingFields: gated.verdict.missingFields, ...describe(gated.landing) };
  }
  const { landing, family } = gated;
  const entryPath = landing.entryPath.split('.');
  if (!fs.existsSync(filePath)) return { status: 'absent', serverName, ...describe(landing) };
  const raw = fs.readFileSync(filePath, 'utf8');
  let current;
  try {
    current = family.read(raw, entryPath);
  } catch (error) {
    return { status: 'rejected', reason: `landing-unparsable: ${error.message}`, ...describe(landing) };
  }
  if (!Object.prototype.hasOwnProperty.call(current.entries, serverName)) {
    return { status: 'not-found', reason: 'entry-not-found', serverName, ...describe(landing) };
  }
  if (isDeepStrictEqual(current.entries[serverName], entry)) return { status: 'unchanged', dryRun, ...describe(landing) };
  let text;
  try {
    text = family.replace(raw, entryPath, serverName, entry).text;
  } catch (error) {
    return { status: 'rejected', reason: `replace-failed: ${error.message}`, ...describe(landing) };
  }
  try {
    if (!family.validate(text, entryPath, serverName)) {
      return { status: 'rejected', reason: 'post-write-verify-failed', ...describe(landing) };
    }
    family.parseable(text);
  } catch (error) {
    return { status: 'rejected', reason: `post-write-invalid: ${error.message}`, ...describe(landing) };
  }
  if (dryRun) return { status: 'planned', serverName, bytes: text.length, ...describe(landing) };
  const backupPath = await backupOriginal(filePath, raw, backupDir);
  await writeFileAtomic(filePath, text);
  return { status: 'replaced', serverName, backupPath, ...describe(landing) };
}

/** 卸载一个条目：只有真删掉了才落盘，其余字节必须原样。 */
export async function removeServer({ clientId, scope, serverName, filePath, dryRun = false, backupDir = '', dropEmptyBucket = false, dropRootKeys: dropRootKeyPaths = [], rootKeyValues = {}, targets } = {}) {
  const gated = gate({ clientId, scope, entry: null, action: 'remove', targets });
  if (!gated.ok) return gated.notWired || { status: 'rejected', reason: gated.verdict.reason, ...describe(gated.landing) };
  const { landing, family } = gated;
  const entryPath = landing.entryPath.split('.');
  if (!fs.existsSync(filePath)) return { status: 'absent', serverName, ...describe(landing) };
  const raw = fs.readFileSync(filePath, 'utf8');
  const planned = planRemoveOnText({ family, landing, entryPath, raw, serverName, dropEmptyBucket, dropRootKeyPaths, rootKeyValues });
  if (planned.status === 'not-found') return { status: 'not-found', reason: planned.reason, serverName, ...describe(landing) };
  if (planned.status !== 'removed') return { status: 'rejected', reason: planned.reason, ...describe(landing) };
  if (dryRun) return { status: 'planned', serverName, residue: planned.residue, droppedRootKeys: planned.droppedRootKeys, ...describe(landing) };
  const backupPath = await backupOriginal(filePath, raw, backupDir);
  await writeFileAtomic(filePath, planned.text);
  return { status: 'removed', serverName, backupPath, residue: planned.residue, droppedRootKeys: planned.droppedRootKeys, ...describe(landing) };
}
/** 备份沿用既有纪律：原文整份留底，回滚是文件复制而不是凭记忆重建。 */
async function backupOriginal(filePath, raw, backupDir) {
  const dir = backupDir || path.join(path.dirname(filePath), '.aios-config-backups');
  await fs.promises.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const backupPath = path.join(dir, `${path.basename(filePath)}.${stamp}.bak`);
  await fs.promises.writeFile(backupPath, raw, 'utf8');
  return backupPath;
}
