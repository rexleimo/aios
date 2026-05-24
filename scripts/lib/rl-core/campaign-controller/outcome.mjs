import { reduceDegradationStreak as reduceDegradationStreakFromResults } from '../comparison-engine.mjs';

// 纯函数：根据监控摘要和安全门结果决定 epoch 下一步状态。
export function computeEpochOutcome({
  activeEnvironments = [],
  betterCount = 0,
  worseCount = 0,
  comparisonFailedCount = 0,
  coverageSatisfied = true,
  shellSafetyGatePassed,
  shellSafetyGate,
  degradationStreak = 0,
}) {
  if (degradationStreak >= 3) {
    return {
      outcome: 'rollback',
      shellSafetyGateCalled: false,
      shellSafetyGatePassed: shellSafetyGatePassed ?? null,
    };
  }

  if (!coverageSatisfied) {
    return {
      outcome: 'replay_only',
      shellSafetyGateCalled: false,
      shellSafetyGatePassed: shellSafetyGatePassed ?? null,
    };
  }

  let gateCalled = false;
  let gatePassed = shellSafetyGatePassed;
  const promotionCandidate = betterCount > 0 && worseCount === 0 && comparisonFailedCount === 0;
  if (promotionCandidate && activeEnvironments.includes('shell')) {
    if (typeof shellSafetyGate === 'function') {
      gateCalled = true;
      gatePassed = Boolean(shellSafetyGate());
    } else if (typeof gatePassed !== 'boolean') {
      gatePassed = true;
    }
  }

  if (promotionCandidate && activeEnvironments.includes('shell') && gatePassed === false) {
    return {
      outcome: 'replay_only',
      shellSafetyGateCalled: gateCalled,
      shellSafetyGatePassed: gatePassed,
    };
  }

  if (comparisonFailedCount > 0) {
    return {
      outcome: 'replay_only',
      shellSafetyGateCalled: gateCalled,
      shellSafetyGatePassed: gatePassed ?? null,
    };
  }

  if (promotionCandidate) {
    return {
      outcome: 'promotion_eligible',
      shellSafetyGateCalled: gateCalled,
      shellSafetyGatePassed: gatePassed ?? null,
    };
  }

  return {
    outcome: 'continue_monitoring',
    shellSafetyGateCalled: gateCalled,
    shellSafetyGatePassed: gatePassed ?? null,
  };
}

export function reduceMonitoringDegradation(results, { rollbackThreshold = 3 } = {}) {
  return reduceDegradationStreakFromResults(results, { rollbackThreshold });
}

export { reduceDegradationStreakFromResults as reduceDegradationStreak };
