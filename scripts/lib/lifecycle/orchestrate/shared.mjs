// 纯函数：把正整数环境变量归一化，避免 orchestrate 各分支重复解析预算参数。
export function normalizePositiveInteger(rawValue, fallback) {
  const value = Number.parseInt(String(rawValue ?? '').trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// 纯函数：统一解析布尔环境变量，兼容 1/0、true/false、yes/no、on/off。
export function parseBooleanEnv(rawValue, fallback = false) {
  const value = String(rawValue ?? '').trim().toLowerCase();
  if (!value) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
}

// 纯函数：把计数输入收敛为非负整数，供 retry、hindsight、entropy 等治理入口复用。
export function normalizeCounter(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

// 纯函数边界：统一警告输出优先级，让主编排入口不直接关心 io 兼容分支。
export function writeWarning(io, message) {
  const text = String(message || '').trim();
  if (!text) return;
  if (io && typeof io.warn === 'function') {
    io.warn(text);
    return;
  }
  if (io && typeof io.error === 'function') {
    io.error(text);
    return;
  }
  process.stderr.write(`${text}\n`);
}
