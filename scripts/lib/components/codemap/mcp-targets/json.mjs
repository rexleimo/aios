import fs from 'node:fs';
import path from 'node:path';

import { CRG_MCP_ALIAS } from '../constants.mjs';
import { backupFilePath } from '../paths.mjs';
import { buildCrgMcpServerEntryForProject, isCrgServeEntry, isObjectRecord } from './entries.mjs';

function parseJsonConfig(filePath, { dryRun = false } = {}) {
  const exists = fs.existsSync(filePath);
  const raw = exists ? fs.readFileSync(filePath, 'utf8') : '';
  let parsed = {};

  if (exists && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      if (!dryRun) {
        fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
      }
      return {
        exists,
        raw,
        parsed: {},
        error: `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return {
    exists,
    raw,
    parsed: isObjectRecord(parsed) ? parsed : {},
    error: '',
  };
}

function writeJsonConfig(filePath, raw, parsed, exists, { dryRun = false } = {}) {
  const nextRaw = `${JSON.stringify(parsed, null, 2)}\n`;
  if (exists && raw === nextRaw) {
    return { status: 'unchanged' };
  }
  if (dryRun) {
    return { status: 'planned' };
  }
  if (exists) {
    fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, nextRaw, 'utf8');
  return { status: exists ? 'updated' : 'created' };
}

export function injectCrgIntoMcpJson(filePath, clientKey, projectRoot, { dryRun = false } = {}) {
  const state = parseJsonConfig(filePath, { dryRun });
  if (state.error) {
    return { status: 'error', reason: state.error };
  }

  const parsed = state.parsed;
  if (!isObjectRecord(parsed.mcpServers)) {
    parsed.mcpServers = {};
  }

  const desired = buildCrgMcpServerEntryForProject(clientKey, projectRoot);
  const existing = parsed.mcpServers[CRG_MCP_ALIAS];
  const nextEntry = { ...desired };
  if (isObjectRecord(existing)) {
    Object.assign(nextEntry, existing, desired);
  }
  parsed.mcpServers[CRG_MCP_ALIAS] = nextEntry;

  return writeJsonConfig(filePath, state.raw, parsed, state.exists, { dryRun });
}

export function injectCrgIntoOpencodeJson(filePath, { dryRun = false } = {}) {
  const state = parseJsonConfig(filePath, { dryRun });
  if (state.error) {
    return { status: 'error', reason: state.error };
  }

  const parsed = state.parsed;
  if (!isObjectRecord(parsed.mcp)) {
    parsed.mcp = {};
  }

  const desired = {
    type: 'local',
    command: ['uvx', 'code-review-graph', 'serve'],
    enabled: true,
  };
  const existing = parsed.mcp[CRG_MCP_ALIAS];
  const nextEntry = { ...desired };
  if (isObjectRecord(existing)) {
    Object.assign(nextEntry, existing, desired);
  }
  parsed.mcp[CRG_MCP_ALIAS] = nextEntry;

  return writeJsonConfig(filePath, state.raw, parsed, state.exists, { dryRun });
}

function removeCrgFromJsonNamespace(filePath, namespaceKey, { io = console } = {}) {
  if (!fs.existsSync(filePath)) return;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!isObjectRecord(parsed?.[namespaceKey])) return;
    if (!(CRG_MCP_ALIAS in parsed[namespaceKey])) return;

    delete parsed[namespaceKey][CRG_MCP_ALIAS];
    fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
    fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    io.log(`OK   codemap removed ${CRG_MCP_ALIAS} from ${filePath}`);
  } catch (error) {
    io.log(`ERR  codemap failed to clean ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function removeCrgFromMcpJson(filePath, options = {}) {
  return removeCrgFromJsonNamespace(filePath, 'mcpServers', options);
}

export function removeCrgFromOpencodeJson(filePath, options = {}) {
  return removeCrgFromJsonNamespace(filePath, 'mcp', options);
}

export function injectCrgIntoCrushJson(filePath, { dryRun = false } = {}) {
  const state = parseJsonConfig(filePath, { dryRun });
  if (state.error) {
    return { status: 'error', reason: state.error };
  }

  const parsed = state.parsed;
  if (!isObjectRecord(parsed.mcp)) {
    parsed.mcp = {};
  }

  const desired = {
    type: 'stdio',
    command: 'uvx',
    args: ['code-review-graph', 'serve'],
  };
  const existing = parsed.mcp[CRG_MCP_ALIAS];
  const nextEntry = { ...desired };
  if (isObjectRecord(existing)) {
    Object.assign(nextEntry, existing, desired);
  }
  parsed.mcp[CRG_MCP_ALIAS] = nextEntry;

  return writeJsonConfig(filePath, state.raw, parsed, state.exists, { dryRun });
}

export function removeCrgFromCrushJson(filePath, options = {}) {
  return removeCrgFromJsonNamespace(filePath, 'mcp', options);
}

export function inspectJsonNamespace(raw, namespaceKey) {
  const parsed = raw.trim() ? JSON.parse(raw) : {};
  const namespace = parsed?.[namespaceKey];
  const entry = isObjectRecord(namespace) ? namespace[CRG_MCP_ALIAS] : null;
  return {
    exists: true,
    hasCrg: Boolean(entry),
    valid: isCrgServeEntry(entry),
    reason: entry ? 'invalid' : 'missing',
  };
}