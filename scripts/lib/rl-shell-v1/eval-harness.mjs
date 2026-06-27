import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { clone, computeHash } from '../../../src/shared/normalize.mjs';

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function ratio(numerator, denominator) {
  if (!Number(denominator)) return 0;
  return Number(numerator || 0) / Number(denominator);
}

function averageDefined(values) {
  const defined = (Array.isArray(values) ? values : []).filter((value) => value !== null && value !== undefined);
  return average(defined);
}

async function readPhase3EpisodeRecords(runDir) {
  if (!runDir) {
    return [];
  }
  const episodesDir = typeof runDir === 'string' ? path.join(runDir, 'episodes') : runDir.episodesDir;
  if (!episodesDir) {
    return [];
  }
  try {
    const entries = (await readdir(episodesDir)).filter((name) => name.endsWith('.json')).sort();
    const records = [];
    for (const entry of entries) {
      records.push(JSON.parse(await readFile(path.join(episodesDir, entry), 'utf8')));
    }
    return records;
  } catch {
    return [];
  }
}

function computeTeacherShapingAlignment(episode) {
  if (episode.comparison_status !== 'completed') {
    return null;
  }
  const shapingScore = Number(episode.teacher_shaping_score || 0);
  if (episode.relative_outcome === 'better') {
    return shapingScore > 0 ? 1 : 0;
  }
  if (episode.relative_outcome === 'worse') {
    return shapingScore < 0 ? 1 : 0;
  }
  if (episode.relative_outcome === 'same') {
    return shapingScore === 0 ? 1 : 0;
  }
  return null;
}

function deterministicResult(taskId, checkpoint) {
  const seed = Number(checkpoint.seed || 0);
  const score = computeHash(`${taskId}:${seed}`) % 100;
  const success = score >= 40 ? 1 : 0;
  return {
    success,
    regressionFreeFix: success,
    reward: success ? 1 : -1,
    fusedReward: success ? 1 : -1,
    episodeLength: success ? 1 : 2,
    tokenCount: 8 + (score % 5),
    runtimeDurationMs: 25 + (score % 20),
    teacherBackend: null,
    fallbackUsed: false,
    teacherLatencyMs: 0,
    policyLoss: 0,
    distillLoss: 0,
    klLoss: 0,
    rewardHacking: false,
    degenerateAction: false,
    invalidStepCount: success ? 0 : 1 + (score % 2),
    stepCount: success ? 2 : 4,
    stopCondition: success ? 'student_stop' : score % 2 === 0 ? 'repeated_no_progress' : 'max_steps_reached',
  };
}

function deterministicRate(key, { min = 0.45, span = 0.35 } = {}) {
  const score = computeHash(String(key)) % 100;
  return Number((min + (score / 100) * span).toFixed(4));
}

export function summarizeEvalResults(results) {
  const rows = Array.isArray(results) ? results : [];
  return {
    successRate: average(rows.map((row) => row.success ? 1 : 0)),
    regressionFreeFixRate: average(rows.map((row) => row.regressionFreeFix ? 1 : 0)),
    avgTokenCount: average(rows.map((row) => row.tokenCount)),
    averageReward: average(rows.map((row) => row.reward)),
    averageFusedReward: average(rows.map((row) => row.fusedReward)),
    averageEpisodeLength: average(rows.map((row) => row.episodeLength)),
    averageRuntimeDurationMs: average(rows.map((row) => row.runtimeDurationMs)),
    teacherBackendHitRate: average(rows.map((row) => row.teacherBackend ? 1 : 0)),
    fallbackRate: average(rows.map((row) => row.fallbackUsed ? 1 : 0)),
    teacherLatencyMs: average(rows.map((row) => row.teacherLatencyMs)),
    policyLoss: average(rows.map((row) => row.policyLoss)),
    distillLoss: average(rows.map((row) => row.distillLoss)),
    klLoss: average(rows.map((row) => row.klLoss)),
    rewardHackingRate: average(rows.map((row) => row.rewardHacking ? 1 : 0)),
    degenerateActionRate: average(rows.map((row) => row.degenerateAction ? 1 : 0)),
    invalidStepRatio: average(rows.map((row) => ratio(row.invalidStepCount, row.stepCount || row.episodeLength || 0))),
    repeatedNoProgressRate: average(rows.map((row) => row.stopCondition === 'repeated_no_progress' ? 1 : 0)),
    teacherOverdependenceGap: 0,
  };
}

export function comparePhase2ABaseline({ currentSummary, multiStepBaselineSummary, v1Summary }) {
  const beatsV1Success = Number(currentSummary?.successRate || 0) > Number(v1Summary?.successRate || 0);
  const preservesRegressionFree = Number(currentSummary?.regressionFreeFixRate || 0) >= Number(v1Summary?.regressionFreeFixRate || 0);
  const lowersInvalidStepRatio = Number(currentSummary?.invalidStepRatio || 0) < Number(multiStepBaselineSummary?.invalidStepRatio || 0);
  const lowersRepeatedNoProgressRate = Number(currentSummary?.repeatedNoProgressRate || 0) < Number(multiStepBaselineSummary?.repeatedNoProgressRate || 0);

  return {
    accepted: beatsV1Success && preservesRegressionFree && lowersInvalidStepRatio && lowersRepeatedNoProgressRate,
    beatsV1Success,
    preservesRegressionFree,
    lowersInvalidStepRatio,
    lowersRepeatedNoProgressRate,
  };
}

export function summarizeRealShadowEval({ pool_status, admitted_tasks, attempt_results }) {
  const attempts = Array.isArray(attempt_results) ? attempt_results : [];
  const byTask = new Map();
  for (const attempt of attempts) {
    const current = byTask.get(attempt.task_id) || { attempts: 0, repairs: 0 };
    current.attempts += 1;
    current.repairs += attempt.repaired ? 1 : 0;
    byTask.set(attempt.task_id, current);
  }

  const stableRepairCount = [...byTask.values()].filter((entry) => entry.repairs >= 2).length;
  return {
    poolStatus: pool_status || 'limited-pool',
    admittedTasks: Number(admitted_tasks || 0),
    repeatedRepairRate: Number(admitted_tasks || 0) === 0 ? 0 : stableRepairCount / Number(admitted_tasks),
    stableRepairCount,
    perTaskAttemptCounts: Object.fromEntries(
      [...byTask.entries()].map(([taskId, entry]) => [taskId, entry.attempts])
    ),
    mainWorktreeContaminationFailures: attempts.filter((attempt) => attempt.contaminated_main_worktree).length,
  };
}

export function summarizePhase2Ablation({ phase2a, phase2b, phase2c }) {
  const syntheticImprovement = Number((Number(phase2c?.successRate || 0) - Number(phase2a?.successRate || 0)).toFixed(2));
  const realRepairImprovement = Number((Number(phase2c?.repeatedRepairRate || 0) - Number(phase2b?.repeatedRepairRate || 0)).toFixed(2));
  const replayDrivenImprovement = syntheticImprovement;
  const overfittingWarning = Number(phase2c?.avgTokenCount || 0) > Number(phase2a?.avgTokenCount || 0) * 1.5;
  return {
    syntheticImprovement,
    realRepairImprovement,
    replayDrivenImprovement,
    overfittingWarning,
  };
}

export async function evaluatePhase3Run({ runDir, episodeRecords, runSummary = {} }) {
  const records = Array.isArray(episodeRecords) ? episodeRecords : await readPhase3EpisodeRecords(runDir);
  const betterCount = records.filter((episode) => episode.comparison_status === 'completed' && episode.relative_outcome === 'better').length;
  const sameCount = records.filter((episode) => episode.comparison_status === 'completed' && episode.relative_outcome === 'same').length;
  const worseCount = records.filter((episode) => episode.comparison_status === 'completed' && episode.relative_outcome === 'worse').length;
  const comparisonFailedCount = records.filter((episode) => episode.comparison_status === 'comparison_failed').length;

  return {
    better_count: betterCount,
    same_count: sameCount,
    worse_count: worseCount,
    comparison_failed_count: comparisonFailedCount,
    updates_completed: Number(runSummary.updates_completed || 0),
    updates_failed: Number(runSummary.updates_failed || 0),
    rollbacks_completed: Number(runSummary.rollbacks_completed || 0),
    replay_only_epochs: Number(runSummary.replay_only_epochs || 0),
    teacher_shaping_alignment_rate: averageDefined(records.map(computeTeacherShapingAlignment)),
    active_checkpoint_id: runSummary.active_checkpoint_id || null,
    pre_update_ref_checkpoint_id: runSummary.pre_update_ref_checkpoint_id ?? null,
    last_stable_checkpoint_id: runSummary.last_stable_checkpoint_id || null,
  };
}

export function pickBestCheckpoint(checkpoints) {
  return [...checkpoints].sort((left, right) => {
    if (right.successRate !== left.successRate) {
      return right.successRate - left.successRate;
    }
    if (right.regressionFreeFixRate !== left.regressionFreeFixRate) {
      return right.regressionFreeFixRate - left.regressionFreeFixRate;
    }
    if ((left.invalidStepRatio || 0) !== (right.invalidStepRatio || 0)) {
      return (left.invalidStepRatio || 0) - (right.invalidStepRatio || 0);
    }
    if ((left.repeatedNoProgressRate || 0) !== (right.repeatedNoProgressRate || 0)) {
      return (left.repeatedNoProgressRate || 0) - (right.repeatedNoProgressRate || 0);
    }
    if (left.avgTokenCount !== right.avgTokenCount) {
      return left.avgTokenCount - right.avgTokenCount;
    }
    return left.step - right.step;
  })[0] || null;
}

export async function runHeldOutEval({ checkpoint, registry, policyFactory, teacherMode = 'none' }) {
  const checkpointCopy = clone(checkpoint);
  const producedPolicy = policyFactory ? await policyFactory(clone(checkpointCopy)) : clone(checkpointCopy);
  const evalPolicy = clone(producedPolicy);
  const tasks = Array.isArray(registry?.heldOutTasks) ? registry.heldOutTasks : [];

  const results = tasks.map((task) => ({
    task_id: task.task_id,
    split: task.split || 'held_out',
    teacherMode,
    ...deterministicResult(task.task_id, evalPolicy),
  }));

  return {
    results,
    summary: summarizeEvalResults(results),
  };
}

export async function runShellHoldoutValidation({
  checkpointId,
  baselineCheckpointId = 'shell-baseline',
  episodeCount = 20,
}) {
  const successRate = deterministicRate(`${checkpointId}:shell-success`, { min: 0.5, span: 0.3 });
  const baselineSuccessRate = deterministicRate(`${baselineCheckpointId}:shell-success`, { min: 0.5, span: 0.3 });
  const regression_pp = Number(Math.max(0, (baselineSuccessRate - successRate) * 100).toFixed(2));
  return {
    environment: 'shell',
    status: regression_pp <= 5 ? 'passed' : 'failed',
    episode_count: episodeCount,
    metrics: {
      success_rate: successRate,
      baseline_success_rate: baselineSuccessRate,
      regression_pp,
    },
  };
}
