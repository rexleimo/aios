// 中文注释：网关决策记录的跨进程持久化（实时路由图的数据源）。daemon 内存里的 decisions GUI 独立进程读不到，
// 故 onDecision 落盘成 JSONL，GUI 数据端点跨进程读。同步「读-裁-写」保证单进程内每次 append 原子、有界滚动；
// 防御性剔除敏感键——决策记录本就不含密钥/正文，这里再兜一道，绝不让凭据落盘。
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_MAX_ENTRIES = 500;
const SENSITIVE_KEYS = Object.freeze(['apiKey', 'authorization', 'headers', 'body', 'requestBody', 'secret', 'token']);

// 纯函数：默认日志路径 = 状态目录下的 decisions.jsonl。
export function defaultDecisionLogPath(stateDir) {
  return path.join(stateDir, 'decisions.jsonl');
}

function sanitize(entry) {
  const out = {};
  for (const [key, value] of Object.entries(entry || {})) {
    if (SENSITIVE_KEYS.includes(key)) continue;
    out[key] = value;
  }
  return out;
}

function readAll(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return text.split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

// 工厂：返回 {append, readRecent}。append 同步读-裁-写（tmp+rename）保证原子与有界；readRecent 最新在前。
export function createDecisionLog(filePath, { maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
  return Object.freeze({
    filePath,
    append(entry) {
      const safe = sanitize(entry);
      const capped = [...readAll(filePath), safe].slice(-maxEntries);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.tmp-${process.pid}`;
      fs.writeFileSync(temporary, `${capped.map((line) => JSON.stringify(line)).join('\n')}\n`);
      fs.renameSync(temporary, filePath);
      return safe;
    },
    readRecent(limit = 50) {
      return readAll(filePath).slice(-limit).reverse();
    },
  });
}

// 纯函数：把决策列表汇成路由图计数。errors=带 error 或 status>=400；autoRouted=带 intent（按意图分类）。
// 不虚构 rerouted——本网关尚未做请求级 failover 重试，改道计数留待真正实装后再加，不拿空数据冒充。
export function summarizeDecisions(entries) {
  const summary = { requests: 0, errors: 0, autoRouted: 0, byModel: {}, byClient: {} };
  for (const entry of entries || []) {
    summary.requests += 1;
    if (entry?.error || Number(entry?.status) >= 400) summary.errors += 1;
    if (entry?.intent) summary.autoRouted += 1;
    const model = String(entry?.modelId || '');
    const client = String(entry?.clientId || '');
    if (model) summary.byModel[model] = (summary.byModel[model] || 0) + 1;
    if (client) summary.byClient[client] = (summary.byClient[client] || 0) + 1;
  }
  return summary;
}