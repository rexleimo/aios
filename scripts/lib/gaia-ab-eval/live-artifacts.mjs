function assertFiniteNonNegativeNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

// Only persist fields needed for scoring and arm-level auditability.
export function createGaiaLiveArtifact({ task, job, actual, status, spendUsd }) {
  assertNonEmptyString(task.taskId, 'GAIA task.taskId');
  if (!Number.isInteger(task.level) || task.level < 1 || task.level > 3) {
    throw new Error('GAIA task.level must be one of 1, 2, or 3');
  }
  assertNonEmptyString(task.expected, 'GAIA task.expected');
  assertNonEmptyString(job.client, 'GAIA job.client');
  assertNonEmptyString(job.model, 'GAIA job.model');
  assertNonEmptyString(job.arm, 'GAIA job.arm');
  assertNonEmptyString(status, 'GAIA artifact.status');
  assertFiniteNonNegativeNumber(spendUsd, 'GAIA artifact.spendUsd');

  return {
    // The scorer requires globally unique answer IDs when artifacts from all
    // independent client/model/arm jobs are summarized together.
    taskId: `${job.client}:${job.model}:${job.arm}:${task.taskId}`,
    level: task.level,
    expected: task.expected,
    actual,
    client: job.client,
    model: job.model,
    arm: job.arm,
    status,
    spendUsd,
  };
}
