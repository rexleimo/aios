/**
 * 占空比额度（借鉴 LoopX quota economics，见 research/upstream/loopx-analysis.md §4.3）。
 *
 * compute 是占空比：24h 窗口 × 1 分钟 slot = 每天 1440 个 slot；computeQuota=1.0
 * 表示可占满全部 slot。只有 material turn（结算为进展/完成的轮）才扣费——
 * noop/wait/quiet 不扣。这样"无人值守烧钱"被限制为：窗口内的 material turn 总量。
 * 纯函数模块：账本由调用方（run summary）持久化。
 */

export const DEFAULT_QUOTA_CONFIG = Object.freeze({
  computeQuota: 1.0,
  windowHours: 24,
  slotMinutes: 1,
  slotsPerMaterialTurn: 1,
});

const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;

export function resolveQuotaConfig({
  enabled = false,
  computeQuota = DEFAULT_QUOTA_CONFIG.computeQuota,
  windowHours = DEFAULT_QUOTA_CONFIG.windowHours,
  slotMinutes = DEFAULT_QUOTA_CONFIG.slotMinutes,
  slotsPerMaterialTurn = DEFAULT_QUOTA_CONFIG.slotsPerMaterialTurn,
} = {}) {
  const quota = Number(computeQuota);
  if (!Number.isFinite(quota) || quota <= 0) {
    throw new TypeError('quota computeQuota must be a positive number');
  }
  const hours = Number(windowHours);
  if (!Number.isFinite(hours) || hours <= 0) throw new TypeError('quota windowHours must be a positive number');
  const slot = Number(slotMinutes);
  if (!Number.isFinite(slot) || slot <= 0) throw new TypeError('quota slotMinutes must be a positive number');
  const perTurn = Number(slotsPerMaterialTurn);
  if (!Number.isFinite(perTurn) || perTurn <= 0) {
    throw new TypeError('quota slotsPerMaterialTurn must be a positive number');
  }
  return Object.freeze({
    enabled: enabled === true,
    computeQuota: quota,
    windowHours: hours,
    slotMinutes: slot,
    slotsPerMaterialTurn: perTurn,
  });
}

function pruneSpend(spend, nowMs, windowMs) {
  return (Array.isArray(spend) ? spend : [])
    .map((entry) => ({ ts: Number(entry?.ts), slots: Number(entry?.slots) }))
    .filter((entry) => Number.isFinite(entry.ts) && Number.isFinite(entry.slots) && entry.slots > 0)
    .filter((entry) => entry.ts > nowMs - windowMs);
}

/** material 才产生一条 spend 记录；非 material 原样返回（不扣费）。 */
export function chargeQuotaSpend({ spend = [], material = false, nowMs = Date.now(), config = DEFAULT_QUOTA_CONFIG } = {}) {
  if (!material) return [...(Array.isArray(spend) ? spend : [])];
  return [...pruneSpend(spend, nowMs, config.windowHours * MINUTES_PER_HOUR * MS_PER_MINUTE), {
    ts: Math.floor(nowMs),
    slots: config.slotsPerMaterialTurn,
  }];
}

/**
 * 窗口内额度状态：used/capacity/remaining、是否耗尽，以及耗尽时最早一条
 * spend 退出窗口的时间点（freedAtMs，should-run 的 wait 唤醒依据）。
 */
export function computeQuotaState({ spend = [], nowMs = Date.now(), config = DEFAULT_QUOTA_CONFIG } = {}) {
  const windowMs = config.windowHours * MINUTES_PER_HOUR * MS_PER_MINUTE;
  const live = pruneSpend(spend, nowMs, windowMs);
  const usedSlots = live.reduce((total, entry) => total + entry.slots, 0);
  const capacitySlots = config.computeQuota * (config.windowHours * MINUTES_PER_HOUR / config.slotMinutes);
  const remainingSlots = Math.max(0, capacitySlots - usedSlots);
  const exhausted = config.enabled === true && remainingSlots <= 0;
  const freedAtMs = exhausted && live.length > 0
    ? Math.min(...live.map((entry) => entry.ts)) + windowMs
    : null;
  return Object.freeze({
    enabled: config.enabled === true,
    usedSlots,
    capacitySlots,
    remainingSlots,
    exhausted,
    freedAtMs,
    windowMs,
    liveSpend: Object.freeze(live),
  });
}
