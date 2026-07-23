const CODEX_MODEL = 'gpt-5.6-terra';
const CLAUDE_MODEL = 'claude-sonnet-5';
const HERMES_MODEL = 'deepseek-v4-pro';

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertPositiveNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
}

function buildTaskInput({ arm, policy, task, timeoutSeconds, remainingSpendUsd }) {
  assertNonEmptyString(arm, 'GAIA task arm');
  assertNonEmptyString(policy, 'GAIA task policy');
  assertNonEmptyString(task?.taskId, 'GAIA task.taskId');
  assertNonEmptyString(task?.prompt, 'GAIA task.prompt');
  assertPositiveNumber(timeoutSeconds, 'GAIA task timeoutSeconds');
  assertPositiveNumber(remainingSpendUsd, 'GAIA task remainingSpendUsd');

  if (!Number.isInteger(task.level) || task.level < 1 || task.level > 3) {
    throw new Error('GAIA task.level must be one of 1, 2, or 3');
  }

  return [
    'Complete this GAIA evaluation task and return only the final answer.',
    `Evaluation arm: ${arm}`,
    `Policy: ${policy}`,
    `Task ID: ${task.taskId}`,
    `Level: ${task.level}`,
    `Timeout seconds: ${timeoutSeconds}`,
    `Granted budget USD: ${remainingSpendUsd}`,
    'Task:',
    task.prompt,
  ].join('\n');
}

export function buildGaiaClientInvocation({
  client,
  model,
  arm,
  policy,
  task,
  timeoutSeconds,
  remainingSpendUsd,
  usagePath,
}) {
  const input = buildTaskInput({ arm, policy, task, timeoutSeconds, remainingSpendUsd });

  if (client === 'hermes') {
    if (model !== HERMES_MODEL) {
      throw new Error(`hermes model must equal ${HERMES_MODEL}`);
    }
    assertNonEmptyString(usagePath, 'GAIA Hermes usagePath');
    return Object.freeze({
      executable: 'hermes',
      args: Object.freeze([
        '--oneshot',
        input,
        '--model',
        HERMES_MODEL,
        '--usage-file',
        usagePath,
      ]),
      input,
    });
  }

  if (client === 'claude') {
    if (model !== CLAUDE_MODEL) {
      throw new Error(`claude model must equal ${CLAUDE_MODEL}`);
    }
    return Object.freeze({
      executable: 'claude',
      args: Object.freeze([
        '--print',
        '--model',
        CLAUDE_MODEL,
        '--output-format',
        'json',
        '--max-budget-usd',
        String(remainingSpendUsd),
      ]),
      input,
    });
  }

  if (client !== 'codex') {
    throw new Error(`GAIA client adapter is not configured for ${client}`);
  }
  if (model !== CODEX_MODEL) {
    throw new Error(`codex model must equal ${CODEX_MODEL}`);
  }

  return Object.freeze({
    executable: 'codex',
    args: Object.freeze([
      'exec',
      '--model',
      CODEX_MODEL,
      '--sandbox',
      'read-only',
      '--json',
      '-',
    ]),
    input,
  });
}
