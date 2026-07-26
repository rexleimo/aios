const CODEX_MODEL = 'gpt-5.6-terra';
const TOOL_POLICY = 'no-browser-no-network-tools';
const ANSWER_INSTRUCTION = 'Return only the final answer with no explanation.';

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

function assertNoExpectedAnswer(payload, expected, label) {
  if (payload.includes(expected)) {
    throw new Error(`workflow diagnostic ${label} must not contain the expected answer`);
  }
}

function buildTaskInput({ policyText, task, timeoutSeconds, remainingSpendUsd }) {
  return [
    policyText.trim(),
    '',
    ANSWER_INSTRUCTION,
    `Tool policy: ${TOOL_POLICY}`,
    `Task ID: ${task.taskId}`,
    `Timeout seconds: ${timeoutSeconds}`,
    `Granted budget USD: ${remainingSpendUsd}`,
    'Task:',
    task.prompt,
  ].join('\n');
}

/**
 * Build the client-visible invocation for one workflow diagnostic task.
 *
 * The arm label is reporting metadata only: it is never accepted here, so it
 * cannot reach the client. The expected answer and its normalization rule stay
 * outside every stdin and argv payload, and the builder fails closed if either
 * payload still contains the expected answer.
 */
export function buildWorkflowDiagnosticInvocation({
  client,
  model,
  policyText,
  task,
  timeoutSeconds,
  remainingSpendUsd,
  toolPolicy,
}) {
  if (client !== 'codex') {
    throw new Error(`workflow diagnostic invocation is not configured for ${client}`);
  }
  if (model !== CODEX_MODEL) {
    throw new Error(`workflow diagnostic model must equal ${CODEX_MODEL}`);
  }
  if (toolPolicy !== TOOL_POLICY) {
    throw new Error(`workflow diagnostic toolPolicy must equal ${TOOL_POLICY}`);
  }

  assertNonEmptyString(policyText, 'workflow diagnostic policyText');
  assertNonEmptyString(task?.taskId, 'workflow diagnostic task.taskId');
  assertNonEmptyString(task?.prompt, 'workflow diagnostic task.prompt');
  assertNonEmptyString(task?.expected, 'workflow diagnostic task.expected');
  assertPositiveNumber(timeoutSeconds, 'workflow diagnostic timeoutSeconds');
  assertPositiveNumber(remainingSpendUsd, 'workflow diagnostic remainingSpendUsd');

  const input = buildTaskInput({ policyText, task, timeoutSeconds, remainingSpendUsd });
  const args = Object.freeze([
    'exec',
    '--model',
    CODEX_MODEL,
    '--sandbox',
    'read-only',
    '--json',
    '-',
  ]);

  assertNoExpectedAnswer(input, task.expected, 'stdin payload');
  assertNoExpectedAnswer(args.join(' '), task.expected, 'argv payload');

  return Object.freeze({
    executable: 'codex',
    args,
    input,
  });
}
