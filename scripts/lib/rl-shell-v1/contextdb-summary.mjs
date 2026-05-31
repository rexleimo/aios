import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runContextDbCli } from '../contextdb-cli.mjs';
import { validateRunSummary } from './schema.mjs';

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function buildPhase3ContextSummary({ runSummary }) {
  return {
    phase: runSummary.phase || 'v1',
    updates_completed: Number(runSummary.updates_completed || 0),
    updates_failed: Number(runSummary.updates_failed || 0),
    rollbacks_completed: Number(runSummary.rollbacks_completed || 0),
    replay_only_epochs: Number(runSummary.replay_only_epochs || 0),
    comparison_failed_count: Number(runSummary.comparison_failed_count || 0),
    better_count: Number(runSummary.better_count || 0),
    same_count: Number(runSummary.same_count || 0),
    worse_count: Number(runSummary.worse_count || 0),
    teacher_shaping_alignment_rate: Number(runSummary.teacher_shaping_alignment_rate || 0),
    active_checkpoint_id: runSummary.active_checkpoint_id || null,
    pre_update_ref_checkpoint_id: runSummary.pre_update_ref_checkpoint_id || null,
    last_stable_checkpoint_id: runSummary.last_stable_checkpoint_id || null,
  };
}

async function defaultWriter({ rootDir, summary, sessionId, artifactPath }) {
  if (!sessionId) {
    return { persisted: false, skipped: true, artifactPath };
  }
  const phase3 = buildPhase3ContextSummary({ runSummary: summary });
  const verifyEvidence = [
    `best_checkpoint=${summary.best_checkpoint_path}`,
    `primary_teacher=${summary.primary_teacher}`,
  ];
  if (summary.phase === '3') {
    verifyEvidence.push(
      `rollbacks_completed=${phase3.rollbacks_completed}`,
      `last_stable_checkpoint_id=${phase3.last_stable_checkpoint_id || 'n/a'}`
    );
  }
  return runContextDbCli([
    'checkpoint',
    '--workspace',
    rootDir,
    '--session',
    sessionId,
    '--summary',
    `RL shell v1 run ${summary.run_id}`,
    '--status',
    summary.status === 'ok' ? 'done' : 'blocked',
    '--artifacts',
    artifactPath,
    '--next',
    `Inspect ${artifactPath}`,
    '--verify-result',
    summary.status === 'ok' ? 'passed' : 'failed',
    '--verify-evidence',
    verifyEvidence.join('; '),
    '--retry-count',
    '0',
    '--elapsed-ms',
    '0',
    '--cost-total-tokens',
    '0',
    '--cost-usd',
    '0',
  ], { cwd: rootDir });
}

function normalizeRunSummary(summary) {
  return {
    updates_completed: 0,
    updates_failed: 0,
    rollbacks_completed: 0,
    replay_only_epochs: 0,
    comparison_failed_count: 0,
    better_count: 0,
    same_count: 0,
    worse_count: 0,
    teacher_shaping_alignment_rate: 0,
    ...summary,
  };
}

export function buildRunSummaryPayload({ run, metrics, config }) {
  return validateRunSummary(normalizeRunSummary({
    run_id: run.runId,
    spec_path: 'docs/superpowers/specs/2026-03-22-aios-shell-rl-v1-design.md',
    student_model_id: run.studentModelId || 'tiny-json-policy-v1',
    phase: config.phase || 'v1',
    primary_teacher: config.teacher_backend_requested,
    fallback_order: config.fallback_order || [],
    train_split: 'benchmark-v1-train',
    held_out_split: 'benchmark-v1-held-out',
    best_checkpoint_path: run.bestCheckpointPath,
    best_metrics: metrics,
    updates_completed: Number(config.updates_completed || 0),
    updates_failed: Number(config.updates_failed || 0),
    rollbacks_completed: Number(config.rollbacks_completed || 0),
    replay_only_epochs: Number(config.replay_only_epochs || 0),
    comparison_failed_count: Number(
      config.comparison_failed_count
      ?? metrics?.comparison_failed_count
      ?? 0
    ),
    seed_results: config.seed_results || [],
    replay_pool_status: config.replay_pool_status,
    ...(metrics?.better_count !== undefined ? { better_count: metrics.better_count } : {}),
    ...(metrics?.same_count !== undefined ? { same_count: metrics.same_count } : {}),
    ...(metrics?.worse_count !== undefined ? { worse_count: metrics.worse_count } : {}),
    ...(metrics?.teacher_shaping_alignment_rate !== undefined
      ? { teacher_shaping_alignment_rate: metrics.teacher_shaping_alignment_rate }
      : {}),
    ...(config.active_checkpoint_id ? { active_checkpoint_id: config.active_checkpoint_id } : {}),
    ...(config.pre_update_ref_checkpoint_id ? { pre_update_ref_checkpoint_id: config.pre_update_ref_checkpoint_id } : {}),
    ...(config.last_stable_checkpoint_id ? { last_stable_checkpoint_id: config.last_stable_checkpoint_id } : {}),
    status: run.status || 'ok',
  }));
}

export async function writeRunSummary({ rootDir, summary, sessionId = '', writer = defaultWriter }) {
  const normalized = validateRunSummary(normalizeRunSummary(summary));
  const artifactPath = path.join(rootDir, '.aios', 'experiments', 'rl-shell-v1', 'runs', normalized.run_id, 'run-summary.json');
  await writeJson(artifactPath, normalized);

  try {
    const result = await writer({
      rootDir,
      summary: normalized,
      sessionId,
      artifactPath,
    });
    return {
      ok: true,
      summaryPath: artifactPath,
      writerResult: result || null,
    };
  } catch (error) {
    console.warn(`[rl-shell-v1] ContextDB summary write failed: ${error.message}`);
    return {
      ok: false,
      summaryPath: artifactPath,
      error: error.message,
    };
  }
}
