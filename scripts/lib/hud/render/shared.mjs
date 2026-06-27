// 纯函数：统一 HUD 文本归一化，避免渲染层重复 trim。
export { normalizeText } from '../../../../src/shared/normalize.mjs';

// 纯函数：压缩单行文本，避免 Windows 终端和 watch 输出过宽。
export function clipLine(value, maxLen = 140) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

// 纯函数：规整 job/tool 进度计数，输出 HUD 可直接消费的结构。
export function normalizeProgressCounts(progress = null) {
  if (!progress || typeof progress !== 'object') return null;
  const total = Number.isFinite(progress.total) ? Math.max(0, Math.floor(progress.total)) : 0;
  const queued = Number.isFinite(progress.queued) ? Math.max(0, Math.floor(progress.queued)) : 0;
  const running = Number.isFinite(progress.running) ? Math.max(0, Math.floor(progress.running)) : 0;
  const blocked = Number.isFinite(progress.blocked) ? Math.max(0, Math.floor(progress.blocked)) : 0;
  const done = Number.isFinite(progress.done) ? Math.max(0, Math.floor(progress.done)) : 0;
  const completionRatio = Number.isFinite(progress.completionRatio)
    ? Math.max(0, Math.min(1, Number(progress.completionRatio)))
    : total > 0
      ? Math.max(0, Math.min(1, done / total))
      : 0;
  if (total <= 0) return null;
  return {
    total,
    queued,
    running,
    blocked,
    done,
    completionRatio,
  };
}

// 纯函数：把 0-1 完成度格式化为百分比。
export function formatCompletionPercent(completionRatio = 0) {
  const ratio = Number.isFinite(completionRatio) ? Math.max(0, Math.min(1, Number(completionRatio))) : 0;
  return `${Math.round(ratio * 100)}%`;
}
