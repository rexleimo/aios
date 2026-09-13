/**
 * 无人值守档位的 pacing 配置构建（Phase 3，见 docs/plans/2026-09-12-loopx-adoption-*.md）。
 *
 * attended（默认）：返回 null —— should-run 门完全关闭，行为与历史版本一致。
 * unattended（显式 opt-in）：quota 计费 + cadence 节奏 + unchanged-poll 停机 +
 * safe_bypass 全部启用，但额度上限默认保守（computeQuota=1.0，可调低）。
 * 重入方式不变：`aios harness resume` 显式触发。
 */

export const UNATTENDED_DEFAULTS = Object.freeze({
  computeQuota: 1.0,
  cadenceBaseMs: 180_000,
  cadenceMaxMs: 1_800_000,
  quietThreshold: 3,
  safeBypass: true,
});

export function buildLoopPacingConfig({
  unattended = false,
  computeQuota,
  cadenceBaseMs,
  cadenceMaxMs,
  quietThreshold,
  safeBypass,
} = {}) {
  if (unattended !== true) return null;
  return Object.freeze({
    quota: {
      enabled: true,
      computeQuota: Number.isFinite(Number(computeQuota)) && Number(computeQuota) > 0
        ? Number(computeQuota)
        : UNATTENDED_DEFAULTS.computeQuota,
    },
    cadence: {
      enabled: true,
      baseDelayMs: Number.isFinite(Number(cadenceBaseMs)) && Number(cadenceBaseMs) >= 0
        ? Number(cadenceBaseMs)
        : UNATTENDED_DEFAULTS.cadenceBaseMs,
      maxDelayMs: Number.isFinite(Number(cadenceMaxMs)) && Number(cadenceMaxMs) >= 0
        ? Number(cadenceMaxMs)
        : UNATTENDED_DEFAULTS.cadenceMaxMs,
    },
    quietThreshold: Number.isFinite(Number(quietThreshold)) && Number(quietThreshold) > 0
      ? Math.floor(Number(quietThreshold))
      : UNATTENDED_DEFAULTS.quietThreshold,
    safeBypass: safeBypass !== false,
    // 政策文本随 run payload 落盘可审计（LoopX safe_bypass 惯例）。
    policy: Object.freeze({
      tier: 'unattended',
      safeBypassTurns: safeBypass !== false ? 1 : 0,
      safeBypassScope: 'read-only steering / analysis / documentation; material claims are rejected by the settlement gate',
      materialChargeRule: 'only settled material turns charge quota',
    }),
  });
}
