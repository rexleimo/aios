// apps/shell/ui/src/lib/config/routing-decisions.mjs — 网关决策日志的读侧尺子（实时路由图数据源）。
//
// 镜像 scripts/lib/tooling/model-router/session/decision-log.mjs 的读取/汇总语义；
// 自包含（不 import scripts/lib，避免 Turbopack 整仓 trace），与 lib/config/model-routing.mjs 同一先例。
// 写侧（网关进程）负责原子追加与滚动上限；本模块只读，绝不写日志。
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const SENSITIVE_KEYS = Object.freeze(['apiKey', 'authorization', 'headers', 'body', 'requestBody', 'secret', 'token']);

// 与 entry/command.mjs 的 gateway stateDir 同一约定：--state-dir > AIOS_GATEWAY_STATE_DIR > ~/.aios/gateway。
export function defaultStateDir(env = process.env) {
  return String(env.AIOS_GATEWAY_STATE_DIR || path.join(os.homedir(), '.aios', 'gateway'));
}

export function decisionLogPath(stateDir) {
  return path.join(stateDir, 'decisions.jsonl');
}

// 读侧防御性脱敏：写侧已剥敏，这里再剥一次——日志可能被旧版本/手工写入污染。
export function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return {};
  return Object.fromEntries(Object.entries(entry).filter(([key]) => !SENSITIVE_KEYS.includes(key)));
}

// 副作用函数：读 JSONL。文件缺失 = 空状态（exists:false），不是错误；坏行跳过；其它 IO 错误抛给路由层。
export function readDecisions(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, entries: [] };
    throw error;
  }
  const entries = [];
  const occurrences = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const entry = sanitizeEntry(parsed);
        delete entry.recordKey;
        const fingerprint = createHash('sha256').update(JSON.stringify(entry)).digest('hex');
        const occurrence = occurrences.get(fingerprint) || 0;
        occurrences.set(fingerprint, occurrence + 1);
        // Assign before newest-first slicing: appends must not remount existing rows.
        entries.push({ ...entry, recordKey: `${fingerprint}:${occurrence}` });
      }
    } catch { /* 坏行跳过，不让一行污染整份日志 */ }
  }
  return { exists: true, entries };
}

// 纯函数：汇总计数器 + 按模型/客户端分组 + client→model 边（路由图的连线）。
// 诚实计数：errors = status>=400 或带 error；autoRouted = 带 intent。没有 failover 就不造 rerouted 指标。
export function summarizeDecisions(entries) {
  const summary = { requests: 0, errors: 0, autoRouted: 0, byModel: {}, byClient: {}, edges: [] };
  const edgeMap = new Map();
  for (const entry of entries || []) {
    summary.requests += 1;
    const isError = Boolean(entry?.error) || Number(entry?.status) >= 400;
    const isAuto = Boolean(entry?.intent);
    if (isError) summary.errors += 1;
    if (isAuto) summary.autoRouted += 1;
    const modelId = String(entry?.modelId || '');
    const clientId = String(entry?.clientId || '');
    if (modelId) summary.byModel[modelId] = (summary.byModel[modelId] || 0) + 1;
    if (clientId) summary.byClient[clientId] = (summary.byClient[clientId] || 0) + 1;
    if (modelId) {
      const key = `${clientId}→${modelId}`;
      const edge = edgeMap.get(key) || { clientId, modelId, count: 0, errors: 0, autoRouted: 0 };
      edge.count += 1;
      if (isError) edge.errors += 1;
      if (isAuto) edge.autoRouted += 1;
      edgeMap.set(key, edge);
    }
  }
  summary.edges = [...edgeMap.values()];
  return summary;
}

// 纯函数：recent 条数上限——非法/非正 → 默认 20，合法钳到 1..100。
export function parseLimit(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 20;
  return Math.min(Math.max(Math.floor(value), 1), 100);
}
