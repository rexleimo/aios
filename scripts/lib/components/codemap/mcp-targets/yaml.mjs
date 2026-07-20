import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { parseDocument } from 'yaml';

import { CRG_MCP_ALIAS } from '../constants.mjs';
import { backupFilePath } from '../paths.mjs';
import { buildCrgMcpServerEntryForProject, isCrgServeEntry, isObjectRecord } from './entries.mjs';

function toHermesMcpEntry(entry) {
  const normalized = {};
  if (entry?.command) normalized.command = String(entry.command);
  if (Array.isArray(entry?.args)) normalized.args = entry.args.map(String);
  if (entry?.cwd) normalized.cwd = String(entry.cwd);
  if (isObjectRecord(entry?.env) && Object.keys(entry.env).length > 0) {
    normalized.env = Object.fromEntries(Object.keys(entry.env).sort().map((key) => [key, String(entry.env[key])]));
  }
  return normalized;
}

function parseHermesDocument(raw) {
  const document = parseDocument(raw || '{}\n');
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join('; '));
  }

  let config = document.toJS();
  if (!isObjectRecord(config)) {
    document.contents = document.createNode({});
    config = {};
  }
  if (!isObjectRecord(config.mcp_servers)) {
    document.set('mcp_servers', document.createNode({}));
    config.mcp_servers = {};
  }
  return { document, config };
}

function writeHermesYaml(filePath, raw, nextRaw, exists, { dryRun = false } = {}) {
  if (exists && raw === nextRaw) return { status: 'unchanged' };
  if (dryRun) return { status: 'planned' };
  if (exists) fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, nextRaw, 'utf8');
  return { status: exists ? 'updated' : 'created' };
}

export function upsertCrgIntoHermesYaml(filePath, projectRoot, { dryRun = false } = {}) {
  const exists = fs.existsSync(filePath);
  const raw = exists ? fs.readFileSync(filePath, 'utf8') : '';
  let state;
  try {
    state = parseHermesDocument(raw);
  } catch (error) {
    return { status: 'error', reason: `YAML parse failed: ${error instanceof Error ? error.message : String(error)}` };
  }

  const desired = toHermesMcpEntry(buildCrgMcpServerEntryForProject('hermes', projectRoot));
  if (isDeepStrictEqual(state.config.mcp_servers[CRG_MCP_ALIAS], desired)) {
    return { status: 'unchanged' };
  }

  state.document.setIn(['mcp_servers', CRG_MCP_ALIAS], desired);
  return writeHermesYaml(filePath, raw, String(state.document), exists, { dryRun });
}

export function removeCrgFromHermesYaml(filePath, { io = console } = {}) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    const state = parseHermesDocument(raw);
    if (!Object.hasOwn(state.config.mcp_servers, CRG_MCP_ALIAS)) return;
    state.document.deleteIn(['mcp_servers', CRG_MCP_ALIAS]);
    fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
    fs.writeFileSync(filePath, String(state.document), 'utf8');
    io.log(`OK   codemap removed ${CRG_MCP_ALIAS} from ${filePath}`);
  } catch (error) {
    io.log(`ERR  codemap failed to clean ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function inspectHermesYaml(raw) {
  const { config } = parseHermesDocument(raw);
  const entry = config.mcp_servers[CRG_MCP_ALIAS];
  return {
    exists: true,
    hasCrg: Boolean(entry),
    valid: isCrgServeEntry(entry),
    reason: entry ? 'invalid' : 'missing',
  };
}
