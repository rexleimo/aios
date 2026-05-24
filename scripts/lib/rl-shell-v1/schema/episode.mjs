import {
  ADMISSION_STATUS,
  COMPARISON_STATUS,
  DISTILLATION_STATUS,
  EPISODE_ALLOWED_KEYS,
  EPISODE_ENVIRONMENTS,
  EPISODE_STATUS,
  RELATIVE_OUTCOMES,
  REPLAY_ROUTES,
  SPLITS,
  STOP_CONDITIONS,
  TASK_SOURCES,
  TEACHER_CALL_STATUS,
} from './constants.mjs';
import {
  assertArray,
  assertBoolean,
  assertEnum,
  assertInteger,
  assertNoUnknownKeys,
  assertNullableString,
  assertNumber,
  assertObject,
  assertString,
  assertStringArray,
} from './assertions.mjs';
import { validateActionObject, validateObservationEvent } from './action-observation.mjs';

function validateStudentStep(step, index) {
  assertObject(step, `episode.student_steps[${index}]`);
  assertNoUnknownKeys(step, ['step_index', 'prompt_excerpt', 'raw_output_text', 'token_ids', 'token_logprobs', 'parsed_action', 'observation_event'], `episode.student_steps[${index}]`);
  assertInteger(step.step_index, `episode.student_steps[${index}].step_index`, { min: 1 });
  if (typeof step.prompt_excerpt !== 'string') {
    throw new Error(`episode.student_steps[${index}].prompt_excerpt must be a string`);
  }
  if (typeof step.raw_output_text !== 'string') {
    throw new Error(`episode.student_steps[${index}].raw_output_text must be a string`);
  }
  assertArray(step.token_ids, `episode.student_steps[${index}].token_ids`);
  assertArray(step.token_logprobs, `episode.student_steps[${index}].token_logprobs`);
  validateActionObject(step.parsed_action, `episode.student_steps[${index}].parsed_action`);
  validateObservationEvent(step.observation_event);
}

function validateEpisodeIdentity(raw) {
  assertInteger(raw.schema_version, 'episode.schema_version', { min: 1 });
  if (raw.schema_version !== 1) {
    throw new Error('episode.schema_version must equal 1');
  }
  assertEnum(raw.environment, EPISODE_ENVIRONMENTS, 'episode.environment');
  assertString(raw.episode_id, 'episode.episode_id');
  assertString(raw.run_id, 'episode.run_id');
  assertString(raw.task_id, 'episode.task_id');
  assertEnum(raw.task_source, TASK_SOURCES, 'episode.task_source');
  assertEnum(raw.split, SPLITS, 'episode.split');
  assertString(raw.repo_snapshot_id, 'episode.repo_snapshot_id');
  assertString(raw.student_model_id, 'episode.student_model_id');
  assertString(raw.teacher_backend_requested, 'episode.teacher_backend_requested');
  assertString(raw.teacher_backend_used, 'episode.teacher_backend_used');
  if (raw.task_source === 'real_shadow') {
    assertString(raw.attempt_id, 'episode.attempt_id');
  } else if (raw.attempt_id !== null && raw.attempt_id !== undefined) {
    assertString(raw.attempt_id, 'episode.attempt_id');
  }
  assertString(raw.update_epoch_id, 'episode.update_epoch_id');
  assertString(raw.batch_id, 'episode.batch_id');
  assertNullableString(raw.pre_update_ref_checkpoint_id, 'episode.pre_update_ref_checkpoint_id');
  assertInteger(raw.seed, 'episode.seed');
  assertString(raw.start_ts, 'episode.start_ts');
  assertString(raw.end_ts, 'episode.end_ts');
  assertEnum(raw.status, EPISODE_STATUS, 'episode.status');
}

function validateEpisodeTaskAndSteps(raw) {
  assertString(raw.task_prompt, 'episode.task_prompt');
  assertStringArray(raw.constraints, 'episode.constraints');
  assertStringArray(raw.baseline_failing_tests, 'episode.baseline_failing_tests');
  assertBoolean(raw.baseline_reproduced, 'episode.baseline_reproduced');
  assertArray(raw.student_steps, 'episode.student_steps');
  raw.student_steps.forEach(validateStudentStep);
  assertStringArray(raw.commands_executed, 'episode.commands_executed');
  assertStringArray(raw.files_read, 'episode.files_read');
  assertStringArray(raw.files_touched, 'episode.files_touched');
  assertArray(raw.patch_apply_results, 'episode.patch_apply_results');
  assertBoolean(raw.verification_executed, 'episode.verification_executed');
  assertBoolean(raw.verification_passed, 'episode.verification_passed');
  if (typeof raw.stdout_summary !== 'string') throw new Error('episode.stdout_summary must be a string');
  if (typeof raw.stderr_summary !== 'string') throw new Error('episode.stderr_summary must be a string');
  if (typeof raw.final_diff !== 'string') throw new Error('episode.final_diff must be a string');
  assertStringArray(raw.tests_before, 'episode.tests_before');
  assertStringArray(raw.tests_after, 'episode.tests_after');
  assertArray(raw.runtime_failures, 'episode.runtime_failures');
  assertBoolean(raw.timeout_flag, 'episode.timeout_flag');
  assertString(raw.stop_reason, 'episode.stop_reason');
  assertEnum(raw.stop_condition, STOP_CONDITIONS, 'episode.stop_condition');
  assertInteger(raw.no_progress_window, 'episode.no_progress_window', { min: 1 });
}

function validateEpisodeTeacherAndRewards(raw) {
  assertEnum(raw.teacher_call_status, TEACHER_CALL_STATUS, 'episode.teacher_call_status');
  assertInteger(raw.teacher_latency_ms, 'episode.teacher_latency_ms', { min: 0 });
  assertNumber(raw.teacher_confidence, 'episode.teacher_confidence');
  if (raw.teacher_confidence < 0 || raw.teacher_confidence > 1) {
    throw new Error('episode.teacher_confidence must be in [0, 1]');
  }
  assertNullableString(raw.teacher_critique, 'episode.teacher_critique');
  if (raw.teacher_reference_solution !== null && typeof raw.teacher_reference_solution !== 'string' && !Array.isArray(raw.teacher_reference_solution)) {
    throw new Error('episode.teacher_reference_solution must be a string, array, or null');
  }
  assertNumber(raw.teacher_shaping_score, 'episode.teacher_shaping_score');
  assertEnum(raw.distillation_status, DISTILLATION_STATUS, 'episode.distillation_status');
  if (raw.distillation_skip_reason !== null && typeof raw.distillation_skip_reason !== 'string') {
    throw new Error('episode.distillation_skip_reason must be a string or null');
  }
  for (const field of ['terminal_reward', 'teacher_term', 'fused_reward', 'advantage', 'return', 'replay_priority', 'policy_loss', 'distill_loss', 'kl_loss']) {
    assertNumber(raw[field], `episode.${field}`);
  }
}

function validateEpisodeReplayAndArtifacts(raw) {
  assertEnum(raw.comparison_status, COMPARISON_STATUS, 'episode.comparison_status');
  if (raw.comparison_status === 'completed') {
    assertEnum(raw.relative_outcome, RELATIVE_OUTCOMES, 'episode.relative_outcome');
  } else if (raw.relative_outcome !== null) {
    throw new Error('episode.relative_outcome must be null when comparison_status=comparison_failed');
  }
  assertBoolean(raw.rollback_batch, 'episode.rollback_batch');
  assertEnum(raw.admission_status, ADMISSION_STATUS, 'episode.admission_status');
  assertNullableString(raw.admission_reason, 'episode.admission_reason');
  if (raw.replay_priority < 0 || raw.replay_priority > 1) {
    throw new Error('episode.replay_priority must be in [0, 1]');
  }
  assertBoolean(raw.replay_eligible, 'episode.replay_eligible');
  assertEnum(raw.replay_route, REPLAY_ROUTES, 'episode.replay_route');
  assertBoolean(raw.safety_violation, 'episode.safety_violation');
  if (raw.safety_violation) {
    assertString(raw.safety_violation_reason, 'episode.safety_violation_reason');
  } else if (raw.safety_violation_reason !== null) {
    throw new Error('episode.safety_violation_reason must be null when safety_violation=false');
  }
  for (const field of ['stdout_artifact_path', 'stderr_artifact_path', 'final_diff_artifact_path', 'observation_trace_artifact_path']) {
    assertString(raw[field], `episode.${field}`);
  }
}

export function validateEpisodeRecord(raw) {
  assertObject(raw, 'episode');
  assertNoUnknownKeys(raw, EPISODE_ALLOWED_KEYS, 'episode');
  validateEpisodeIdentity(raw);
  validateEpisodeTaskAndSteps(raw);
  validateEpisodeTeacherAndRewards(raw);
  validateEpisodeReplayAndArtifacts(raw);
  return raw;
}
