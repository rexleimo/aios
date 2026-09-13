/**
 * should-run 决策门（借鉴 LoopX quota should-run，见 research/upstream/loopx-analysis.md §4.3）。
 *
 * "The timer only wakes the executor. The control plane decides."——本模块是
 * 纯决策函数：输入 run summary 的节奏/额度/连续计数状态，输出
 * {action, reasonCode, nextWakeMs, cadenceClass}：
 * - run：执行下一轮；
 * - wait：睡到 nextWakeMs 再问（不消耗 iteration）；
 * - ask：挂起等操作者（attended 下表现为停机，resume 仍须显式）；
 * - quiet：无人值守下的 unchanged-poll 停机建议；
 * - self_repair：保留动作——需要注册修复白名单 lane 后才会返回，v1 不产出。
 *
 * 全部输入来自 journal 数据（声明字段），不做关键词/文本猜测。
 */

export const SHOULD_RUN_ACTIONS = Object.freeze(['run', 'wait', 'ask', 'self_repair', 'quiet']);

const MIN_WAKE_MS = 1_000;

function wakeIn(targetMs, nowMs) {
  return Math.max(MIN_WAKE_MS, Math.floor(targetMs - nowMs));
}

/**
 * @param {object} input
 * @param {string|null} input.lastOutcome    run summary 的 lastOutcome
 * @param {string|null} input.lastStatus     run summary 的 status（human-gate 等）
 * @param {string|null} input.lastFailureClass
 * @param {object|null} input.quotaState     computeQuotaState() 的输出（未启用传 null）
 * @param {object|null} input.cadenceState   resolveCadenceState() 的输出
 * @param {number}      input.consecutiveNoop 连续 noop 轮数
 * @param {number|null} input.quietThreshold 连续 noop 停机阈值（null = 停用 quiet 建议）
 * @param {boolean}     input.operatorGateAcknowledged true = 本次运行入口视为操作者意图
 *                  （显式 resume / 首次启动）：上一轮遗留的 operator gate / budget /
 *                  human_gate cadence 不再次拦截；额度规则不受此影响（钱闸不放行）。
 * @param {number}      input.nowMs
 */
export function resolveShouldRun({
  lastOutcome = null,
  lastStatus = null,
  lastFailureClass = null,
  quotaState = null,
  cadenceState = null,
  consecutiveNoop = 0,
  quietThreshold = null,
  operatorGateAcknowledged = false,
  nowMs = Date.now(),
} = {}) {
  // 1. 操作者门未解除 → ask（resume 是显式动作，门不会自己消失）。
  if (!operatorGateAcknowledged && (lastOutcome === 'human-gate' || lastStatus === 'human-gate')) {
    return decision({ action: 'ask', reasonCode: 'operator_gate', cadenceState });
  }

  // 2. provider 侧预算耗尽：控制面算不出恢复时间，交给操作者。
  if (!operatorGateAcknowledged && lastFailureClass === 'budget-exhausted') {
    return decision({ action: 'ask', reasonCode: 'budget_exhausted', cadenceState });
  }

  // 3. 占空比额度耗尽 → 等最早一笔 spend 退出窗口。
  if (quotaState?.exhausted) {
    const target = Number.isFinite(quotaState.freedAtMs) ? quotaState.freedAtMs : nowMs + MIN_WAKE_MS;
    return decision({
      action: 'wait',
      reasonCode: 'quota_exhausted',
      nextWakeMs: wakeIn(target, nowMs),
      cadenceState,
    });
  }

  // 4. cadence 未到唤醒点 → 监控等待。
  if (cadenceState && cadenceState.untilMs === null) {
    return decision({ action: 'ask', reasonCode: 'cadence_human_gate', cadenceState });
  }
  if (cadenceState && Number.isFinite(cadenceState.untilMs) && cadenceState.untilMs > nowMs) {
    return decision({
      action: 'wait',
      reasonCode: 'cadence_wait',
      nextWakeMs: wakeIn(cadenceState.untilMs, nowMs),
      cadenceState,
    });
  }

  // 5. unchanged-poll 停机建议（仅在无人值守档启用阈值时）。
  if (Number.isFinite(quietThreshold) && quietThreshold > 0 && consecutiveNoop >= quietThreshold) {
    return decision({ action: 'quiet', reasonCode: 'unchanged_poll', cadenceState });
  }

  return decision({ action: 'run', reasonCode: 'eligible', cadenceState });
}

function decision({ action, reasonCode, nextWakeMs = 0, cadenceState = null }) {
  return Object.freeze({
    action,
    reasonCode,
    nextWakeMs,
    cadenceClass: cadenceState?.cadenceClass || null,
  });
}
