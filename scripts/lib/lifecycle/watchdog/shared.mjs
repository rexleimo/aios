/* 中文注释：watchdog 纯函数工具负责输入归一化和时间计算，不触碰文件系统。 */

// 纯函数：统一修剪字符串，避免 session/provider 参数含空白导致误判。
export function normalizeText(value) {
  return String(value ?? '').trim();
}

// 纯函数：数值字段允许无法解析时回退，便于组合多个弱信号。
export function normalizeNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// 纯函数：把用户输入规整为非负整数，非法值走 fallback。
export function normalizeNonNegativeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

// 纯函数：根据 epoch 毫秒计算分钟年龄，缺失时间返回 null。
export function ageMinutesFromEpoch(epochMs, nowMs) {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return null;
  const ageMs = Math.max(0, nowMs - epochMs);
  return Math.floor(ageMs / 60000);
}

// 纯函数：去重并过滤空文本，供 readiness 和 nextActions 共用。
export function normalizeUniqueTextArray(value) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map((item) => normalizeText(item)).filter(Boolean))];
}
