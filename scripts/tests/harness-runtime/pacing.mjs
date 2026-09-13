import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveShouldRun,
} from '../../lib/harness/solo-runtime/should-run.mjs';
import {
  resolveCadenceConfig,
  resolveCadenceState,
  cadenceReady,
} from '../../lib/harness/solo-runtime/cadence.mjs';
import {
  chargeQuotaSpend,
  computeQuotaState,
  resolveQuotaConfig,
} from '../../lib/harness/solo-runtime/quota.mjs';

const NOW = 1_800_000_000_000;

test('should-run decision matrix follows the documented priority chain', () => {
  // 操作者门：仅在本次运行入口未被操作者意图覆盖时拦截。
  assert.deepEqual(
    resolveShouldRun({ lastOutcome: 'human-gate', nowMs: NOW }),
    { action: 'ask', reasonCode: 'operator_gate', nextWakeMs: 0, cadenceClass: null },
  );
  assert.equal(
    resolveShouldRun({ lastOutcome: 'human-gate', operatorGateAcknowledged: true, nowMs: NOW }).action,
    'run',
  );

  // budget 耗尽是操作者决策，不是重试信号；运行入口被操作者意图覆盖时不拦截。
  assert.equal(
    resolveShouldRun({ lastFailureClass: 'budget-exhausted', nowMs: NOW }).reasonCode,
    'budget_exhausted',
  );
  assert.equal(
    resolveShouldRun({ lastFailureClass: 'budget-exhausted', operatorGateAcknowledged: true, nowMs: NOW }).action,
    'run',
  );

  // 额度耗尽 → wait 到最早 spend 退出窗口；钱闸不受 operatorGateAcknowledged 影响。
  const quotaConfig = resolveQuotaConfig({ enabled: true, computeQuota: 1 / 1440 });
  const exhausted = computeQuotaState({
    spend: [{ ts: NOW - 1000, slots: 1 }],
    nowMs: NOW,
    config: quotaConfig,
  });
  const quotaWait = resolveShouldRun({ quotaState: exhausted, operatorGateAcknowledged: true, nowMs: NOW });
  assert.equal(quotaWait.action, 'wait');
  assert.equal(quotaWait.reasonCode, 'quota_exhausted');
  assert.ok(quotaWait.nextWakeMs > 0);

  // cadence 未到唤醒点 → wait；human_gate（untilMs=null）→ ask。
  const cadenceWait = resolveShouldRun({
    operatorGateAcknowledged: true,
    cadenceState: { cadenceClass: 'monitor_wait', delayMs: 1000, untilMs: NOW + 5000 },
    nowMs: NOW,
  });
  assert.equal(cadenceWait.action, 'wait');
  assert.equal(cadenceWait.reasonCode, 'cadence_wait');
  assert.equal(cadenceWait.nextWakeMs, 5000);

  // unchanged-poll quiet 建议（阈值启用才产出）。
  const quiet = resolveShouldRun({
    operatorGateAcknowledged: true,
    consecutiveNoop: 3,
    quietThreshold: 3,
    nowMs: NOW,
  });
  assert.deepEqual(
    { action: quiet.action, reasonCode: quiet.reasonCode },
    { action: 'quiet', reasonCode: 'unchanged_poll' },
  );
  assert.equal(
    resolveShouldRun({ operatorGateAcknowledged: true, consecutiveNoop: 3, quietThreshold: null, nowMs: NOW }).action,
    'run',
  );

  // 全部条件为空 → run。
  assert.deepEqual(
    resolveShouldRun({ operatorGateAcknowledged: true, nowMs: NOW }),
    { action: 'run', reasonCode: 'eligible', nextWakeMs: 0, cadenceClass: null },
  );
});

test('cadence ladder widens on non-material outcomes and resets on material progress', () => {
  const config = resolveCadenceConfig({ enabled: true, baseDelayMs: 100, maxDelayMs: 1000 });

  const first = resolveCadenceState({ outcome: { outcome: 'noop' }, nowMs: NOW, config });
  assert.equal(first.cadenceClass, 'monitor_wait');
  assert.equal(first.delayMs, 150); // 100 × 1.5

  const second = resolveCadenceState({ previous: first, outcome: { outcome: 'blocked' }, nowMs: NOW, config });
  assert.equal(second.delayMs, 225);

  const capped = resolveCadenceState({
    previous: { delayMs: 900 },
    outcome: { outcome: 'infra-retry' },
    nowMs: NOW,
    config,
  });
  assert.equal(capped.delayMs, 1000); // cap 生效

  const material = resolveCadenceState({ previous: capped, outcome: { outcome: 'success' }, nowMs: NOW, config });
  assert.equal(material.cadenceClass, 'active_work');
  assert.equal(material.delayMs, 100); // 回基准

  const gate = resolveCadenceState({ outcome: { outcome: 'human-gate' }, nowMs: NOW, config });
  assert.equal(gate.cadenceClass, 'human_gate');
  assert.equal(gate.untilMs, null); // 不自动唤醒
  assert.equal(cadenceReady(gate, NOW + 999_999), false);
  assert.equal(cadenceReady(material, material.untilMs), true);
});

test('quota charges only material turns and recovers when the window frees', () => {
  const config = resolveQuotaConfig({ enabled: true, computeQuota: 2 / 1440, windowHours: 24 });
  assert.equal(config.enabled, true);

  const now = NOW;
  let spend = chargeQuotaSpend({ spend: [], material: false, nowMs: now, config });
  assert.equal(spend.length, 0, 'non-material turns never charge');

  spend = chargeQuotaSpend({ spend, material: true, nowMs: now, config });
  let state = computeQuotaState({ spend, nowMs: now, config });
  assert.equal(state.usedSlots, 1);
  assert.equal(state.remainingSlots, 1);
  assert.equal(state.exhausted, false);

  spend = chargeQuotaSpend({ spend, material: true, nowMs: now + 1000, config });
  state = computeQuotaState({ spend, nowMs: now + 1000, config });
  assert.equal(state.exhausted, true);
  assert.equal(state.freedAtMs, now + 24 * 60 * 60 * 1000); // 最早 spend 退出窗口

  // 窗口滑过最早一笔后恢复可用。
  const recovered = computeQuotaState({ spend, nowMs: state.freedAtMs + 1, config });
  assert.equal(recovered.exhausted, false);
  assert.equal(recovered.remainingSlots, 1);
});

test('quota config validation fails closed on nonsense values', () => {
  assert.throws(() => resolveQuotaConfig({ enabled: true, computeQuota: 0 }), /positive/u);
  assert.throws(() => resolveQuotaConfig({ enabled: true, computeQuota: -1 }), /positive/u);
  assert.throws(() => resolveQuotaConfig({ enabled: true, windowHours: 0 }), /positive/u);
  assert.throws(() => resolveQuotaConfig({ enabled: true, slotMinutes: 'x' }), /positive/u);
  assert.throws(() => resolveCadenceConfig({ enabled: true, baseDelayMs: 100, maxDelayMs: 50 }), /maxDelayMs/u);
});
