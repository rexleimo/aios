/**
 * 只读 status dashboard（借鉴 LoopX 长任务可见性，见 research/upstream/loopx-analysis.md §4.5/§6）。
 *
 * 纯只读投影：组合既有只读数据面（solo run summary、rex work-item 索引、
 * settlement journal、dream proposals、宿主探针），渲染为单个静态 HTML 文件。
 * 无服务进程、无第二个状态 owner、零状态写入——"随时能看"但不产生任何控制面副作用。
 */

import fs from 'node:fs';
import path from 'node:path';

import { readSoloRunStatus } from './solo-journal.mjs';
import { getSoloHarnessPaths } from './solo-journal/paths.mjs';
import { resolveContextDbRoot } from '../aios/state-root.mjs';
import { listProbedHosts, probeHost } from './host-probes.mjs';
import { listDreamProposals } from '../lifecycle/dream/governance.mjs';

const SETTLEMENT_TAIL_ROWS = 20;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function readJsonIfExists(target) {
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    return null;
  }
}

/** 扫描 ContextDB sessions 下带 run-summary 的 harness 会话。 */
export function discoverHarnessSessions({ rootDir, env = process.env } = {}) {
  const sessionsRoot = path.join(resolveContextDbRoot(rootDir, { env }), 'sessions');
  let entries = [];
  try {
    entries = fs.readdirSync(sessionsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const sessionIds = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const summaryPath = getSoloHarnessPaths({ rootDir, sessionId: entry.name }).summaryPath;
    if (fs.existsSync(summaryPath)) sessionIds.push(entry.name);
  }
  return sessionIds.sort();
}

function collectRexSurfaces(rootDir) {
  const rexRoot = path.join(rootDir, '.rex-harness');
  const workflowsDir = path.join(rexRoot, 'workflows');
  const settlementsDir = path.join(rexRoot, 'settlements');

  const workItems = [];
  try {
    for (const entry of fs.readdirSync(workflowsDir).filter((name) => name.endsWith('.json'))) {
      const index = readJsonIfExists(path.join(workflowsDir, entry));
      if (index?.kind === 'rex.standalone-work-item.v1') workItems.push(index);
    }
  } catch {
    // 无 rex 工作流状态是正常情况
  }

  const settlements = [];
  try {
    for (const file of fs.readdirSync(settlementsDir).filter((name) => name.endsWith('.ndjson'))) {
      const workflowActivationId = file.replace(/\.ndjson$/u, '');
      const rows = fs.readFileSync(path.join(settlementsDir, file), 'utf8')
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
      for (const row of rows.slice(-SETTLEMENT_TAIL_ROWS)) {
        settlements.push({ workflowActivationId, ...row });
      }
    }
  } catch {
    // 无 settlement 记录是正常情况
  }

  settlements.sort((a, b) => String(a.settledAt || '').localeCompare(String(b.settledAt || '')));
  return { workItems, settlements: settlements.slice(-SETTLEMENT_TAIL_ROWS) };
}

export async function collectDashboardData({ rootDir, env = process.env } = {}) {
  const sessionIds = discoverHarnessSessions({ rootDir, env });
  const sessions = [];
  for (const sessionId of sessionIds) {
    const status = await readSoloRunStatus({ rootDir, sessionId });
    if (status) sessions.push(status);
  }

  const rex = collectRexSurfaces(rootDir);

  let dream = { proposals: [] };
  try {
    dream.proposals = await listDreamProposals({ rootDir, env });
  } catch {
    // dream 状态缺失不阻断 dashboard
  }

  const probes = listProbedHosts().map((host) => probeHost({ host }));

  return {
    generatedAt: new Date().toISOString(),
    sessions,
    rex,
    dream: { proposalCount: dream.proposals.length, byStatus: dream.proposals.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {}) },
    probes,
  };
}

export function renderDashboardHtml(data) {
  const esc = escapeHtml;
  const sessionRows = data.sessions.map((s) => `
      <tr>
        <td>${esc(s.sessionId)}</td>
        <td>${esc(s.objective || '')}</td>
        <td>${esc(s.status)}</td>
        <td>${esc(s.provider)}</td>
        <td>${esc(String(s.iterationCount))}</td>
        <td>${esc(s.lastOutcome || '')}</td>
        <td>${esc(s.lastFailureClass || '')}</td>
        <td>${s.pacing ? esc(`${s.pacing.lastDecision?.action || '-'} / ${s.pacing.cadenceClass || '-'}`) : '—'}</td>
      </tr>`).join('\n');

  const settlementRows = data.rex.settlements.map((row) => `
      <tr>
        <td>${esc(row.settledAt || '')}</td>
        <td>${esc(row.workflowActivationId || '')}</td>
        <td>${esc(row.turnKey?.iteration ?? '')}</td>
        <td>${esc(row.decision || '')}${row.reason ? ` (${esc(row.reason)})` : ''}</td>
        <td>${esc(row.outcome || '')}</td>
        <td><code>${esc(String(row.effectRef || '').slice(0, 20))}…</code></td>
      </tr>`).join('\n');

  const probeRows = data.probes.map((p) => `
      <tr>
        <td>${esc(p.host)}</td>
        <td>${esc(p.status)}</td>
        <td>${esc(p.detail)}</td>
      </tr>`).join('\n');

  const dreamSummary = Object.entries(data.dream.byStatus || {})
    .map(([status, count]) => `${esc(status)}: ${count}`)
    .join(', ') || 'none';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>AIOS Harness Dashboard (read-only)</title>
<style>
  body { font-family: -apple-system, "Segoe UI", sans-serif; margin: 2rem; color: #1c1c1e; }
  h1 { font-size: 1.4rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
  table { border-collapse: collapse; width: 100%; margin-top: .5rem; }
  th, td { border: 1px solid #d1d1d6; padding: .35rem .6rem; text-align: left; font-size: .85rem; }
  th { background: #f2f2f7; }
  code { font-size: .8rem; }
  .meta { color: #8e8e93; font-size: .8rem; }
</style>
</head>
<body>
<h1>AIOS Harness Dashboard</h1>
<p class="meta">read-only projection · generated ${esc(data.generatedAt)} · no server, no state writes</p>

<h2>Solo Runs (${data.sessions.length})</h2>
<table>
  <tr><th>Session</th><th>Objective</th><th>Status</th><th>Provider</th><th>Iterations</th><th>Last outcome</th><th>Failure class</th><th>Pacing (decision / cadence)</th></tr>
  ${sessionRows}
</table>

<h2>Turn Settlements (rex, tail ${data.rex.settlements.length})</h2>
<table>
  <tr><th>Settled at</th><th>Activation</th><th>Iter</th><th>Decision</th><th>Outcome</th><th>effectRef</th></tr>
  ${settlementRows}
</table>
<p class="meta">rex work items: ${data.rex.workItems.length} · dream proposals: ${data.dream.proposalCount} (${dreamSummary})</p>

<h2>Host Probes</h2>
<table>
  <tr><th>Host</th><th>Status</th><th>Detail</th></tr>
  ${probeRows}
</table>
</body>
</html>
`;
}

/** 生成只读 dashboard 文件，返回写入路径。唯一的写动作是投影文件本身。 */
export async function writeHarnessDashboard({ rootDir, env = process.env } = {}) {
  const data = await collectDashboardData({ rootDir, env });
  const targetDir = path.join(resolveContextDbRoot(rootDir, { env }), 'harness');
  await fs.promises.mkdir(targetDir, { recursive: true });
  const target = path.join(targetDir, 'dashboard.html');
  await fs.promises.writeFile(target, renderDashboardHtml(data), 'utf8');
  return { target, data };
}
