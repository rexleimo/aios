import { SPLITS, TEACHER_CALL_STATUS } from './constants.mjs';
import {
  assertEnum,
  assertInteger,
  assertNoUnknownKeys,
  assertNullableString,
  assertNumber,
  assertObject,
  assertString,
  assertStringArray,
} from './assertions.mjs';

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
