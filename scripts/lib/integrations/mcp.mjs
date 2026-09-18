// scripts/lib/integrations/mcp.mjs — 远程 HTTP MCP 文档服务器的注册平面。
// 两条路径：
//   1. cli  —— 委托给客户端自己的 `mcp add`，让客户端拥有它自己的配置 schema；
//   2. config —— 直写客户端配置文件（Pi 的 mcp.json 走这条，因为 Pi core 没有 MCP 面）。
// 所有写操作都先算指纹、后落盘、再回读；回读不一致时报告 drift 而不是宣称成功。
import fs from 'node:fs';
import path from 'node:path';

import { getIntegrationClientEntry, resolveIntegrationClientConfigPath } from './clients.mjs';
import { classifyIntegrationOwnership, fingerprintMcpEntry, normalizeMcpEntry } from './ledger.mjs';

const DEFAULT_PROBE_TIMEOUT_MS = 15000;

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function backupFilePath(filePath) {
  const ts = new Date().toISOString().replace(/[-:]/gu, '').replace('T', '-').slice(0, 15);
  return `${filePath}.bak-${ts}`;
}

// 纯函数：AIOS 期望写进客户端配置的条目形状（HTTP 传输）。
export function buildDesiredMcpEntry(integration) {
  return { type: 'http', url: integration.mcp.url };
}

// 纯函数：某一客户端实际期望的条目（config 型客户端可以有自己的附加字段）。
export function buildClientDesiredEntry(client, integration) {
  const entry = getIntegrationClientEntry(client);
  if (entry?.transport === 'config' && typeof entry.config.buildEntry === 'function') {
    return entry.config.buildEntry({ mcp: integration.mcp });
  }
  return buildDesiredMcpEntry(integration);
}

// 纯函数：读取 config 型客户端里 AIOS 关心的那个条目。
export function readConfigEntryFor({ client, serverName, clientHome = '', projectRoot = '', readFileImpl = fs.readFileSync } = {}) {
  const entry = getIntegrationClientEntry(client);
  if (!entry || entry.transport !== 'config') {
    return { targetPath: '', entry: null, parseError: '', supported: false };
  }
  const targetPath = resolveIntegrationClientConfigPath(client, { clientHome, projectRoot });
  if (!targetPath) return { targetPath: '', entry: null, parseError: '', supported: true };
  let raw;
  try {
    raw = String(readFileImpl(targetPath, 'utf8')).replace(/^\uFEFF/u, '');
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return { targetPath, entry: null, parseError: '', supported: true };
    return { targetPath, entry: null, parseError: error instanceof Error ? error.message : String(error), supported: true };
  }
  try {
    const parsed = objectRecord(JSON.parse(raw));
    const namespace = objectRecord(parsed[entry.config.namespace]);
    return { targetPath, entry: normalizeMcpEntry(namespace[String(serverName)]), parseError: '', supported: true };
  } catch (error) {
    return { targetPath, entry: null, parseError: error instanceof Error ? error.message : String(error), supported: true };
  }
}

function writeJsonConfig({ filePath, raw, parsed, exists, dryRun }) {
  const nextRaw = `${JSON.stringify(parsed, null, 2)}\n`;
  if (exists && raw === nextRaw) return { status: 'unchanged' };
  if (dryRun) return { status: 'planned' };
  if (exists) fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, nextRaw, 'utf8');
  return { status: exists ? 'updated' : 'created' };
}

// 写入 config 型客户端的条目；保留同命名空间下的其他条目，不改动其他命名空间。
export function upsertConfigEntry({ client, integration, clientHome = '', projectRoot = '', dryRun = false, now = () => new Date().toISOString() }) {
  const entry = getIntegrationClientEntry(client);
  if (!entry || entry.transport !== 'config') {
    return { status: 'unsupported', reason: 'client-does-not-use-config-transport' };
  }
  const targetPath = resolveIntegrationClientConfigPath(client, { clientHome, projectRoot });
  if (!targetPath) return { status: 'unsupported', reason: 'client-home-unresolved' };

  const exists = fs.existsSync(targetPath);
  const raw = exists ? fs.readFileSync(targetPath, 'utf8') : '';
  let parsed = {};
  if (exists && raw.trim()) {
    try {
      parsed = objectRecord(JSON.parse(raw.replace(/^\uFEFF/u, '')));
    } catch (error) {
      if (!dryRun) fs.writeFileSync(backupFilePath(targetPath), raw, 'utf8');
      return { status: 'error', reason: `JSON parse failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  const namespace = objectRecord(parsed[entry.config.namespace]);
  const desired = buildClientDesiredEntry(client, integration);
  const existing = objectRecord(namespace[integration.mcp.serverName]);
  const nextEntry = { ...desired };
  if (Object.keys(existing).length > 0) {
    Object.assign(nextEntry, existing, desired);
  }
  parsed[entry.config.namespace] = { ...namespace, [integration.mcp.serverName]: nextEntry };

  const written = writeJsonConfig({ filePath: targetPath, raw, parsed, exists, dryRun });
  return {
    status: written.status === 'planned' ? 'planned' : 'written',
    writeStatus: written.status,
    configPath: targetPath,
    entry: nextEntry,
    fingerprint: fingerprintMcpEntry(normalizeMcpEntry(nextEntry)),
    createdAt: now(),
  };
}

export function removeConfigEntry({ client, integration, clientHome = '', projectRoot = '', dryRun = false }) {
  const entry = getIntegrationClientEntry(client);
  if (!entry || entry.transport !== 'config') return { status: 'unsupported' };
  const targetPath = resolveIntegrationClientConfigPath(client, { clientHome, projectRoot });
  if (!targetPath || !fs.existsSync(targetPath)) return { status: 'not-found' };

  const raw = fs.readFileSync(targetPath, 'utf8');
  let parsed;
  try {
    parsed = objectRecord(JSON.parse(raw.replace(/^\uFEFF/u, '')));
  } catch (error) {
    return { status: 'error', reason: `JSON parse failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  const namespace = objectRecord(parsed[entry.config.namespace]);
  if (!(integration.mcp.serverName in namespace)) return { status: 'not-found' };
  delete namespace[integration.mcp.serverName];
  parsed[entry.config.namespace] = namespace;
  if (dryRun) return { status: 'planned', configPath: targetPath };
  fs.writeFileSync(backupFilePath(targetPath), raw, 'utf8');
  fs.writeFileSync(targetPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return { status: 'removed', configPath: targetPath };
}

// 纯函数：把 CLI 回读到的对象与期望条目做归属判定。
export function classifyClientEntry({ client, actual, integration, ledgerEntry }) {
  const desired = buildClientDesiredEntry(client, integration);
  // CLI 回读可能带客户端自己的默认字段，因此只在 url 维度上比对。
  if (actual) {
    const actualUrl = String(actual.url || '').trim();
    if (actualUrl && actualUrl !== integration.mcp.url) {
      return { status: 'conflict', actualUrl, desiredUrl: integration.mcp.url };
    }
    if (ledgerEntry?.fingerprint) {
      return { status: 'owned', actualUrl };
    }
    return { status: 'external', actualUrl };
  }
  return classifyIntegrationOwnership({ actual: null, desired, ledgerEntry });
}

// 实时握手：证明文档 MCP 端点真的可用，并核对它是否暴露了注册表声明的工具。
// 这是集成是否"真的能用"的硬证据 —— 客户端配置写没写成不是证据。
export async function probeDocsMcp(integration, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
  now = () => Date.now(),
} = {}) {
  if (typeof fetchImpl !== 'function') {
    return { status: 'unavailable', reason: 'no-fetch-impl' };
  }
  const startedAt = now();
  const post = async (payload) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(integration.mcp.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) return { ok: false, reason: `http-${response.status}` };
      const text = await response.text();
      // MCP streamable HTTP 既可能是纯 JSON，也可能是 SSE 帧（"data: {...}"）。
      const jsonLine = text.includes('data: ')
        ? text.split('\n').find((line) => line.startsWith('data: '))?.slice(6) || ''
        : text;
      return { ok: true, payload: JSON.parse(jsonLine) };
    } catch (error) {
      const reason = error?.name === 'AbortError' ? 'timeout' : (error instanceof Error ? error.message : String(error));
      return { ok: false, reason };
    } finally {
      clearTimeout(timer);
    }
  };

  const init = await post({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'aios-integration-doctor', version: '1' },
    },
  });
  if (!init.ok) return { status: 'unreachable', reason: init.reason, latencyMs: now() - startedAt };

  const listed = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const tools = listed.ok && Array.isArray(listed.payload?.result?.tools)
    ? listed.payload.result.tools.map((tool) => String(tool?.name || '')).filter(Boolean)
    : [];
  const expected = integration.mcp.tools;
  const missingTools = expected.filter((name) => !tools.includes(name));
  return {
    status: missingTools.length === 0 ? 'verified' : 'capability-mismatch',
    serverName: String(init.payload?.result?.serverInfo?.name || ''),
    tools,
    missingTools,
    latencyMs: now() - startedAt,
  };
}
