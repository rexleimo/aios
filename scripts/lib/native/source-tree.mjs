import fs from 'node:fs';
import path from 'node:path';

import { NATIVE_SYNC_META_FILE } from './install-metadata.mjs';

const MANIFEST_PATH = path.join('config', 'native-sync-manifest.json');
const CLIENT_SOURCE_ROOT = path.join('client-sources', 'native-base');
const ALLOWED_CLIENTS = ['codex', 'claude', 'gemini', 'opencode', 'kiro'];
const ALLOWED_TIERS = ['deep', 'compatibility'];

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function resolveNativeClients(client = 'all') {
  const normalized = String(client || 'all').trim().toLowerCase();
  if (normalized === 'all') {
    return [...ALLOWED_CLIENTS];
  }
  assertCondition(ALLOWED_CLIENTS.includes(normalized), `unsupported native client: ${normalized}`);
  return [normalized];
}

export function loadNativeSyncManifest(rootDir) {
  const manifestPath = path.join(rootDir, MANIFEST_PATH);
  const raw = readJsonFile(manifestPath);

  assertCondition(raw && typeof raw === 'object' && !Array.isArray(raw), 'native manifest must be an object');
  assertCondition(raw.schemaVersion === 1, 'native manifest schemaVersion must be 1');
  assertCondition(raw.managedBy === 'aios', 'native manifest managedBy must be aios');
  assertCondition(raw.markers && typeof raw.markers === 'object', 'native manifest markers must be an object');
  assertCondition(typeof raw.markers.markdownBegin === 'string' && raw.markers.markdownBegin.trim().length > 0, 'native manifest markdownBegin must be non-empty');
  assertCondition(typeof raw.markers.markdownEnd === 'string' && raw.markers.markdownEnd.trim().length > 0, 'native manifest markdownEnd must be non-empty');
  assertCondition(raw.clients && typeof raw.clients === 'object' && !Array.isArray(raw.clients), 'native manifest clients must be an object');

  const clients = {};
  for (const client of ALLOWED_CLIENTS) {
    const entry = raw.clients[client];
    assertCondition(entry && typeof entry === 'object' && !Array.isArray(entry), `native manifest missing client entry: ${client}`);
    assertCondition(ALLOWED_TIERS.includes(entry.tier), `native manifest tier must be one of: ${ALLOWED_TIERS.join(', ')}`);
    assertCondition(typeof entry.metadataRoot === 'string' && entry.metadataRoot.trim().length > 0, `native manifest metadataRoot missing for ${client}`);
    assertCondition(Array.isArray(entry.outputs) && entry.outputs.length > 0, `native manifest outputs missing for ${client}`);

    clients[client] = {
      tier: entry.tier,
      metadataRoot: entry.metadataRoot,
      outputs: entry.outputs.map((item) => String(item || '').trim()).filter(Boolean),
    };
  }

  return {
    schemaVersion: 1,
    managedBy: 'aios',
    markers: {
      markdownBegin: raw.markers.markdownBegin,
      markdownEnd: raw.markers.markdownEnd,
    },
    clients,
  };
}

export function buildNativeOutputPlan({ rootDir, manifest = loadNativeSyncManifest(rootDir), client }) {
  const normalized = String(client || '').trim().toLowerCase();
  assertCondition(ALLOWED_CLIENTS.includes(normalized), `unsupported native client: ${normalized}`);
  const entry = manifest.clients[normalized];
  const metadataRoot = path.join(rootDir, entry.metadataRoot);
  return {
    client: normalized,
    tier: entry.tier,
    metadataRoot,
    metadataPath: path.join(metadataRoot, NATIVE_SYNC_META_FILE),
    outputs: [...entry.outputs],
  };
}

export function resolveNativeSourcePath({ rootDir, client, fileName }) {
  return path.join(rootDir, CLIENT_SOURCE_ROOT, client, 'project', fileName);
}

export function resolveSharedNativePartialPath({ rootDir, fileName }) {
  return path.join(rootDir, CLIENT_SOURCE_ROOT, 'shared', 'partials', fileName);
}
