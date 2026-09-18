// scripts/lib/integrations/ledger.mjs — 厂商集成的归属账本。
// 复用 headroom-mcp 的纪律：AIOS 只承认自己写过的条目（指纹一致），
// 用户手改过的条目一律判为 conflict/external，绝不覆盖、绝不删除。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { writeFileAtomic } from '../fs/atomic-write.mjs';

export const INTEGRATION_LEDGER_SCHEMA_VERSION = 1;

export function resolveIntegrationLedgerDir({ env = process.env, homeDir = os.homedir() } = {}) {
  const stateHome = env.AIOS_HOME && path.isAbsolute(env.AIOS_HOME)
    ? env.AIOS_HOME
    : path.join(homeDir, '.aios');
  return path.join(stateHome, 'integrations');
}

export function resolveIntegrationLedgerPath(vendor, options = {}) {
  const key = String(vendor || '').trim().toLowerCase();
  if (!key) throw new Error('integration ledger requires a vendor id');
  return path.join(resolveIntegrationLedgerDir(options), `${key}.json`);
}

function emptyLedger(vendor) {
  return { schemaVersion: INTEGRATION_LEDGER_SCHEMA_VERSION, vendor, entries: {}, skill: null };
}

// 纯函数：把一份 MCP 条目归一化成可比较的指纹形状，屏蔽与归属无关的字段。
export function normalizeMcpEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const normalized = {};
  const url = String(entry.url || '').trim();
  if (url) normalized.url = url;
  const type = String(entry.type || '').trim();
  if (type) normalized.type = type;
  const command = String(entry.command || '').trim();
  if (command) normalized.command = command;
  if (Array.isArray(entry.args)) normalized.args = entry.args.map(String);
  if (entry.env && typeof entry.env === 'object' && !Array.isArray(entry.env)) {
    normalized.env = Object.fromEntries(
      Object.entries(entry.env).map(([key, value]) => [key, String(value)]).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return normalized;
}

export function fingerprintMcpEntry(entry) {
  return createHash('sha256').update(JSON.stringify(normalizeMcpEntry(entry))).digest('hex');
}

// 纯函数：判定当前磁盘条目与 AIOS 期望条目之间的归属关系。
export function classifyIntegrationOwnership({ actual, desired, ledgerEntry } = {}) {
  const actualFingerprint = actual ? fingerprintMcpEntry(actual) : '';
  const desiredFingerprint = desired ? fingerprintMcpEntry(desired) : '';
  if (!actual) return { status: 'absent', actualFingerprint, desiredFingerprint };
  if (desiredFingerprint && actualFingerprint !== desiredFingerprint) {
    return { status: 'conflict', actualFingerprint, desiredFingerprint };
  }
  if (!ledgerEntry || ledgerEntry.fingerprint !== actualFingerprint) {
    return { status: 'external', actualFingerprint, desiredFingerprint };
  }
  return { status: 'owned', actualFingerprint, desiredFingerprint };
}

export function readIntegrationLedger(vendor, { readFileImpl = fs.readFileSync, ...options } = {}) {
  const filePath = resolveIntegrationLedgerPath(vendor, options);
  let raw;
  try {
    raw = String(readFileImpl(filePath, 'utf8')).replace(/^\uFEFF/u, '');
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return emptyLedger(String(vendor));
    throw error;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== INTEGRATION_LEDGER_SCHEMA_VERSION || !parsed.entries || typeof parsed.entries !== 'object') {
      return emptyLedger(String(vendor));
    }
    return { ...emptyLedger(String(vendor)), ...parsed, vendor: String(vendor) };
  } catch {
    return emptyLedger(String(vendor));
  }
}

export async function writeIntegrationLedger(vendor, ledger, options = {}) {
  const filePath = resolveIntegrationLedgerPath(vendor, options);
  const sanitized = {
    schemaVersion: INTEGRATION_LEDGER_SCHEMA_VERSION,
    vendor: String(vendor),
    entries: {},
    skill: ledger.skill || null,
  };
  for (const [client, entry] of Object.entries(ledger.entries || {})) {
    sanitized.entries[client] = {
      client,
      serverName: String(entry.serverName || ''),
      url: String(entry.url || ''),
      transport: String(entry.transport || ''),
      scope: String(entry.scope || ''),
      configPath: String(entry.configPath || ''),
      fingerprint: String(entry.fingerprint || ''),
      unverifiedReason: String(entry.unverifiedReason || ''),
      createdAt: entry.createdAt || null,
      lastVerifiedAt: entry.lastVerifiedAt || null,
    };
  }
  await writeFileAtomic(filePath, `${JSON.stringify(sanitized, null, 2)}\n`);
  return filePath;
}

// 纯函数：账本里是否存在一条"AIOS 写过且未被改动"的技能记录。
export function isSkillOwnedByAios(ledger, { installName, sha256 } = {}) {
  const skill = ledger?.skill;
  if (!skill) return false;
  if (installName && skill.installName !== installName) return false;
  if (sha256 && skill.sha256 !== sha256) return false;
  return true;
}
