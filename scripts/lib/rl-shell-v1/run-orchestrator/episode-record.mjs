import { dedupe, formatSequenceId } from './helpers.mjs';

export function buildEpisodeRecord({
  runId,
  task,
  seed,
  startedAt,
  endedAt,
  studentSteps,
  baseline,
  verification,
  rewardParts,
  teacherResponse,
  trainerMetrics = {},
  stopCondition,
  stopReason,
  executionPolicy,
}) {
  const success = rewardParts.terminalReward > 0;
  const commandsExecuted = [];
  const filesRead = [];
  const filesTouched = [];
  const patchApplyResults = [];
  const runtimeFailures = [];
  let timeoutFlag = false;

  for (const step of studentSteps) {
    const action = step.parsed_action;
    const observation = step.observation_event;
    if (action?.action === 'run' && action.command) {
      commandsExecuted.push(action.command);
    }
    if (action?.action === 'read' && action.path) {
      filesRead.push(action.path);
    }
    if (Array.isArray(observation?.payload?.files_touched)) {
      filesTouched.push(...observation.payload.files_touched);
    }
    if (action?.action === 'patch') {
      patchApplyResults.push({
        applied: observation?.payload?.applied === true,
        reject_reason: observation?.payload?.reject_reason ?? null,
      });
      if (Array.isArray(observation?.payload?.files_touched)) {
        filesTouched.push(...observation.payload.files_touched);
      }
    }
    if (observation?.status === 'timeout') {
      timeoutFlag = true;
      runtimeFailures.push('command_timeout');
    } else if (observation?.status === 'error' && observation?.error_code) {
      runtimeFailures.push(observation.error_code);
    } else if (observation?.status === 'rejected' && observation?.error_code) {
      runtimeFailures.push(observation.error_code);
    }
  }

  const finalDiff = studentSteps
    .filter((step) => step.parsed_action?.action === 'patch')
    .map((step) => step.parsed_action.diff || '')
    .join('\n');

  const finalObservation = verification.observation;
  const replayPriority = success ? 0.7 : verification.tests_after.length < baseline.failingTests.length ? 0.5 : 0.3;
  return {
    episode_id: `${runId}-episode-001`,
    run_id: runId,
    task_id: task.task_id,
    task_source: 'synthetic',
    split: task.split,
    repo_snapshot_id: task.repo_snapshot_id,
    student_model_id: 'tiny-json-policy-v1',
    teacher_backend_requested: teacherResponse.backend_used,
    teacher_backend_used: teacherResponse.backend_used,
    attempt_id: null,
    update_epoch_id: formatSequenceId('epoch', 1),
    batch_id: formatSequenceId('batch', 1),
    pre_update_ref_checkpoint_id: null,
    seed,
    start_ts: startedAt.toISOString(),
    end_ts: endedAt.toISOString(),
    status: timeoutFlag ? 'timeout' : success ? 'success' : 'failed',
    task_prompt: task.task_prompt,
    constraints: task.constraints,
    baseline_failing_tests: baseline.failingTests,
    baseline_reproduced: baseline.reproduced,
    student_steps: studentSteps,
    commands_executed: dedupe(commandsExecuted),
    files_read: dedupe(filesRead),
    files_touched: dedupe(filesTouched),
    patch_apply_results: patchApplyResults,
    verification_executed: true,
    verification_passed: verification.verification_status === 'ok',
    stdout_summary: finalObservation.payload?.stdout_excerpt || '',
    stderr_summary: finalObservation.payload?.stderr_excerpt || '',
    final_diff: finalDiff,
    tests_before: baseline.failingTests,
    tests_after: verification.tests_after,
    runtime_failures: dedupe(runtimeFailures),
    timeout_flag: timeoutFlag,
    stop_reason: stopReason,
    stop_condition: stopCondition,
    no_progress_window: Number(executionPolicy.no_progress_window || 3),
    teacher_call_status: teacherResponse.call_status,
    teacher_latency_ms: teacherResponse.latency_ms,
    teacher_confidence: teacherResponse.confidence,
    teacher_critique: teacherResponse.critique,
    teacher_reference_solution: teacherResponse.reference_solution,
    teacher_shaping_score: teacherResponse.shaping_score,
    distillation_status: teacherResponse.reference_solution ? 'applied' : 'skipped',
    distillation_skip_reason: teacherResponse.reference_solution ? null : 'teacher_unavailable',
    terminal_reward: rewardParts.terminalReward,
    teacher_term: rewardParts.teacherTerm,
    fused_reward: rewardParts.fusedReward,
    advantage: Number(trainerMetrics.advantage || 0),
    return: Number(trainerMetrics.return || 0),
    comparison_status: 'completed',
    relative_outcome: success ? 'better' : 'same',
    rollback_batch: false,
    admission_status: 'admitted',
    admission_reason: null,
    replay_eligible: baseline.reproduced && stopCondition !== 'unsafe_runner_state',
    replay_priority: replayPriority,
    replay_route: success ? 'positive' : 'neutral',
    policy_loss: Number(trainerMetrics.policy_loss || 0),
    distill_loss: Number(trainerMetrics.distill_loss || 0),
    kl_loss: Number(trainerMetrics.kl_loss || 0),
    stdout_artifact_path: 'artifacts/stdout.log',
    stderr_artifact_path: 'artifacts/stderr.log',
    final_diff_artifact_path: 'artifacts/final.patch',
    observation_trace_artifact_path: 'artifacts/trace.json',
  };
}
