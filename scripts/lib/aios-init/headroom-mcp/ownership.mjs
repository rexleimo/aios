import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeFileAtomic } from '../../fs/atomic-write.mjs';

const ALLOWED_ENV = Object.freeze(['HEADROOM_MCP_CLIENT', 'HEADROOM_MCP_READ']);

export function normalizeHeadroomEntry(entry) {
  if (!entry) return null;
  return {
    command: String(entry.command || ''),
    args: Array.isArray(entry.args) ? entry.args.map(String) : [],
    env: Object.fromEntries(
      ALLOWED_ENV
        .filter((key) => entry.env?.[key] != null)
        .map((key) => [key, String(entry.env[key])]),
    ),
  };
}

export function fingerprintHeadroomEntry(entry) {
  return createHash('sha256').update(JSON.stringify(normalizeHeadroomEntry(entry))).digest('hex');
}

export function classifyHeadroomOwnership({ actual, desired, ledgerEntry } = {}) {
  if (!actual) return { status: 'absent' };
  const actualFingerprint = fingerprintHeadroomEntry(actual);
  const desiredFingerprint = fingerprintHeadroomEntry(desired);
  if (actualFingerprint !== desiredFingerprint) return { status: 'conflict', actualFingerprint, desiredFingerprint };
  if (!ledgerEntry || ledgerEntry.fingerprint !== actualFingerprint) return { status: 'external', actualFingerprint };
  return { status: 'owned', actualFingerprint };
}

export function resolveHeadroomLedgerPath({ env = process.env, homeDir = os.homedir() } = {}) {
  const stateHome = env.AIOS_HOME && path.isAbsolute(env.AIOS_HOME) ? env.AIOS_HOME : path.join(homeDir, '.aios');
  return path.join(stateHome, 'integrations', 'headroom-mcp.json');
}

export async function readHeadroomLedger(options = {}) {
  try {
    const parsed = JSON.parse(await readFile(resolveHeadroomLedgerPath(options), 'utf8'));
    return parsed?.schemaVersion === 1 && parsed.entries && typeof parsed.entries === 'object'
      ? parsed
      : { schemaVersion: 1, entries: {} };
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return { schemaVersion: 1, entries: {} };
    throw error;
  }
}

export async function writeHeadroomLedger(ledger, options = {}) {
  const sanitized = { schemaVersion: 1, entries: {} };
  for (const [runtimeId, entry] of Object.entries(ledger.entries || {})) {
    sanitized.entries[runtimeId] = {
      runtimeId,
      serverName: 'headroom',
      scope: 'user',
      profile: entry.profile || null,
      configPath: entry.configPath,
      command: String(entry.command || ''),
      args: ['mcp', 'serve'],
      env: { HEADROOM_MCP_CLIENT: runtimeId, HEADROOM_MCP_READ: 'off' },
      fingerprint: entry.fingerprint,
      createdAt: entry.createdAt,
      lastVerifiedAt: entry.lastVerifiedAt,
    };
  }
  await writeFileAtomic(resolveHeadroomLedgerPath(options), `${JSON.stringify(sanitized, null, 2)}\n`);
}
