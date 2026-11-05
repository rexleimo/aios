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
import { insertEntry, readBucketEntries, removeEntry } from './formats/json-editor.mjs';
import { insertTomlEntry, readTomlEntries, removeTomlEntry } from './formats/toml-editor.mjs';
import { insertYamlEntry, readYamlEntries, removeYamlEntry } from './formats/yaml-editor.mjs';

/** 声明表的 format → 文本手术家族。JSON 的四种方言共用同一把手术刀，差别只在白名单与归一化。 */
const FORMAT_FAMILY = Object.freeze({
  json: 'json',
  'gemini-json': 'json',
  'zcode-json': 'json',
  'opencode-json': 'json',
  toml: 'toml',
  yaml: 'yaml',
});

const FAMILIES = Object.freeze({
  json: {
    read(raw, entryPath) {
      // 整份可解析是动手的前提：不合法就抛，调用方拒绝写——绝不基于半截理解去改别人的文本。
      JSON.parse(raw);
      const bucket = readBucketEntries(raw, entryPath);
      const entries = {};
      for (const [name, record] of Object.entries(bucket.entries)) {
        try {
          entries[name] = JSON.parse(record.raw);
        } catch {
          entries[name] = null; // 读不回即 null，交给 conflict 判定，绝不猜
        }
      }
      return { found: bucket.found, entries };
    },
    insert(raw, entryPath, name, entry) {
      return insertEntry(raw || '{}\n', entryPath, name, entry);
    },
    remove(raw, entryPath, name) {
      return removeEntry(raw, entryPath, name);
    },
    validate(text, entryPath, name) {
      const parsed = JSON.parse(text);
      const bucket = entryPath.reduce((node, segment) => (node == null ? node : node[segment]), parsed);
      return Boolean(bucket) && Object.prototype.hasOwnProperty.call(bucket, name);
    },
    parseable(text) {
      JSON.parse(text);
      return true;
    },
  },
  toml: {
    read(raw, entryPath) {
      return readTomlEntries(raw, entryPath);
    },
    insert(raw, entryPath, name, entry) {
      return insertTomlEntry(raw, entryPath, name, entry);
    },
    remove(raw, entryPath, name) {
      return removeTomlEntry(raw, entryPath, name);
    },
    validate(text, entryPath, name) {
      return Object.prototype.hasOwnProperty.call(readTomlEntries(text, entryPath).entries, name);
    },
    parseable() {
      // TOML 这层没有整份 parser：读写都走行定位，删除后由 readTomlEntries 复核条目确实消失。
      return true;
    },
  },
  yaml: {
    read(raw, entryPath) {
      return readYamlEntries(raw, entryPath);
    },
    insert(raw, entryPath, name, entry) {
      return insertYamlEntry(raw, entryPath, name, entry);
    },
    remove(raw, entryPath, name) {
      return removeYamlEntry(raw, entryPath, name);
    },
    validate(text, entryPath, name) {
      return Object.prototype.hasOwnProperty.call(readYamlEntries(text, entryPath).entries, name);
    },
    parseable(text) {
      // `yaml` 解析失败会抛，正是我们要的拒绝信号。
      readYamlEntries(text, ['__rex_absent_probe__']);
      return true;
    },
  },
});

function familyFor(landing) {
  const key = FORMAT_FAMILY[landing.format];
  return key ? FAMILIES[key] : null;
}

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
    wiredFormats: Object.keys(FORMAT_FAMILY),
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
 * 安装一个条目。`dryRun: true` 时**保证不落盘**（测试同时断言 mtime 与原文）。
 * 同名条目已存在且形状相同 → `unchanged`（幂等）；形状不同 → `conflict`（等 w3 的归属裁断，不覆盖）。
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
  const raw = exists ? fs.readFileSync(filePath, 'utf8') : '';

  let current;
  try {
    current = exists ? family.read(raw, entryPath) : { entries: {} };
  } catch (error) {
    return { status: 'rejected', reason: `landing-unparsable: ${error.message}`, ...describe(landing) };
  }
  if (Object.prototype.hasOwnProperty.call(current.entries, serverName)) {
    if (isDeepStrictEqual(current.entries[serverName], entry)) return { status: 'unchanged', dryRun, ...describe(landing) };
    return { status: 'conflict', reason: 'entry-exists-differs', serverName, ...describe(landing) };
  }

  let text;
  let createdBucket = false;
  try {
    const inserted = family.insert(raw, entryPath, serverName, entry);
    text = inserted.text;
    createdBucket = Boolean(inserted.createdBucket);
  } catch (error) {
    return { status: 'rejected', reason: `insert-failed: ${error.message}`, ...describe(landing) };
  }
  // 落盘前必过：家族自己负责把新文本再解析一遍（json/yaml 解析失败即抛），条目必须在桶里。
  try {
    if (!family.validate(text, entryPath, serverName)) {
      return { status: 'rejected', reason: 'post-write-verify-failed', ...describe(landing) };
    }
  } catch (error) {
    return { status: 'rejected', reason: `post-write-invalid: ${error.message}`, ...describe(landing) };
  }

  if (dryRun) return { status: 'planned', serverName, bytes: text.length, createdBucket, ...describe(landing) };
  const backupPath = exists ? await backupOriginal(filePath, raw, backupDir) : '';
  await writeFileAtomic(filePath, text);
  // `createdBucket` 回传给调用方：w3 账本据此决定卸载最后一条时能不能连桶一起收掉。
  return { status: exists ? 'updated' : 'created', serverName, backupPath, createdBucket, ...describe(landing) };
}

/** 卸载一个条目：只有真删掉了才落盘，其余字节必须原样。 */
export async function removeServer({ clientId, scope, serverName, filePath, dryRun = false, backupDir = '', dropEmptyBucket = false, targets } = {}) {
  const gated = gate({ clientId, scope, entry: null, action: 'remove', targets });
  if (!gated.ok) return gated.notWired || { status: 'rejected', reason: gated.verdict.reason, ...describe(gated.landing) };
  const { landing, family } = gated;
  const entryPath = landing.entryPath.split('.');
  if (!fs.existsSync(filePath)) return { status: 'absent', serverName, ...describe(landing) };
  const raw = fs.readFileSync(filePath, 'utf8');
  let result;
  try {
    result = family.remove(raw, entryPath, serverName);
  } catch (error) {
    return { status: 'rejected', reason: `remove-failed: ${error.message}`, ...describe(landing) };
  }
  if (!result.changed) return { status: 'not-found', reason: result.reason, serverName, ...describe(landing) };
  let text = result.text;
  let residue = result.residue || '';
  // 空桶是卸载后被我们掏空的外壳。只有调用方授权（w3 账本证明桶由 AIOS 创建）才连桶一起收掉，
  // 否则保留并如实报 `empty-bucket`——删别人写过的键不属于「卸掉我装的东西」。
  if (residue === 'empty-bucket' && dropEmptyBucket) {
    const dropped = family.remove(text, entryPath.slice(0, -1), entryPath[entryPath.length - 1]);
    if (dropped.changed) {
      text = dropped.text;
      residue = '';
    }
  }
  try {
    family.parseable(text);
    const after = family.read(text, entryPath);
    if (Object.prototype.hasOwnProperty.call(after.entries, serverName)) {
      return { status: 'rejected', reason: 'post-remove-still-present', ...describe(landing) };
    }
  } catch (error) {
    return { status: 'rejected', reason: `post-remove-invalid: ${error.message}`, ...describe(landing) };
  }
  if (dryRun) return { status: 'planned', serverName, residue, ...describe(landing) };
  const backupPath = await backupOriginal(filePath, raw, backupDir);
  await writeFileAtomic(filePath, text);
  return { status: 'removed', serverName, backupPath, residue, ...describe(landing) };
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
