import { spawnSync } from 'node:child_process';

function collectFailureLines(output) {
  return String(output || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.includes('not ok') || line.includes('ERR_') || line.toLowerCase().includes('failed'));
}

function createDefaultCommandRunner() {
  return async function runCommand({ command, cwd }) {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(command, {
      windowsHide: true,
      cwd,
      shell: true,
      encoding: 'utf8',
      env,
    });
    return {
      status: result.status ?? 1,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    };
  };
}

export function createCurrentFailureCandidates(rootDir) {
  return [
    {
      task_id: 'real-test-scripts',
      task_kind: 'failing_tests',
      task_family: 'failing_tests',
      verification_command: 'npm run test:scripts',
      cwd: rootDir,
      task_prompt: 'Repair the current failing scripts test workflow in the aios repository.',
      constraints: ['Run only inside an isolated temporary git worktree'],
    },
    {
      task_id: 'real-mcp-typecheck',
      task_kind: 'typecheck_repair',
      task_family: 'typecheck',
      verification_command: 'cd mcp-server && npm run typecheck',
      cwd: rootDir,
      task_prompt: 'Repair the current mcp-server typecheck failure in the aios repository.',
      constraints: ['Run only inside an isolated temporary git worktree'],
    },
    {
      task_id: 'real-mcp-build',
      task_kind: 'build_repair',
      task_family: 'build',
      verification_command: 'cd mcp-server && npm run build',
      cwd: rootDir,
      task_prompt: 'Repair the current mcp-server build failure in the aios repository.',
      constraints: ['Run only inside an isolated temporary git worktree'],
    },
  ];
}

function normalizeSignature(result) {
  const lines = collectFailureLines(`${result.stdout}\n${result.stderr}`);
  return lines.join('\n');
}

async function runAdmissionChecks({ candidate, baselineRepeats, commandRunner }) {
  const attempts = [];
  for (let index = 0; index < baselineRepeats; index += 1) {
    const result = await commandRunner({
      cwd: candidate.cwd,
      command: candidate.verification_command,
    });
    attempts.push({
      attempt_index: index + 1,
      status: result.status,
      failure_signature: normalizeSignature(result),
    });
  }

  const reproduced = attempts.every((attempt) => attempt.status !== 0 && attempt.failure_signature.length > 0);
  const stableSignature = reproduced && attempts.every((attempt) => attempt.failure_signature === attempts[0].failure_signature);
  return {
    attempts,
    baseline_reproduced: reproduced,
    stable_signature: stableSignature ? attempts[0].failure_signature : '',
    admission_status: reproduced && stableSignature ? 'admitted' : 'rejected',
  };
}

export async function collectRealTasks({
  rootDir,
  mode = 'current-failures-first',
  baselineRepeats = 2,
  commandRunner = createDefaultCommandRunner(),
  historicalFallback = async () => [],
}) {
  if (mode !== 'current-failures-first') {
    throw new Error(`Unsupported real-task collection mode: ${mode}`);
  }

  const candidates = createCurrentFailureCandidates(rootDir);
  const admitted = [];
  const rejected = [];

  for (const candidate of candidates) {
    const admission = await runAdmissionChecks({
      candidate,
      baselineRepeats,
      commandRunner,
    });
    const task = {
      ...candidate,
      task_source: 'real_shadow',
      reproducible: admission.baseline_reproduced && Boolean(admission.stable_signature),
      admission_status: admission.admission_status,
      baseline_reproduced: admission.baseline_reproduced,
      baseline_failure_signature: admission.stable_signature,
      baseline_failing_tests: admission.stable_signature ? admission.stable_signature.split('\n').filter(Boolean) : [],
      baseline_attempts: admission.attempts,
    };
    if (admission.admission_status === 'admitted') {
      admitted.push(task);
    } else {
      rejected.push(task);
    }
  }

  if (admitted.length < 3) {
    const historicalTasks = await historicalFallback({ rootDir, admitted, rejected });
    for (const task of historicalTasks || []) {
      admitted.push({
        ...task,
        task_source: 'real_shadow',
        admission_status: 'admitted',
      });
    }
  }

  return {
    mode,
    pool_status: admitted.length < 3 ? 'limited-pool' : 'ready',
    admitted,
    rejected,
    admitted_tasks: admitted.length,
  };
}
