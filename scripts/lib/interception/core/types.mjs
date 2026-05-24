/* 中文注释：核心层定义拦截数据契约，把原始输出标准化成可压缩、可计量的 envelope。 */
/* 中文注释：默认阈值要偏保守；宁可小输出 inline，也不要把短错误信息藏进 ref 里。 */
export const DEFAULT_THRESHOLDS = Object.freeze({
  minRawBytes: 2048,
  maxSummaryLines: 8,
  maxKeyLines: 12,
  maxErrorLines: 8,
});

export const INTERCEPTION_PACKET_TYPE = 'aios.compact_packet';

/* 中文注释：把所有调用方的元信息整理成稳定 contract，后续层只信任这里返回的字段。 */
export function normalizeInterceptionRequest(request) {
  if (!request || typeof request !== 'object') {
    throw new TypeError('interception request must be an object');
  }
  const kind = String(request.kind || '').trim();
  const host = String(request.host || '').trim() || 'unknown';
  const sessionId = String(request.sessionId || 'default').trim() || 'default';
  if (!kind) throw new TypeError('interception request kind is required');
  return {
    kind,
    host,
    sessionId,
    cwd: request.cwd || '',
    payload: request.payload ?? {},
    capabilities: request.capabilities ?? {},
    metadata: request.metadata ?? {},
  };
}

/* 中文注释：不同工具返回字段名不一致，这里统一提取 stdout/stderr/raw/exitCode，避免压缩层知道每个宿主细节。 */
export function normalizeToolOutput(payload) {
  const stdout = stringifyOutput(payload?.stdout ?? payload?.output ?? payload?.result ?? '');
  const stderr = stringifyOutput(payload?.stderr ?? '');
  const raw = [stdout, stderr].filter(Boolean).join(stderr && stdout ? '\n' : '');
  return {
    raw,
    stdout,
    stderr,
    exitCode: normalizeExitCode(payload?.exitCode ?? payload?.exit_code ?? payload?.status),
    command: payload?.command ? String(payload.command) : '',
    toolName: payload?.toolName ? String(payload.toolName) : '',
  };
}

/* 中文注释：对象输出转成格式化 JSON，保证 MCP result、浏览器快照等结构化数据也能进入同一压缩流程。 */
function stringifyOutput(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); }
  catch { return String(value); }
}

/* 中文注释：宿主可能给 number/string/status/null，这里统一成数字退出码，失败路径才能稳定判定。 */
function normalizeExitCode(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
