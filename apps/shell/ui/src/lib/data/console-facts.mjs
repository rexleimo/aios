// apps/shell/ui/src/lib/data/console-facts.mjs — 首屏真实事实的唯一装配点（服务端）。
//
// 为什么需要这一个文件：实测 `aios status --json` 要 2.7s，而它 64% 的时间花在把 29 MB 的
// `.aios/interception/metrics` 整份读进来判断「agent/客户端有没有双向证据」
// （docs/plans/2026-11-07-stage0-real-data-measurement.md 第 1 节）。首屏不展示证据审计，
// 所以首屏**不为它付钱**——这里一个 `status` 调用都没有。
//
// 三条纪律：
//   1. 每个采集项各自成功、各自失败：一项挂了不牵连别的项，失败原因原样进 `degraded`，
//      界面据此显示「没读到 + 为什么」，绝不拿空数组冒充「用户没有东西」。
//   2. 每个数字都有出处：`sources[]` 里能找到同名字段，界面不写自算常量。
//   3. 慢项不占关键路径：全部并行，整包实测应在 300ms 级（最慢的一路是 `mcp list`）。
import fs from 'node:fs';
import path from 'node:path';

import { loadMcpList } from './mcp.mjs';
import { listSessions, auditSessionStore } from './sessions.mjs';
import { readMemoEvents, readPinnedMemo } from './memo-store.mjs';
import { loadPluginPanelViews } from './plugin-contributions.mjs';
import { runCapabilityJson, repoRoot } from './capability.mjs';

/** 字面量类型要显式声明：没有这层断言，导出常量会被推成 `string`，页面就没法对齐 `ConsoleFacts`。 */
export const CONSOLE_FACTS_KIND = /** @type {'aios.console-facts.v1'} */ ('aios.console-facts.v1');

/** 单独计时的一个采集项；失败不抛，变成 `{ ok:false, error }`。 */
async function timed(item, fn) {
  const startedAt = Date.now();
  try {
    const value = await fn();
    return { item, ms: Date.now() - startedAt, ok: true, value, error: undefined };
  } catch (error) {
    return {
      item,
      ms: Date.now() - startedAt,
      ok: false,
      value: undefined,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** 声明表（`config/host-capabilities.json`）决定「产品声称支持谁」，落点表决定「本机真的有什么」。 */
function readDeclaredClients(rootDir) {
  const file = path.join(rootDir, 'config', 'host-capabilities.json');
  if (!fs.existsSync(file)) return { clients: [], file, reason: 'declaration file absent' };
  try {
    const document = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/u, ''));
    return { clients: Object.keys(document?.clients ?? {}), file, reason: null };
  } catch (error) {
    return { clients: [], file, reason: `declaration file unreadable: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * 一个客户端在本机的真实状况。名字来自落点表，不是来自界面常量。
 * `declaredOnly` 为真表示「产品说支持，但这台机器上没有它的落点」，
 * 这是一个需要解释的状态（路线图 P1-1），不是一个错误状态。
 */
function buildClients({ landings, declared }) {
  const byId = new Map();
  for (const landing of landings) {
    const id = String(landing.clientId ?? '');
    if (!id) continue;
    if (!byId.has(id)) {
      byId.set(id, { clientId: id, scopes: [], services: 0, landingTokens: [], configFiles: [], unreadable: [] });
    }
    const client = byId.get(id);
    const servers = Array.isArray(landing.servers) ? landing.servers : [];
    client.scopes.push({
      scope: String(landing.scope ?? ''),
      format: String(landing.format ?? ''),
      file: String(landing.file ?? ''),
      writable: landing.writable !== false,
      registered: landing.registered !== false,
      services: servers.length,
      status: String(landing.status ?? 'unknown'),
    });
    client.services += servers.length;
    if (landing.landingToken) {
      client.landingTokens.push({
        scope: String(landing.scope ?? ''),
        token: landing.landingToken,
        reason: String(landing.statusReason ?? landing.reason ?? ''),
      });
    }
    if (landing.file) client.configFiles.push(String(landing.file));
    if (landing.status === 'error') client.unreadable.push(`${landing.scope}: ${landing.reason ?? 'config read failed'}`);
  }
  for (const id of declared) {
    if (!byId.has(id)) byId.set(id, { clientId: id, scopes: [], services: 0, landingTokens: [], configFiles: [], unreadable: [], declaredOnly: true });
  }
  const clients = [...byId.values()];
  for (const client of clients) {
    client.declaredOnly = client.declaredOnly === true || client.scopes.length === 0;
    // 排序事实：本机命中（有落点）的在前，只声明的沉底——这是 P1-2 的地基，不是猜测。
    client.installed = client.scopes.length > 0;
  }
  clients.sort((left, right) => (right.installed - left.installed) || left.clientId.localeCompare(right.clientId));
  return clients;
}

/**
 * 「需要你处理」= 能从事实里客观数出来的坏东西，不是编一条好听话。
 * 每条都带 clientId / 出处，所以点进去能看到同一个数字的来源。
 */
function buildIssues({ mcp, summary }) {
  const issues = [];
  const landings = Array.isArray(mcp?.data?.landings) ? mcp.data.landings : [];
  for (const landing of landings) {
    const servers = Array.isArray(landing.servers) ? landing.servers : [];
    if (landing.status === 'error') {
      issues.push({
        kind: 'config-unreadable',
        clientId: String(landing.clientId ?? ''),
        scope: String(landing.scope ?? ''),
        detail: String(landing.reason ?? '配置文件读取失败'),
        source: 'aios mcp list --json → landings[].status',
      });
    }
    if (landing.ledgerCorrupt === true) {
      issues.push({
        kind: 'ledger-corrupt',
        clientId: String(landing.clientId ?? ''),
        scope: String(landing.scope ?? ''),
        detail: 'AIOS 归属账本损坏，服务清单可能不完整',
        source: 'aios mcp list --json → landings[].ledgerCorrupt',
      });
    }
    for (const server of servers) {
      if (server.ownership === 'conflict') {
        issues.push({
          kind: 'ownership-conflict',
          clientId: String(landing.clientId ?? ''),
          scope: String(landing.scope ?? ''),
          server: String(server.name ?? ''),
          detail: '同一个服务名在客户端配置与 AIOS 账本里指向不同内容',
          source: 'aios mcp list --json → servers[].ownership',
        });
      }
    }
  }
  const drift = Array.isArray(summary?.drift) ? summary.drift : [];
  if (drift.length > 0) {
    issues.push({
      kind: 'drift',
      clientId: '',
      scope: '',
      detail: `${drift.length} 处配置与账本记录不一致`,
      source: 'aios mcp list --json → counts.drift',
    });
  }
  return issues;
}

/**
 * 项目面 = 本机工作区清单（注册表 ∪ 记忆仓存在性），不是从会话 meta 里猜的名字。
 *
 * 旧实现的两个实测后果：它把 `workspace-memory` 这种记忆空间伪会话当成项目列出来；而它的
 * `lastUsedAt` 来自会话面——本机会话自 2026-10-27 之后就没有写者，所以首页一边显示
 * 「最近使用 10-27」、一边显示 11-07 的记忆，看着就是数据错了。现在一个名字只能来自
 * 一个真实存在的工作区，活跃度用它自己记忆仓的最后事件时间。
 */
function buildProjects({ workspaces, rootDir }) {
  const current = path.resolve(rootDir);
  return workspaces.map((item) => ({
    key: String(item.key ?? ''),
    name: String(item.name ?? path.basename(String(item.path ?? current))),
    path: String(item.path ?? ''),
    sessions: Number(item.sessions ?? 0),
    memos: Number(item.memos ?? 0),
    lastActivityAt: item.lastActivityAt ?? null,
    registeredLastSeenAt: item.registeredLastSeenAt ?? null,
    origin: Array.isArray(item.origin) ? item.origin.map(String) : [],
    missing: item.missing === true,
    stale: item.stale === true,
    current: path.resolve(String(item.path ?? '')) === current,
  }));
}

/**
 * 首屏一次取齐。返回的每一项都带自己的耗时与成败，所以「慢在哪」是可回答的问题，
 * 不是一个需要再猜一次的数字。
 */
export async function collectConsoleFacts({ rootDir = repoRoot(), runImpl, workspaces: workspacesInjected } = {}) {
  const startedAt = Date.now();
  const [mcpResult, sessionsResult, memoResult, pinnedResult, memoryReportResult, declarationResult, workspacesResult, pluginViewsResult] = await Promise.all([
    timed('mcp', () => loadMcpList({ rootDir, runImpl })),
    timed('sessions', async () => ({ rows: listSessions(rootDir), audit: auditSessionStore(rootDir) })),
    timed('memo', async () => readMemoEvents({ rootDir })),
    timed('pinned', async () => readPinnedMemo({ rootDir })),
    timed('memoryReport', () => runCapabilityJson(['memory', 'report', '--json'], { rootDir, runImpl })),
    timed('declaration', async () => readDeclaredClients(rootDir)),
    // 工作区清单总是从**服务自己的根**去发现（而不是被选中的那个根）：否则切到另一个工程后，
    // 清单变成「那个工程看它周围有什么」，下拉框会随选择漂移，而它正是用来选的东西。
    timed('workspaces', async () => {
      if (workspacesInjected) return workspacesInjected;
      const { loadWorkspaces } = await import('../config/workspaces.mjs');
      return loadWorkspaces({ rootDir: repoRoot(), runImpl });
    }),
    timed('plugins', async () => loadPluginPanelViews({ rootDir })),
  ]);

  const degraded = [mcpResult, sessionsResult, memoResult, pinnedResult, memoryReportResult, declarationResult, workspacesResult, pluginViewsResult]
    .filter((entry) => !entry.ok)
    .map((entry) => ({ item: String(entry.item), error: String(entry.error ?? 'unknown failure') }));
  // 采集器自己也会返回 `{ ok:false }`（子进程跑了但没拿到 payload），那同样是降级。
  if (mcpResult.ok && mcpResult.value?.ok === false) {
    degraded.push({ item: 'mcp', error: String(mcpResult.value.error) });
  }
  if (memoryReportResult.ok && memoryReportResult.value?.ok === false) {
    degraded.push({ item: 'memoryReport', error: String(memoryReportResult.value.error) });
  }
  if (memoResult.ok && memoResult.value?.ok === false) {
    degraded.push({ item: 'memo', error: String(memoResult.value.error ?? memoResult.value.reason) });
  }
  if (workspacesResult.ok && workspacesResult.value?.ok === false) {
    // 清单读不到不等于「本机只有一个工作区」：那是一个需要说出来的降级。
    degraded.push({ item: 'workspaces', error: String(workspacesResult.value.error ?? '工作区清单没读到') });
  }

  const mcp = mcpResult.ok && mcpResult.value?.ok ? mcpResult.value : null;
  const report = memoryReportResult.ok && memoryReportResult.value?.ok ? memoryReportResult.value.data : null;
  const sessionsPackage = sessionsResult.ok && sessionsResult.value ? sessionsResult.value : { rows: [], audit: null };
  const sessions = Array.isArray(sessionsPackage.rows) ? sessionsPackage.rows : [];
  const sessionsAudit = sessionsPackage.audit;
  const memoRows = memoResult.ok && memoResult.value?.ok ? memoResult.value.rows : [];
  // 清单读失败时是一个空数组加一条 degraded，而不是「本机只有这一个工程」。
  const workspaceItems = workspacesResult.ok && workspacesResult.value?.ok ? workspacesResult.value.workspaces : [];
  const declared = declarationResult.ok ? declarationResult.value : { clients: [], file: '', reason: declarationResult.error };
  if (!declarationResult.ok) degraded.push({ item: 'declaration', error: declarationResult.error });
  const rows = mcp ? mcp.rows : [];
  // 落点 token 由 `flattenMcpServers` 逐行算出（deriveLandingStatus 的产物），这里只聚到客户端粒度；
  // 字段名是 `status`/`statusReason`，不是再算一遍——同一份判据只允许有一个所有者。
  const landingStatus = (landing) => {
    const row = rows.find((item) => item.clientId === landing.clientId && item.scope === landing.scope);
    return { token: row?.status ?? null, reason: row?.statusReason ?? '' };
  };
  const clients = buildClients({
    landings: (mcp?.data?.landings ?? []).map((landing) => ({
      ...landing,
      landingToken: landingStatus(landing).token,
      statusReason: landingStatus(landing).reason,
    })),
    declared: declared.clients,
  });

  return {
    kind: CONSOLE_FACTS_KIND,
    rootDir,
    generatedAt: new Date().toISOString(),
    totalMs: Date.now() - startedAt,
    timings: [
      { item: 'mcp', ms: mcpResult.ms },
      { item: 'sessions', ms: sessionsResult.ms },
      { item: 'memo', ms: memoResult.ms },
      { item: 'pinned', ms: pinnedResult.ms },
      { item: 'memoryReport', ms: memoryReportResult.ms },
      { item: 'declaration', ms: declarationResult.ms },
      { item: 'workspaces', ms: workspacesResult.ms },
      { item: 'plugins', ms: pluginViewsResult.ms },
    ],
    pluginViews: pluginViewsResult.ok && pluginViewsResult.value ? pluginViewsResult.value.views : [],
    pluginFailures: pluginViewsResult.ok && pluginViewsResult.value ? pluginViewsResult.value.failed : [],
    degraded,
    sources: [
      { field: 'clients / services / issues', origin: 'node scripts/aios.mjs mcp list --json' },
      { field: 'declaredClients', origin: declared.file },
      { field: 'sessions / projects', origin: `${path.join(rootDir, '.aios', 'context-db', 'sessions')}` },
      { field: 'memories', origin: memoResult.ok ? memoResult.value?.file : 'unreadable' },
      { field: 'memoryTotals', origin: 'node scripts/aios.mjs memory report --json' },
      { field: 'workspaces', origin: 'node scripts/aios.mjs workspaces list --json（注册表 ∪ 记忆仓存在性）' },
      { field: 'pluginViews', origin: path.join(rootDir, 'config', 'plugins.json') },
    ],
    declaredClientCount: declared.clients.length,
    declaredOnlyReason: declared.reason,
    clients,
    services: {
      rows,
      summary: mcp?.summary ?? null,
      loaded: Boolean(mcp),
      error: mcp ? null : String(mcpResult.value?.error ?? degraded.find((d) => d.item === 'mcp')?.error ?? 'not loaded'),
    },
    issues: buildIssues({ mcp, summary: mcp?.summary ?? { drift: [] } }),
    projects: buildProjects({ workspaces: workspaceItems, rootDir }),
    workspaces: workspaceItems,
    workspacesScanRoots: workspacesResult.ok && workspacesResult.value?.ok ? workspacesResult.value.scanRoots : [],
    sessionsAudit,
    sessions,
    memories: memoRows,
    pinned: pinnedResult.ok ? pinnedResult.value : { ok: false, chars: 0, entries: [], reason: 'read-threw' },
    memoryTotals: report?.totals ?? null,
    memorySpaces: report?.spaces ?? [],
    memoryPinnedBudget: report?.pinned ?? null,
  };
}
