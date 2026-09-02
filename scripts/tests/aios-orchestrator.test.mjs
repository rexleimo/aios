import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseArgs } from '../lib/cli/parse-args.mjs';
import {
  createLocalDispatchExecutorRegistry,
  resolveLocalDispatchExecutor,
  selectLocalDispatchExecutor,
} from '../lib/harness/orchestrator-executors.mjs';
import {
  buildExecutorCapabilityManifest,
  buildDecomposedWorkItems,
  buildLocalDispatchPlan,
  buildOrchestrationPlan,
  executeLocalDispatchPlan,
  getOrchestratorBlueprint,
  mergeParallelHandoffs,
  renderOrchestrationReport,
} from '../lib/harness/orchestrator.mjs';
import { evaluateClarityGate } from '../lib/harness/clarity-gate.mjs';
import { buildDispatchInsights } from '../lib/harness/dispatch-insights.mjs';
import { persistDispatchEvidence } from '../lib/harness/orchestrator-evidence.mjs';
import { buildWorkItemTelemetry } from '../lib/harness/work-item-telemetry.mjs';
import { executeMergeGateJob } from '../lib/harness/subagent-runtime/merge-gate.mjs';
import { planOrchestrate, runOrchestrate } from '../lib/lifecycle/orchestrate.mjs';

async function importDispatchRuntimes() {
  try {
    return await import('../lib/harness/orchestrator-runtimes.mjs');
  } catch {
    return null;
  }
}

async function importDispatchRuntimeSpec() {
  try {
    return await import('../lib/specs/orchestrator-runtimes.json', { with: { type: 'json' } });
  } catch {
    return null;
  }
}

async function importWorkItemTelemetrySpec() {
  try {
    return await import('../lib/specs/orchestrator-work-item-telemetry.schema.json', { with: { type: 'json' } });
  } catch {
    return null;
  }
}

async function makeRootDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'aios-orchestrator-'));
}

function assertSnapshotManifestShape(manifest, {
  expectedSessionId = null,
  expectedJobId = '',
  expectedPhaseId = '',
  expectedRole = '',
  expectedPathPrefix = '',
  expectedManifestPath = '',
  expectedBackupPath = '',
} = {}) {
  assert.equal(manifest?.schemaVersion, 1);
  assert.equal(manifest?.kind, 'orchestration.pre-mutation-snapshot');
  assert.equal(typeof manifest?.createdAt, 'string');
  assert.equal(Number.isFinite(Date.parse(manifest.createdAt)), true);
  assert.equal(typeof manifest?.sessionId, 'string');
  assert.equal(typeof manifest?.jobId, 'string');
  assert.equal(typeof manifest?.phaseId, 'string');
  assert.equal(typeof manifest?.role, 'string');
  assert.equal(Array.isArray(manifest?.targets), true);
  assert.equal(manifest.targets.length > 0, true);
  assert.equal(typeof manifest?.backupPath, 'string');
  assert.equal(manifest.backupPath.length > 0, true);
  assert.equal(manifest.backupPath.endsWith('/backup'), true);
  assert.match(manifest.backupPath, /pre-mutation-/);
  assert.equal(typeof manifest?.restoreHint, 'string');
  assert.equal(manifest.restoreHint.length > 0, true);

  if (expectedSessionId !== null) {
    assert.equal(manifest.sessionId, expectedSessionId);
  }
  if (expectedJobId) {
    assert.equal(manifest.jobId, expectedJobId);
  }
  if (expectedPhaseId) {
    assert.equal(manifest.phaseId, expectedPhaseId);
  }
  if (expectedRole) {
    assert.equal(manifest.role, expectedRole);
  }
  if (expectedPathPrefix) {
    assert.equal(
      manifest.targets.some((item) => String(item?.path || '').startsWith(expectedPathPrefix)),
      true
    );
  }
  if (expectedManifestPath) {
    assert.equal(manifest.restoreHint.includes(expectedManifestPath), true);
  }
  if (expectedBackupPath) {
    assert.equal(manifest.restoreHint.includes(expectedBackupPath), true);
    assert.equal(manifest.backupPath, expectedBackupPath);
  }

  for (const target of manifest.targets) {
    assert.equal(typeof target?.path, 'string');
    assert.equal(target.path.length > 0, true);
    assert.equal(target.path.startsWith('/'), false);
    assert.equal(target.path.includes('..'), false);
    assert.equal(typeof target?.existed, 'boolean');
    assert.equal(['file', 'dir'].includes(target?.type), true);
  }
}

async function createFakeCodexCommand(
  payload = null,
  {
    usageLog = '',
    failOnOutputSchema = false,
    upstreamFailAttempts = 0,
    captureInputPath = '',
    captureArgsPath = '',
    hangAfterOutput = false,
  } = {}
) {
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-orchestrator-bin-'));
  const json = payload || {
    status: 'completed',
    fromRole: 'subagent',
    toRole: 'next-phase',
    taskTitle: 'Fake subagent task',
    contextSummary: 'Synthetic subagent output for harness tests.',
    findings: [],
    filesTouched: [],
    openQuestions: [],
    recommendations: [],
  };
  const jsonText = JSON.stringify(json);
  const jsTextLiteral = JSON.stringify(`${jsonText}\n`);
  const jsonTextLiteral = JSON.stringify(jsonText);
  const usageText = String(usageLog || '').trim();
  const usageLiteral = JSON.stringify(usageText.length > 0 ? `${usageText}\n` : '');
  const usageWrite = usageText.length > 0 ? `process.stderr.write(${usageLiteral});\n` : '';
  const invalidSchemaErrorLiteral = JSON.stringify('ERROR: {"error":{"message":"schema rejected","type":"invalid_request_error","code":"invalid_json_schema","param":"text.format.schema"}}\n');
  const upstreamErrorLiteral = JSON.stringify('ERROR: {"error":{"message":"upstream failure","type":"server_error","code":"upstream_error"}}\n');
  const upstreamFailureLimit = Number.parseInt(String(upstreamFailAttempts ?? 0), 10);
  const upstreamFailureLimitLiteral = Number.isFinite(upstreamFailureLimit) && upstreamFailureLimit > 0 ? String(upstreamFailureLimit) : '0';
  const attemptStatePathLiteral = JSON.stringify(path.join(binDir, 'codex-fake-attempt-count.txt'));
  const captureInputPathLiteral = JSON.stringify(String(captureInputPath || '').trim());
  const captureArgsPathLiteral = JSON.stringify(String(captureArgsPath || '').trim());
  const scriptBody = [
    "import fs from 'node:fs';",
    "const args = process.argv.slice(2);",
    `const attemptStatePath = ${attemptStatePathLiteral};`,
    `const captureInputPath = ${captureInputPathLiteral};`,
    `const captureArgsPath = ${captureArgsPathLiteral};`,
    "let stdinText = '';",
    'try {',
    "  stdinText = fs.readFileSync(0, 'utf8');",
    '} catch {',
    "  stdinText = '';",
    '}',
    'if (captureInputPath) {',
    '  try {',
    "    fs.appendFileSync(captureInputPath, `===PROMPT===\\n${stdinText}\\n`, 'utf8');",
    '  } catch {',
    '    // ignore capture failures in test fixture',
    '  }',
    '}',
    'if (captureArgsPath) {',
    '  try {',
    "    fs.appendFileSync(captureArgsPath, `${JSON.stringify(args)}\\n`, 'utf8');",
    '  } catch {',
    '    // ignore capture failures in test fixture',
    '  }',
    '}',
    'let attempt = 0;',
    'try {',
    "  attempt = Number.parseInt(fs.readFileSync(attemptStatePath, 'utf8'), 10) || 0;",
    '} catch {',
    '  attempt = 0;',
    '}',
    'attempt += 1;',
    'try {',
    "  fs.writeFileSync(attemptStatePath, String(attempt), 'utf8');",
    '} catch {',
    '  // ignore counter write failures in test fixture',
    '}',
    `if (attempt <= ${upstreamFailureLimitLiteral}) {`,
    `  process.stderr.write(${upstreamErrorLiteral});`,
    '  process.exit(1);',
    '}',
    "const schemaFlagIndex = args.indexOf('--output-schema');",
    "if (schemaFlagIndex >= 0 && " + (failOnOutputSchema ? 'true' : 'false') + ") {",
    `  process.stderr.write(${invalidSchemaErrorLiteral});`,
    '  process.exit(1);',
    '}',
    "const lastMessageFlagIndex = args.indexOf('--output-last-message');",
    'if (lastMessageFlagIndex >= 0 && args[lastMessageFlagIndex + 1]) {',
    '  try {',
    `    fs.writeFileSync(args[lastMessageFlagIndex + 1], ${jsonTextLiteral}, 'utf8');`,
    '  } catch {',
    '    // ignore write failures in test fixture',
    '  }',
    '}',
    `process.stdout.write(${jsTextLiteral});`,
    usageWrite.trimEnd(),
    hangAfterOutput ? "setInterval(() => {}, 1000);" : '',
  ].filter(Boolean).join('\n');
  const script = path.join(binDir, 'codex-fake.mjs');
  await fs.writeFile(script, `${scriptBody}\n`, 'utf8');

  if (process.platform === 'win32') {
    const shim = path.join(binDir, 'codex.cmd');
    await fs.writeFile(shim, `@echo off\r\nnode "${script}" %*\r\n`, 'utf8');
    return binDir;
  }

  const file = path.join(binDir, 'codex');
  await fs.writeFile(file, `#!/usr/bin/env bash\nexec node "${script}" "$@"\n`, 'utf8');
  await fs.chmod(file, 0o755);
  return binDir;
}

async function createFakeAgentCommands({ captureInputPath = '', captureArgsPath = '' } = {}) {
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-agent-bin-'));
  const script = path.join(binDir, 'fake-agent.mjs');
  const captureInputPathLiteral = JSON.stringify(String(captureInputPath || '').trim());
  const captureArgsPathLiteral = JSON.stringify(String(captureArgsPath || '').trim());
  const scriptBody = [
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    'const cli = path.basename(process.argv[1]).replace(/\\.(?:cmd|mjs)$/i, "");',
    'const args = process.argv.slice(2);',
    'const invoked = process.env.FAKE_AGENT_CLI || (["codex", "claude", "gemini"].includes(cli) ? cli : String(args.find((arg) => arg === "codex" || arg === "claude" || arg === "gemini") || cli));',
    `const captureInputPath = ${captureInputPathLiteral};`,
    `const captureArgsPath = ${captureArgsPathLiteral};`,
    "let stdinText = '';",
    'try {',
    "  stdinText = fs.readFileSync(0, 'utf8');",
    '} catch {',
    "  stdinText = '';",
    '}',
    'if (captureInputPath) {',
    '  fs.appendFileSync(captureInputPath, `===${invoked}:PROMPT===\\n${stdinText}\\nARGS=${JSON.stringify(args)}\\n`, "utf8");',
    '}',
    'if (captureArgsPath) {',
    '  fs.appendFileSync(captureArgsPath, `${invoked} ${JSON.stringify(args)}\\n`, "utf8");',
    '}',
    'const prompt = [stdinText, ...args].join(" ");',
    'const roleMatch = /fromRole=([a-z-]+)/.exec(prompt) || /role:\\s*([a-z-]+)/.exec(prompt);',
    'const role = roleMatch ? roleMatch[1] : "subagent";',
    'const workItemMatch = /workItemRefs=([^\\n]+)/.exec(prompt);',
    'const workItem = workItemMatch ? workItemMatch[1].split(",")[0].trim() : "";',
    'const fileByWorkItem = { "wi.1": "scripts/routed-worker.mjs", "wi.2": "scripts/tests/routed-worker.test.mjs", "wi.3": "scripts/routed-worker-extra.mjs", "wi.4": "scripts/tests/routed-worker-extra.test.mjs" };',
    'const filesTouched = role === "implementer" ? [fileByWorkItem[workItem] || "scripts/routed-worker.mjs"] : [];',
    'const payload = { schemaVersion: 1, status: "completed", fromRole: role, toRole: "next-phase", taskTitle: "Fake routed task", contextSummary: `Routed through ${invoked}`, findings: [`cli=${invoked}`], filesTouched, openQuestions: [], recommendations: [] };',
    'const jsonText = JSON.stringify(payload);',
    'const lastMessageFlagIndex = args.indexOf("--output-last-message");',
    'if (lastMessageFlagIndex >= 0 && args[lastMessageFlagIndex + 1]) {',
    '  fs.writeFileSync(args[lastMessageFlagIndex + 1], jsonText, "utf8");',
    '}',
    'process.stdout.write(`${jsonText}\\n`);',
  ].join('\n');
  await fs.writeFile(script, `${scriptBody}\n`, 'utf8');

  for (const command of ['codex', 'claude', 'gemini']) {
    if (process.platform === 'win32') {
      const commandScript = path.join(binDir, `${command}.mjs`);
      await fs.writeFile(commandScript, `${scriptBody}\n`, 'utf8');
      const file = path.join(binDir, `${command}.cmd`);
      await fs.writeFile(file, `@echo off\r\nnode "${commandScript}" %*\r\n`, 'utf8');
      continue;
    }

    const file = path.join(binDir, command);
    await fs.writeFile(file, `#!/usr/bin/env bash\nFAKE_AGENT_CLI="${command}" exec node "${script}" "$@"\n`, 'utf8');
    await fs.chmod(file, 0o755);
  }

  return binDir;
}


async function writePlanFile(rootDir, relPath = 'docs/plans/preflight-ready.md', markdown = '') {
  const content = markdown || `# Preflight Ready Plan

## Progress
- Ready for dispatch.

## Decision Log
- Use explicit plan and ownership readiness gates.

## Acceptance
- Dry-run reports readiness.

## Next Actions
- Run orchestrate preflight.
`;
  const absPath = path.join(rootDir, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, 'utf8');
  return relPath;
}

async function writeSession(rootDir, sessionId, metaOverrides = {}, checkpoints = []) {
  const sessionDir = path.join(rootDir, '.aios', 'context-db', 'sessions', sessionId);
  await fs.mkdir(sessionDir, { recursive: true });

  const meta = {
    schemaVersion: 1,
    sessionId,
    agent: 'codex-cli',
    project: 'rex-ai-boot',
    goal: 'Ship orchestrator blueprints',
    tags: [],
    status: 'running',
    createdAt: '2026-03-09T00:00:00.000Z',
    updatedAt: '2026-03-09T00:10:00.000Z',
    ...metaOverrides,
  };
  const lastCheckpoint = checkpoints[checkpoints.length - 1] || null;
  const summaryUpdatedAt = lastCheckpoint?.ts || meta.updatedAt || meta.createdAt;
  const summaryStatus = lastCheckpoint?.status || meta.status || 'running';
  const summaryNextActions = Array.isArray(lastCheckpoint?.nextActions) && lastCheckpoint.nextActions.length > 0
    ? lastCheckpoint.nextActions.map((item) => `- ${item}`).join('\n')
    : '- (none)';
  const summaryArtifacts = Array.isArray(lastCheckpoint?.artifacts) && lastCheckpoint.artifacts.length > 0
    ? lastCheckpoint.artifacts.map((item) => `- ${item}`).join('\n')
    : '- (none)';
  const summaryMarkdown = [
    `# Session ${sessionId}`,
    '',
    `- Agent: ${meta.agent}`,
    `- Project: ${meta.project}`,
    `- Goal: ${meta.goal}`,
    `- Status: ${summaryStatus}`,
    `- Updated: ${summaryUpdatedAt}`,
    '',
    '## Summary',
    lastCheckpoint?.summary || 'Test session scaffold.',
    '',
    '## Next Actions',
    summaryNextActions,
    '',
    '## Artifacts',
    summaryArtifacts,
    '',
  ].join('\n');

  await fs.writeFile(path.join(sessionDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(sessionDir, 'l0-summary.md'), summaryMarkdown, 'utf8');
  await fs.writeFile(path.join(sessionDir, 'l2-events.jsonl'), '', 'utf8');
  await fs.writeFile(
    path.join(sessionDir, 'l1-checkpoints.jsonl'),
    checkpoints.map((item) => JSON.stringify(item)).join('\n') + (checkpoints.length > 0 ? '\n' : ''),
    'utf8'
  );
  await fs.writeFile(
    path.join(sessionDir, 'state.json'),
    `${JSON.stringify({
      lastEventAt: null,
      lastEventSeq: 0,
      lastCheckpointAt: lastCheckpoint?.ts || null,
      lastCheckpointSeq: checkpoints.length,
      status: lastCheckpoint?.status || meta.status || 'running',
      nextActions: Array.isArray(lastCheckpoint?.nextActions) ? lastCheckpoint.nextActions : [],
    }, null, 2)}\n`,
    'utf8'
  );
}

async function writeDispatchEvidence(rootDir, sessionId, {
  seq = 1,
  ts = '2026-03-09T03:00:00.000Z',
  ok = true,
  executors = ['local-phase', 'local-merge-gate'],
  blockedJobs = 0,
  artifactName = 'dispatch-run-20260309T030000Z.json',
} = {}) {
  const artifactPath = path.join('.aios', 'context-db', 'sessions', sessionId, 'artifacts', artifactName);
  const artifactAbsPath = path.join(rootDir, artifactPath);
  await fs.mkdir(path.dirname(artifactAbsPath), { recursive: true });
  await fs.writeFile(
    artifactAbsPath,
    `${JSON.stringify({
      schemaVersion: 1,
      kind: 'orchestration.dispatch-run',
      sessionId,
      persistedAt: ts,
      dispatchRun: {
        mode: 'dry-run',
        ok,
        executorRegistry: executors,
        jobRuns: [
          { jobId: 'phase.plan', status: 'simulated', output: { outputType: 'handoff' } },
          {
            jobId: 'merge.final-checks',
            status: blockedJobs > 0 ? 'blocked' : 'simulated',
            output: { outputType: 'merged-handoff' },
          },
        ],
        finalOutputs: [
          { jobId: 'phase.plan', outputType: 'handoff' },
          { jobId: 'merge.final-checks', outputType: 'merged-handoff' },
        ],
      },
    }, null, 2)}\n`,
    'utf8'
  );

  const sessionDir = path.join(rootDir, '.aios', 'context-db', 'sessions', sessionId);
  const eventsPath = path.join(sessionDir, 'l2-events.jsonl');
  const event = {
    seq,
    ts,
    role: 'assistant',
    kind: 'orchestration.dispatch-run',
    text: `orchestrate dry-run ${ok ? 'ready' : 'blocked'} artifact=${artifactPath}`,
    refs: [artifactPath],
  };
  await fs.appendFile(eventsPath, `${JSON.stringify(event)}\n`, 'utf8');

  return { artifactPath, eventId: `${sessionId}#${seq}` };
}

function runContextDbCli(args, { cwd = process.cwd() } = {}) {
  const tsxCli = path.join(cwd, 'mcp-server', 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const contextDbCli = path.join(cwd, 'mcp-server', 'src', 'contextdb', 'cli.ts');
  const result = spawnSync(process.execPath, [tsxCli, contextDbCli, ...args], {
    cwd,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const stdout = String(result.stdout || '').trim();
  return stdout.length > 0 ? JSON.parse(stdout) : {};
}

test('parseArgs accepts orchestrate blueprint and task', () => {
  const result = parseArgs(['orchestrate', 'feature', '--task', 'Add harness orchestrator']);
  assert.equal(result.command, 'orchestrate');
  assert.equal(result.options.blueprint, 'feature');
  assert.equal(result.options.taskTitle, 'Add harness orchestrator');
});

test('parseArgs accepts orchestrate learn-eval overlay options', () => {
  const result = parseArgs([
    'orchestrate',
    '--session',
    'session-123',
    '--limit',
    '5',
    '--recommendation',
    'blueprint.security',
  ]);
  assert.equal(result.command, 'orchestrate');
  assert.equal(result.options.sessionId, 'session-123');
  assert.equal(result.options.limit, 5);
  assert.equal(result.options.recommendationId, 'blueprint.security');
});

test('parseArgs accepts local dispatch mode for orchestrate', () => {
  const result = parseArgs(['orchestrate', 'feature', '--dispatch', 'local']);
  assert.equal(result.command, 'orchestrate');
  assert.equal(result.options.dispatchMode, 'local');
});

test('parseArgs accepts local dry-run execute mode for orchestrate', () => {
  const result = parseArgs(['orchestrate', 'feature', '--dispatch', 'local', '--execute', 'dry-run']);
  assert.equal(result.command, 'orchestrate');
  assert.equal(result.options.dispatchMode, 'local');
  assert.equal(result.options.executionMode, 'dry-run');
});

test('parseArgs accepts local live execute mode for orchestrate', () => {
  const result = parseArgs(['orchestrate', 'feature', '--dispatch', 'local', '--execute', 'live']);
  assert.equal(result.command, 'orchestrate');
  assert.equal(result.options.dispatchMode, 'local');
  assert.equal(result.options.executionMode, 'live');
});

test('parseArgs accepts orchestrate preflight mode and plan path', () => {
  const result = parseArgs([
    'orchestrate',
    'feature',
    '--dispatch',
    'local',
    '--preflight',
    'auto',
    '--plan',
    'docs/plans/feature.md',
  ]);
  assert.equal(result.command, 'orchestrate');
  assert.equal(result.options.preflightMode, 'auto');
  assert.equal(result.options.planPath, 'docs/plans/feature.md');
});

test('getOrchestratorBlueprint expands role cards', () => {
  const blueprint = getOrchestratorBlueprint('feature');
  assert.equal(blueprint.phases.length, 4);
  assert.equal(blueprint.phases[0].roleCard.label, 'Planner');
  assert.equal(blueprint.phases[2].group, 'final-checks');
  const implementPhase = blueprint.phases.find((phase) => phase.role === 'implementer');
  assert.ok(implementPhase, 'expected implementer phase');
  assert.equal(Array.isArray(implementPhase.ownedPathPrefixes), true);
  assert.equal(implementPhase.ownedPathPrefixes.includes(''), false);
});

test('buildOrchestrationPlan creates ordered phases', () => {
  const plan = buildOrchestrationPlan({ blueprint: 'bugfix', taskTitle: 'Fix auth wall detection' });
  assert.equal(plan.blueprint, 'bugfix');
  assert.equal(plan.phases[0].role, 'planner');
  assert.equal(plan.phases[1].role, 'implementer');
  assert.equal(Array.isArray(plan.workItems), true);
  assert.equal(plan.workItems.length >= 1, true);
});

test('buildDecomposedWorkItems extracts context candidates with neutral types and deterministic path hints', () => {
  const items = buildDecomposedWorkItems({
    taskTitle: 'Harden checkout flow',
    contextSummary: '- add auth preflight check\n- update billing retry logic\n- add regression tests\n- update docs/README.md',
  });

  assert.equal(items.length, 4);
  assert.equal(items[0].itemId, 'wi.1');
  // 北极星原则：程序不猜类型，无显式声明时一律 general
  assert.equal(items.every((item) => item.type === 'general'), true);
  // 确定性提取：summary 中形如路径的 token 才进入 ownedPathHints
  assert.equal(items[3].ownedPathHints.includes('docs/README.md'), true);
  // 无显式路径时只返回宽泛默认，不做关键词归属猜测
  assert.equal(items[0].ownedPathHints.includes('scripts/tests/'), false);
  assert.equal(items[2].ownedPathHints.includes('scripts/tests/'), false);
  assert.deepEqual(items[0].ownedPathHints, ['scripts/', 'mcp-server/', 'docs/']);
  assert.equal(items.every((item) => item.status === 'queued'), true);
});

test('selectLocalDispatchExecutor resolves supported local job types', () => {
  assert.equal(selectLocalDispatchExecutor({ jobType: 'phase' }), 'local-phase');
  assert.equal(selectLocalDispatchExecutor({ jobType: 'merge-gate' }), 'local-merge-gate');
});

test('dispatch runtime manifest spec defines the local dry-run runtime', async () => {
  const runtimeSpec = await importDispatchRuntimeSpec();
  assert.ok(runtimeSpec, 'expected runtime manifest spec');

  assert.equal(runtimeSpec.default.schemaVersion, 1);
  assert.equal(typeof runtimeSpec.default.runtimes['local-dry-run']?.label, 'string');
  assert.equal(runtimeSpec.default.runtimes['local-dry-run']?.requiresModel, false);
  assert.equal(runtimeSpec.default.runtimes['subagent-runtime']?.requiresModel, true);
  assert.equal(runtimeSpec.default.runtimes['subagent-runtime']?.executionModes?.includes('live'), true);
});

test('work-item telemetry schema exists and pins schemaVersion=1', async () => {
  const telemetrySpec = await importWorkItemTelemetrySpec();
  assert.ok(telemetrySpec, 'expected work-item telemetry schema');
  assert.equal(telemetrySpec.default.properties.schemaVersion.const, 1);
});

test('buildWorkItemTelemetry keeps neutral failure class and deterministic retry class for blocked retries', () => {
  const telemetry = buildWorkItemTelemetry({
    dispatchRun: {
      jobRuns: [
        {
          jobId: 'phase.plan',
          jobType: 'phase',
          role: 'planner',
          status: 'completed',
          dependsOn: [],
          elapsedMs: 1200,
          output: { outputType: 'handoff' },
        },
        {
          jobId: 'phase.implement',
          jobType: 'phase',
          role: 'implementer',
          status: 'blocked',
          attempts: 2,
          dependsOn: ['phase.plan'],
          output: { outputType: 'handoff', error: 'Timed out after 600000 ms' },
        },
      ],
    },
    artifactRefs: ['.aios/context-db/sessions/s/artifacts/dispatch-run-x.json'],
  });

  assert.equal(telemetry.schemaVersion, 1);
  assert.equal(telemetry.totals.total, 2);
  assert.equal(telemetry.totals.done, 1);
  assert.equal(telemetry.totals.blocked, 1);
  const blocked = telemetry.items.find((item) => item.itemId === 'phase.implement');
  assert.ok(blocked, 'expected blocked work item');
  // 北极星原则：无显式声明时失败类别恒为中性 runtime-error，不从错误文本猜
  assert.equal(blocked.failureClass, 'runtime-error');
  // 重试类别是确定性计数簿记（attempts>1），不受错误文本影响
  assert.equal(blocked.retryClass, 'same-hypothesis');
  assert.equal(blocked.attempts, 2);
  assert.equal(blocked.artifactRefs.length, 1);
});

test('buildDispatchInsights ranks blocked retries and clarity gate as blocking signals', () => {
  const insights = buildDispatchInsights({
    dispatchRun: {
      mode: 'live',
      ok: false,
      runtime: { id: 'subagent-runtime', executionMode: 'live' },
      jobRuns: [
        {
          jobId: 'phase.implement',
          jobType: 'phase',
          role: 'implementer',
          status: 'blocked',
          attempts: 2,
          output: {
            error: 'timed out waiting for handoff',
            outputType: 'error',
          },
        },
      ],
      cost: { totalTokens: 250000, usd: 1.25 },
    },
    workItemTelemetry: {
      schemaVersion: 1,
      totals: { total: 1, queued: 0, running: 0, blocked: 1, done: 0 },
      items: [
        {
          itemId: 'phase.implement',
          itemType: 'phase',
          role: 'implementer',
          status: 'blocked',
          failureClass: 'timeout',
          retryClass: 'same-hypothesis',
          attempts: 2,
        },
      ],
    },
    executorCapabilityManifest: {
      executionMode: 'live',
      runtimeId: 'subagent-runtime',
      summary: { read: 'yes', write: 'yes', network: 'unknown', browser: 'no', sideEffect: 'unknown' },
      executors: [],
    },
    clarityGate: { needsHuman: true, reasons: ['risk signal present'] },
  }, { costTokenWarningThreshold: 100000 });

  assert.equal(insights.schemaVersion, 1);
  assert.equal(insights.status, 'blocked');
  assert.equal(insights.runtime.id, 'subagent-runtime');
  assert.equal(insights.runtime.executionMode, 'live');
  assert.ok(insights.score < 100);
  assert.ok(insights.signals.some((signal) => signal.id === 'work.blocked' && signal.severity === 'block'));
  assert.ok(insights.signals.some((signal) => signal.id === 'retry.same-hypothesis'));
  assert.ok(insights.signals.some((signal) => signal.id === 'capability.unknown'));
  assert.ok(insights.signals.some((signal) => signal.id === 'clarity.human-gate'));
  assert.ok(insights.signals.some((signal) => signal.id === 'cost.high'));
  assert.ok(insights.suggestedActions.some((action) => action.id === 'revise-before-retry'));
  assert.ok(insights.suggestedActions.some((action) => action.id === 'review-clarity-gate'));
});

test('buildDispatchInsights marks successful dispatch as clear with learn-eval follow-up', () => {
  const insights = buildDispatchInsights({
    dispatchRun: {
      mode: 'dry-run',
      ok: true,
      runtime: { id: 'local-dry-run', executionMode: 'dry-run' },
      jobRuns: [
        { jobId: 'phase.plan', jobType: 'phase', role: 'planner', status: 'simulated', output: { outputType: 'handoff' } },
      ],
    },
    workItemTelemetry: {
      schemaVersion: 1,
      totals: { total: 1, queued: 0, running: 0, blocked: 0, done: 1 },
      items: [
        { itemId: 'phase.plan', itemType: 'phase', role: 'planner', status: 'done', failureClass: 'none', retryClass: 'none' },
      ],
    },
  });

  assert.equal(insights.status, 'clear');
  assert.equal(insights.score, 100);
  assert.equal(insights.signals.some((signal) => signal.severity === 'block'), false);
  assert.ok(insights.suggestedActions.some((action) => action.id === 'run-learn-eval'));
});

test('evaluateClarityGate flags sensitive command and boundary-crossing signals', () => {
  const gate = evaluateClarityGate({
    sessionId: 'risk-session',
    learnEvalReport: {
      status: { counts: { blocked: 0 } },
      recommendations: { fix: [], promote: [] },
    },
    dispatchRun: {
      jobRuns: [
        {
          output: {
            payload: {
              taskTitle: 'Rotate auth token safely',
              contextSummary: 'Need policy and compliance review before billing workflow changes.',
              recommendations: [
                'Run: sudo chmod 600 ~/.ssh/id_rsa',
              ],
              findings: [],
              openQuestions: [],
              filesTouched: [],
            },
          },
        },
      ],
    },
  });

  assert.equal(gate.needsHuman, true);
  assert.equal(gate.reasons.some((item) => /sensitive command signals/i.test(item)), true);
  assert.equal(gate.reasons.some((item) => /auth\/payment\/policy boundary signals/i.test(item)), true);
  assert.equal(gate.metrics.sensitiveCommandSignals.length > 0, true);
  assert.equal(gate.metrics.boundaryCrossingSignals.length > 0, true);
  assert.equal(gate.metrics.externalWriteSignals.length, 0);
  assert.equal(gate.decision, 'approval-required');
  assert.match(gate.question, /confirm/i);
  assert.equal(gate.nextActions.some((item) => /rerun/i.test(item)), true);
});

test('evaluateClarityGate flags external write targets outside repo scope', () => {
  const gate = evaluateClarityGate({
    sessionId: 'risk-session',
    learnEvalReport: {
      status: { counts: { blocked: 0 } },
      recommendations: { fix: [], promote: [] },
    },
    dispatchRun: {
      jobRuns: [
        {
          output: {
            payload: {
              taskTitle: 'Update deployment config',
              contextSummary: 'write system config',
              recommendations: [],
              findings: [],
              openQuestions: [],
              filesTouched: ['/etc/hosts', '../outside-repo.txt', 'C:\\Windows\\System32\\drivers\\etc\\hosts'],
            },
          },
        },
      ],
    },
  });

  assert.equal(gate.needsHuman, true);
  assert.equal(gate.reasons.some((item) => /external write signals/i.test(item)), true);
  assert.equal(gate.metrics.externalWriteSignals.length >= 2, true);
});

test('evaluateClarityGate ignores boundary terms in narrative findings and recommendations', () => {
  const gate = evaluateClarityGate({
    sessionId: 'narrative-session',
    learnEvalReport: {
      status: { counts: { blocked: 0 } },
      recommendations: { fix: [], promote: [] },
    },
    dispatchRun: {
      jobRuns: [
        {
          output: {
            payload: {
              taskTitle: 'Operational follow-up',
              contextSummary: 'No explicit risky action requested.',
              findings: [
                'Prior auth/payment/policy incidents were already triaged.',
              ],
              openQuestions: [
                'Who will run the pending Windows PowerShell wrapper validation?',
              ],
              recommendations: [
                'Keep historical privacy/legal notes in the runbook timeline.',
              ],
              filesTouched: [],
            },
          },
        },
      ],
    },
  });

  assert.equal(gate.needsHuman, false);
  assert.equal(gate.metrics.boundaryCrossingSignals.length, 0);
  assert.equal(gate.reasons.some((item) => /auth\/payment\/policy boundary signals/i.test(item)), false);
});

test('evaluateClarityGate ignores negated sensitive command references', () => {
  const gate = evaluateClarityGate({
    sessionId: 'negated-command-session',
    learnEvalReport: {
      status: { counts: { blocked: 0 } },
      recommendations: { fix: [], promote: [] },
    },
    dispatchRun: {
      jobRuns: [
        {
          output: {
            payload: {
              taskTitle: 'Document release safety',
              contextSummary: 'Explain when approvals are needed.',
              findings: [],
              openQuestions: [],
              recommendations: [
                'Do not run git push; only document the approval rule.',
              ],
              filesTouched: [],
            },
          },
        },
      ],
    },
  });

  assert.equal(gate.needsHuman, false);
  assert.equal(gate.decision, 'allow');
  assert.equal(gate.metrics.sensitiveCommandSignals.length, 0);
  assert.equal(gate.reasons.some((item) => /sensitive command signals/i.test(item)), false);
});

test('evaluateClarityGate excludes clarity-needs-input checkpoints from blocked threshold metric', () => {
  const gate = evaluateClarityGate(
    {
      sessionId: 'clarity-loop-session',
      learnEvalReport: {
        status: { counts: { blocked: 6 } },
        signals: {
          failures: {
            top: [
              { category: 'clarity-needs-input', count: 5 },
              { category: 'dispatch-runtime-blocked', count: 1 },
            ],
          },
        },
        recommendations: { fix: [], promote: [] },
      },
      dispatchRun: {
        jobRuns: [
          {
            output: {
              payload: {
                taskTitle: 'Operational telemetry pass',
                contextSummary: 'Capture evidence without applying risky actions.',
                findings: [],
                openQuestions: [],
                recommendations: [],
                filesTouched: [],
              },
            },
          },
        ],
      },
    },
    { blockedCheckpointThreshold: 2 }
  );

  assert.equal(gate.needsHuman, false);
  assert.equal(gate.metrics.blockedCheckpoints, 1);
  assert.equal(gate.metrics.blockedCheckpointsTotal, 6);
  assert.equal(gate.metrics.blockedCheckpointsExcluded, 5);
  assert.equal(gate.reasons.some((item) => /blocked checkpoints/i.test(item)), false);
});

test('dispatch runtime registry lists the local dry-run runtime', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  const all = runtimes.listDispatchRuntimes();
  const runtime = runtimes.getDispatchRuntime('local-dry-run');

  assert.equal(all.some((item) => item.id === 'local-dry-run'), true);
  assert.equal(runtime.id, 'local-dry-run');
  assert.equal(runtime.manifestVersion, 1);
  assert.equal(runtime.requiresModel, false);
  assert.deepEqual(runtime.executionModes, ['dry-run']);
});

test('dispatch runtime registry selects local dry-run for dry-run execution', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  assert.equal(runtimes.selectDispatchRuntime({ executionMode: 'dry-run' }), 'local-dry-run');
});

test('dispatch runtime registry selects the subagent runtime for live execution', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  assert.equal(runtimes.selectDispatchRuntime({ executionMode: 'live' }), 'subagent-runtime');
});

test('dispatch runtime registry rejects unknown runtime ids and unsupported modes', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  assert.throws(() => runtimes.getDispatchRuntime('missing-runtime'), /Unknown dispatch runtime/i);
  assert.throws(() => runtimes.selectDispatchRuntime({ executionMode: 'none' }), /No dispatch runtime available/i);
});

test('dispatch runtime registry blocks live subagent execution until explicitly opted in', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  const registry = runtimes.createDispatchRuntimeRegistry({ executeDryRunPlan: () => ({ mode: 'dry-run', ok: true, jobRuns: [] }) });
  const runtime = runtimes.resolveDispatchRuntime({ runtimeId: 'subagent-runtime', executionMode: 'live' }, registry);

  assert.equal(runtime.requiresModel, true);
  assert.equal(runtime.manifestVersion, 1);

  const result = await runtime.execute({ plan: { phases: [] }, dispatchPlan: { jobs: [] }, dispatchPolicy: null, env: {} });
  assert.equal(result.mode, 'live');
  assert.equal(result.ok, false);
  assert.equal(Array.isArray(result.jobRuns), true);
  assert.match(String(result.error || ''), /AIOS_EXECUTE_LIVE/i);
});

test('dispatch runtime registry rejects unsupported subagent client in live mode', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  const registry = runtimes.createDispatchRuntimeRegistry({ executeDryRunPlan: () => ({ mode: 'dry-run', ok: true, jobRuns: [] }) });
  const runtime = runtimes.resolveDispatchRuntime({ runtimeId: 'subagent-runtime', executionMode: 'live' }, registry);

  const plan = buildOrchestrationPlan({ blueprint: 'feature', taskTitle: 'Reject unsupported client' });
  const dispatchPlan = buildLocalDispatchPlan(plan);

  const result = await runtime.execute({
    plan,
    dispatchPlan,
    dispatchPolicy: null,
    env: {
      AIOS_EXECUTE_LIVE: '1',
      AIOS_SUBAGENT_CLIENT: 'unsupported-cli',
    },
  });

  assert.equal(result.mode, 'live');
  assert.equal(result.ok, false);
  assert.equal(Array.isArray(result.jobRuns), true);
  assert.match(String(result.error || ''), /Unsupported AIOS_SUBAGENT_CLIENT/i);
  assert.match(String(result.error || ''), /codex-cli, claude-code, gemini-cli, opencode-cli/i);
  assert.match(String(result.error || ''), /grok-build/i);
});

test('dispatch runtime registry can simulate the subagent runtime when explicitly enabled', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  const registry = runtimes.createDispatchRuntimeRegistry({ executeDryRunPlan: () => ({ mode: 'dry-run', ok: true, jobRuns: [] }) });
  const runtime = runtimes.resolveDispatchRuntime({ runtimeId: 'subagent-runtime', executionMode: 'live' }, registry);

  const plan = buildOrchestrationPlan({ blueprint: 'feature', taskTitle: 'Simulate subagent runtime' });
  const dispatchPlan = buildLocalDispatchPlan(plan);

  const result = await runtime.execute({
    plan,
    dispatchPlan,
    dispatchPolicy: null,
    env: {
      AIOS_EXECUTE_LIVE: '1',
      AIOS_SUBAGENT_SIMULATE: '1',
    },
  });

  assert.equal(result.mode, 'live');
  assert.equal(result.ok, true);
  assert.equal(result.jobRuns.length > 0, true);
  assert.equal(result.executorRegistry.length > 0, true);
});

test('dispatch runtime registry can execute the subagent runtime with a configured client', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  const fakeBin = await createFakeCodexCommand(null, {
    usageLog: 'inputTokens=100 outputTokens=40 totalTokens=140 usd=0.2',
  });
  const registry = runtimes.createDispatchRuntimeRegistry({ executeDryRunPlan: () => ({ mode: 'dry-run', ok: true, jobRuns: [] }) });
  const runtime = runtimes.resolveDispatchRuntime({ runtimeId: 'subagent-runtime', executionMode: 'live' }, registry);

  const plan = buildOrchestrationPlan({ blueprint: 'feature', taskTitle: 'Execute subagent runtime' });
  const dispatchPlan = buildLocalDispatchPlan(plan);

  const result = await runtime.execute({
    plan,
    dispatchPlan,
    dispatchPolicy: null,
    env: {
      ...process.env,
      AIOS_EXECUTE_LIVE: '1',
      AIOS_SUBAGENT_CLIENT: 'codex-cli',
      AIOS_SUBAGENT_CONCURRENCY: '2',
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
    },
    io: { log() {} },
  });

  assert.equal(result.mode, 'live');
  assert.equal(result.ok, true);
  assert.equal(result.runtime?.id, 'subagent-runtime');
  assert.equal(result.jobRuns.length > plan.phases.length, true);
  assert.equal(result.jobRuns.every((jobRun) => jobRun.status !== 'blocked'), true);
  assert.equal(result.finalOutputs.length > 0, true);
  assert.equal((result.cost?.inputTokens || 0) > 0, true);
  assert.equal((result.cost?.outputTokens || 0) > 0, true);
  assert.equal((result.cost?.totalTokens || 0) > 0, true);
  assert.equal((result.cost?.usd || 0) > 0, true);
});

test('dispatch runtime registry disables Codex MCP startup for child workers by default', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  const captureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-orchestrator-codex-args-'));
  const captureArgsPath = path.join(captureDir, 'argv.jsonl');
  const fakeBin = await createFakeCodexCommand(null, {
    captureArgsPath,
  });
  const registry = runtimes.createDispatchRuntimeRegistry({ executeDryRunPlan: () => ({ mode: 'dry-run', ok: true, jobRuns: [] }) });
  const runtime = runtimes.resolveDispatchRuntime({ runtimeId: 'subagent-runtime', executionMode: 'live' }, registry);

  const plan = buildOrchestrationPlan({ blueprint: 'feature', taskTitle: 'Disable Codex MCP startup' });
  const dispatchPlan = buildLocalDispatchPlan(plan);

  const result = await runtime.execute({
    plan,
    dispatchPlan,
    dispatchPolicy: null,
    env: {
      ...process.env,
      AIOS_EXECUTE_LIVE: '1',
      AIOS_SUBAGENT_CLIENT: 'codex-cli',
      AIOS_SUBAGENT_CONCURRENCY: '1',
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
    },
    io: { log() {} },
  });

  assert.equal(result.ok, true);
  const argRows = (await fs.readFile(captureArgsPath, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(argRows.length > 0, true);
  for (const args of argRows) {
    assert.equal(args[0], 'exec');
    assert.equal(args.includes('-c'), true);
    assert.equal(args.includes('mcp_servers={}'), true);
    assert.equal(args.includes('features.rmcp_client=false'), true);
  }
});

test('dispatch runtime registry makes Codex child workers unattended by default', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  const captureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-orchestrator-codex-unattended-'));
  const captureArgsPath = path.join(captureDir, 'argv.jsonl');
  const fakeBin = await createFakeCodexCommand(null, {
    captureArgsPath,
  });
  const registry = runtimes.createDispatchRuntimeRegistry({ executeDryRunPlan: () => ({ mode: 'dry-run', ok: true, jobRuns: [] }) });
  const runtime = runtimes.resolveDispatchRuntime({ runtimeId: 'subagent-runtime', executionMode: 'live' }, registry);

  const plan = buildOrchestrationPlan({ blueprint: 'feature', taskTitle: 'Run Codex child workers unattended' });
  const dispatchPlan = buildLocalDispatchPlan(plan);

  const result = await runtime.execute({
    plan,
    dispatchPlan,
    dispatchPolicy: null,
    env: {
      ...process.env,
      AIOS_EXECUTE_LIVE: '1',
      AIOS_SUBAGENT_CLIENT: 'codex-cli',
      AIOS_SUBAGENT_CONCURRENCY: '1',
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
    },
    io: { log() {} },
  });

  assert.equal(result.ok, true);
  const argRows = (await fs.readFile(captureArgsPath, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(argRows.length > 0, true);
  for (const args of argRows) {
    assert.equal(args[0], 'exec');
    const unattendedIndex = args.indexOf('--dangerously-bypass-approvals-and-sandbox');
    const firstConfigIndex = args.indexOf('-c');
    assert.notEqual(unattendedIndex, -1);
    assert.equal(unattendedIndex < firstConfigIndex, true);
  }
});

test('subagent runtime captures pre-mutation snapshots with schema-checked manifest when opted in', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  const rootDir = await makeRootDir();
  await fs.mkdir(path.join(rootDir, 'scripts'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'scripts', 'pre-mutation.txt'), 'before\n', 'utf8');

  const fakeBin = await createFakeCodexCommand({
    status: 'completed',
    fromRole: 'implementer',
    toRole: 'next-phase',
    taskTitle: 'Scoped edit',
    contextSummary: 'No-op execution with snapshot enabled',
    findings: [],
    filesTouched: [],
    openQuestions: [],
    recommendations: [],
  });

  const registry = runtimes.createDispatchRuntimeRegistry({
    executeDryRunPlan: () => ({ mode: 'dry-run', ok: true, jobRuns: [] }),
  });
  const runtime = runtimes.resolveDispatchRuntime({ runtimeId: 'subagent-runtime', executionMode: 'live' }, registry);

  const plan = {
    blueprint: 'feature',
    description: 'pre-mutation snapshot path',
    taskTitle: 'Snapshot test',
    contextSummary: '',
    phases: [
      {
        step: 1,
        id: 'implement',
        role: 'implementer',
        mode: 'sequential',
        group: null,
        label: 'Implementer',
        responsibility: 'Update scripts',
        ownership: 'Production code',
        canEditFiles: true,
        ownedPathPrefixes: ['scripts/'],
      },
    ],
  };
  const dispatchPlan = buildLocalDispatchPlan(plan);

  const result = await runtime.execute({
    plan,
    dispatchPlan,
    dispatchPolicy: null,
    rootDir,
    env: {
      ...process.env,
      AIOS_EXECUTE_LIVE: '1',
      AIOS_SUBAGENT_CLIENT: 'codex-cli',
      AIOS_SUBAGENT_PRE_MUTATION_SNAPSHOT: '1',
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
    },
    io: { log() {} },
  });

  assert.equal(result.ok, true);
  const implementRun = result.jobRuns.find((jobRun) => jobRun.jobId === 'phase.implement');
  assert.ok(implementRun, 'expected implement job run');
  assert.equal(implementRun.status, 'completed');
  assert.equal(Boolean(implementRun.preMutationSnapshot), true);
  const snapshot = implementRun.preMutationSnapshot;
  assert.equal(snapshot.enabled, true);
  assert.equal(Number(snapshot.targetCount) > 0, true);
  assert.match(String(snapshot.manifestPath || ''), /\.json$/);
  assert.match(String(snapshot.backupPath || ''), /pre-mutation-/);

  const manifestPath = path.join(rootDir, snapshot.manifestPath);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  assert.equal(snapshot.targetCount, manifest.targets.length);
  assertSnapshotManifestShape(manifest, {
    expectedSessionId: '',
    expectedJobId: 'phase.implement',
    expectedPhaseId: 'implement',
    expectedRole: 'implementer',
    expectedPathPrefix: 'scripts/',
    expectedManifestPath: snapshot.manifestPath,
    expectedBackupPath: snapshot.backupPath,
  });

  for (const target of manifest.targets) {
    if (target.existed !== true) continue;
    const backupTargetPath = path.join(rootDir, snapshot.backupPath, target.path);
    const details = await fs.lstat(backupTargetPath);
    if (target.type === 'dir') {
      assert.equal(details.isDirectory(), true);
    } else {
      assert.equal(details.isDirectory(), false);
    }
  }

  const backupFilePath = path.join(rootDir, snapshot.backupPath, 'scripts', 'pre-mutation.txt');
  assert.equal(await fs.readFile(backupFilePath, 'utf8'), 'before\n');
});

test('dispatch runtime registry retries codex execution when output schema is rejected by backend', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  const captureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-orchestrator-codex-schema-fallback-'));
  const captureArgsPath = path.join(captureDir, 'argv.jsonl');
  const fakeBin = await createFakeCodexCommand(null, {
    usageLog: 'inputTokens=60 outputTokens=20 totalTokens=80 usd=0.08',
    failOnOutputSchema: true,
    captureArgsPath,
  });
  const registry = runtimes.createDispatchRuntimeRegistry({ executeDryRunPlan: () => ({ mode: 'dry-run', ok: true, jobRuns: [] }) });
  const runtime = runtimes.resolveDispatchRuntime({ runtimeId: 'subagent-runtime', executionMode: 'live' }, registry);

  const plan = buildOrchestrationPlan({ blueprint: 'feature', taskTitle: 'Retry schema fallback' });
  const dispatchPlan = buildLocalDispatchPlan(plan);

  const result = await runtime.execute({
    plan,
    dispatchPlan,
    dispatchPolicy: null,
    env: {
      ...process.env,
      AIOS_EXECUTE_LIVE: '1',
      AIOS_SUBAGENT_CLIENT: 'codex-cli',
      AIOS_SUBAGENT_CONCURRENCY: '1',
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
    },
    io: { log() {} },
  });

  assert.equal(result.mode, 'live');
  assert.equal(result.ok, true);
  assert.equal(result.runtime?.id, 'subagent-runtime');
  assert.equal(result.jobRuns.some((jobRun) => jobRun.status === 'blocked'), false);
  assert.equal((result.cost?.totalTokens || 0) > 0, true);
  assert.equal((result.cost?.usd || 0) > 0, true);

  const argRows = (await fs.readFile(captureArgsPath, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(argRows.length > 1, true);
  assert.equal(argRows.some((args) => args.includes('--output-schema')), true);
  assert.equal(argRows.some((args) => !args.includes('--output-schema')), true);
  for (const args of argRows) {
    assert.equal(args.includes('--dangerously-bypass-approvals-and-sandbox'), true);
  }
});

test('dispatch runtime registry accepts a valid codex handoff that arrives before process exit', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  const fakeBin = await createFakeCodexCommand(null, {
    usageLog: 'inputTokens=30 outputTokens=10 totalTokens=40 usd=0.04',
    hangAfterOutput: true,
  });
  const registry = runtimes.createDispatchRuntimeRegistry({ executeDryRunPlan: () => ({ mode: 'dry-run', ok: true, jobRuns: [] }) });
  const runtime = runtimes.resolveDispatchRuntime({ runtimeId: 'subagent-runtime', executionMode: 'live' }, registry);

  const plan = buildOrchestrationPlan({ blueprint: 'feature', taskTitle: 'Accept early handoff output' });
  const dispatchPlan = buildLocalDispatchPlan(plan);

  const result = await runtime.execute({
    plan,
    dispatchPlan,
    dispatchPolicy: null,
    env: {
      ...process.env,
      AIOS_EXECUTE_LIVE: '1',
      AIOS_SUBAGENT_CLIENT: 'codex-cli',
      AIOS_SUBAGENT_CONCURRENCY: '1',
      AIOS_SUBAGENT_TIMEOUT_MS: '2500',
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
    },
    io: { log() {} },
  });

  assert.equal(result.mode, 'live');
  assert.equal(result.ok, true);
  assert.equal(result.runtime?.id, 'subagent-runtime');
  assert.equal(result.jobRuns.some((jobRun) => jobRun.status === 'blocked'), false);
  assert.equal((result.cost?.totalTokens || 0) > 0, true);
  assert.equal((result.cost?.usd || 0) > 0, true);
});

test('dispatch runtime registry retries codex upstream errors with backoff before succeeding', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  const fakeBin = await createFakeCodexCommand(null, {
    usageLog: 'inputTokens=70 outputTokens=15 totalTokens=85 usd=0.09',
    upstreamFailAttempts: 1,
  });
  const registry = runtimes.createDispatchRuntimeRegistry({ executeDryRunPlan: () => ({ mode: 'dry-run', ok: true, jobRuns: [] }) });
  const runtime = runtimes.resolveDispatchRuntime({ runtimeId: 'subagent-runtime', executionMode: 'live' }, registry);

  const plan = buildOrchestrationPlan({ blueprint: 'feature', taskTitle: 'Retry upstream error' });
  const dispatchPlan = buildLocalDispatchPlan(plan);
  const logs = [];

  const result = await runtime.execute({
    plan,
    dispatchPlan,
    dispatchPolicy: null,
    env: {
      ...process.env,
      AIOS_EXECUTE_LIVE: '1',
      AIOS_SUBAGENT_CLIENT: 'codex-cli',
      AIOS_SUBAGENT_CONCURRENCY: '1',
      AIOS_SUBAGENT_UPSTREAM_MAX_ATTEMPTS: '2',
      AIOS_SUBAGENT_UPSTREAM_BACKOFF_MS: '1',
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
    },
    io: { log: (line) => logs.push(String(line)) },
  });

  assert.equal(result.mode, 'live');
  assert.equal(result.ok, true);
  assert.equal(result.runtime?.id, 'subagent-runtime');
  assert.equal(result.jobRuns.some((jobRun) => jobRun.status === 'blocked'), false);
  assert.equal((result.cost?.totalTokens || 0) > 0, true);
  assert.equal((result.cost?.usd || 0) > 0, true);
  assert.equal(logs.some((line) => line.includes('codex upstream_error retry attempt')), true);
});

test('subagent runtime prompt tells implementer to return no-op handoffs instead of waiting on non-code work', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  const captureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-orchestrator-prompt-'));
  const capturePath = path.join(captureDir, 'stdin.log');
  const fakeBin = await createFakeCodexCommand(null, { captureInputPath: capturePath });
  const registry = runtimes.createDispatchRuntimeRegistry({ executeDryRunPlan: () => ({ mode: 'dry-run', ok: true, jobRuns: [] }) });
  const runtime = runtimes.resolveDispatchRuntime({ runtimeId: 'subagent-runtime', executionMode: 'live' }, registry);

  const plan = buildOrchestrationPlan({ blueprint: 'feature', taskTitle: 'Prompt guidance capture' });
  const dispatchPlan = buildLocalDispatchPlan(plan);

  const result = await runtime.execute({
    plan,
    dispatchPlan,
    dispatchPolicy: null,
    env: {
      ...process.env,
      AIOS_EXECUTE_LIVE: '1',
      AIOS_SUBAGENT_CLIENT: 'codex-cli',
      AIOS_SUBAGENT_CONCURRENCY: '1',
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
    },
    io: { log() {} },
  });

  assert.equal(result.ok, true);
  const captured = await fs.readFile(capturePath, 'utf8');
  assert.match(captured, /role: implementer/);
  assert.match(captured, /## Decomposed Work Items/);
  assert.match(captured, /wi\.1/);
  assert.match(captured, /If upstream handoffs do not clearly require code changes, return a no-op handoff instead of exploring indefinitely\./);
  assert.match(captured, /Do not run broad verification commands unless you actually changed owned files\./);
});

test('subagent runtime blocks file touches outside phase ownedPathPrefixes', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  const fakeBin = await createFakeCodexCommand({
    status: 'completed',
    fromRole: 'implementer',
    toRole: 'next-phase',
    taskTitle: 'Scoped edit',
    contextSummary: 'Attempted edit',
    findings: [],
    filesTouched: ['AGENTS.md'],
    openQuestions: [],
    recommendations: [],
  });

  const registry = runtimes.createDispatchRuntimeRegistry({
    executeDryRunPlan: () => ({ mode: 'dry-run', ok: true, jobRuns: [] }),
  });
  const runtime = runtimes.resolveDispatchRuntime({ runtimeId: 'subagent-runtime', executionMode: 'live' }, registry);

  const plan = {
    blueprint: 'feature',
    description: 'file policy test',
    taskTitle: 'Ownership hardening',
    contextSummary: '',
    phases: [
      {
        step: 1,
        id: 'implement',
        role: 'implementer',
        mode: 'sequential',
        group: null,
        label: 'Implementer',
        responsibility: 'Implement scoped change',
        ownership: 'Production code',
        canEditFiles: true,
        ownedPathPrefixes: ['scripts/'],
      },
    ],
  };
  const dispatchPlan = buildLocalDispatchPlan(plan);

  const result = await runtime.execute({
    plan,
    dispatchPlan,
    dispatchPolicy: null,
    env: {
      ...process.env,
      AIOS_EXECUTE_LIVE: '1',
      AIOS_SUBAGENT_CLIENT: 'codex-cli',
      AIOS_SUBAGENT_CONCURRENCY: '1',
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
    },
    io: { log() {} },
  });

  assert.equal(result.ok, false);
  const implementRun = result.jobRuns.find((jobRun) => jobRun.jobId === 'phase.implement');
  assert.ok(implementRun, 'expected implement job run');
  assert.equal(implementRun.status, 'blocked');
  assert.match(String(implementRun.output?.error || ''), /File policy violation/i);
});

test('subagent runtime honors work-item ownedPathHints for file policy', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  const fakeBin = await createFakeCodexCommand({
    status: 'completed',
    fromRole: 'implementer',
    toRole: 'next-phase',
    taskTitle: 'Scoped edit',
    contextSummary: 'Applied scoped update',
    findings: [],
    filesTouched: ['scripts/ok.txt'],
    openQuestions: [],
    recommendations: [],
  });

  const registry = runtimes.createDispatchRuntimeRegistry({
    executeDryRunPlan: () => ({ mode: 'dry-run', ok: true, jobRuns: [] }),
  });
  const runtime = runtimes.resolveDispatchRuntime({ runtimeId: 'subagent-runtime', executionMode: 'live' }, registry);

  const plan = {
    blueprint: 'feature',
    description: 'work-item ownership hints',
    taskTitle: 'Ownership from work item',
    contextSummary: '',
    workItems: [
      {
        itemId: 'wi.1',
        title: 'Update scripts',
        summary: 'Update scripts/ok.txt',
        type: 'general',
        source: 'planner-context',
        status: 'queued',
        dependsOn: [],
        ownedPathHints: ['scripts/'],
      },
    ],
    phases: [
      {
        step: 1,
        id: 'implement',
        role: 'implementer',
        mode: 'sequential',
        group: null,
        label: 'Implementer',
        responsibility: 'Implement scoped change',
        ownership: 'Production code',
        canEditFiles: true,
        ownedPathPrefixes: [],
      },
    ],
  };
  const dispatchPlan = buildLocalDispatchPlan(plan);

  const result = await runtime.execute({
    plan,
    dispatchPlan,
    dispatchPolicy: null,
    env: {
      ...process.env,
      AIOS_EXECUTE_LIVE: '1',
      AIOS_SUBAGENT_CLIENT: 'codex-cli',
      AIOS_SUBAGENT_CONCURRENCY: '1',
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
    },
    io: { log() {} },
  });

  assert.equal(result.ok, true);
  const implementRun = result.jobRuns.find((jobRun) => jobRun.jobId.startsWith('phase.implement'));
  assert.ok(implementRun, 'expected implement job run');
  assert.equal(implementRun.status, 'completed');
});

test('subagent runtime auto-completes review/security when upstream handoffs touched no files', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  const fakeBin = await createFakeCodexCommand({
    status: 'completed',
    fromRole: 'implementer',
    toRole: 'next-phase',
    taskTitle: 'No-op implementation',
    contextSummary: 'No files changed',
    findings: [],
    filesTouched: [],
    openQuestions: [],
    recommendations: [],
  });

  const registry = runtimes.createDispatchRuntimeRegistry({
    executeDryRunPlan: () => ({ mode: 'dry-run', ok: true, jobRuns: [] }),
  });
  const runtime = runtimes.resolveDispatchRuntime({ runtimeId: 'subagent-runtime', executionMode: 'live' }, registry);

  const plan = {
    blueprint: 'feature',
    description: 'auto-complete review/security no-op path',
    taskTitle: 'No-op fast path',
    contextSummary: '',
    phases: [
      {
        step: 1,
        id: 'implement',
        role: 'implementer',
        mode: 'sequential',
        group: null,
        label: 'Implementer',
        responsibility: 'No-op implement',
        ownership: 'Production code',
        canEditFiles: true,
        ownedPathPrefixes: ['scripts/'],
      },
      {
        step: 2,
        id: 'review',
        role: 'reviewer',
        mode: 'sequential',
        group: null,
        label: 'Reviewer',
        responsibility: 'Review no-op handoff',
        ownership: 'Findings only',
        canEditFiles: false,
        ownedPathPrefixes: [],
      },
      {
        step: 3,
        id: 'security',
        role: 'security-reviewer',
        mode: 'sequential',
        group: null,
        label: 'Security Reviewer',
        responsibility: 'Security review no-op handoff',
        ownership: 'Security findings only',
        canEditFiles: false,
        ownedPathPrefixes: [],
      },
    ],
  };
  const dispatchPlan = buildLocalDispatchPlan(plan);

  const result = await runtime.execute({
    plan,
    dispatchPlan,
    dispatchPolicy: null,
    env: {
      ...process.env,
      AIOS_EXECUTE_LIVE: '1',
      AIOS_SUBAGENT_CLIENT: 'codex-cli',
      AIOS_SUBAGENT_CONCURRENCY: '1',
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
    },
    io: { log() {} },
  });

  assert.equal(result.ok, true);
  const attemptStatePath = path.join(fakeBin, 'codex-fake-attempt-count.txt');
  const attemptCount = Number.parseInt(await fs.readFile(attemptStatePath, 'utf8'), 10);
  assert.equal(attemptCount, 1);

  const reviewRun = result.jobRuns.find((jobRun) => jobRun.jobId === 'phase.review');
  const securityRun = result.jobRuns.find((jobRun) => jobRun.jobId === 'phase.security');
  assert.ok(reviewRun, 'expected review job run');
  assert.ok(securityRun, 'expected security job run');
  assert.equal(reviewRun.status, 'completed');
  assert.equal(securityRun.status, 'completed');
});

test('dispatch runtime registry keeps blocked workflow results as structured runtime output', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  const registry = runtimes.createDispatchRuntimeRegistry({
    executeDryRunPlan: () => ({
      mode: 'dry-run',
      ok: false,
      executorRegistry: [],
      executorDetails: [],
      jobRuns: [
        { jobId: 'merge.final-checks', status: 'blocked', output: { outputType: 'merged-handoff' } },
      ],
      finalOutputs: [],
    }),
  });
  const runtime = runtimes.resolveDispatchRuntime({ executionMode: 'dry-run' }, registry);
  const result = await runtime.execute({ plan: { phases: [] }, dispatchPlan: { jobs: [] }, dispatchPolicy: null });

  assert.equal(result.ok, false);
  assert.equal(result.runtime.id, 'local-dry-run');
  assert.equal(result.jobRuns[0].status, 'blocked');
});

test('dispatch runtime registry rejects invalid runtime output', async () => {
  const runtimes = await importDispatchRuntimes();
  assert.ok(runtimes, 'expected runtime registry module');

  const registry = runtimes.createDispatchRuntimeRegistry({
    executeDryRunPlan: () => ({ mode: 'dry-run', ok: true, jobRuns: null }),
  });
  const runtime = runtimes.resolveDispatchRuntime({ executionMode: 'dry-run' }, registry);

  await assert.rejects(
    () => runtime.execute({ plan: { phases: [] }, dispatchPlan: { jobs: [] }, dispatchPolicy: null }),
    /invalid jobRuns/i
  );
});

test('createLocalDispatchExecutorRegistry exposes executor metadata and resolution', () => {
  const registry = createLocalDispatchExecutorRegistry({
    executePhaseJob: () => ({ status: 'simulated', output: { outputType: 'handoff', payload: {} } }),
    executeMergeGateJob: () => ({ status: 'simulated', output: { outputType: 'merged-handoff', payload: {} } }),
  });

  const phaseExecutor = resolveLocalDispatchExecutor({
    jobType: 'phase',
    role: 'planner',
    launchSpec: { executor: 'local-phase' },
  }, registry);
  const mergeExecutor = resolveLocalDispatchExecutor({
    jobType: 'merge-gate',
    role: 'merge-gate',
    launchSpec: { executor: 'local-merge-gate' },
  }, registry);

  assert.equal(phaseExecutor.id, 'local-phase');
  assert.equal(phaseExecutor.requiresModel, false);
  assert.deepEqual(phaseExecutor.executionModes, ['dry-run']);
  assert.deepEqual(phaseExecutor.jobTypes, ['phase']);
  assert.deepEqual(phaseExecutor.supportedRoles, ['planner', 'implementer', 'reviewer', 'security-reviewer']);
  assert.equal(phaseExecutor.concurrencyMode, 'parallel-safe');

  assert.equal(mergeExecutor.id, 'local-merge-gate');
  assert.deepEqual(mergeExecutor.jobTypes, ['merge-gate']);
  assert.deepEqual(mergeExecutor.outputTypes, ['merged-handoff']);
  assert.equal(mergeExecutor.concurrencyMode, 'serial-only');
});

test('buildLocalDispatchPlan creates job dependencies and a merge gate for parallel groups', () => {
  const orchestration = buildOrchestrationPlan({
    blueprint: 'feature',
    taskTitle: 'Ship blueprints',
    contextSummary: '- implement core behavior\n- add tests',
  });
  const dispatch = buildLocalDispatchPlan(orchestration);

  assert.equal(dispatch.mode, 'local');
  assert.equal(dispatch.jobs.length, 6);
  assert.deepEqual(dispatch.jobs.map((job) => job.jobId), [
    'phase.plan',
    'phase.implement.wi.1',
    'phase.implement.wi.2',
    'phase.review',
    'phase.security',
    'merge.final-checks',
  ]);

  const planJob = dispatch.jobs.find((job) => job.jobId === 'phase.plan');
  const implementJob1 = dispatch.jobs.find((job) => job.jobId === 'phase.implement.wi.1');
  const implementJob2 = dispatch.jobs.find((job) => job.jobId === 'phase.implement.wi.2');
  const reviewJob = dispatch.jobs.find((job) => job.jobId === 'phase.review');
  const securityJob = dispatch.jobs.find((job) => job.jobId === 'phase.security');
  const mergeJob = dispatch.jobs.find((job) => job.jobId === 'merge.final-checks');

  assert.deepEqual(planJob?.dependsOn, []);
  assert.deepEqual(implementJob1?.dependsOn, ['phase.plan']);
  assert.deepEqual(implementJob2?.dependsOn, ['phase.plan']);
  assert.deepEqual(reviewJob?.dependsOn, ['phase.implement.wi.1', 'phase.implement.wi.2']);
  assert.deepEqual(securityJob?.dependsOn, ['phase.implement.wi.1', 'phase.implement.wi.2']);
  assert.deepEqual(mergeJob?.dependsOn, ['phase.review', 'phase.security']);
  assert.equal(mergeJob?.jobType, 'merge-gate');
  assert.equal(planJob?.launchSpec.requiresModel, true);
  assert.equal(planJob?.launchSpec.modelRouting?.taskType, 'planning');
  assert.equal(planJob?.launchSpec.modelRouting?.modelId, 'glm-5.1');
  assert.equal(planJob?.launchSpec.modelRouting?.clientId, 'claude-code');
  assert.equal(implementJob1?.launchSpec.requiresModel, true);
  assert.equal(implementJob1?.launchSpec.modelRouting?.taskType, 'implementation');
  assert.equal(implementJob1?.launchSpec.modelRouting?.modelId, 'deepseek-v4');
  assert.equal(reviewJob?.launchSpec.requiresModel, true);
  assert.equal(reviewJob?.launchSpec.modelRouting?.taskType, 'code-review');
  assert.equal(reviewJob?.launchSpec.modelRouting?.modelId, 'claude-opus');
  assert.equal(securityJob?.launchSpec.modelRouting?.taskType, 'security-review');
  assert.equal(mergeJob?.launchSpec.requiresModel, false);
  assert.equal(reviewJob?.launchSpec.executor, 'local-phase');
  assert.equal(Array.isArray(reviewJob?.launchSpec.workItemRefs), true);
  assert.equal((reviewJob?.launchSpec.workItemRefs || []).length >= 1, true);
  assert.equal(mergeJob?.launchSpec.executor, 'local-merge-gate');
  assert.equal(Array.isArray(implementJob1?.launchSpec.ownedPathPrefixes), true);
  assert.equal(implementJob1.launchSpec.ownedPathPrefixes.length > 0, true);
  assert.deepEqual(dispatch.executorRegistry, ['local-phase', 'local-merge-gate']);
  assert.equal(dispatch.executorDetails[0]?.requiresModel, false);
  assert.deepEqual(dispatch.executorDetails[0]?.jobTypes, ['phase']);
  assert.deepEqual(dispatch.executorDetails[1]?.jobTypes, ['merge-gate']);
  assert.equal(Array.isArray(dispatch.workItems), true);
  assert.equal(dispatch.workItems.length, 2);
  assert.equal(dispatch.workItemQueue.enabled, true);
  assert.equal(dispatch.workItemQueue.maxParallel, 2);
  assert.equal(dispatch.workItemQueue.entries.length, 2);
});

test('buildLocalDispatchPlan serializes grouped phases when policy requires serial-only', () => {
  const orchestration = buildOrchestrationPlan({
    blueprint: 'feature',
    taskTitle: 'Ship blueprints',
    dispatchPolicy: {
      status: 'blocked',
      parallelism: 'serial-only',
    },
  });
  const dispatch = buildLocalDispatchPlan(orchestration);

  assert.equal(dispatch.jobs.length, 4);
  assert.deepEqual(dispatch.jobs.map((job) => job.jobId), [
    'phase.plan',
    'phase.implement',
    'phase.review',
    'phase.security',
  ]);
  assert.deepEqual(dispatch.jobs.map((job) => job.dependsOn), [
    [],
    ['phase.plan'],
    ['phase.implement'],
    ['phase.review'],
  ]);
  assert.equal(dispatch.jobs.some((job) => job.jobType === 'merge-gate'), false);
  assert.match(dispatch.notes.join(' '), /serial-only/i);
});

test('buildExecutorCapabilityManifest declares read/write/network/browser/side-effect surfaces', () => {
  const orchestration = buildOrchestrationPlan({
    blueprint: 'feature',
    taskTitle: 'Ship blueprints',
    contextSummary: '- implement core behavior\n- add tests',
  });
  const dispatch = buildLocalDispatchPlan(orchestration);

  const dryRunManifest = buildExecutorCapabilityManifest({
    dispatchPlan: dispatch,
    executionMode: 'dry-run',
    runtimeId: 'local-dry-run',
  });
  assert.equal(dryRunManifest.executionMode, 'dry-run');
  assert.equal(dryRunManifest.runtimeId, 'local-dry-run');
  assert.equal(dryRunManifest.summary.read, 'yes');
  assert.equal(dryRunManifest.summary.write, 'no');
  assert.equal(dryRunManifest.summary.network, 'no');
  assert.equal(dryRunManifest.summary.browser, 'no');
  assert.equal(dryRunManifest.summary.sideEffect, 'no');

  const dryRunPhase = dryRunManifest.executors.find((item) => item.id === 'local-phase');
  assert.ok(dryRunPhase, 'expected local-phase capability row');
  assert.equal(dryRunPhase.capabilities.read, 'yes');
  assert.equal(dryRunPhase.capabilities.write, 'no');
  assert.equal(dryRunPhase.capabilities.network, 'no');
  assert.equal(dryRunPhase.capabilities.browser, 'no');
  assert.equal(dryRunPhase.capabilities.sideEffect, 'no');

  const liveManifest = buildExecutorCapabilityManifest({
    dispatchPlan: dispatch,
    executionMode: 'live',
    runtimeId: 'subagent-runtime',
  });
  assert.equal(liveManifest.executionMode, 'live');
  assert.equal(liveManifest.runtimeId, 'subagent-runtime');
  assert.equal(liveManifest.summary.read, 'yes');
  assert.equal(liveManifest.summary.write, 'yes');
  assert.equal(liveManifest.summary.network, 'unknown');
  assert.equal(liveManifest.summary.browser, 'unknown');
  assert.equal(liveManifest.summary.sideEffect, 'yes');

  const livePhase = liveManifest.executors.find((item) => item.id === 'local-phase');
  assert.ok(livePhase, 'expected local-phase capability row');
  assert.equal(livePhase.capabilities.read, 'yes');
  assert.equal(livePhase.capabilities.write, 'yes');
  assert.equal(livePhase.capabilities.network, 'unknown');
  assert.equal(livePhase.capabilities.browser, 'unknown');
  assert.equal(livePhase.capabilities.sideEffect, 'yes');
});

test('buildLocalDispatchPlan bounds implementer work-item queue parallelism by dependency window', () => {
  const orchestration = buildOrchestrationPlan({
    blueprint: 'feature',
    taskTitle: 'Queue bounded work items',
    contextSummary: '- item one\n- item two\n- item three\n- item four',
  });
  const dispatch = buildLocalDispatchPlan(orchestration);
  const implementJobs = dispatch.jobs.filter((job) => job.jobId.startsWith('phase.implement.'));

  assert.equal(implementJobs.length, 4);
  assert.deepEqual(implementJobs.map((job) => job.jobId), [
    'phase.implement.wi.1',
    'phase.implement.wi.2',
    'phase.implement.wi.3',
    'phase.implement.wi.4',
  ]);
  assert.deepEqual(implementJobs[0].dependsOn, ['phase.plan']);
  assert.deepEqual(implementJobs[1].dependsOn, ['phase.plan']);
  assert.deepEqual(implementJobs[2].dependsOn, ['phase.implement.wi.1']);
  assert.deepEqual(implementJobs[3].dependsOn, ['phase.implement.wi.2']);
  assert.equal(dispatch.workItemQueue.enabled, true);
  assert.equal(dispatch.workItemQueue.maxParallel, 2);
  assert.equal(dispatch.workItemQueue.entries.length, 4);
});

test('buildLocalDispatchPlan rejects editable parallel phases without explicit ownership scopes', () => {
  const orchestration = {
    blueprint: 'feature',
    description: 'test',
    taskTitle: 'Scoped parallel edits',
    contextSummary: '',
    phases: [
      {
        step: 1,
        id: 'implement-a',
        role: 'implementer',
        mode: 'parallel',
        group: 'impl',
        label: 'Implementer',
        responsibility: 'Implement chunk A',
        ownership: 'Production code',
        canEditFiles: true,
        ownedPathPrefixes: [],
      },
      {
        step: 2,
        id: 'implement-b',
        role: 'implementer',
        mode: 'parallel',
        group: 'impl',
        label: 'Implementer',
        responsibility: 'Implement chunk B',
        ownership: 'Production code',
        canEditFiles: true,
        ownedPathPrefixes: ['scripts/'],
      },
    ],
  };

  assert.throws(
    () => buildLocalDispatchPlan(orchestration),
    /requires explicit ownedPathPrefixes/i
  );
});

test('executeLocalDispatchPlan simulates phase jobs and merge-gate outputs', () => {
  const orchestration = buildOrchestrationPlan({ blueprint: 'feature', taskTitle: 'Ship blueprints' });
  const dispatch = buildLocalDispatchPlan(orchestration);
  const run = executeLocalDispatchPlan(orchestration, dispatch);

  assert.equal(run.mode, 'dry-run');
  assert.equal(run.runtime?.id, 'local-dry-run');
  assert.equal(run.runtime?.executionMode, 'dry-run');
  assert.equal(run.ok, true);
  assert.equal(run.jobRuns.length, 5);
  assert.equal(run.jobRuns.every((jobRun) => jobRun.status === 'simulated'), true);
  assert.deepEqual(run.executorRegistry, ['local-phase', 'local-merge-gate']);
  assert.equal(run.executorDetails[0]?.label, 'Local Phase Executor');
  assert.equal(run.executorDetails[1]?.label, 'Local Merge Gate Executor');

  const reviewRun = run.jobRuns.find((jobRun) => jobRun.jobId === 'phase.review');
  const mergeRun = run.jobRuns.find((jobRun) => jobRun.jobId === 'merge.final-checks');

  assert.equal(reviewRun?.executor, 'local-phase');
  assert.equal(reviewRun?.output.outputType, 'handoff');
  assert.equal(reviewRun?.output.payload.toRole, 'merge-gate');
  assert.equal(mergeRun?.executor, 'local-merge-gate');
  assert.equal(mergeRun?.output.outputType, 'merged-handoff');
  assert.equal(mergeRun?.output.mergeResult.ok, true);
  assert.equal(mergeRun?.output.payload.status, 'completed');
});

test('mergeParallelHandoffs blocks conflicting file ownership', () => {
  const result = mergeParallelHandoffs([
    {
      fromRole: 'reviewer',
      toRole: 'merge-gate',
      taskTitle: 'Review auth flow',
      contextSummary: 'Quality findings',
      filesTouched: ['src/auth.ts'],
    },
    {
      fromRole: 'security-reviewer',
      toRole: 'merge-gate',
      taskTitle: 'Review auth flow',
      contextSummary: 'Security findings',
      filesTouched: ['src/auth.ts'],
    },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].filePath, 'src/auth.ts');
});

test('mergeParallelHandoffs blocks blocked statuses', () => {
  const result = mergeParallelHandoffs([
    {
      fromRole: 'reviewer',
      toRole: 'merge-gate',
      taskTitle: 'Review auth flow',
      contextSummary: 'Needs clarification',
      status: 'needs-input',
    },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.blocked.length, 1);
});

test('mergeParallelHandoffs blocks file touches from read-only roles', () => {
  const result = mergeParallelHandoffs([
    {
      fromRole: 'reviewer',
      toRole: 'merge-gate',
      taskTitle: 'Review auth flow',
      contextSummary: 'Quality findings',
      filesTouched: ['src/new-file.ts'],
    },
  ]);

  assert.equal(result.ok, false);
  assert.equal(Array.isArray(result.ownershipViolations), true);
  assert.equal(result.ownershipViolations.length, 1);
  assert.equal(result.ownershipViolations[0].filePath, 'src/new-file.ts');
});

test('executeMergeGateJob includes actionable blocked details', () => {
  const run = executeMergeGateJob(
    { taskTitle: 'Review auth flow' },
    {
      jobId: 'merge.final-checks',
      jobType: 'merge-gate',
      role: 'merge-gate',
      group: 'final-checks',
      dependsOn: ['phase.review', 'phase.security'],
      launchSpec: { executor: 'local-merge-gate', outputType: 'merged-handoff' },
    },
    [
      {
        jobId: 'phase.review',
        output: {
          payload: {
            fromRole: 'reviewer',
            toRole: 'merge-gate',
            taskTitle: 'Review auth flow',
            contextSummary: 'Reviewer needs branch confirmation.',
            status: 'needs-input',
            openQuestions: ['Which branch should be reviewed?'],
            filesTouched: ['src/auth.ts'],
          },
        },
      },
      {
        jobId: 'phase.security',
        output: {
          payload: {
            fromRole: 'security-reviewer',
            toRole: 'merge-gate',
            taskTitle: 'Review auth flow',
            contextSummary: 'Security review touched the same file.',
            status: 'completed',
            filesTouched: ['src/auth.ts'],
          },
        },
      },
    ],
    { executorLabel: 'Local Merge Gate Executor' }
  );

  assert.equal(run.status, 'blocked');
  assert.equal(run.output.mergeResult.blocked.length, 1);
  assert.equal(run.output.mergeResult.ownershipViolations.length, 2);
  assert.equal(run.output.mergeResult.conflicts.length, 1);
  assert.match(run.output.mergeResult.question, /resolve/i);
  assert.match(run.output.mergeResult.nextAction, /phase\.review/i);
});

test('planOrchestrate emits stable preview', () => {
  const plan = planOrchestrate({ blueprint: 'security', taskTitle: 'Audit login flow', format: 'json' });
  assert.match(plan.preview, /orchestrate security --task/);
  assert.match(plan.preview, /--format json/);
});

test('planOrchestrate includes learn-eval overlay flags in preview', () => {
  const plan = planOrchestrate({ sessionId: 'security-stable', limit: 5, recommendationId: 'blueprint.security' });
  assert.match(plan.preview, /orchestrate --session security-stable --limit 5 --recommendation blueprint\.security/);
});

test('planOrchestrate includes local dispatch mode in preview', () => {
  const plan = planOrchestrate({ sessionId: 'security-stable', dispatchMode: 'local' });
  assert.match(plan.preview, /--dispatch local/);
});

test('planOrchestrate includes dry-run execute mode in preview', () => {
  const plan = planOrchestrate({ sessionId: 'security-stable', dispatchMode: 'local', executionMode: 'dry-run' });
  assert.match(plan.preview, /--execute dry-run/);
});

test('planOrchestrate includes live execute mode in preview', () => {
  const plan = planOrchestrate({ sessionId: 'security-stable', dispatchMode: 'local', executionMode: 'live' });
  assert.match(plan.preview, /--execute live/);
});


test('runOrchestrate preflight auto reports ready plan and ownership evidence', async () => {
  const rootDir = await makeRootDir();
  const planPath = await writePlanFile(rootDir);
  await writeSession(rootDir, 'preflight-readiness-ready', {
    updatedAt: '2026-04-25T02:00:00.000Z',
    goal: 'Update scripts/ctx-agent-core.mjs safely',
  });

  const logs = [];
  const result = await runOrchestrate(
    {
      sessionId: 'preflight-readiness-ready',
      dispatchMode: 'local',
      executionMode: 'dry-run',
      preflightMode: 'auto',
      planPath,
      contextSummary: '- Update scripts/ctx-agent-core.mjs safely',
      format: 'json',
    },
    {
      rootDir,
      io: { log: (line) => logs.push(line) },
      preflightAdapters: {
        releaseStatus: async () => ({ ok: true, exitCode: 0, health: { metrics: { samples: 1 }, reasons: [] } }),
      },
    }
  );
  const report = JSON.parse(logs.join('\n'));

  assert.equal(result.exitCode, 0);
  assert.equal(report.readiness.verdict, 'ready');
  assert.deepEqual(report.readiness.blockedReasons, []);
  assert.equal(report.readiness.evidence.some((item) => item.type === 'file' && item.path === planPath), true);
  assert.equal(report.readiness.evidence.some((item) => /phase\.implement/.test(item.summary)), true);
});

test('runOrchestrate preflight auto reports blockers during dry-run without throwing', async () => {
  const rootDir = await makeRootDir();
  await writeSession(rootDir, 'preflight-readiness-blocked', {
    updatedAt: '2026-04-25T02:05:00.000Z',
    goal: 'Implement unscoped risky change',
  });

  const logs = [];
  const result = await runOrchestrate(
    {
      sessionId: 'preflight-readiness-blocked',
      dispatchMode: 'local',
      executionMode: 'dry-run',
      preflightMode: 'auto',
      planPath: 'docs/plans/missing.md',
      format: 'json',
    },
    {
      rootDir,
      io: { log: (line) => logs.push(line) },
      preflightAdapters: {
        releaseStatus: async () => ({ ok: true, exitCode: 0, health: { metrics: { samples: 1 }, reasons: [] } }),
      },
    }
  );
  const report = JSON.parse(logs.join('\n'));

  assert.equal(result.exitCode, 0);
  assert.equal(report.readiness.verdict, 'blocked');
  assert.equal(report.readiness.blockedReasons.includes('missing_plan_artifact'), true);
  assert.equal(report.readiness.evidence.some((item) => item.type === 'ownership'), true);
  assert.equal(report.dispatchRun.mode, 'dry-run');
});

test('runOrchestrate preflight auto blocks live execution when readiness is blocked', async () => {
  const rootDir = await makeRootDir();
  await writeSession(rootDir, 'preflight-readiness-live-blocked', {
    updatedAt: '2026-04-25T02:10:00.000Z',
    goal: 'Implement live risky change',
  });

  const logs = [];
  const result = await runOrchestrate(
    {
      sessionId: 'preflight-readiness-live-blocked',
      dispatchMode: 'local',
      executionMode: 'live',
      preflightMode: 'auto',
      planPath: 'docs/plans/missing.md',
      contextSummary: '- Update scripts/ctx-agent-core.mjs safely',
      format: 'json',
    },
    {
      rootDir,
      io: { log: (line) => logs.push(line) },
      preflightAdapters: {
        releaseStatus: async () => ({ ok: true, exitCode: 0, health: { metrics: { samples: 1 }, reasons: [] } }),
      },
    }
  );
  const report = JSON.parse(logs.join('\n'));

  assert.equal(result.exitCode, 1);
  assert.equal(report.kind, 'guardrail.preflight-readiness');
  assert.equal(report.readiness.verdict, 'blocked');
  assert.equal(report.readiness.blockedReasons.includes('missing_plan_artifact'), true);
});

test('runOrchestrate defaults to local dry-run execution when dispatch/execute are omitted', async () => {
  const rootDir = await makeRootDir();
  const logs = [];
  await runOrchestrate(
    { blueprint: 'feature', taskTitle: 'Default dry-run', format: 'json' },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.at(-1));

  assert.equal(report.dispatchPlan.mode, 'local');
  assert.equal(report.dispatchRun.mode, 'dry-run');
  assert.equal(report.dispatchRun.runtime?.id, 'local-dry-run');
  assert.equal(Array.isArray(report.workItems), true);
  assert.equal(report.workItems.length >= 1, true);
  assert.equal(report.dispatchEvidence.persisted, false);
  assert.equal(report.dispatchEvidence.reason, 'session-required');
});

test('runOrchestrate --retry-blocked replays blocked jobs with seeded dependencies', async () => {
  const rootDir = await makeRootDir();
  const fakeBin = await createFakeCodexCommand();
  await writeSession(
    rootDir,
    'retry-session',
    { updatedAt: '2026-03-09T04:30:00.000Z', goal: 'Retry blocked implement phase' },
    [
      {
        seq: 1,
        ts: '2026-03-09T04:00:00.000Z',
        status: 'running',
        summary: 'Initial dispatch run',
        nextActions: ['retry blocked implementer job'],
        artifacts: [],
        telemetry: {
          verification: { result: 'partial', evidence: 'dispatch runtime blocked' },
          retryCount: 0,
          elapsedMs: 1000,
        },
      },
    ]
  );

  const artifactRel = path.join(
    '.aios',
    'context-db',
    'sessions',
    'retry-session',
    'artifacts',
    'dispatch-run-20260309T040000Z.json'
  );
  const artifactAbs = path.join(rootDir, artifactRel);
  await fs.mkdir(path.dirname(artifactAbs), { recursive: true });
  await fs.writeFile(
    artifactAbs,
    `${JSON.stringify({
      schemaVersion: 1,
      kind: 'orchestration.dispatch-run',
      sessionId: 'retry-session',
      persistedAt: '2026-03-09T04:00:00.000Z',
      dispatchRun: {
        mode: 'live',
        ok: false,
        executorRegistry: ['subagent-runtime'],
        jobRuns: [
          {
            jobId: 'phase.plan',
            jobType: 'phase',
            role: 'planner',
            status: 'completed',
            output: {
              outputType: 'handoff',
              payload: {
                schemaVersion: 1,
                status: 'completed',
                fromRole: 'planner',
                toRole: 'next-phase',
                taskTitle: 'Retry blocked implement phase',
                contextSummary: 'Seed planner output',
                findings: [],
                filesTouched: [],
                openQuestions: [],
                recommendations: [],
              },
            },
          },
          {
            jobId: 'phase.implement.wi.1',
            jobType: 'phase',
            role: 'implementer',
            dependsOn: ['phase.plan'],
            status: 'blocked',
            output: {
              outputType: 'handoff',
              error: 'timeout',
            },
          },
        ],
        finalOutputs: [{ jobId: 'phase.plan', outputType: 'handoff' }],
      },
    }, null, 2)}\n`,
    'utf8'
  );

  const logs = [];
  await runOrchestrate(
    {
      sessionId: 'retry-session',
      resumeSessionId: 'retry-session',
      retryBlocked: true,
      dispatchMode: 'local',
      executionMode: 'live',
      format: 'json',
    },
    {
      rootDir,
      io: { log: (line) => logs.push(line) },
      env: {
        ...process.env,
        AIOS_EXECUTE_LIVE: '1',
        AIOS_ALLOW_UNKNOWN_CAPABILITIES: '1',
        AIOS_SUBAGENT_CLIENT: 'codex-cli',
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
      },
    }
  );

  const report = JSON.parse(logs.at(-1));
  assert.equal(report.retryReplay.sessionId, 'retry-session');
  assert.equal(report.retryReplay.enabled, true);
  assert.equal(report.retryReplay.blockedJobIds.includes('phase.implement.wi.1'), true);
  assert.deepEqual(report.dispatchPlan.jobs.map((job) => job.jobId), ['phase.implement.wi.1']);
  assert.equal(report.dispatchPlan.seedJobRuns.some((jobRun) => jobRun.jobId === 'phase.plan'), true);
  assert.equal(report.dispatchRun.jobRuns.length, 1);
  assert.equal(report.dispatchRun.jobRuns[0].jobId, 'phase.implement.wi.1');
  assert.equal(report.dispatchRun.jobRuns[0].status, 'completed');
});


test('runOrchestrate live dispatch uses model-router per job and records dispatch events', async () => {
  const rootDir = await makeRootDir();
  const captureInputPath = path.join(rootDir, 'agent-prompts.log');
  const captureArgsPath = path.join(rootDir, 'agent-args.log');
  const fakeBin = await createFakeAgentCommands({ captureInputPath, captureArgsPath });
  await writeSession(
    rootDir,
    'model-route-session',
    { updatedAt: '2026-05-08T08:00:00.000Z', goal: 'Verify model-router team execution' },
    [
      {
        seq: 1,
        ts: '2026-05-08T08:00:00.000Z',
        status: 'done',
        summary: 'Ready to route.',
        nextActions: [],
        artifacts: [],
        telemetry: { verification: { result: 'passed', evidence: 'setup' }, retryCount: 0, elapsedMs: 10 },
      },
    ]
  );

  const logs = [];
  await runOrchestrate(
    {
      sessionId: 'model-route-session',
      blueprint: 'feature',
      contextSummary: '- implement routed worker\n- add routed tests',
      dispatchMode: 'local',
      executionMode: 'live',
      format: 'json',
    },
    {
      rootDir,
      io: { log: (line) => logs.push(line) },
      env: {
        ...process.env,
        AIOS_EXECUTE_LIVE: '1',
        AIOS_ALLOW_UNKNOWN_CAPABILITIES: '1',
        AIOS_SUBAGENT_CLIENT: 'codex-cli',
        AIOS_MODEL_ROUTER: '1',
        AIOS_MODEL_PLANNER: 'gemini-3-pro',
        AIOS_MODEL_IMPLEMENTER: 'gpt-5.5',
        AIOS_MODEL_REVIEWER: 'claude-opus',
        AIOS_MODEL_SECURITY_REVIEWER: 'claude-opus',
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
      },
    }
  );

  const report = JSON.parse(logs.at(-1));
  const planRun = report.dispatchRun.jobRuns.find((jobRun) => jobRun.role === 'planner');
  const implementRun = report.dispatchRun.jobRuns.find((jobRun) => jobRun.role === 'implementer');
  const reviewRun = report.dispatchRun.jobRuns.find((jobRun) => jobRun.role === 'reviewer');
  assert.equal(planRun?.modelRouting?.modelId, 'gemini-3-pro');
  assert.equal(planRun?.modelRouting?.clientId, 'gemini-cli');
  assert.equal(implementRun?.modelRouting?.modelId, 'gpt-5.5');
  assert.equal(implementRun?.modelRouting?.clientId, 'codex-cli');
  assert.equal(reviewRun?.modelRouting?.modelId, 'claude-opus');
  assert.equal(reviewRun?.modelRouting?.clientId, 'claude-code');

  const argsLog = await fs.readFile(captureArgsPath, 'utf8');
  assert.match(argsLog, /gemini \["-m","gemini-3-pro","--yolo","-p"/);
  assert.match(argsLog, /codex \["exec","--dangerously-bypass-approvals-and-sandbox",.*"-m","gpt-5\.5"/);
  assert.match(argsLog, /claude \["--model","claude-opus-4-7","--dangerously-skip-permissions","--print"/);

  const promptLog = await fs.readFile(captureInputPath, 'utf8');
  assert.match(promptLog, /## Model Router/);
  assert.match(promptLog, /modelId=gpt-5\.5/);
  assert.match(promptLog, /cliCommand=codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5\.5/);

  const sessionDirs = await fs.readdir(path.join(rootDir, '.aios', 'context-db', 'sessions'));
  const modelEvents = [];
  for (const sessionDir of sessionDirs) {
    const eventsPath = path.join(rootDir, '.aios', 'context-db', 'sessions', sessionDir, 'l2-events.jsonl');
    try {
      const lines = (await fs.readFile(eventsPath, 'utf8')).trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const event = JSON.parse(line);
        if (event.kind === 'model.dispatch') modelEvents.push(event);
      }
    } catch {
      // ignore sessions without event logs
    }
  }
  assert.equal(modelEvents.length >= 3, true);
  assert.equal(modelEvents.some((event) => event.turn?.environment === 'model-router'), true);
  assert.equal(modelEvents.some((event) => event.refs?.includes('gpt-5.5')), true);
});


test('runOrchestrate live dispatch honors AIOS_MODEL_ROUTER=0 while keeping metadata', async () => {
  const rootDir = await makeRootDir();
  const captureInputPath = path.join(rootDir, 'agent-prompts-disabled.log');
  const captureArgsPath = path.join(rootDir, 'agent-args-disabled.log');
  const fakeBin = await createFakeAgentCommands({ captureInputPath, captureArgsPath });
  await writeSession(
    rootDir,
    'model-route-disabled-session',
    { updatedAt: '2026-05-08T08:00:00.000Z', goal: 'Verify disabled model-router execution override' },
    [
      {
        seq: 1,
        ts: '2026-05-08T08:00:00.000Z',
        status: 'done',
        summary: 'Ready to route without overriding CLI.',
        nextActions: [],
        artifacts: [],
        telemetry: { verification: { result: 'passed', evidence: 'setup' }, retryCount: 0, elapsedMs: 10 },
      },
    ]
  );

  const logs = [];
  await runOrchestrate(
    {
      sessionId: 'model-route-disabled-session',
      blueprint: 'feature',
      contextSummary: '- implement routed worker',
      dispatchMode: 'local',
      executionMode: 'live',
      format: 'json',
    },
    {
      rootDir,
      io: { log: (line) => logs.push(line) },
      env: {
        ...process.env,
        AIOS_EXECUTE_LIVE: '1',
        AIOS_ALLOW_UNKNOWN_CAPABILITIES: '1',
        AIOS_SUBAGENT_CLIENT: 'codex-cli',
        AIOS_MODEL_ROUTER: '0',
        AIOS_MODEL_PLANNER: 'gemini-3-pro',
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
      },
    }
  );

  const report = JSON.parse(logs.at(-1));
  const planRun = report.dispatchRun.jobRuns.find((jobRun) => jobRun.role === 'planner');
  assert.equal(planRun?.modelRouting?.modelId, 'gemini-3-pro');
  assert.equal(planRun?.modelRouting?.clientId, 'gemini-cli');
  assert.equal(planRun?.routedClientId, undefined);

  const argsLog = await fs.readFile(captureArgsPath, 'utf8');
  assert.match(argsLog, /codex \["exec"/);
  assert.doesNotMatch(argsLog, /gemini \[/);
  assert.doesNotMatch(argsLog, /"-m","gemini-3-pro"/);

  const promptLog = await fs.readFile(captureInputPath, 'utf8');
  assert.match(promptLog, /## Model Router/);
  assert.match(promptLog, /modelId=gemini-3-pro/);
});

test('runOrchestrate refuses live --retry-blocked when dispatch hindsight is unstable', async () => {
  const rootDir = await makeRootDir();
  const fakeBin = await createFakeCodexCommand();
  const sessionId = 'retry-guardrail';
  await writeSession(
    rootDir,
    sessionId,
    { updatedAt: '2026-03-09T04:30:00.000Z', goal: 'Guardrail retry-blocked test' },
    [
      {
        seq: 1,
        ts: '2026-03-09T04:00:00.000Z',
        status: 'running',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 900,
        },
      },
    ]
  );

  await writeDispatchEvidence(rootDir, sessionId, {
    seq: 1,
    ts: '2026-03-09T04:06:00.000Z',
    ok: true,
    blockedJobs: 0,
    artifactName: 'dispatch-run-20260309T040600Z.json',
  });
  await writeDispatchEvidence(rootDir, sessionId, {
    seq: 2,
    ts: '2026-03-09T04:07:00.000Z',
    ok: false,
    blockedJobs: 1,
    artifactName: 'dispatch-run-20260309T040700Z.json',
  });

  const logs = [];
  const result = await runOrchestrate(
    {
      sessionId,
      resumeSessionId: sessionId,
      retryBlocked: true,
      dispatchMode: 'local',
      executionMode: 'live',
      format: 'json',
    },
    {
      rootDir,
      io: { log: (line) => logs.push(line) },
      env: {
        ...process.env,
        AIOS_SUBAGENT_CLIENT: 'codex-cli',
        AIOS_SUBAGENT_CONCURRENCY: '2',
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
      },
    }
  );

  assert.equal(result.exitCode, 1);
  const report = JSON.parse(logs.at(-1));
  assert.equal(report.kind, 'guardrail.retry-blocked');
  assert.equal(report.sessionId, sessionId);
  assert.equal(report.dispatchHindsight.regressions, 1);
  assert.match(report.message, /refusing live --retry-blocked/i);
  assert.ok(Array.isArray(report.suggestedCommands));
  assert.ok(report.suggestedCommands.some((cmd) => cmd.includes('learn-eval') && cmd.includes(sessionId)));
  assert.ok(report.suggestedCommands.some((cmd) => cmd.includes('orchestrate') && cmd.includes('--execute dry-run')));
  assert.ok(report.suggestedCommands.some((cmd) => cmd.includes('team') && cmd.includes('--retry-blocked') && cmd.includes('--dry-run')));
});

test('runOrchestrate resolves blueprint and context from learn-eval overlay', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'security-stable',
    { updatedAt: '2026-03-09T02:30:00.000Z', goal: 'Audit login flow hardening' },
    [
      {
        seq: 1,
        ts: '2026-03-09T02:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1200,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T02:05:00.000Z',
        status: 'done',
        summary: 'Checkpoint 2',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1400,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T02:10:00.000Z',
        status: 'done',
        summary: 'Checkpoint 3',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1600,
        },
      },
    ]
  );

  const logs = [];
  const result = await runOrchestrate(
    { sessionId: 'security-stable', format: 'json' },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.at(-1));

  assert.equal(result.exitCode, 0);
  assert.equal(report.blueprint, 'feature');
  assert.equal(report.taskTitle, 'Audit login flow hardening');
  assert.equal(report.learnEvalOverlay.sourceSessionId, 'security-stable');
  assert.equal(report.learnEvalOverlay.selectedRecommendationId, 'blueprint.feature');
  assert.equal(report.learnEvalOverlay.appliedRecommendationIds.includes('checklist.verification-standard'), true);
  assert.match(report.contextSummary, /learn-eval overlay/i);
});

test('runOrchestrate adds a local dispatch skeleton without invoking models', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'security-stable',
    { updatedAt: '2026-03-09T02:30:00.000Z', goal: 'Audit login flow hardening' },
    [
      {
        seq: 1,
        ts: '2026-03-09T02:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1200,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T02:05:00.000Z',
        status: 'done',
        summary: 'Checkpoint 2',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1400,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T02:10:00.000Z',
        status: 'done',
        summary: 'Checkpoint 3',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1600,
        },
      },
    ]
  );

  const logs = [];
  await runOrchestrate(
    { blueprint: 'security', sessionId: 'security-stable', dispatchMode: 'local', format: 'json' },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.at(-1));

  assert.equal(report.dispatchPlan.mode, 'local');
  assert.equal(report.dispatchPlan.readyForExecution, false);
  assert.equal(report.dispatchPlan.jobs.filter((job) => job.jobType === 'phase').every((job) => job.launchSpec.requiresModel === true), true);
  assert.equal(report.dispatchPlan.jobs.filter((job) => job.jobType === 'merge-gate').every((job) => job.launchSpec.requiresModel === false), true);
  assert.equal(report.dispatchPlan.jobs.find((job) => job.jobId === 'phase.plan')?.launchSpec.modelRouting?.taskType, 'planning');
  assert.equal(report.dispatchPlan.jobs.find((job) => job.jobId === 'phase.plan')?.launchSpec.modelRouting?.modelId, 'glm-5.1');
  assert.equal(report.dispatchPlan.jobs.find((job) => job.role === 'security-reviewer')?.launchSpec.modelRouting?.modelId, 'claude-opus');
  assert.equal(report.dispatchPlan.jobs.filter((job) => job.jobType === 'phase').every((job) => job.launchSpec.executor === 'local-phase'), true);
  assert.equal(report.dispatchPlan.jobs.filter((job) => job.jobType === 'merge-gate').every((job) => job.launchSpec.executor === 'local-merge-gate'), true);
  assert.deepEqual(report.dispatchPlan.executorRegistry, ['local-phase']);
  assert.equal(report.executorCapabilityManifest.executionMode, 'dry-run');
  assert.equal(report.executorCapabilityManifest.runtimeId, 'local-dry-run');
  assert.equal(report.executorCapabilityManifest.summary.read, 'yes');
  assert.equal(report.executorCapabilityManifest.summary.write, 'no');
  assert.equal(report.executorCapabilityManifest.summary.sideEffect, 'no');
});

test('runOrchestrate binds phaseExecutor override into dispatch planning and execution', async () => {
  const rootDir = await makeRootDir();
  const logs = [];
  await runOrchestrate(
    {
      blueprint: 'feature',
      taskTitle: 'Route policy executor',
      contextSummary: '- implement core behavior\n- add tests',
      dispatchMode: 'local',
      executionMode: 'dry-run',
      phaseExecutor: 'local-control',
      format: 'json',
    },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.at(-1));

  assert.equal(report.dispatchPlan.phaseExecutor.requested_executor, 'local-control');
  assert.equal(report.dispatchPlan.phaseExecutor.applied_executor, 'local-control');
  assert.equal(report.dispatchPlan.jobs.filter((job) => job.jobType === 'phase').every((job) => job.launchSpec.executor === 'local-control'), true);
  assert.equal(report.dispatchPlan.jobs.filter((job) => job.jobType === 'merge-gate').every((job) => job.launchSpec.executor === 'local-merge-gate'), true);
  assert.equal(report.dispatchRun.executorRegistry.includes('local-control'), true);
  assert.equal(report.dispatchRun.executorRegistry.includes('local-phase'), false);
});

test('runOrchestrate falls back to local-phase when phaseExecutor override is unsupported', async () => {
  const rootDir = await makeRootDir();
  const logs = [];
  await runOrchestrate(
    {
      blueprint: 'feature',
      taskTitle: 'Fallback executor override',
      dispatchMode: 'local',
      executionMode: 'dry-run',
      phaseExecutor: 'unsupported-executor',
      format: 'json',
    },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.at(-1));

  assert.equal(report.dispatchPlan.phaseExecutor.requested_executor, 'unsupported-executor');
  assert.equal(report.dispatchPlan.phaseExecutor.applied_executor, 'local-phase');
  assert.equal(report.dispatchPlan.phaseExecutor.fallback_applied, true);
  assert.equal(report.dispatchPlan.jobs.filter((job) => job.jobType === 'phase').every((job) => job.launchSpec.executor === 'local-phase'), true);
  assert.equal(report.dispatchRun.executorRegistry.includes('local-phase'), true);
});

test('runOrchestrate throws when the selected dispatch runtime returns invalid output', async () => {
  const rootDir = await makeRootDir();
  const logs = [];

  await assert.rejects(
    () => runOrchestrate(
      { blueprint: 'feature', taskTitle: 'Invalid runtime output', dispatchMode: 'local', executionMode: 'dry-run', format: 'json' },
      {
        rootDir,
        io: { log: (line) => logs.push(line) },
        dispatchRuntimeRegistry: {
          'local-dry-run': {
            id: 'local-dry-run',
            label: 'Local Dry Run Runtime',
            requiresModel: false,
            executionModes: ['dry-run'],
            execute() {
              return { mode: 'dry-run', ok: true, jobRuns: null };
            },
          },
        },
      }
    ),
    /jobRuns/
  );
});

test('runOrchestrate blocks live execution when capability surfaces are unknown', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'live-capability-guard',
    { updatedAt: '2026-03-09T02:30:00.000Z', goal: 'Validate capability guard behavior' },
    [
      {
        seq: 1,
        ts: '2026-03-09T02:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1200,
        },
      },
    ]
  );

  const logs = [];
  const result = await runOrchestrate(
    { sessionId: 'live-capability-guard', dispatchMode: 'local', executionMode: 'live', format: 'json' },
    {
      rootDir,
      io: { log: (line) => logs.push(line) },
      env: {
        ...process.env,
        AIOS_EXECUTE_LIVE: '1',
        AIOS_SUBAGENT_SIMULATE: '1',
      },
    }
  );
  assert.equal(result.exitCode, 1);

  const report = JSON.parse(logs.at(-1));
  assert.equal(report.kind, 'guardrail.capability-unknown');
  assert.equal(report.executionMode, 'live');
  assert.equal(report.runtimeId, 'subagent-runtime');
  assert.equal(Array.isArray(report.unknownCapabilities), true);
  assert.equal(report.unknownCapabilities.includes('network'), true);
  assert.equal(report.unknownCapabilities.includes('browser'), true);
  assert.equal(report.unknownCapabilities.includes('sideEffect'), false);
  assert.equal(Array.isArray(report.unknownExecutors), true);
  assert.equal(report.unknownExecutors.some((item) => item.id === 'local-phase'), true);
  assert.equal(Array.isArray(report.suggestedCommands), true);
  assert.equal(report.suggestedCommands.some((cmd) => cmd.includes('--execute dry-run')), true);
  assert.equal(report.suggestedCommands.some((cmd) => cmd.includes('--execute live') && cmd.includes('--force')), true);

  await assert.rejects(
    () => fs.access(path.join(rootDir, '.aios', 'context-db', 'sessions', 'live-capability-guard', 'artifacts')),
    /ENOENT/
  );
});

test('runOrchestrate blocks live execution by default without persisting evidence', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'live-session',
    { updatedAt: '2026-03-09T02:30:00.000Z', goal: 'Validate live gate behavior' },
    [
      {
        seq: 1,
        ts: '2026-03-09T02:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1200,
        },
      },
    ]
  );

  const logs = [];
  await runOrchestrate(
    { sessionId: 'live-session', dispatchMode: 'local', executionMode: 'live', format: 'json' },
    {
      rootDir,
      env: {
        AIOS_ALLOW_UNKNOWN_CAPABILITIES: '1',
      },
      io: { log: (line) => logs.push(line) },
    }
  );
  const report = JSON.parse(logs.join('\n'));

  assert.equal(report.dispatchRun.mode, 'live');
  assert.equal(report.dispatchRun.runtime?.id, 'subagent-runtime');
  assert.equal(report.dispatchRun.ok, false);
  assert.match(String(report.dispatchRun.error || ''), /AIOS_EXECUTE_LIVE/i);
  assert.equal(report.executorCapabilityManifest.executionMode, 'live');
  assert.equal(report.executorCapabilityManifest.runtimeId, 'subagent-runtime');
  assert.equal(report.executorCapabilityManifest.summary.read, 'yes');
  assert.equal(report.executorCapabilityManifest.summary.write, 'yes');
  assert.equal(report.executorCapabilityManifest.summary.network, 'unknown');
  assert.equal(report.executorCapabilityManifest.summary.browser, 'unknown');
  assert.equal(report.executorCapabilityManifest.summary.sideEffect, 'yes');

  assert.equal(report.effectiveDispatchPolicy.status, 'blocked');
  assert.equal(report.effectiveDispatchPolicy.blockerIds.includes('runbook.dispatch-runtime-unavailable'), true);
  assert.equal(report.effectiveDispatchPolicy.requiredActions.some((item) => /--dispatch local --execute dry-run/.test(item.action)), true);

  assert.equal(report.dispatchEvidence.persisted, false);
  assert.equal(report.dispatchEvidence.reason, 'mode-unsupported');

  await assert.rejects(
    () => fs.access(path.join(rootDir, '.aios', 'context-db', 'sessions', 'live-session', 'artifacts')),
    /ENOENT/
  );
  const eventsRaw = await fs.readFile(path.join(rootDir, '.aios', 'context-db', 'sessions', 'live-session', 'l2-events.jsonl'), 'utf8');
  assert.equal(eventsRaw.trim(), '');
});

test('runOrchestrate persists live dispatch evidence with runtime cost telemetry', async () => {
  const rootDir = await makeRootDir();
  const fakeBin = await createFakeCodexCommand(null, {
    usageLog: 'inputTokens=120 outputTokens=30 totalTokens=150 usd=0.25',
  });
  await writeSession(
    rootDir,
    'live-cost-session',
    { updatedAt: '2026-03-09T02:30:00.000Z', goal: 'Validate live cost evidence' },
    [
      {
        seq: 1,
        ts: '2026-03-09T02:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1200,
        },
      },
    ]
  );

  const logs = [];
  await runOrchestrate(
    { sessionId: 'live-cost-session', dispatchMode: 'local', executionMode: 'live', format: 'json' },
    {
      rootDir,
      io: { log: (line) => logs.push(line) },
      env: {
        ...process.env,
        AIOS_EXECUTE_LIVE: '1',
        AIOS_ALLOW_UNKNOWN_CAPABILITIES: '1',
        AIOS_SUBAGENT_CLIENT: 'codex-cli',
        AIOS_SUBAGENT_CONCURRENCY: '2',
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
      },
    }
  );
  assert.equal(
    logs.some((line) => String(line).includes('[subagent-runtime] context pack failed')),
    false,
    logs.map((line) => String(line)).join('\n')
  );
  const report = JSON.parse(logs.at(-1));

  assert.equal(report.dispatchRun.mode, 'live');
  assert.equal(report.dispatchRun.runtime?.id, 'subagent-runtime');
  assert.equal(report.dispatchRun.ok, true);
  assert.equal((report.dispatchRun.cost?.totalTokens || 0) > 0, true);
  assert.equal((report.dispatchRun.cost?.usd || 0) > 0, true);
  assert.equal(report.workItemTelemetry.schemaVersion, 1);
  assert.equal(report.workItemTelemetry.totals.total > 0, true);
  assert.equal(report.workItemTelemetry.totals.done > 0, true);
  assert.equal(report.dispatchInsights.schemaVersion, 1);
  assert.equal(report.dispatchInsights.runtime.id, 'subagent-runtime');
  assert.equal(report.dispatchInsights.runtime.executionMode, 'live');
  assert.ok(report.dispatchInsights.signals.some((signal) => signal.id === 'capability.unknown'));
  assert.equal(report.entropyGc.mode, 'auto');
  assert.equal(report.entropyGc.evidence?.persisted, true);

  assert.equal(report.dispatchEvidence.persisted, true);
  assert.equal(report.dispatchEvidence.eventKind, 'orchestration.dispatch-run');
  assert.match(report.dispatchEvidence.artifactPath, /dispatch-run-/);

  const artifactPath = path.join(rootDir, report.dispatchEvidence.artifactPath);
  const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
  assert.equal(artifact.dispatchRun.mode, 'live');
  assert.equal(artifact.dispatchRun.runtime?.id, 'subagent-runtime');
  assert.equal(artifact.executorCapabilityManifest?.executionMode, 'live');
  assert.equal(artifact.executorCapabilityManifest?.runtimeId, 'subagent-runtime');
  assert.equal(artifact.executorCapabilityManifest?.summary?.write, 'yes');
  assert.equal(Array.isArray(artifact.workItems), true);
  assert.equal(artifact.workItems.length >= 1, true);
  assert.equal((artifact.dispatchRun.cost?.totalTokens || 0) > 0, true);
  assert.equal((artifact.dispatchRun.cost?.usd || 0) > 0, true);
  assert.equal(artifact.workItemTelemetry.schemaVersion, 1);
  assert.equal(artifact.workItemTelemetry.totals.total > 0, true);
  assert.equal(artifact.dispatchInsights.schemaVersion, 1);
  assert.equal(artifact.dispatchInsights.runtime.id, 'subagent-runtime');
  assert.equal(
    artifact.workItemTelemetry.items.every((item) => item.artifactRefs.includes(report.dispatchEvidence.artifactPath)),
    true
  );

  const checkpointsRaw = await fs.readFile(path.join(rootDir, '.aios', 'context-db', 'sessions', 'live-cost-session', 'l1-checkpoints.jsonl'), 'utf8');
  const lastCheckpoint = JSON.parse(checkpointsRaw.trim().split('\n').at(-1));
  assert.match(lastCheckpoint.summary, /live/);
  assert.equal((lastCheckpoint.telemetry?.cost?.totalTokens || 0) > 0, true);
  assert.equal((lastCheckpoint.telemetry?.cost?.usd || 0) > 0, true);

  const liveEventsRaw = await fs.readFile(path.join(rootDir, '.aios', 'context-db', 'sessions', 'live-cost-session', 'l2-events.jsonl'), 'utf8');
  const liveEvents = liveEventsRaw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const entropyEvent = liveEvents.find((item) => item.kind === 'maintenance.entropy-gc');
  assert.equal(Boolean(entropyEvent), true);
  assert.equal(entropyEvent.turn?.turnType, 'system-maintenance');
  assert.equal(entropyEvent.turn?.environment, 'entropy-gc');
  assert.equal(entropyEvent.turn?.hindsightStatus, 'na');
  assert.equal(entropyEvent.turn?.outcome, 'success');
});

test('runOrchestrate enables clarity human-gate and blocks entropy auto when signals are unclear', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'clarity-session',
    { updatedAt: '2026-03-09T02:30:00.000Z', goal: 'Force clarity gate decision' },
    [
      {
        seq: 1,
        ts: '2026-03-09T02:00:00.000Z',
        status: 'blocked',
        summary: 'Blocked checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'failed', evidence: 'dispatch blocked' },
          retryCount: 0,
          failureCategory: 'dispatch-runtime-blocked',
          elapsedMs: 1200,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T02:10:00.000Z',
        status: 'blocked',
        summary: 'Blocked checkpoint 2',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'failed', evidence: 'dispatch blocked' },
          retryCount: 1,
          failureCategory: 'dispatch-runtime-blocked',
          elapsedMs: 1300,
        },
      },
    ]
  );

  const logs = [];
  await runOrchestrate(
    { sessionId: 'clarity-session', dispatchMode: 'local', executionMode: 'live', format: 'json' },
    {
      rootDir,
      io: { log: (line) => logs.push(line) },
      env: {
        ...process.env,
        AIOS_EXECUTE_LIVE: '1',
        AIOS_ALLOW_UNKNOWN_CAPABILITIES: '1',
        AIOS_SUBAGENT_SIMULATE: '1',
      },
    }
  );
  const report = JSON.parse(logs.at(-1));

  assert.equal(report.dispatchRun.mode, 'live');
  assert.equal(report.dispatchRun.ok, true);
  assert.equal(report.clarityGate.needsHuman, true);
  assert.equal(report.effectiveDispatchPolicy.status, 'blocked');
  assert.equal(report.effectiveDispatchPolicy.blockerIds.includes('gate.clarity-human'), true);
  assert.equal(report.effectiveDispatchPolicy.requiredActions.some((item) => /entropy-gc dry-run/.test(item.action)), true);
  assert.equal(report.entropyGc.mode, 'off');
  assert.equal(report.entropyGc.evidence?.persisted, false);

  const eventsRaw = await fs.readFile(path.join(rootDir, '.aios', 'context-db', 'sessions', 'clarity-session', 'l2-events.jsonl'), 'utf8');
  const events = eventsRaw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const clarityEvent = events.find((item) => item.kind === 'orchestration.human-gate');
  assert.equal(Boolean(clarityEvent), true);
  assert.equal(clarityEvent.turn?.turnType, 'verification');
  assert.equal(clarityEvent.turn?.environment, 'orchestrate');
  assert.equal(clarityEvent.turn?.hindsightStatus, 'evaluated');
  assert.equal(clarityEvent.turn?.outcome, 'ambiguous');

  const checkpointsRaw = await fs.readFile(path.join(rootDir, '.aios', 'context-db', 'sessions', 'clarity-session', 'l1-checkpoints.jsonl'), 'utf8');
  const checkpoints = checkpointsRaw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(checkpoints.some((item) => item.telemetry?.failureCategory === 'clarity-needs-input'), true);
});

test('runOrchestrate adds a dry-run dispatch run without invoking models', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'security-stable',
    { updatedAt: '2026-03-09T02:30:00.000Z', goal: 'Audit login flow hardening' },
    [
      {
        seq: 1,
        ts: '2026-03-09T02:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1200,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T02:05:00.000Z',
        status: 'done',
        summary: 'Checkpoint 2',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1400,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T02:10:00.000Z',
        status: 'done',
        summary: 'Checkpoint 3',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1600,
        },
      },
    ]
  );

  const logs = [];
  await runOrchestrate(
    { blueprint: 'security', sessionId: 'security-stable', dispatchMode: 'local', executionMode: 'dry-run', format: 'json' },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.join('\n'));

  assert.equal(report.dispatchRun.mode, 'dry-run');
  assert.equal(report.dispatchRun.runtime?.id, 'local-dry-run');
  assert.equal(report.dispatchRun.runtime?.executionMode, 'dry-run');
  assert.equal(report.dispatchRun.ok, true);
  assert.equal(report.dispatchRun.jobRuns.every((jobRun) => jobRun.status === 'simulated'), true);
  assert.equal(report.dispatchRun.jobRuns.every((jobRun) => typeof jobRun.output.outputType === 'string'), true);
  assert.equal(report.executorCapabilityManifest.executionMode, 'dry-run');
  assert.equal(report.executorCapabilityManifest.runtimeId, 'local-dry-run');
  assert.equal(report.executorCapabilityManifest.summary.read, 'yes');
  assert.equal(report.executorCapabilityManifest.summary.write, 'no');
  assert.equal(report.executorCapabilityManifest.summary.network, 'no');
  assert.equal(report.executorCapabilityManifest.summary.browser, 'no');
  assert.equal(report.executorCapabilityManifest.summary.sideEffect, 'no');
  assert.deepEqual(report.dispatchRun.executorRegistry, ['local-phase']);
  assert.equal(report.dispatchRun.executorDetails[0]?.requiresModel, false);
  assert.equal(report.dispatchRun.jobRuns.find((jobRun) => jobRun.jobId === 'phase.plan')?.executor, 'local-phase');
  assert.equal(report.dispatchRun.jobRuns.some((jobRun) => jobRun.executor === 'local-merge-gate'), false);
});

test('runOrchestrate persists dry-run evidence into ContextDB JSONL and SQLite sidecar', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'security-stable',
    { updatedAt: '2026-03-09T02:30:00.000Z', goal: 'Audit login flow hardening' },
    [
      {
        seq: 1,
        ts: '2026-03-09T02:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1200,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T02:05:00.000Z',
        status: 'done',
        summary: 'Checkpoint 2',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1400,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T02:10:00.000Z',
        status: 'done',
        summary: 'Checkpoint 3',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1600,
        },
      },
    ]
  );

  const logs = [];
  await runOrchestrate(
    { sessionId: 'security-stable', dispatchMode: 'local', executionMode: 'dry-run', format: 'json' },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.join('\n'));

  assert.equal(report.dispatchEvidence.persisted, true);
  assert.equal(report.dispatchEvidence.eventKind, 'orchestration.dispatch-run');
  assert.match(report.dispatchEvidence.artifactPath, /dispatch-run-/);

  const artifactPath = path.join(rootDir, report.dispatchEvidence.artifactPath);
  const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
  assert.equal(artifact.dispatchRun.mode, 'dry-run');
  assert.equal(artifact.dispatchRun.runtime?.id, 'local-dry-run');
  assert.equal(Array.isArray(artifact.workItems), true);
  assert.equal(artifact.workItems.length >= 1, true);
  assert.equal(artifact.dispatchRun.executorRegistry.includes('local-phase'), true);
  assert.equal(artifact.workItemTelemetry.schemaVersion, 1);
  assert.equal(artifact.workItemTelemetry.totals.total > 0, true);
  assert.equal(
    artifact.workItemTelemetry.items.every((item) => item.artifactRefs.includes(report.dispatchEvidence.artifactPath)),
    true
  );
  assert.equal(
    artifact.dispatchRun.jobRuns.every((jobRun) => String(jobRun.turnId || '').length > 0),
    true
  );
  const implementRun = artifact.dispatchRun.jobRuns.find((jobRun) => String(jobRun.jobId || '').startsWith('phase.implement'));
  assert.ok(implementRun, 'expected implement job run');
  assert.equal(Array.isArray(implementRun.workItemRefs), true);
  assert.equal((implementRun.workItemRefs || []).length >= 1, true);
  assert.equal((implementRun.refs || []).some((ref) => String(ref).startsWith('turn:')), true);
  assert.equal((implementRun.refs || []).some((ref) => String(ref).startsWith('work-item:')), true);

  const eventsRaw = await fs.readFile(path.join(rootDir, '.aios', 'context-db', 'sessions', 'security-stable', 'l2-events.jsonl'), 'utf8');
  const checkpointsRaw = await fs.readFile(path.join(rootDir, '.aios', 'context-db', 'sessions', 'security-stable', 'l1-checkpoints.jsonl'), 'utf8');
  const lastEvent = JSON.parse(eventsRaw.trim().split('\n').at(-1));
  const lastCheckpoint = JSON.parse(checkpointsRaw.trim().split('\n').at(-1));

  assert.equal(lastEvent.kind, 'orchestration.dispatch-run');
  assert.equal(lastEvent.refs.includes(report.dispatchEvidence.artifactPath), true);
  assert.match(String(lastEvent.turn?.turnId || ''), /^dispatch:/);
  assert.equal(lastEvent.turn?.turnType, 'verification');
  assert.equal(lastEvent.turn?.environment, 'orchestrate');
  assert.equal(lastEvent.turn?.hindsightStatus, 'evaluated');
  assert.equal(Array.isArray(lastEvent.turn?.workItemRefs), true);
  assert.equal((lastEvent.turn?.workItemRefs || []).length >= 1, true);
  assert.match(lastCheckpoint.summary, /dry-run/);
  assert.equal(lastCheckpoint.telemetry.verification.result, 'partial');
  assert.equal(lastCheckpoint.artifacts.includes(report.dispatchEvidence.artifactPath), true);

  const sqlitePath = path.join(rootDir, '.aios', 'context-db', 'index', 'context.db');
  const timeline = runContextDbCli(['timeline', '--workspace', rootDir, '--session', 'security-stable', '--limit', '10']);
  assert.equal(Array.isArray(timeline.items), true);
  assert.equal(timeline.items.some((item) => item.id === report.dispatchEvidence.eventId), true);
  assert.equal(timeline.items.some((item) => item.id === report.dispatchEvidence.checkpointId), true);
  await fs.access(sqlitePath);
});
test('runOrchestrate keeps explicit blueprint when overlay also recommends one', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'security-stable',
    { updatedAt: '2026-03-09T02:30:00.000Z', goal: 'Audit login flow hardening' },
    [
      {
        seq: 1,
        ts: '2026-03-09T02:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1200,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T02:05:00.000Z',
        status: 'done',
        summary: 'Checkpoint 2',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1400,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T02:10:00.000Z',
        status: 'done',
        summary: 'Checkpoint 3',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1600,
        },
      },
    ]
  );

  const logs = [];
  await runOrchestrate(
    { blueprint: 'refactor', sessionId: 'security-stable', taskTitle: 'Manual override', format: 'json' },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.join('\n'));

  assert.equal(report.blueprint, 'refactor');
  assert.equal(report.learnEvalOverlay.selectedRecommendationId, 'blueprint.feature');
});

test('runOrchestrate preflight clears verification blocker and records results', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'preflight-session',
    { updatedAt: '2026-03-09T03:30:00.000Z', goal: 'Stabilize verification signals' },
    [
      {
        seq: 1,
        ts: '2026-03-09T03:00:00.000Z',
        status: 'running',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'unknown', evidence: '' },
          retryCount: 0,
          elapsedMs: 900,
        },
      },
    ]
  );

  const logs = [];
  await runOrchestrate(
    { sessionId: 'preflight-session', dispatchMode: 'local', preflightMode: 'auto', format: 'json' },
    {
      rootDir,
      io: { log: (line) => logs.push(line) },
      preflightAdapters: {
        qualityGate: async () => ({ ok: true, exitCode: 0, mode: 'full', results: [] }),
        doctor: async () => ({ ok: true, exitCode: 0 }),
      },
    }
  );
  const report = JSON.parse(logs.join('\n'));

  assert.equal(report.dispatchPolicy.status, 'blocked');
  assert.equal(report.effectiveDispatchPolicy.status, 'caution');
  assert.deepEqual(report.effectiveDispatchPolicy.blockerIds, []);
  assert.equal(report.dispatchPreflight.results.some((item) => item.sourceId === 'gate.verification-results' && item.status === 'passed'), true);
  assert.equal(report.dispatchPreflight.results.some((item) => item.type === 'artifact' && item.status === 'skipped'), false);
  assert.equal(report.dispatchPlan.jobs.some((job) => job.jobType === 'merge-gate'), true);
});

test('runOrchestrate preflight refreshes learn-eval from session-scoped verification telemetry', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'preflight-refresh',
    { updatedAt: '2026-03-09T03:35:00.000Z', goal: 'Refresh learn-eval after preflight' },
    [
      {
        seq: 1,
        ts: '2026-03-09T03:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate quick' },
          retryCount: 0,
          elapsedMs: 900,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T03:05:00.000Z',
        status: 'running',
        summary: 'Checkpoint 2',
        nextActions: [],
        artifacts: [],
      },
      {
        seq: 3,
        ts: '2026-03-09T03:10:00.000Z',
        status: 'done',
        summary: 'Checkpoint 3',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'partial', evidence: 'dispatch dry-run' },
          retryCount: 0,
          elapsedMs: 600,
        },
      },
      {
        seq: 4,
        ts: '2026-03-09T03:15:00.000Z',
        status: 'running',
        summary: 'Checkpoint 4',
        nextActions: [],
        artifacts: [],
      },
    ]
  );

  const adapterCalls = [];
  const logs = [];
  await runOrchestrate(
    { sessionId: 'preflight-refresh', dispatchMode: 'local', preflightMode: 'auto', format: 'json' },
    {
      rootDir,
      io: { log: (line) => logs.push(line) },
      preflightAdapters: {
        qualityGate: async (options) => {
          adapterCalls.push(options.sessionId);
          runContextDbCli([
            'checkpoint',
            '--workspace',
            rootDir,
            '--session',
            'preflight-refresh',
            '--summary',
            'Recorded quality-gate full passed',
            '--status',
            'done',
            '--verify-result',
            'passed',
            '--verify-evidence',
            'quality-gate full',
            '--retry-count',
            '0',
            '--elapsed-ms',
            '100',
          ]);
          return { ok: true, exitCode: 0, mode: 'full', results: [] };
        },
        doctor: async () => ({ ok: true, exitCode: 0 }),
      },
    }
  );
  const report = JSON.parse(logs.join('\n'));

  assert.deepEqual(adapterCalls, ['preflight-refresh']);
  assert.equal(report.dispatchPolicy.blockerIds.includes('gate.verification-results'), true);
  assert.equal(report.effectiveDispatchPolicy.blockerIds.includes('gate.verification-results'), false);
  assert.equal(report.effectiveDispatchPolicy.status, 'caution');
});

test('runOrchestrate preflight auto blocks when release strict guard fails', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'preflight-release-fail',
    { updatedAt: '2026-03-09T03:36:00.000Z', goal: 'Guard release quality before dispatch' },
    [
      {
        seq: 1,
        ts: '2026-03-09T03:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 900,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T03:05:00.000Z',
        status: 'done',
        summary: 'Checkpoint 2',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 920,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T03:10:00.000Z',
        status: 'done',
        summary: 'Checkpoint 3',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 930,
        },
      },
    ]
  );

  const logs = [];
  await runOrchestrate(
    { sessionId: 'preflight-release-fail', dispatchMode: 'local', preflightMode: 'auto', format: 'json' },
    {
      rootDir,
      io: { log: (line) => logs.push(line) },
      preflightAdapters: {
        qualityGate: async () => ({ ok: true, exitCode: 0, mode: 'full', results: [] }),
        doctor: async () => ({ ok: true, exitCode: 0 }),
        releaseStatus: async () => ({
          ok: true,
          exitCode: 1,
          strictFailed: true,
          health: {
            reasons: ['failure_rate_exceeded(0.5000>0.2000)'],
          },
        }),
      },
    }
  );
  const report = JSON.parse(logs.join('\n'));

  assert.equal(
    report.dispatchPreflight.results.some(
      (item) => item.sourceId === 'gate.release-health' && item.runner === 'release-status' && item.status === 'failed'
    ),
    true
  );
  assert.equal(report.effectiveDispatchPolicy.status, 'blocked');
  assert.equal(report.effectiveDispatchPolicy.blockerIds.includes('gate.release-health'), true);
  assert.equal(
    report.effectiveDispatchPolicy.requiredActions.some((item) => item.sourceId === 'gate.release-health' && /release-status --strict/.test(item.action)),
    true
  );
});

test('runOrchestrate preflight executes supported local orchestrate dry-run actions', async () => {
  const rootDir = await makeRootDir();
  const dispatch = await writeDispatchEvidence(rootDir, 'preflight-blocked', { ok: false, blockedJobs: 1 });
  await writeSession(
    rootDir,
    'preflight-blocked',
    { updatedAt: '2026-03-09T03:40:00.000Z', goal: 'Recover blocked merge path' },
    [
      {
        seq: 1,
        ts: '2026-03-09T03:00:00.000Z',
        status: 'blocked',
        summary: 'Merge gate blocked',
        nextActions: [],
        artifacts: [dispatch.artifactPath],
        telemetry: {
          verification: { result: 'failed', evidence: `event=${dispatch.eventId}; artifact=${dispatch.artifactPath}` },
          retryCount: 0,
          failureCategory: 'merge-gate-blocked',
          elapsedMs: 50,
        },
      },
    ]
  );

  const calls = [];
  const logs = [];
  await runOrchestrate(
    { sessionId: 'preflight-blocked', dispatchMode: 'local', preflightMode: 'auto', format: 'json' },
    {
      rootDir,
      io: { log: (line) => logs.push(line) },
      preflightAdapters: {
        qualityGate: async () => ({ ok: true, exitCode: 0, mode: 'full', results: [] }),
        doctor: async () => ({ ok: true, exitCode: 0 }),
        orchestrate: async (options) => {
          calls.push(options);
          return {
            exitCode: 0,
            report: {
              dispatchRun: {
                ok: true,
                jobRuns: [
                  { jobId: 'phase.plan', status: 'simulated' },
                  { jobId: 'merge.final-checks', status: 'simulated' },
                ],
              },
            },
          };
        },
      },
    }
  );
  const report = JSON.parse(logs.join('\n'));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].sessionId, 'preflight-blocked');
  assert.equal(calls[0].dispatchMode, 'local');
  assert.equal(calls[0].executionMode, 'dry-run');
  assert.equal(calls[0].preflightMode, 'none');
  assert.equal(report.dispatchPreflight.results.some((item) => item.sourceId === 'runbook.dispatch-merge-triage' && item.status === 'passed' && item.runner === 'orchestrate'), true);
  assert.equal(report.effectiveDispatchPolicy.blockerIds.includes('runbook.dispatch-merge-triage'), false);
  assert.equal(report.dispatchPlan.jobs.some((job) => job.jobType === 'merge-gate'), true);
});

test('runOrchestrate preflight skips non-local-dry-run orchestrate actions', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'preflight-promote',
    { updatedAt: '2026-03-09T05:20:00.000Z', goal: 'Ship orchestrator blueprints' },
    [
      {
        seq: 1,
        ts: '2026-03-09T05:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate quick' },
          retryCount: 0,
          elapsedMs: 1000,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T05:05:00.000Z',
        status: 'done',
        summary: 'Checkpoint 2',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate quick' },
          retryCount: 1,
          elapsedMs: 1100,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T05:10:00.000Z',
        status: 'done',
        summary: 'Checkpoint 3',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate quick' },
          retryCount: 0,
          elapsedMs: 1000,
        },
      },
    ]
  );

  const calls = [];
  const logs = [];
  await runOrchestrate(
    { sessionId: 'preflight-promote', preflightMode: 'auto', format: 'json' },
    {
      rootDir,
      io: { log: (line) => logs.push(line) },
      preflightAdapters: {
        qualityGate: async (options) => ({ ok: true, exitCode: 0, mode: options.mode, results: [] }),
        doctor: async () => ({ ok: true, exitCode: 0 }),
        orchestrate: async (options) => {
          calls.push(options);
          return {
            exitCode: 0,
            report: {
              dispatchRun: {
                ok: true,
                jobRuns: [],
              },
            },
          };
        },
      },
    }
  );
  const report = JSON.parse(logs.join('\n'));

  assert.equal(calls.length, 0);
  assert.equal(report.dispatchPreflight.results.some((item) => item.sourceId === 'blueprint.feature' && item.status === 'skipped' && item.runner === 'unsupported'), true);
  assert.equal(report.dispatchPreflight.results.some((item) => item.sourceId === 'checklist.verification-standard' && item.status === 'passed' && item.runner === 'quality-gate'), true);
});

test('runOrchestrate preflight still records artifact-only actions as skipped', async () => {
  const rootDir = await makeRootDir();
  const dispatch = await writeDispatchEvidence(rootDir, 'preflight-artifact', { ok: true, blockedJobs: 0 });
  await writeSession(
    rootDir,
    'preflight-artifact',
    { updatedAt: '2026-03-09T03:45:00.000Z', goal: 'Observe dispatch evidence' },
    [
      {
        seq: 1,
        ts: '2026-03-09T03:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 900,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T03:05:00.000Z',
        status: 'done',
        summary: 'Checkpoint 2',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 950,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T03:10:00.000Z',
        status: 'running',
        summary: 'Recorded dry-run evidence',
        nextActions: [],
        artifacts: [dispatch.artifactPath],
        telemetry: {
          verification: { result: 'partial', evidence: `event=${dispatch.eventId}; artifact=${dispatch.artifactPath}` },
          retryCount: 0,
          elapsedMs: 50,
        },
      },
    ]
  );

  const logs = [];
  await runOrchestrate(
    { sessionId: 'preflight-artifact', dispatchMode: 'local', preflightMode: 'auto', format: 'json' },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.join('\n'));

  assert.equal(report.dispatchPreflight.results.some((item) => item.type === 'artifact' && item.sourceId === 'sample.dispatch-evidence-present' && item.status === 'skipped'), true);
  assert.equal(report.effectiveDispatchPolicy.status, 'ready');
});

test('runOrchestrate derives blocked dispatch policy from learn-eval and dispatch evidence', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'blocked-session',
    { updatedAt: '2026-03-09T03:30:00.000Z', goal: 'Stabilize merge gate behavior' },
    [
      {
        seq: 1,
        ts: '2026-03-09T03:00:00.000Z',
        status: 'blocked',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'unknown', evidence: '' },
          retryCount: 0,
          elapsedMs: 900,
        },
      },
    ]
  );
  await writeDispatchEvidence(rootDir, 'blocked-session', { ok: false, blockedJobs: 1 });

  const logs = [];
  await runOrchestrate(
    { sessionId: 'blocked-session', dispatchMode: 'local', format: 'json' },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.join('\n'));

  assert.equal(report.dispatchPolicy.status, 'blocked');
  assert.equal(report.dispatchPolicy.parallelism, 'serial-only');
  assert.equal(report.dispatchPolicy.blockerIds.includes('gate.verification-results'), true);
  assert.equal(report.dispatchPolicy.blockerIds.includes('runbook.dispatch-merge-triage'), true);
  assert.equal(report.dispatchPolicy.requiredActions.some((item) => /quality-gate full/.test(item.action)), true);
  assert.equal(report.dispatchPolicy.requiredActions.some((item) => /--dispatch local --execute dry-run --format json/.test(item.action)), true);
  assert.equal(report.dispatchPlan.jobs.some((job) => job.jobType === 'merge-gate'), false);
  const blockedJobIds = report.dispatchPlan.jobs.map((job) => job.jobId);
  const blockedImplementJobIds = blockedJobIds.filter((jobId) => jobId.startsWith('phase.implement'));
  assert.equal(blockedImplementJobIds.length >= 1, true);
  assert.deepEqual(blockedJobIds, ['phase.plan', ...blockedImplementJobIds, 'phase.review', 'phase.security']);
  assert.deepEqual(report.dispatchPlan.jobs.find((job) => job.jobId === 'phase.review')?.dependsOn, blockedImplementJobIds);
  assert.deepEqual(report.dispatchPlan.jobs.find((job) => job.jobId === 'phase.security')?.dependsOn, ['phase.review']);
  assert.deepEqual(report.dispatchPolicy.executorPreferences, []);
  assert.deepEqual(report.dispatchPlan.executorRegistry, ['local-phase']);
});

test('runOrchestrate derives ready dispatch policy when observed evidence is clean', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'ready-session',
    { updatedAt: '2026-03-09T02:30:00.000Z', goal: 'Audit login flow hardening' },
    [
      {
        seq: 1,
        ts: '2026-03-09T02:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1200,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T02:05:00.000Z',
        status: 'done',
        summary: 'Checkpoint 2',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1400,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T02:10:00.000Z',
        status: 'done',
        summary: 'Checkpoint 3',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1600,
        },
      },
    ]
  );
  await writeDispatchEvidence(rootDir, 'ready-session', {
    ok: true,
    blockedJobs: 0,
    seq: 2,
    ts: '2026-03-09T03:10:00.000Z',
    artifactName: 'dispatch-run-20260309T031000Z.json',
  });

  const logs = [];
  await runOrchestrate(
    { blueprint: 'feature', sessionId: 'ready-session', dispatchMode: 'local', format: 'json' },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.join('\n'));

  assert.equal(report.dispatchPolicy.status, 'ready');
  assert.equal(report.dispatchPolicy.parallelism, 'parallel-with-merge-gate');
  assert.deepEqual(report.dispatchPolicy.blockerIds, []);
  assert.equal(report.dispatchPlan.jobs.some((job) => job.jobType === 'merge-gate'), true);
  const readyImplementJobIds = report.dispatchPlan.jobs
    .map((job) => job.jobId)
    .filter((jobId) => jobId.startsWith('phase.implement'));
  assert.equal(readyImplementJobIds.length >= 1, true);
  assert.deepEqual(report.dispatchPlan.jobs.find((job) => job.jobId === 'phase.review')?.dependsOn, readyImplementJobIds);
  assert.deepEqual(report.dispatchPlan.jobs.find((job) => job.jobId === 'phase.security')?.dependsOn, readyImplementJobIds);
  assert.equal(report.dispatchPolicy.executorPreferences.every((item) => item.confidence === 'observed'), true);
  assert.equal(report.dispatchPolicy.notes.some((note) => /observed dispatch evidence/i.test(note)), true);
});

test('renderOrchestrationReport includes merge gate guidance', () => {
  const report = renderOrchestrationReport({ blueprint: 'feature', taskTitle: 'Ship blueprints' });
  assert.match(report, /ORCHESTRATION BLUEPRINT: feature/);
  assert.match(report, /Merge Gate:/);
  assert.match(report, /overlapping file ownership/);
});

test('renderOrchestrationReport includes decomposed work-item plan', () => {
  const report = renderOrchestrationReport({
    blueprint: 'feature',
    taskTitle: 'Ship blueprints',
    contextSummary: '- add auth checks\n- add regression tests',
  });
  assert.match(report, /Work-Item Plan:/);
  // 北极星原则：类型不猜，无显式声明时一律 general
  assert.match(report, /\[general\] wi\.1/);
  assert.match(report, /\[general\] wi\.2/);
});

test('renderOrchestrationReport includes learn-eval overlay summary', () => {
  const report = renderOrchestrationReport({
    blueprint: 'security',
    taskTitle: 'Audit login flow hardening',
    learnEvalOverlay: {
      sourceSessionId: 'security-stable',
      selectedRecommendationId: 'blueprint.security',
      appliedRecommendationIds: ['blueprint.security', 'checklist.verification-standard'],
      appliedRecommendations: [
        { kind: 'promote', targetId: 'blueprint.security', title: 'promote workflow blueprint' },
        { kind: 'promote', targetId: 'checklist.verification-standard', title: 'promote verification checklist' },
      ],
    },
  });
  assert.match(report, /Learn-Eval Overlay:/);
  assert.match(report, /session=security-stable/);
  assert.match(report, /blueprint\.security/);
});

test('renderOrchestrationReport includes dispatch policy summary', () => {
  const report = renderOrchestrationReport({
    blueprint: 'feature',
    taskTitle: 'Ship blueprints',
    dispatchPolicy: {
      status: 'blocked',
      parallelism: 'serial-only',
      blockerIds: ['runbook.dispatch-merge-triage'],
      advisoryIds: ['sample.dispatch-evidence-present'],
      requiredActions: [
        { type: 'command', action: 'node scripts/aios.mjs doctor' },
      ],
      executorPreferences: [
        { executor: 'local-phase', confidence: 'observed', observedCount: 2, source: 'dispatch-evidence' },
      ],
      notes: ['Observed dispatch evidence shows merge-gate blockage.'],
    },
  });
  assert.match(report, /Dispatch Policy:/);
  assert.match(report, /status=blocked/);
  assert.match(report, /parallelism=serial-only/);
  assert.match(report, /runbook\.dispatch-merge-triage/);
});

test('renderOrchestrationReport includes readiness summary', () => {
  const report = renderOrchestrationReport({
    blueprint: 'feature',
    taskTitle: 'Ship readiness gates',
    readiness: {
      verdict: 'blocked',
      blockedReasons: ['missing_plan_artifact'],
      warnings: ['Missing plan heading: Acceptance'],
      nextActions: ['Create docs/plans/example.md'],
      evidence: [
        { type: 'ownership', path: 'scripts/', summary: 'job phase.implement owns scripts/.' },
      ],
    },
  });

  assert.match(report, /Readiness:/);
  assert.match(report, /verdict=blocked/);
  assert.match(report, /missing_plan_artifact/);
  assert.match(report, /Create docs\/plans\/example\.md/);
  assert.match(report, /phase\.implement owns scripts/);
});

test('renderOrchestrationReport includes executor capability manifest summary', () => {
  const report = renderOrchestrationReport({
    blueprint: 'feature',
    taskTitle: 'Ship blueprints',
    executorCapabilityManifest: {
      schemaVersion: 1,
      generatedAt: '2026-04-12T14:00:00.000Z',
      executionMode: 'live',
      runtimeId: 'subagent-runtime',
      summary: {
        read: 'yes',
        write: 'yes',
        network: 'unknown',
        browser: 'unknown',
        sideEffect: 'yes',
      },
      executors: [
        {
          id: 'local-phase',
          label: 'Local Phase Executor',
          jobCount: 3,
          capabilities: {
            read: 'yes',
            write: 'yes',
            network: 'unknown',
            browser: 'unknown',
            sideEffect: 'yes',
          },
          notes: ['Live mode delegates phase execution to subagent-runtime.'],
        },
      ],
    },
  });
  assert.match(report, /Executor Capability Manifest:/);
  assert.match(report, /mode=live runtime=subagent-runtime/);
  assert.match(report, /summary read=yes write=yes network=unknown browser=unknown sideEffect=yes/);
  assert.match(report, /local-phase jobs=3 read=yes write=yes/);
});

test('renderOrchestrationReport includes local dry-run execution summary', () => {
  const report = renderOrchestrationReport({
    blueprint: 'feature',
    taskTitle: 'Ship blueprints',
    dispatchRun: {
      mode: 'dry-run',
      ok: true,
      executorRegistry: ['local-phase', 'local-merge-gate'],
      executorDetails: [
        { id: 'local-phase', label: 'Local Phase Executor', jobTypes: ['phase'], supportedRoles: ['planner', 'implementer', 'reviewer', 'security-reviewer'], outputTypes: ['handoff'], executionModes: ['dry-run'], concurrencyMode: 'parallel-safe', requiresModel: false },
        { id: 'local-merge-gate', label: 'Local Merge Gate Executor', jobTypes: ['merge-gate'], supportedRoles: ['merge-gate'], outputTypes: ['merged-handoff'], executionModes: ['dry-run'], concurrencyMode: 'serial-only', requiresModel: false },
      ],
      jobRuns: [
        { jobId: 'phase.plan', status: 'simulated', output: { outputType: 'handoff' } },
        { jobId: 'merge.final-checks', status: 'simulated', output: { outputType: 'merged-handoff' } },
      ],
    },
  });
  assert.match(report, /Local Dispatch Run:/);
  assert.match(report, /phase\.plan/);
  assert.match(report, /merged-handoff/);
});

test('renderOrchestrationReport includes dispatch run errors when present', () => {
  const report = renderOrchestrationReport({
    blueprint: 'feature',
    taskTitle: 'Ship blueprints',
    dispatchRun: {
      mode: 'live',
      ok: false,
      error: 'Live execution is disabled by default.',
      executorRegistry: [],
      executorDetails: [],
      jobRuns: [],
      finalOutputs: [],
    },
  });
  assert.match(report, /Local Dispatch Run:/);
  assert.match(report, /error=Live execution is disabled by default\./);
});

test('renderOrchestrationReport includes dispatch evidence summary', () => {
  const report = renderOrchestrationReport({
    blueprint: 'feature',
    taskTitle: 'Ship blueprints',
    dispatchEvidence: {
      persisted: true,
      artifactPath: '.aios/context-db/sessions/security-stable/artifacts/dispatch-run-20260309T030000Z.json',
      eventId: 'security-stable#1',
      checkpointId: 'security-stable#C4',
    },
  });
  assert.match(report, /Dispatch Evidence:/);
  assert.match(report, /security-stable#1/);
  assert.match(report, /dispatch-run-20260309T030000Z\.json/);
});

test('persistDispatchEvidence uses millisecond artifact stamps to avoid collisions', async () => {
  const rootDir = await makeRootDir();
  const sessionId = 'artifact-stamp-ms';

  const report = {
    blueprint: 'feature',
    taskTitle: 'Stamp test',
    dispatchRun: {
      ok: true,
      mode: 'dry-run',
      executorRegistry: ['local-dry-run'],
      jobRuns: [],
      finalOutputs: [],
    },
  };

  const firstNow = new Date('2026-04-06T00:00:00.123Z');
  const secondNow = new Date('2026-04-06T00:00:00.124Z');

  const first = await persistDispatchEvidence({ rootDir, sessionId, report, elapsedMs: 1, now: firstNow });
  const second = await persistDispatchEvidence({ rootDir, sessionId, report, elapsedMs: 1, now: secondNow });

  assert.match(String(first.artifactPath || ''), /dispatch-run-20260406T000000123Z\.json$/);
  assert.match(String(second.artifactPath || ''), /dispatch-run-20260406T000000124Z\.json$/);
  assert.notEqual(first.artifactPath, second.artifactPath);

  const firstAbs = path.join(rootDir, first.artifactPath);
  const secondAbs = path.join(rootDir, second.artifactPath);
  assert.equal(Boolean(await fs.stat(firstAbs)), true);
  assert.equal(Boolean(await fs.stat(secondAbs)), true);
});

test('persistDispatchEvidence writes turn envelope work-item refs and enriches job turn refs', async () => {
  const rootDir = await makeRootDir();
  const sessionId = 'dispatch-envelope-session';

  await writeSession(
    rootDir,
    sessionId,
    { updatedAt: '2026-04-06T00:00:00.000Z', goal: 'Validate dispatch turn envelope linkage' },
    []
  );

  const report = {
    blueprint: 'feature',
    taskTitle: 'Dispatch envelope linkage',
    contextSummary: 'Validate turn/work-item correlation',
    workItems: [
      { itemId: 'wi.1', title: 'Implement fix' },
      { itemId: 'wi.2', title: 'Review fix' },
    ],
    dispatchPlan: {
      jobs: [
        {
          jobId: 'phase.implement.wi.1',
          launchSpec: {
            workItemRefs: ['wi.1'],
          },
        },
      ],
    },
    dispatchRun: {
      ok: true,
      mode: 'dry-run',
      executorRegistry: ['local-phase'],
      jobRuns: [
        {
          jobId: 'phase.implement.wi.1',
          jobType: 'phase',
          role: 'implementer',
          status: 'simulated',
          output: { outputType: 'handoff' },
        },
      ],
      finalOutputs: [
        { jobId: 'phase.implement.wi.1', outputType: 'handoff' },
      ],
    },
  };

  const evidence = await persistDispatchEvidence({
    rootDir,
    sessionId,
    report,
    elapsedMs: 9,
    now: new Date('2026-04-06T00:00:00.222Z'),
  });
  assert.equal(evidence.persisted, true);
  assert.match(String(evidence.artifactPath || ''), /dispatch-run-20260406T000000222Z\.json$/);

  const artifact = JSON.parse(await fs.readFile(path.join(rootDir, evidence.artifactPath), 'utf8'));
  const jobRun = artifact.dispatchRun?.jobRuns?.[0];
  assert.ok(jobRun, 'expected enriched job run');
  assert.match(String(jobRun.turnId || ''), /phase\.implement\.wi\.1:a1$/);
  assert.deepEqual(jobRun.workItemRefs, ['wi.1']);
  assert.equal(Array.isArray(jobRun.refs), true);
  assert.equal(jobRun.refs.includes(`turn:${jobRun.turnId}`), true);
  assert.equal(jobRun.refs.includes('work-item:wi.1'), true);

  const eventsRaw = await fs.readFile(path.join(rootDir, '.aios', 'context-db', 'sessions', sessionId, 'l2-events.jsonl'), 'utf8');
  const lastEvent = JSON.parse(eventsRaw.trim().split('\n').at(-1));
  assert.equal(lastEvent.kind, 'orchestration.dispatch-run');
  assert.match(String(lastEvent.turn?.turnId || ''), /^dispatch:/);
  assert.equal(lastEvent.turn?.turnType, 'verification');
  assert.equal(lastEvent.turn?.environment, 'orchestrate');
  assert.equal(lastEvent.turn?.hindsightStatus, 'evaluated');
  assert.deepEqual((lastEvent.turn?.workItemRefs || []).sort(), ['wi.1', 'wi.2']);
});

test('renderOrchestrationReport includes dispatch evidence reasons when present', () => {
  const report = renderOrchestrationReport({
    blueprint: 'feature',
    taskTitle: 'Ship blueprints',
    dispatchEvidence: {
      persisted: false,
      reason: 'mode-unsupported',
      mode: 'live',
    },
  });
  assert.match(report, /Dispatch Evidence:/);
  assert.match(report, /reason=mode-unsupported/);
});

test('renderOrchestrationReport includes work-item telemetry summary', () => {
  const report = renderOrchestrationReport({
    blueprint: 'feature',
    taskTitle: 'Ship blueprints',
    workItemTelemetry: {
      schemaVersion: 1,
      generatedAt: '2026-03-16T03:00:00.000Z',
      totals: {
        total: 4,
        queued: 0,
        running: 0,
        blocked: 2,
        done: 2,
      },
      items: [
        { itemId: 'phase.plan', itemType: 'phase', role: 'planner', status: 'done', failureClass: 'none', retryClass: 'none' },
        { itemId: 'phase.implement', itemType: 'phase', role: 'implementer', status: 'blocked', failureClass: 'timeout', retryClass: 'same-hypothesis' },
        { itemId: 'phase.review', itemType: 'phase', role: 'reviewer', status: 'blocked', failureClass: 'ownership-policy', retryClass: 'none' },
        { itemId: 'merge.final-checks', itemType: 'merge-gate', role: 'merge-gate', status: 'done', failureClass: 'none', retryClass: 'none' },
      ],
    },
  });
  assert.match(report, /Work-Item Telemetry:/);
  assert.match(report, /totals total=4 queued=0 running=0 blocked=2 done=2/);
  assert.match(report, /blockedByType .*phase=2\/3/);
  assert.match(report, /failureClasses/);
  assert.match(report, /retryClasses same-hypothesis=1/);
});

test('renderOrchestrationReport includes dispatch insights summary', () => {
  const report = renderOrchestrationReport({
    blueprint: 'feature',
    taskTitle: 'Ship blueprints',
    dispatchInsights: {
      schemaVersion: 1,
      status: 'attention',
      score: 85,
      runtime: { id: 'subagent-runtime', executionMode: 'live', mode: 'live' },
      signals: [
        {
          id: 'capability.unknown',
          severity: 'warn',
          message: 'Executor capability manifest has unknown surfaces: network.',
          count: 1,
        },
      ],
      suggestedActions: [
        {
          id: 'resolve-capabilities',
          label: 'Run dry-run first or declare capability risk acceptance before live execution.',
        },
      ],
    },
  });

  assert.match(report, /Dispatch Insights:/);
  assert.match(report, /status=attention score=85/);
  assert.match(report, /runtime=subagent-runtime executionMode=live mode=live/);
  assert.match(report, /signal warn capability\.unknown count=1/);
  assert.match(report, /action resolve-capabilities/);
});

test('renderOrchestrationReport includes local dispatch skeleton summary', () => {
  const report = renderOrchestrationReport({
    blueprint: 'feature',
    taskTitle: 'Ship blueprints',
    dispatchPlan: {
      mode: 'local',
      readyForExecution: false,
      workItemQueue: {
        enabled: true,
        maxParallel: 2,
        entries: [
          { queueId: 'implement.wi.1', phaseId: 'implement', role: 'implementer', itemId: 'wi.1', jobId: 'phase.implement.wi.1', dependsOn: ['phase.plan'], status: 'queued' },
        ],
      },
      executorRegistry: ['local-phase', 'local-merge-gate'],
      executorDetails: [
        { id: 'local-phase', label: 'Local Phase Executor', jobTypes: ['phase'], supportedRoles: ['planner', 'implementer', 'reviewer', 'security-reviewer'], outputTypes: ['handoff'], executionModes: ['dry-run'], concurrencyMode: 'parallel-safe', requiresModel: false },
        { id: 'local-merge-gate', label: 'Local Merge Gate Executor', jobTypes: ['merge-gate'], supportedRoles: ['merge-gate'], outputTypes: ['merged-handoff'], executionModes: ['dry-run'], concurrencyMode: 'serial-only', requiresModel: false },
      ],
      jobs: [
        { jobId: 'phase.plan', jobType: 'phase', role: 'planner', dependsOn: [], launchSpec: { executor: 'local-phase', requiresModel: false } },
        { jobId: 'merge.final-checks', jobType: 'merge-gate', role: 'merge-gate', dependsOn: ['phase.review', 'phase.security'], launchSpec: { executor: 'local-merge-gate', requiresModel: false } },
      ],
    },
  });
  assert.match(report, /Local Dispatch Skeleton:/);
  assert.match(report, /workItemQueue maxParallel=2 entries=1/);
  assert.match(report, /phase\.plan/);
  assert.match(report, /merge\.final-checks/);
});
