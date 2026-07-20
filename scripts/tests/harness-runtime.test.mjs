import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  normalizeSoloIterationOutcome,
  resolveSoloBackoffState,
  runSoloHarnessLoop,
  writeSoloIterationCheckpoint,
} from '../lib/harness/solo-runtime.mjs';
import { runContextDbCli } from '../lib/contextdb-cli.mjs';
import {
  getSoloHarnessPaths,
  initSoloRunJournal,
  readSoloRunSummary,
  readSoloControl,
  readSoloRunStatus,
  requestSoloHarnessStop,
} from '../lib/harness/solo-journal.mjs';
import { buildIterationPrompt, runHarnessCommand } from '../lib/lifecycle/harness.mjs';
import {
  buildClientStructuredOutputOptions,
  cleanupClientStructuredOutputTempDir,
  createClientStructuredOutputTempDir,
  shouldUseClientStructuredOutput,
} from '../lib/harness/subagent-clients/structured-output.mjs';
import { buildOneShotInvocation } from '../lib/harness/subagent-clients/one-shot.mjs';
import { runOneShot } from '../lib/harness/subagent-runtime/one-shot-runner.mjs';

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function importHarnessInitHumanGate() {
  return await import(pathToFileURL(path.resolve('skill-sources/harness-init-runner/assets/template/harness/lib/human-gate.mjs')).href);
}

async function writeFakeCli(binDir, name) {
  await mkdir(binDir, { recursive: true });
  const ext = process.platform === 'win32' ? '.cmd' : '';
  const filePath = path.join(binDir, `${name}${ext}`);
  const content = process.platform === 'win32'
    ? `@echo off\r\n"%~dp0\\node.exe" "%~dp0\\${name}.js" %*\r\n`
    : '#!/usr/bin/env sh\necho "fake $@"\n';
  await writeFile(filePath, content, 'utf8');
  if (process.platform === 'win32') {
    await writeFile(path.join(binDir, `${name}.js`), 'console.log("fake");\n', 'utf8');
  }
  if (process.platform !== 'win32') {
    await chmod(filePath, 0o755);
  }
  return filePath;
}

async function writeFallbackCodexCommand(binDir, argsLogPath) {
  await mkdir(binDir, { recursive: true });
  const scriptPath = path.join(binDir, 'codex-fallback.js');
  const script = [
    "const fs = require('node:fs');",
    'const args = process.argv.slice(2);',
    `fs.appendFileSync(${JSON.stringify(argsLogPath)}, JSON.stringify(args) + '\\n', 'utf8');`,
    "if (args.includes('--output-schema')) {",
    "  process.stderr.write(\"unexpected argument '--output-schema'\\n\");",
    '  process.exit(1);',
    '}',
    "process.stdout.write('fake Codex acknowledgement\\n');",
  ].join('\n');
  await writeFile(scriptPath, `${script}\n`, 'utf8');

  const extension = process.platform === 'win32' ? '.cmd' : '';
  const commandPath = path.join(binDir, `codex${extension}`);
  if (process.platform === 'win32') {
    await writeFile(commandPath, `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`, 'utf8');
  } else {
    await writeFile(commandPath, `#!/usr/bin/env sh\nexec "${process.execPath}" "${scriptPath}" "$@"\n`, 'utf8');
    await chmod(commandPath, 0o755);
  }
  return commandPath;
}

test('harness init human gate warns but does not block background safety references', async () => {
  const { evaluateHumanGate } = await importHarnessInitHumanGate();

  const gate = evaluateHumanGate({
    taskText: [
      'User goal: explain why harness gates ask for confirmation.',
      '',
      '# AGENTS.md instructions',
      '- cap eventually runs git push after verification.',
      '- Never expose token, credential, or session cookie values.',
    ].join('\n'),
  });

  assert.equal(gate.allowed, true);
  assert.equal(gate.decision, 'warn');
  assert.deepEqual(gate.reasons, []);
  assert.equal(gate.warnings.some((item) => /background/i.test(item)), true);
});

test('harness init human gate requires confirmation for explicit sensitive actions', async () => {
  const { evaluateHumanGate } = await importHarnessInitHumanGate();

  const gate = evaluateHumanGate({
    taskText: 'Run git push to publish the current branch.',
  });

  assert.equal(gate.allowed, false);
  assert.equal(gate.decision, 'approval-required');
  assert.equal(gate.reasons.some((item) => /git push/i.test(item)), true);
  assert.match(gate.question, /confirm/i);
  assert.match(gate.resumeHint, /--allow-risk/);
});

test('harness init human gate does not block negated sensitive command examples', async () => {
  const { evaluateHumanGate } = await importHarnessInitHumanGate();

  const gate = evaluateHumanGate({
    taskText: 'Do not run git push; only explain when a push would require approval.',
  });

  assert.equal(gate.allowed, true);
  assert.equal(gate.decision, 'warn');
  assert.equal(gate.reasons.length, 0);
});

test('normalizeSoloIterationOutcome fills defaults for a success outcome', () => {
  const success = normalizeSoloIterationOutcome({
    sessionId: 's1',
    iteration: 1,
    outcome: 'success',
    summary: 'done',
    shouldStop: false,
  });

  assert.equal(success.failureClass, 'none');
  assert.equal(success.backoffAction, 'none');
  assert.equal(success.checkpointStatus, 'running');
  assert.equal(success.stage, 'development');
  assert.deepEqual(success.evidence, ['summary: done']);
});

test('normalizeSoloIterationOutcome preserves blocked no-progress decisions', () => {
  const blocked = normalizeSoloIterationOutcome({
    sessionId: 's1',
    iteration: 2,
    outcome: 'blocked',
    summary: 'No safe next mutation',
    stage: 'validation',
    evidence: ['npm test failed'],
    failureClass: 'no-progress',
    shouldStop: false,
  });

  assert.equal(blocked.failureClass, 'no-progress');
  assert.equal(blocked.outcome, 'blocked');
  assert.equal(blocked.stage, 'validation');
  assert.deepEqual(blocked.evidence, ['npm test failed']);
});

test('resolveSoloBackoffState doubles delay for infra failures', () => {
  const infra = resolveSoloBackoffState({
    previous: { consecutiveInfraFailures: 1, nextDelayMs: 60000, until: null },
    outcome: { outcome: 'infra-retry', failureClass: 'runtime-error' },
    nowIso: '2026-04-26T15:00:00.000Z',
  });

  assert.equal(infra.consecutiveInfraFailures, 2);
  assert.equal(infra.nextDelayMs, 120000);
});

test('structured subagent output is isolated to the codex runtime adapter', async () => {
  const tempDir = await createClientStructuredOutputTempDir('codex-cli');

  try {
    assert.equal(shouldUseClientStructuredOutput('codex-cli'), true);
    assert.equal(shouldUseClientStructuredOutput('opencode-cli'), false);
    assert.equal(await createClientStructuredOutputTempDir('opencode-cli'), null);

    const codexOutput = buildClientStructuredOutputOptions({
      clientId: 'codex-cli',
      tempDir,
      schemaPath: 'schema.json',
      lastMessagePath: 'last-message.json',
    });
    assert.deepEqual(codexOutput, {
      schemaPath: 'schema.json',
      lastMessagePath: 'last-message.json',
      color: 'never',
    });
    assert.equal(buildClientStructuredOutputOptions({ clientId: 'opencode-cli', tempDir }), null);
  } finally {
    await cleanupClientStructuredOutputTempDir(tempDir);
  }
});

test('one-shot subagent invocation strategies cover every harness client', () => {
  const adapters = {
    buildClaudeUnattendedArgs: () => ['--claude-unattended'],
    buildGeminiUnattendedArgs: () => ['--gemini-yolo'],
    buildCodexConfigArgs: () => ['-c', 'mcp_servers={}'],
    buildCodexUnattendedArgs: () => ['--codex-unattended'],
  };
  const common = {
    systemText: 'system',
    promptText: 'prompt',
    routedExtraArgs: ['-m', 'model-a'],
    codexOutput: {
      schemaPath: 'schema.json',
      lastMessagePath: 'last-message.json',
      color: 'never',
    },
    adapters,
  };

  assert.deepEqual(buildOneShotInvocation({ clientId: 'claude-code', ...common }), {
    runner: 'spawn',
    args: ['-m', 'model-a', '--claude-unattended', '--print', '--append-system-prompt', 'system', 'prompt'],
  });
  assert.deepEqual(buildOneShotInvocation({ clientId: 'gemini-cli', ...common }), {
    runner: 'spawn',
    args: ['-m', 'model-a', '--gemini-yolo', '-p', 'system\n\n## New User Request\nprompt'],
  });
  assert.deepEqual(buildOneShotInvocation({ clientId: 'opencode-cli', ...common }), {
    runner: 'spawn',
    args: ['run', '--agent', 'aios-build', '-m', 'model-a', 'system\n\n## New User Request\nprompt'],
  });
  assert.deepEqual(buildOneShotInvocation({ clientId: 'codex-cli', ...common }), {
    runner: 'codex-exec',
    fullPrompt: 'system\n\n## New User Request\nprompt',
    codexConfigArgs: ['-c', 'mcp_servers={}'],
    codexUnattendedArgs: ['--codex-unattended'],
    routedExtraArgs: ['-m', 'model-a'],
    structuredFlags: ['--output-schema', 'schema.json', '--output-last-message', 'last-message.json', '--color', 'never'],
    args: [
      'exec',
      '--codex-unattended',
      '-c',
      'mcp_servers={}',
      '-m',
      'model-a',
      '--output-schema',
      'schema.json',
      '--output-last-message',
      'last-message.json',
      '--color',
      'never',
      '-',
    ],
  });
});

test('runOneShot records the final Codex fallback argv for managed provenance', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aios-codex-final-argv-'));
  const binDir = path.join(tempDir, 'bin');
  const argsLogPath = path.join(tempDir, 'argv.jsonl');

  try {
    await writeFallbackCodexCommand(binDir, argsLogPath);
    const result = await runOneShot('codex-cli', {
      systemPrompt: 'system instruction',
      userPrompt: 'user request',
      codexOutput: {
        schemaPath: path.join(tempDir, 'schema.json'),
        lastMessagePath: path.join(tempDir, 'last-message.json'),
        color: 'never',
      },
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
      },
    });

    assert.equal(result.exitCode, 0, result.error || result.stderr);
    const attempts = (await readFile(argsLogPath, 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].includes('--output-schema'), true);
    assert.equal(attempts[1].includes('--output-schema'), false);
    assert.deepEqual(result.managedInvocation.args, attempts[1]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('runOneShot records the successful primary Codex argv for managed provenance', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aios-codex-primary-argv-'));
  const binDir = path.join(tempDir, 'bin');
  const argsLogPath = path.join(tempDir, 'argv.jsonl');

  try {
    await writeFallbackCodexCommand(binDir, argsLogPath);
    const result = await runOneShot('codex-cli', {
      systemPrompt: 'system instruction',
      userPrompt: 'user request',
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
      },
    });

    assert.equal(result.exitCode, 0, result.error || result.stderr);
    const attempts = (await readFile(argsLogPath, 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.equal(attempts.length, 1);
    assert.deepEqual(result.managedInvocation.args, attempts[0]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});



test('executePhaseJob waits for role-memory persistence before returning', async () => {
  const { executePhaseJob } = await import('../lib/harness/subagent-runtime/phase-job.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-subagent-role-memory-'));
  const gate = Promise.withResolvers();
  let appendStarted = false;
  let appendFinished = false;

  try {
    const plan = {
      taskTitle: 'Role memory persistence',
      contextSummary: 'Wait for role memory writes before returning.',
      phases: [],
      workItems: [],
    };
    const job = {
      jobId: 'job.role-memory',
      jobType: 'phase',
      role: 'implementer',
      launchSpec: { executor: 'codex', handoffTarget: 'reviewer', inputs: [] },
      dependsOn: [],
    };
    const phase = {
      id: 'phase.implement',
      label: 'Implement',
      responsibility: 'Persist role memory before returning',
      ownership: 'scripts/lib/harness/subagent-runtime/',
      canEditFiles: false,
    };

    const runPromise = executePhaseJob(plan, job, phase, [], {
      clientId: 'codex-cli',
      timeoutMs: 1000,
      env: process.env,
      io: { log() {}, warn() {}, error() {} },
      agentSpecNormalized: { agents: {} },
      executorLabel: 'codex',
      rootDir,
      appendJobFindingsToRoleMemoryImpl: async () => {
        appendStarted = true;
        await gate.promise;
        appendFinished = true;
      },
      runOneShotImpl: async () => ({
        exitCode: 0,
        stdout: JSON.stringify({
          schemaVersion: 1,
          status: 'completed',
          fromRole: 'implementer',
          toRole: 'reviewer',
          taskTitle: 'Role memory persistence',
          contextSummary: 'Persisted successfully.',
          findings: ['awaited role memory write'],
          filesTouched: [],
          openQuestions: [],
          recommendations: [],
        }),
        stderr: '',
      }),
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    const runState = await Promise.race([
      runPromise.then(() => 'returned'),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 25)),
    ]);

    assert.equal(appendStarted, true);
    assert.equal(runState, 'pending');

    gate.resolve();
    const run = await runPromise;
    assert.equal(appendFinished, true);
    assert.equal(run.status, 'completed');
  } finally {
    gate.resolve();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('executePhaseJob compresses subagent prompts before client launch and compacts accepted output', async () => {
  const { executePhaseJob } = await import('../lib/harness/subagent-runtime/phase-job.mjs');
  const { readMetricsRecords } = await import('../lib/interception/metrics/metrics-sink.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-subagent-turn-'));
  const PRE_SENTINEL = 'SUBAGENT_PRE_SEND_SENTINEL';
  const POST_SENTINEL = 'SUBAGENT_POST_RECEIVE_SENTINEL';
  let captured = null;

  try {
    const requiredInstruction = 'REQUIRED_ORIGINAL_TASK_INSTRUCTION_SURVIVES_PRE_SEND';
    const plan = {
      taskTitle: 'Subagent turn compression',
      contextSummary: `${PRE_SENTINEL.repeat(120)}\n${requiredInstruction}\nscripts/lib/harness/subagent-runtime/phase-job.mjs:42`,
      phases: [],
      workItems: [],
    };
    const job = {
      jobId: 'job.compress',
      jobType: 'phase',
      role: 'implementer',
      launchSpec: { executor: 'codex', handoffTarget: 'reviewer', inputs: [] },
      dependsOn: [],
    };
    const phase = {
      id: 'phase.implement',
      label: 'Implement',
      responsibility: 'Implement the requested behavior',
      ownership: 'scripts/lib/harness/subagent-runtime/',
      canEditFiles: false,
    };

    const run = await executePhaseJob(plan, job, phase, [], {
      clientId: 'codex-cli',
      timeoutMs: 1000,
      env: process.env,
      io: { log() {}, warn() {}, error() {} },
      agentSpecNormalized: { agents: {} },
      executorLabel: 'codex',
      rootDir,
      runOneShotImpl: async (clientId, args) => {
        captured = { clientId, args };
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            schemaVersion: 1,
            status: 'completed',
            fromRole: 'implementer',
            toRole: 'reviewer',
            taskTitle: 'Subagent turn compression',
            contextSummary: `${POST_SENTINEL.repeat(120)}\nscripts/lib/harness/subagent-runtime/phase-output.mjs:7`,
            findings: ['compressed'],
            filesTouched: [],
            openQuestions: [],
            recommendations: [],
          }),
          stderr: '',
        };
      },
    });

    assert.equal(JSON.stringify(captured).includes(requiredInstruction), true);
    assert.equal(run.output.rawOutput.includes(POST_SENTINEL), false);
    assert.match(run.output.rawOutput, /aios\.compact_packet/);

    const records = await readMetricsRecords({ workspaceRoot: rootDir, sessionId: 'job.compress' });
    assert.equal(records.some((record) => record.event_kind === 'pre_send' && record.client_id === 'codex-cli'), true);
    assert.equal(records.some((record) => record.event_kind === 'post_receive' && record.client_id === 'codex-cli'), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('subagent dispatch does not auto-load ContextDB context packets into prompts', async () => {
  const { executeSubagentDispatchPlan } = await import('../lib/harness/subagent-runtime.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-subagent-no-context-pack-'));
  const sessionId = 'subagent-no-context-pack';
  const contextSentinel = 'LEGACY_CONTEXT_PACKET_SHOULD_NOT_APPEAR';
  const fakeBinDir = await mkdtemp(path.join(os.tmpdir(), 'aios-subagent-no-context-bin-'));

  try {
    runContextDbCli([
      'session:new',
      '--workspace',
      rootDir,
      '--agent',
      'codex-cli',
      '--project',
      'tmp-project',
      '--goal',
      'Verify subagent prompt injection removal',
      '--session-id',
      sessionId,
    ]);
    await writeFile(
      path.join(rootDir, '.aios', 'context-db', 'sessions', sessionId, 'l0-summary.md'),
      `${contextSentinel}\n`,
      'utf8'
    );

    const codexImpl = path.join(fakeBinDir, 'codex-fake.mjs');
    await writeFile(
      codexImpl,
      [
        'const fs = await import("node:fs");',
        'const input = fs.readFileSync(0, "utf8");',
        `if (input.includes(${JSON.stringify(contextSentinel)}) || input.includes("# Context Packet") || input.includes("Context Packet")) process.exit(23);`,
        'process.stdout.write(JSON.stringify({',
        '  schemaVersion: 1,',
        '  status: "completed",',
        '  fromRole: "implementer",',
        '  toRole: "reviewer",',
        '  taskTitle: "No context packet",',
        '  contextSummary: "ok",',
        '  findings: [],',
        '  filesTouched: [],',
        '  openQuestions: [],',
        '  recommendations: []',
        '}) + "\\n");',
      ].join('\n'),
      'utf8'
    );
    const codexBin = path.join(fakeBinDir, process.platform === 'win32' ? 'codex.cmd' : 'codex');
    const codexScript = process.platform === 'win32'
      ? `@echo off\r\n"${process.execPath}" "${codexImpl}" %*\r\n`
      : `#!/usr/bin/env sh\nexec "${process.execPath}" "${codexImpl}" "$@"\n`;
    await writeFile(codexBin, codexScript, 'utf8');
    if (process.platform !== 'win32') await chmod(codexBin, 0o755);

    const plan = {
      taskTitle: 'No context packet',
      contextSummary: 'Run one phase without automatic ContextDB prompt input',
      learnEvalOverlay: { sessionId },
      phases: [
        {
          id: 'phase.implement',
          label: 'Implement',
          responsibility: 'Return a handoff',
          ownership: 'scripts/',
          canEditFiles: false,
        },
      ],
      workItems: [],
    };
    const dispatchPlan = {
      executorRegistry: ['codex'],
      executorDetails: [{ id: 'codex', label: 'Codex' }],
      jobs: [
        {
          jobId: 'job.no-context',
          jobType: 'phase',
          role: 'implementer',
          phaseId: 'phase.implement',
          launchSpec: { executor: 'codex', handoffTarget: 'reviewer', inputs: [] },
          dependsOn: [],
        },
      ],
    };

    const result = await executeSubagentDispatchPlan(plan, dispatchPlan, {
      rootDir,
      env: {
        ...process.env,
        AIOS_SUBAGENT_CLIENT: 'codex-cli',
        AIOS_SUBAGENT_TIMEOUT_MS: '5000',
        PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ''}`,
      },
      io: { log() {}, warn() {}, error() {} },
    });

    assert.equal(result.ok, true, JSON.stringify(result, null, 2));
    assert.equal(await pathExists(path.join(rootDir, '.aios', 'context-db', 'exports', `${sessionId}-context.md`)), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
    await rm(fakeBinDir, { recursive: true, force: true });
  }
});

test('subagent runtime delegates orchestration responsibilities to focused modules', async () => {
  const entry = await readFile(path.resolve('scripts/lib/harness/subagent-runtime.mjs'), 'utf8');
  const entryLines = entry.trim().split(/\r?\n/u).length;
  assert.equal(entryLines <= 260, true, `subagent-runtime.mjs is ${entryLines} lines; keep it as a facade and split orchestration responsibilities under harness/subagent-runtime/*`);

  const modules = [
    { file: 'scripts/lib/harness/subagent-runtime/constants.mjs', exports: ['SUBAGENT_CLIENT_ENV', 'CLIENT_COMMAND'] },
    { file: 'scripts/lib/harness/subagent-runtime/text.mjs', exports: ['normalizeText', 'clipText'] },
    { file: 'scripts/lib/harness/subagent-runtime/file-policy.mjs', exports: ['evaluatePhaseFilePolicy', 'summarizeFilePolicyViolation'] },
    { file: 'scripts/lib/harness/subagent-runtime/client-args.mjs', exports: ['buildCodexConfigArgs', 'buildRoutedExtraArgs'] },
    { file: 'scripts/lib/harness/subagent-runtime/one-shot-runner.mjs', exports: ['runOneShot'] },
    { file: 'scripts/lib/harness/subagent-runtime/paths.mjs', exports: ['resolveRepoRoot'] },
    { file: 'scripts/lib/harness/subagent-runtime/snapshots.mjs', exports: ['createPreMutationSnapshot', 'withPreMutationSnapshot'] },
    { file: 'scripts/lib/harness/subagent-runtime/telemetry.mjs', exports: ['collectCostTelemetry', 'mergeCostTelemetry', 'normalizeCostTelemetry'] },
    { file: 'scripts/lib/harness/subagent-runtime/context-packet.mjs', exports: ['detectSessionIdFromPlan'] },
    { file: 'scripts/lib/harness/subagent-runtime/role-memory.mjs', exports: ['loadRolePinnedMemory', 'appendJobFindingsToRoleMemory'] },
    { file: 'scripts/lib/harness/subagent-runtime/prompts.mjs', exports: ['buildSystemPrompt', 'buildUserPrompt', 'renderDependencyContext'] },
    { file: 'scripts/lib/harness/subagent-runtime/handoff-output.mjs', exports: ['extractJsonCandidate'] },
    { file: 'scripts/lib/harness/subagent-runtime/job-runs.mjs', exports: ['buildBlockedJobRun', 'buildAutoCompletedReadOnlyReviewRun', 'normalizeSeededJobRun'] },
    { file: 'scripts/lib/harness/subagent-runtime/phase-job.mjs', exports: ['executePhaseJob'] },
    { file: 'scripts/lib/harness/subagent-runtime/phase-job-helpers.mjs', exports: ['resolveAgentForJob', 'injectAgentIdEnv', 'normalizeResultAttempts', 'buildStructuredOutput'] },
    { file: 'scripts/lib/harness/subagent-runtime/phase-death-notice.mjs', exports: ['maybeRecordWorkerDeathNotice'] },
    { file: 'scripts/lib/harness/subagent-runtime/phase-plan-sync.mjs', exports: ['maybeSyncPlanOnPhaseSuccess'] },
    { file: 'scripts/lib/harness/subagent-runtime/merge-gate.mjs', exports: ['executeMergeGateJob'] },
    { file: 'scripts/lib/harness/subagent-runtime/dispatch-executor.mjs', exports: ['runDispatchJobs'] },
    { file: 'scripts/lib/harness/subagent-runtime/phase-output.mjs', exports: ['readSubagentOutputText', 'normalizePhaseHandoffPayload', 'buildCompletedPhaseJobRun'] },
    { file: 'scripts/lib/harness/subagent-runtime/phase-blocks.mjs', exports: ['buildBlockedPhaseJobRun'] },
    { file: 'scripts/lib/harness/subagent-clients/spawn-result.mjs', exports: ['normalizeSpawnResult'] },
    { file: 'scripts/lib/harness/subagent-clients/invocation-runner.mjs', exports: ['runClientInvocation'] },
    { file: 'scripts/lib/harness/subagent-clients/codex-exec.mjs', exports: ['runCodexInvocation'] },
  ];

  for (const moduleDef of modules) {
    const mod = await import(pathToFileURL(path.resolve(moduleDef.file)).href);
    for (const exportName of moduleDef.exports) {
      assert.notEqual(mod[exportName], undefined, `${moduleDef.file} should export ${exportName}`);
    }
  }

  const focusedBudgets = [
    ['scripts/lib/harness/subagent-runtime/one-shot-runner.mjs', 120],
    ['scripts/lib/harness/subagent-runtime/phase-job.mjs', 190],
  ];
  for (const [file, maxLines] of focusedBudgets) {
    const raw = await readFile(path.resolve(file), 'utf8');
    const lines = raw.trim().split(/\r?\n/u).length;
    assert.equal(lines <= maxLines, true, `${file} is ${lines} lines; move reusable client/result handling into focused modules`);
  }
});

test('buildIterationPrompt injects offload canvas as compact resume context', () => {
  const prompt = buildIterationPrompt({
    objective: 'Resume offloaded evidence',
    iteration: 2,
    offloadCanvas: {
      relativePath: '.aios/offload/canvas/demo-session/task-canvas.mmd',
      mermaid: 'graph LR\n    m_n0001_abc123["n0001-abc123 Bash: npm test"]\n',
      truncated: false,
    },
  });

  assert.match(prompt, /Offload Canvas/);
  assert.match(prompt, /\.aios\/offload\/canvas\/demo-session\/task-canvas\.mmd/);
  assert.match(prompt, /n0001-abc123 Bash: npm test/);
  assert.match(prompt, /aios refs grep\/read/);
});



test('buildProductionExecuteTurn compresses solo harness prompts before provider launch and compacts received output', async () => {
  const { buildProductionExecuteTurn } = await import('../lib/lifecycle/harness/execute-turn.mjs');
  const { readMetricsRecords } = await import('../lib/interception/metrics/metrics-sink.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-turn-'));
  const PRE_SENTINEL = 'SOLO_HARNESS_PRE_SEND_SENTINEL';
  const POST_SENTINEL = 'SOLO_HARNESS_POST_RECEIVE_SENTINEL';
  let captured = null;

  try {
    const executeTurn = buildProductionExecuteTurn({
      rootDir,
      aiosRootDir: rootDir,
      sessionId: 'solo-turn',
      objective: `${PRE_SENTINEL.repeat(120)}\nscripts/lib/lifecycle/harness/execute-turn.mjs:11`,
      provider: 'codex',
      spawnCommandImpl: async (command, args, options) => {
        captured = { command, args, options };
        return {
          status: 0,
          stdout: JSON.stringify({
            outcome: 'success',
            summary: `${POST_SENTINEL.repeat(120)}\nscripts/lib/lifecycle/harness/execute-turn.mjs:33`,
            keyChanges: [],
            keyLearnings: [],
            nextAction: 'stop',
            shouldStop: true,
          }),
          stderr: '',
        };
      },
    });

    const result = await executeTurn({
      iteration: 1,
      continuity: '',
      offloadCanvas: null,
      summary: { workspaceRoot: rootDir, aiosRootDir: rootDir },
      worktree: { enabled: false },
    });

    assert.equal(JSON.stringify(captured).includes(PRE_SENTINEL), false);
    assert.equal(result.rawOutput.includes(POST_SENTINEL), false);
    assert.match(result.rawOutput, /aios\.compact_packet/);

    const records = await readMetricsRecords({ workspaceRoot: rootDir, sessionId: 'solo-turn' });
    assert.equal(records.some((record) => record.event_kind === 'pre_send' && record.client_id === 'aios-harness'), true);
    assert.equal(records.some((record) => record.event_kind === 'post_receive' && record.client_id === 'aios-harness'), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runSoloHarnessLoop appends iterations and stops when executeTurn requests it', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-runtime-'));

  try {
    await initSoloRunJournal({
      rootDir,
      sessionId: 's1',
      objective: 'Ship X',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      worktree: {
        enabled: false,
        baseRef: 'HEAD',
        path: '',
        preserved: false,
        cleanupReason: '',
      },
    });

    const result = await runSoloHarnessLoop({
      rootDir,
      sessionId: 's1',
      objective: 'Ship X',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      maxIterations: 2,
      executeTurn: async ({ iteration }) => ({
        outcome: iteration === 1 ? 'success' : 'stopped',
        summary: iteration === 1 ? 'made progress' : 'operator requested stop',
        keyChanges: iteration === 1 ? ['docs/checklist.md'] : [],
        keyLearnings: [],
        nextAction: 'continue',
        shouldStop: iteration === 2,
        failureClass: iteration === 2 ? 'stop-requested' : 'none',
      }),
      sleepImpl: async () => {},
    });

    assert.equal(result.summary.iterationCount, 2);
    assert.equal(result.summary.status, 'stopped');

    const status = await readSoloRunStatus({ rootDir, sessionId: 's1' });
    assert.equal(status.iterationCount, 2);
    assert.equal(status.lastFailureClass, 'stop-requested');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runSoloHarnessLoop passes offload canvas to executeTurn', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-runtime-offload-canvas-'));

  try {
    await initSoloRunJournal({
      rootDir,
      sessionId: 'canvas-session',
      objective: 'Resume with canvas',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      worktree: {
        enabled: false,
        baseRef: 'HEAD',
        path: '',
        preserved: false,
        cleanupReason: '',
      },
    });
    const canvasDir = path.join(rootDir, '.aios', 'offload', 'canvas', 'canvas-session');
    await mkdir(canvasDir, { recursive: true });
    await writeFile(
      path.join(canvasDir, 'task-canvas.mmd'),
      'graph LR\n    m_n0001_abc123["n0001-abc123 Bash: npm test"]\n',
      'utf8'
    );

    let capturedCanvas = null;
    await runSoloHarnessLoop({
      rootDir,
      sessionId: 'canvas-session',
      objective: 'Resume with canvas',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      maxIterations: 1,
      executeTurn: async ({ offloadCanvas }) => {
        capturedCanvas = offloadCanvas;
        return {
          outcome: 'success',
          summary: 'used canvas',
          keyChanges: [],
          keyLearnings: [],
          nextAction: 'done',
          shouldStop: true,
          failureClass: 'none',
        };
      },
      sleepImpl: async () => {},
    });

    assert.ok(capturedCanvas);
    assert.match(capturedCanvas.relativePath, /\.aios\/offload\/canvas\/canvas-session\/task-canvas\.mmd/);
    assert.match(capturedCanvas.mermaid, /n0001-abc123 Bash: npm test/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runSoloHarnessLoop writes stage checkpoint evidence through checkpoint writer', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-runtime-stage-checkpoint-'));

  try {
    await initSoloRunJournal({
      rootDir,
      sessionId: 'stage-session',
      objective: 'Ship checkpoint strengthening',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      worktree: {
        enabled: false,
        baseRef: 'HEAD',
        path: '',
        preserved: false,
        cleanupReason: '',
      },
    });

    const checkpoints = [];
    const result = await runSoloHarnessLoop({
      rootDir,
      sessionId: 'stage-session',
      objective: 'Ship checkpoint strengthening',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      maxIterations: 1,
      executeTurn: async () => ({
        outcome: 'success',
        stage: 'validation',
        summary: 'validated harness stage evidence',
        evidence: ['node --test scripts/tests/harness-runtime.test.mjs'],
        keyChanges: ['scripts/lib/harness/solo-runtime.mjs'],
        keyLearnings: [],
        nextAction: 'ship',
        shouldStop: true,
        failureClass: 'none',
      }),
      checkpointWriter: async (payload) => {
        checkpoints.push(payload);
        return { persisted: true, checkpointId: 'stage-session#C1' };
      },
      sleepImpl: async () => {},
    });

    assert.equal(result.summary.status, 'done');
    assert.equal(checkpoints.length, 1);
    assert.equal(checkpoints[0].outcome.stage, 'validation');
    assert.deepEqual(checkpoints[0].outcome.evidence, ['node --test scripts/tests/harness-runtime.test.mjs']);
    assert.equal(checkpoints[0].summary.objective, 'Ship checkpoint strengthening');

    const paths = getSoloHarnessPaths({ rootDir, sessionId: 'stage-session' });
    const logRaw = await readFile(path.join(paths.iterationDir, 'iteration-0001.log.jsonl'), 'utf8');
    assert.match(logRaw, /\"kind\":\"checkpoint\"/);
    assert.match(logRaw, /stage-session#C1/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('writeSoloIterationCheckpoint persists stage telemetry into ContextDB when session exists', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-runtime-contextdb-checkpoint-'));

  try {
    runContextDbCli(['init', '--workspace', rootDir]);
    runContextDbCli([
      'session:new',
      '--workspace',
      rootDir,
      '--agent',
      'codex-cli',
      '--project',
      'checkpoint-test',
      '--goal',
      'Persist solo stage checkpoints',
      '--session-id',
      'ctx-stage-session',
    ]);

    const outcome = normalizeSoloIterationOutcome({
      sessionId: 'ctx-stage-session',
      iteration: 1,
      outcome: 'success',
      stage: 'validation',
      summary: 'validated stage checkpoint persistence',
      evidence: ['node --test scripts/tests/harness-runtime.test.mjs'],
      keyChanges: ['scripts/lib/harness/solo-runtime.mjs'],
      nextAction: 'continue',
      shouldStop: true,
      failureClass: 'none',
    });

    const result = await writeSoloIterationCheckpoint({
      rootDir,
      sessionId: 'ctx-stage-session',
      summary: { objective: 'Persist solo stage checkpoints' },
      outcome,
    });

    assert.equal(result.persisted, true);
    assert.equal(result.checkpointId, 'ctx-stage-session#C1');

    const checkpointsPath = path.join(rootDir, '.aios', 'context-db', 'sessions', 'ctx-stage-session', 'l1-checkpoints.jsonl');
    const checkpointsRaw = await readFile(checkpointsPath, 'utf8');
    const checkpoint = JSON.parse(checkpointsRaw.trim());
    assert.equal(checkpoint.status, 'done');
    assert.match(checkpoint.summary, /^\[validation\]/);
    assert.equal(checkpoint.telemetry.verification.result, 'passed');
    assert.match(checkpoint.telemetry.verification.evidence, /stage=validation/);
    assert.deepEqual(checkpoint.artifacts, [
      'node --test scripts/tests/harness-runtime.test.mjs',
      'scripts/lib/harness/solo-runtime.mjs',
    ]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runHarnessCommand supports dry-run, stop, status, and resume with injected executeTurn', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-harness-command-'));
  const logs = [];

  try {
    const dryRun = await runHarnessCommand(
      {
        subcommand: 'run',
        objective: 'Ship release checklist',
        sessionId: 'demo-session',
        provider: 'codex',
        profile: 'standard',
        worktree: true,
        baseRef: 'HEAD',
        dryRun: true,
        json: true,
      },
      {
        rootDir,
        io: { log: (line) => logs.push(String(line)) },
      }
    );
    assert.equal(dryRun.exitCode, 0);
    const dryRunPayload = JSON.parse(logs.at(-1));
    assert.equal(dryRunPayload.session.sessionId, 'demo-session');
    assert.equal(dryRunPayload.session.worktree.enabled, true);

    const stopResult = await runHarnessCommand(
      { subcommand: 'stop', sessionId: 'demo-session', json: true },
      { rootDir, io: { log: (line) => logs.push(String(line)) } }
    );
    assert.equal(stopResult.exitCode, 0);
    const control = await readSoloControl({ rootDir, sessionId: 'demo-session' });
    assert.equal(control.stopRequested, true);

    const statusResult = await runHarnessCommand(
      { subcommand: 'status', sessionId: 'demo-session', json: true },
      { rootDir, io: { log: (line) => logs.push(String(line)) } }
    );
    assert.equal(statusResult.exitCode, 0);
    const statusPayload = JSON.parse(logs.at(-1));
    assert.equal(statusPayload.stopRequested, true);

    const resumeResult = await runHarnessCommand(
      {
        subcommand: 'resume',
        sessionId: 'demo-session',
        json: true,
      },
      {
        rootDir,
        io: { log: (line) => logs.push(String(line)) },
        executeTurn: async () => ({
          outcome: 'success',
          summary: 'resumed successfully',
          keyChanges: ['README.md'],
          keyLearnings: [],
          nextAction: 'done',
          shouldStop: true,
          failureClass: 'none',
        }),
        sleepImpl: async () => {},
      }
    );
    assert.equal(resumeResult.exitCode, 0);
    const finalPayload = JSON.parse(logs.at(-1));
    assert.equal(finalPayload.lastOutcome, 'success');
    assert.equal(finalPayload.status, 'done');

    const finalControl = await readSoloControl({ rootDir, sessionId: 'demo-session' });
    assert.equal(finalControl.stopRequested, false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runHarnessCommand dry-run recognizes OpenCode project skill roots', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-harness-opencode-skills-'));
  const binDir = path.join(rootDir, 'bin');
  const logs = [];
  const originalPath = process.env.PATH;
  const originalPathCase = process.env.Path;
  const originalPathExt = process.env.PATHEXT;

  try {
    await writeFakeCli(binDir, 'opencode');
    await mkdir(path.join(rootDir, '.opencode', 'skills', 'find-skills'), { recursive: true });
    await writeFile(path.join(rootDir, '.opencode', 'skills', 'find-skills', 'SKILL.md'), '# find-skills\n', 'utf8');

    const testPath = `${binDir}${path.delimiter}${originalPath || originalPathCase || ''}`;
    process.env.PATH = testPath;
    process.env.Path = testPath;
    if (process.platform === 'win32') {
      process.env.PATHEXT = originalPathExt || '.COM;.EXE;.BAT;.CMD';
    }

    const dryRun = await runHarnessCommand(
      {
        subcommand: 'run',
        objective: 'Verify OpenCode skill discovery',
        sessionId: 'opencode-session',
        provider: 'opencode',
        dryRun: true,
        json: true,
      },
      {
        rootDir,
        io: { log: (line) => logs.push(String(line)) },
      }
    );

    assert.equal(dryRun.exitCode, 0);
    const payload = JSON.parse(logs.at(-1));
    const skillCheck = payload.checks.find((item) => item.label === 'Skills indexed');
    assert.equal(skillCheck.ok, true);
    assert.match(skillCheck.detail, /1 skills found/u);
  } finally {
    process.env.PATH = originalPath;
    if (originalPathCase === undefined) {
      delete process.env.Path;
    } else {
      process.env.Path = originalPathCase;
    }
    if (originalPathExt === undefined) {
      delete process.env.PATHEXT;
    } else {
      process.env.PATHEXT = originalPathExt;
    }
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runHarnessCommand forwards maxIterations budget to run and resume loops', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-harness-budget-'));
  const logs = [];

  try {
    const runResult = await runHarnessCommand(
      {
        subcommand: 'run',
        objective: 'Budget test',
        sessionId: 'budget-session',
        provider: 'codex',
        profile: 'standard',
        worktree: false,
        maxIterations: 1,
        json: true,
      },
      {
        rootDir,
        io: { log: (line) => logs.push(String(line)) },
        executeTurn: async ({ iteration }) => ({
          outcome: 'success',
          summary: `iteration ${iteration}`,
          keyChanges: [],
          keyLearnings: [],
          nextAction: 'continue',
          shouldStop: false,
          failureClass: 'none',
        }),
        sleepImpl: async () => {},
      }
    );
    assert.equal(runResult.exitCode, 0);
    assert.equal(runResult.status.iterationCount, 2);
    assert.equal(runResult.status.status, 'human-gate');
    assert.equal(runResult.status.lastFailureClass, 'safety-gate');

    const resumeResult = await runHarnessCommand(
      {
        subcommand: 'resume',
        sessionId: 'budget-session',
        maxIterations: 1,
        json: true,
      },
      {
        rootDir,
        io: { log: (line) => logs.push(String(line)) },
        executeTurn: async ({ iteration }) => ({
          outcome: 'success',
          summary: `resume iteration ${iteration}`,
          keyChanges: [],
          keyLearnings: [],
          nextAction: 'continue',
          shouldStop: false,
          failureClass: 'none',
        }),
        sleepImpl: async () => {},
      }
    );
    assert.equal(resumeResult.exitCode, 0);
    assert.equal(resumeResult.status.iterationCount, 3);
    assert.equal(resumeResult.status.status, 'human-gate');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runHarnessCommand persists AIOS install root for workspace-scoped live resumes', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-harness-aios-root-'));
  const logs = [];

  try {
    const runResult = await runHarnessCommand(
      {
        subcommand: 'run',
        objective: 'External workspace',
        sessionId: 'external-session',
        provider: 'codex',
        profile: 'standard',
        worktree: false,
        maxIterations: 1,
        json: true,
      },
      {
        rootDir,
        aiosRootDir: '/opt/aios',
        io: { log: (line) => logs.push(String(line)) },
        executeTurn: async () => ({
          outcome: 'success',
          summary: 'stop after first pass',
          keyChanges: [],
          keyLearnings: [],
          nextAction: 'done',
          shouldStop: true,
          failureClass: 'none',
        }),
        sleepImpl: async () => {},
      }
    );

    assert.equal(runResult.exitCode, 0);
    const summary = await readSoloRunSummary({ rootDir, sessionId: 'external-session' });
    assert.equal(summary.aiosRootDir, path.resolve('/opt/aios'));
    assert.equal(summary.workspaceRoot, rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runSoloHarnessLoop exits on requested stop before another executeTurn begins', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-runtime-stop-'));

  try {
    await initSoloRunJournal({
      rootDir,
      sessionId: 'stop-session',
      objective: 'Stop test',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      worktree: {
        enabled: false,
        baseRef: 'HEAD',
        path: '',
        preserved: false,
        cleanupReason: '',
      },
    });
    await requestSoloHarnessStop({ rootDir, sessionId: 'stop-session' });

    let called = 0;
    const result = await runSoloHarnessLoop({
      rootDir,
      sessionId: 'stop-session',
      objective: 'Stop test',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      maxIterations: 3,
      executeTurn: async () => {
        called += 1;
        return {
          outcome: 'success',
          summary: 'unexpected',
          shouldStop: false,
        };
      },
      sleepImpl: async () => {},
    });

    assert.equal(called, 0);
    assert.equal(result.summary.status, 'stopped');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runSoloHarnessLoop emits lifecycle hook evidence and iteration hook logs', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-runtime-hooks-'));

  try {
    await initSoloRunJournal({
      rootDir,
      sessionId: 'hook-session',
      objective: 'Hook validation',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      worktree: {
        enabled: false,
        baseRef: 'HEAD',
        path: '',
        preserved: false,
        cleanupReason: '',
      },
    });

    const hookCalls = [];
    const result = await runSoloHarnessLoop({
      rootDir,
      sessionId: 'hook-session',
      objective: 'Hook validation',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      maxIterations: 1,
      executeTurn: async () => ({
        outcome: 'success',
        summary: 'done with hooks',
        keyChanges: ['scripts/lib/harness/solo-runtime.mjs'],
        keyLearnings: [],
        nextAction: 'none',
        shouldStop: true,
        failureClass: 'none',
      }),
      lifecycleHooks: {
        onTurnStart: ({ iteration }) => {
          hookCalls.push(`start:${iteration}`);
          return 'turn start ok';
        },
        onTurnComplete: ({ outcome }) => {
          hookCalls.push(`complete:${outcome.outcome}`);
          return 'turn complete ok';
        },
        onBeforeContinuityCommit: () => {
          hookCalls.push('pre-commit');
          return 'continuity commit ok';
        },
        onSessionEnd: ({ reason }) => {
          hookCalls.push(`end:${reason}`);
          return 'session end ok';
        },
      },
      sleepImpl: async () => {},
    });

    assert.equal(result.summary.status, 'done');
    assert.equal(hookCalls.includes('start:1'), true);
    assert.equal(hookCalls.includes('complete:success'), true);
    assert.equal(hookCalls.includes('pre-commit'), true);
    assert.equal(hookCalls.includes('end:iteration-stop'), true);

    const paths = getSoloHarnessPaths({ rootDir, sessionId: 'hook-session' });
    const hookRaw = await readFile(paths.hookEventsPath, 'utf8');
    assert.match(hookRaw, /onTurnStart/);
    assert.match(hookRaw, /onTurnComplete/);
    assert.match(hookRaw, /onBeforeContinuityCommit/);
    assert.match(hookRaw, /onSessionEnd/);

    const logRaw = await readFile(
      path.join(paths.iterationDir, 'iteration-0001.log.jsonl'),
      'utf8'
    );
    assert.match(logRaw, /\"kind\":\"hook\"/);
    assert.match(logRaw, /turn-start/);
    assert.match(logRaw, /turn-complete/);
    assert.match(logRaw, /pre-continuity-commit/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('classifySoloFailure does not treat search results mentioning ownership as an ownership gate', async () => {
  const { classifySoloFailure } = await import('../lib/harness/solo-runtime.mjs');
  const detail = 'docs/plans/plan-ownership-preflight-gates.md\nSearch result mentions ownership, but no gate was raised.';
  assert.equal(classifySoloFailure(detail), 'runtime-error');
});
