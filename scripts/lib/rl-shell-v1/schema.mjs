import runSummarySchema from '../specs/rl-shell-v1-run-summary.schema.json' with { type: 'json' };

const ACTION_TYPES = new Set(['read', 'run', 'patch', 'stop']);
const EPISODE_ENVIRONMENTS = new Set(['shell']);
const OBSERVATION_STATUS = new Set(['ok', 'rejected', 'error', 'timeout']);
const TEACHER_CALL_STATUS = new Set(['ok', 'fallback_ok', 'invalid_response', 'failed_all_backends']);
const SPLITS = new Set(['train', 'held_out']);
const EPISODE_STATUS = new Set(['success', 'failed', 'runtime_error', 'timeout']);
const DISTILLATION_STATUS = new Set(['applied', 'skipped']);
const TASK_SOURCES = new Set(['synthetic', 'real_shadow']);
const COMPARISON_STATUS = new Set(['completed', 'comparison_failed']);
const RELATIVE_OUTCOMES = new Set(['better', 'same', 'worse']);
const ADMISSION_STATUS = new Set(['admitted', 'rejected']);
const REPLAY_ROUTES = new Set(['positive', 'neutral', 'negative', 'diagnostic_only']);
const STOP_CONDITIONS = new Set([
  'student_stop',
  'verification_passed',
  'max_steps_reached',
  'episode_timeout',
  'unsafe_runner_state',
  'repeated_no_progress',
]);

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertNoUnknownKeys(value, allowedKeys, label) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} contains unknown key: ${key}`);
    }
  }
}

export function assertEnum(value, allowed, label) {
  if (!allowed.has(value)) {
    throw new Error(`${label} must be one of: ${Array.from(allowed).join(', ')}`);
  }
}

export function assertString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

export function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
}

function assertNullableString(value, label) {
  if (value === null) return;
  assertString(value, label);
}

function assertNullableEnum(value, allowed, label) {
  if (value === null) return;
  assertEnum(value, allowed, label);
}

function assertNumber(value, label) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${label} must be a number`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean`);
  }
}

function assertInteger(value, label, { min = Number.MIN_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${label} must be an integer >= ${min}`);
  }
}

function assertStringArray(value, label) {
  assertArray(value, label);
  for (const [index, item] of value.entries()) {
    assertString(item, `${label}[${index}]`);
  }
}

function validateActionObject(action, label = 'action') {
  assertObject(action, label);
  assertNoUnknownKeys(action, ['action', 'path', 'command', 'diff', 'message'], label);
  assertEnum(action.action, ACTION_TYPES, `${label}.action`);
  if (action.action === 'read') {
    assertString(action.path, `${label}.path`);
  } else if (action.action === 'run') {
    assertString(action.command, `${label}.command`);
  } else if (action.action === 'patch') {
    assertString(action.diff, `${label}.diff`);
  } else if (action.action === 'stop') {
    assertString(action.message, `${label}.message`);
  }
}

function validateObservationPayload(actionType, payload) {
  assertObject(payload, 'payload');
  if (actionType === 'read') {
    assertNoUnknownKeys(payload, ['path', 'content_excerpt', 'content_truncated', 'bytes_read'], 'payload');
    assertString(payload.path, 'payload.path');
    assertBoolean(payload.content_truncated, 'payload.content_truncated');
    assertInteger(payload.bytes_read, 'payload.bytes_read', { min: 0 });
    if (typeof payload.content_excerpt !== 'string') {
      throw new Error('payload.content_excerpt must be a string');
    }
    return;
  }
  if (actionType === 'run') {
    assertNoUnknownKeys(payload, ['exit_code', 'stdout_excerpt', 'stderr_excerpt', 'stdout_truncated', 'stderr_truncated', 'files_touched'], 'payload');
    assertInteger(payload.exit_code, 'payload.exit_code');
    if (typeof payload.stdout_excerpt !== 'string') {
      throw new Error('payload.stdout_excerpt must be a string');
    }
    if (typeof payload.stderr_excerpt !== 'string') {
      throw new Error('payload.stderr_excerpt must be a string');
    }
    assertBoolean(payload.stdout_truncated, 'payload.stdout_truncated');
    assertBoolean(payload.stderr_truncated, 'payload.stderr_truncated');
    assertStringArray(payload.files_touched, 'payload.files_touched');
    return;
  }
  if (actionType === 'patch') {
    assertNoUnknownKeys(payload, ['applied', 'files_touched', 'reject_reason', 'diff_excerpt'], 'payload');
    assertBoolean(payload.applied, 'payload.applied');
    assertStringArray(payload.files_touched, 'payload.files_touched');
    if (payload.reject_reason !== null && typeof payload.reject_reason !== 'string') {
      throw new Error('payload.reject_reason must be a string or null');
    }
    if (typeof payload.diff_excerpt !== 'string') {
      throw new Error('payload.diff_excerpt must be a string');
    }
    return;
  }
  assertNoUnknownKeys(payload, ['message'], 'payload');
  assertString(payload.message, 'payload.message');
}

export function validateTaskManifest(raw) {
  assertObject(raw, 'task manifest');
  assertNoUnknownKeys(
    raw,
    ['schema_version', 'task_id', 'repo_snapshot_id', 'repo_source_path', 'split', 'task_prompt', 'verification_command', 'baseline_failing_tests', 'constraints'],
    'task manifest'
  );
  assertInteger(raw.schema_version, 'task manifest.schema_version', { min: 1 });
  if (raw.schema_version !== 1) {
    throw new Error('task manifest.schema_version must equal 1');
  }
  assertString(raw.task_id, 'task manifest.task_id');
  assertString(raw.repo_snapshot_id, 'task manifest.repo_snapshot_id');
  assertString(raw.repo_source_path, 'task manifest.repo_source_path');
  assertEnum(raw.split, SPLITS, 'task manifest.split');
  assertString(raw.task_prompt, 'task manifest.task_prompt');
  assertString(raw.verification_command, 'task manifest.verification_command');
  assertStringArray(raw.baseline_failing_tests, 'task manifest.baseline_failing_tests');
  assertStringArray(raw.constraints, 'task manifest.constraints');
  return raw;
}

export function validateObservationEvent(raw) {
  assertObject(raw, 'observation event');
  assertNoUnknownKeys(raw, ['schema_version', 'step_index', 'action', 'status', 'error_code', 'error_message', 'payload'], 'observation event');
  assertInteger(raw.schema_version, 'observation event.schema_version', { min: 1 });
  if (raw.schema_version !== 1) {
    throw new Error('observation event.schema_version must equal 1');
  }
  assertInteger(raw.step_index, 'observation event.step_index', { min: 1 });
  validateActionObject(raw.action, 'observation event.action');
  assertEnum(raw.status, OBSERVATION_STATUS, 'observation event.status');
  if (raw.error_code !== null && typeof raw.error_code !== 'string') {
    throw new Error('observation event.error_code must be a string or null');
  }
  if (raw.error_message !== null && typeof raw.error_message !== 'string') {
    throw new Error('observation event.error_message must be a string or null');
  }
  validateObservationPayload(raw.action.action, raw.payload);
  return raw;
}

export function validateTeacherResponse(raw) {
  assertObject(raw, 'teacher response');
  assertNoUnknownKeys(raw, ['backend_used', 'call_status', 'latency_ms', 'critique', 'reference_solution', 'shaping_score', 'confidence'], 'teacher response');
  assertString(raw.backend_used, 'teacher response.backend_used');
  assertEnum(raw.call_status, TEACHER_CALL_STATUS, 'teacher response.call_status');
  assertInteger(raw.latency_ms, 'teacher response.latency_ms', { min: 0 });
  assertNullableString(raw.critique, 'teacher response.critique');
  if (raw.reference_solution !== null && typeof raw.reference_solution !== 'string' && !Array.isArray(raw.reference_solution)) {
    throw new Error('teacher response.reference_solution must be a string, array, or null');
  }
  assertNumber(raw.shaping_score, 'teacher response.shaping_score');
  if (raw.shaping_score < -1 || raw.shaping_score > 1) {
    throw new Error('teacher response.shaping_score must be in [-1, 1]');
  }
  assertNumber(raw.confidence, 'teacher response.confidence');
  if (raw.confidence < 0 || raw.confidence > 1) {
    throw new Error('teacher response.confidence must be in [0, 1]');
  }
  return raw;
}

export function readShellEpisodeForDiagnosis(raw) {
  assertObject(raw, 'diagnostic shell episode');
  const schemaVersion = raw.schema_version === 1 ? 'v1' : 'v0';
  return {
    ...raw,
    schema_version: raw.schema_version ?? 0,
    environment: raw.environment ?? 'shell',
    safety_violation: raw.safety_violation ?? false,
    safety_violation_reason: raw.safety_violation_reason ?? null,
    legacyCompatibility: {
      schemaVersion,
      replayEligible: schemaVersion === 'v1',
    },
  };
}

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

export function validateEpisodeRecord(raw) {
  assertObject(raw, 'episode');
  assertNoUnknownKeys(
    raw,
    [
      'schema_version',
      'environment',
      'episode_id',
      'run_id',
      'task_id',
      'task_source',
      'split',
      'repo_snapshot_id',
      'student_model_id',
      'teacher_backend_requested',
      'teacher_backend_used',
      'attempt_id',
      'update_epoch_id',
      'batch_id',
      'pre_update_ref_checkpoint_id',
      'seed',
      'start_ts',
      'end_ts',
      'status',
      'task_prompt',
      'constraints',
      'baseline_failing_tests',
      'baseline_reproduced',
      'student_steps',
      'commands_executed',
      'files_read',
      'files_touched',
      'patch_apply_results',
      'verification_executed',
      'verification_passed',
      'stdout_summary',
      'stderr_summary',
      'final_diff',
      'tests_before',
      'tests_after',
      'runtime_failures',
      'timeout_flag',
      'stop_reason',
      'stop_condition',
      'no_progress_window',
      'teacher_call_status',
      'teacher_latency_ms',
      'teacher_confidence',
      'teacher_critique',
      'teacher_reference_solution',
      'teacher_shaping_score',
      'distillation_status',
      'distillation_skip_reason',
      'terminal_reward',
      'teacher_term',
      'fused_reward',
      'advantage',
      'return',
      'comparison_status',
      'relative_outcome',
      'rollback_batch',
      'admission_status',
      'admission_reason',
      'replay_eligible',
      'replay_priority',
      'replay_route',
      'safety_violation',
      'safety_violation_reason',
      'policy_loss',
      'distill_loss',
      'kl_loss',
      'stdout_artifact_path',
      'stderr_artifact_path',
      'final_diff_artifact_path',
      'observation_trace_artifact_path',
    ],
    'episode'
  );
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
  return raw;
}

export function validateRunSummary(raw) {
  assertObject(raw, 'run summary');
  assertNoUnknownKeys(raw, Object.keys(runSummarySchema.properties), 'run summary');
  for (const field of runSummarySchema.required) {
    if (!(field in raw) || raw[field] === undefined) {
      throw new Error(`run summary missing required field: ${field}`);
    }
  }
  assertString(raw.run_id, 'run summary.run_id');
  assertString(raw.spec_path, 'run summary.spec_path');
  assertString(raw.student_model_id, 'run summary.student_model_id');
  if (raw.phase !== undefined) {
    assertString(raw.phase, 'run summary.phase');
  }
  assertString(raw.primary_teacher, 'run summary.primary_teacher');
  assertStringArray(raw.fallback_order, 'run summary.fallback_order');
  assertString(raw.train_split, 'run summary.train_split');
  assertString(raw.held_out_split, 'run summary.held_out_split');
  assertString(raw.best_checkpoint_path, 'run summary.best_checkpoint_path');
  assertObject(raw.best_metrics, 'run summary.best_metrics');
  assertArray(raw.seed_results, 'run summary.seed_results');
  for (const field of ['updates_completed', 'updates_failed', 'rollbacks_completed', 'replay_only_epochs', 'comparison_failed_count']) {
    if (raw[field] !== undefined) {
      assertInteger(raw[field], `run summary.${field}`, { min: 0 });
    }
  }
  for (const field of ['better_count', 'same_count', 'worse_count']) {
    if (raw[field] !== undefined) {
      assertInteger(raw[field], `run summary.${field}`, { min: 0 });
    }
  }
  if (raw.teacher_shaping_alignment_rate !== undefined) {
    assertNumber(raw.teacher_shaping_alignment_rate, 'run summary.teacher_shaping_alignment_rate');
    if (raw.teacher_shaping_alignment_rate < 0 || raw.teacher_shaping_alignment_rate > 1) {
      throw new Error('run summary.teacher_shaping_alignment_rate must be in [0, 1]');
    }
  }
  for (const field of ['active_checkpoint_id', 'pre_update_ref_checkpoint_id', 'last_stable_checkpoint_id']) {
    if (raw[field] !== undefined) {
      assertString(raw[field], `run summary.${field}`);
    }
  }
  if (raw.replay_pool_status !== undefined) {
    assertString(raw.replay_pool_status, 'run summary.replay_pool_status');
  }
  assertString(raw.status, 'run summary.status');
  return raw;
}
