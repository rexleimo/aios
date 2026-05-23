// 纯函数：根据监控覆盖率、比较结果和退化 streak 决定 epoch 下一步。
export function computeMixedEpochOutcome({
  coverage_sufficient,
  shell_safety_gate_passed,
  comparison_failed_count,
  degradation_streak,
  better_count = 1,
  worse_count = 0,
}) {
  if (degradation_streak >= 3) {
    return { epoch_outcome: 'rollback' };
  }
  if (!coverage_sufficient) {
    return { epoch_outcome: 'replay_only' };
  }
  if (shell_safety_gate_passed === false) {
    return { epoch_outcome: 'replay_only' };
  }
  if (comparison_failed_count > 0) {
    return { epoch_outcome: 'replay_only' };
  }
  if (better_count > 0 && worse_count === 0) {
    return { epoch_outcome: 'promotion_eligible' };
  }
  return { epoch_outcome: 'continue_monitoring' };
}
