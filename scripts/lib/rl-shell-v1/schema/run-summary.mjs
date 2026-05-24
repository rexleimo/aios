import runSummarySchema from '../../specs/rl-shell-v1-run-summary.schema.json' with { type: 'json' };
import { assertArray, assertInteger, assertNumber, assertObject, assertString, assertStringArray, assertNoUnknownKeys } from './assertions.mjs';

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
