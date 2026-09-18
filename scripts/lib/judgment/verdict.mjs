// scripts/lib/judgment/verdict.mjs — 把一次判定答案映射成 act / confirm / abort。
//
// 纯函数，不做任何 I/O，方便单测把边界钉死。三条规则来自计划文档：
//   1. 阈值由配置给，不由模型给；
//   2. 只能收窄动作 —— riskClass 只能【抬高】actFloor，永不降低；
//   3. 低置信 = 不动手（"I don't know" 是有用信号）。
export const RISK_CLASSES = Object.freeze(['read-only', 'guarded', 'destructive']);

// 风险只做加法：破坏性动作要比只读动作更确定才敢自动放行。
export const RISK_FLOOR_LIFT = Object.freeze({
  'read-only': 0,
  guarded: 0.05,
  destructive: 0.15,
});

export const VERDICTS = Object.freeze(['act', 'confirm', 'abort']);

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

// 计算结果阈值。riskClass 只能抬高 actFloor；confirmFloor 跟随但不得超过 actFloor。
export function resolveFloors({ actFloor, confirmFloor, riskClass = 'guarded' }) {
  if (!RISK_CLASSES.includes(riskClass)) {
    const error = new Error(`unknown risk class "${riskClass}" (expected one of ${RISK_CLASSES.join(', ')})`);
    error.code = 'unknown-risk-class';
    throw error;
  }
  const lift = RISK_FLOOR_LIFT[riskClass];
  const effectiveActFloor = clamp01(actFloor + lift);
  const effectiveConfirmFloor = Math.min(confirmFloor, effectiveActFloor);
  return { effectiveActFloor, effectiveConfirmFloor, riskClass, lift };
}

/**
 * @returns {{verdict:'act'|'confirm'|'abort', reason:string, signal:number|null,
 *            signalKind:'confidence'|'noul', ...}}
 */
export function judgeVerdict({ answer, actFloor, confirmFloor, riskClass = 'guarded' }) {
  if (!answer || typeof answer !== 'object') {
    const error = new Error('judgeVerdict requires an answer object');
    error.code = 'invalid-answer';
    throw error;
  }
  const floors = resolveFloors({ actFloor, confirmFloor, riskClass });

  // Noul 按设计不带 confidence（见 API reference）。这里如实说明用的是概率本身，
  // 而不是偷偷给它编一个 confidence。
  const signalKind = answer.type === 'noul' ? 'noul' : 'confidence';
  const signal = signalKind === 'noul' ? answer.noul : answer.confidence;

  if (typeof signal !== 'number' || !Number.isFinite(signal)) {
    const error = new Error(`answer of type "${answer.type}" has no usable ${signalKind}`);
    error.code = 'invalid-answer';
    throw error;
  }

  const base = { ...floors, signal, signalKind, answer };

  if (signal >= floors.effectiveActFloor) {
    return {
      ...base,
      verdict: 'act',
      reason: `${signalKind} ${signal.toFixed(3)} >= actFloor ${floors.effectiveActFloor.toFixed(3)} (${riskClass})`,
    };
  }
  if (signal < floors.effectiveConfirmFloor) {
    return {
      ...base,
      verdict: 'abort',
      reason: `${signalKind} ${signal.toFixed(3)} < confirmFloor ${floors.effectiveConfirmFloor.toFixed(3)}; do not act`,
    };
  }
  return {
    ...base,
    verdict: 'confirm',
    reason: `${signalKind} ${signal.toFixed(3)} is between confirmFloor ${floors.effectiveConfirmFloor.toFixed(3)} and actFloor ${floors.effectiveActFloor.toFixed(3)}; ask a human`,
  };
}

// 供 CLI 展示的一行摘要。判定是提案，所以措辞必须带上"谁说的 / 多确定 / 编号"。
export function renderVerdictLine(questionId, result, { model, requestId } = {}) {
  const parts = [`  ${questionId}: ${result.verdict.toUpperCase()} (${result.reason})`];
  if (model) parts.push(`model=${model}`);
  if (requestId) parts.push(`request=${requestId}`);
  return `${parts.join(' ')}\n`;
}
