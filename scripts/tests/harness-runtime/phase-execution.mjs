import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chmod,
  mkdtemp,
  rm,
  writeFile,
  os,
  path,
  runContextDbCli,
  pathExists,
} from './support.mjs';

test('executePhaseJob waits for role-memory persistence before returning', async () => {
  const { executePhaseJob } = await import('../../lib/harness/subagent-runtime/phase-job.mjs');
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
  const { executePhaseJob } = await import('../../lib/harness/subagent-runtime/phase-job.mjs');
  const { readMetricsRecords } = await import('../../lib/interception/metrics/metrics-sink.mjs');
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
  const { executeSubagentDispatchPlan } = await import('../../lib/harness/subagent-runtime.mjs');
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
