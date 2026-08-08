import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildLocalDispatchPlan, buildOrchestrationPlan } from '../lib/harness/orchestrator.mjs';

async function importAgentModule() {
  try {
    return await import('../lib/harness/orchestrator-agents.mjs');
  } catch {
    return null;
  }
}

async function makeRootDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'aios-orchestrator-agents-'));
}

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
}

async function copyCanonicalSource(rootDir) {
  await fs.cp(path.join(resolveRepoRoot(), 'agent-sources'), path.join(rootDir, 'agent-sources'), {
    recursive: true,
  });
}

async function writeJson(rootDir, relativePath, value) {
  const filePath = path.join(rootDir, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function replaceInFile(rootDir, relativePath, search, replacement) {
  const filePath = path.join(rootDir, relativePath);
  const current = await fs.readFile(filePath, 'utf8');
  assert.ok(current.includes(search), `${relativePath} should include ${search}`);
  await fs.writeFile(filePath, current.replace(search, replacement), 'utf8');
}

async function loadCanonicalFixture() {
  const sourceTree = await import('../lib/agents/source-tree.mjs');
  return sourceTree.loadCanonicalAgents({ rootDir: resolveRepoRoot() });
}

test('orchestrator agent module exists', async () => {
  const agents = await importAgentModule();
  assert.ok(agents, 'expected orchestrator-agents module');
});

test('resolveAgentRefIdForRole maps role ids to stable agent ids', async () => {
  const agents = await importAgentModule();
  assert.ok(agents, 'expected orchestrator-agents module');

  assert.equal(agents.resolveAgentRefIdForRole('planner'), 'rex-planner');
  assert.equal(agents.resolveAgentRefIdForRole('implementer'), 'rex-implementer');
  assert.equal(agents.resolveAgentRefIdForRole('reviewer'), 'rex-reviewer');
  assert.equal(agents.resolveAgentRefIdForRole('security-reviewer'), 'rex-security-reviewer');
});

test('renderAgentMarkdown emits YAML frontmatter and a managed marker', async () => {
  const agents = await importAgentModule();
  assert.ok(agents, 'expected orchestrator-agents module');

  const md = agents.renderAgentMarkdown({
    name: 'rex-planner',
    description: 'Planner role',
    tools: ['Read'],
    model: 'sonnet',
    role: 'planner',
    handoffTarget: 'next-phase',
    systemPrompt: 'You are the planner.',
  });

  assert.match(md, /^---/);
  assert.match(md, /name:\s*rex-planner/);
  assert.match(md, /tools:\s*\[/);
  assert.match(md, /<!--\s*AIOS-GENERATED: orchestrator-agents v1\s*-->/);
  assert.match(md, /output a single JSON object/i);
});

test('renderCompatibilityExport preserves current orchestrator agent shape', async () => {
  const source = await loadCanonicalFixture();
  const mod = await import('../lib/agents/compat-export.mjs');
  const text = mod.renderCompatibilityExport(source);
  const parsed = JSON.parse(text);

  assert.deepEqual(Object.keys(parsed), ['schemaVersion', 'roleMap', 'agents']);
  for (const role of ['planner', 'implementer', 'reviewer', 'security-reviewer']) {
    assert.ok(parsed.roleMap[role], `expected roleMap.${role}`);
  }
  for (const agentId of ['rex-implementer', 'rex-planner', 'rex-reviewer', 'rex-security-reviewer']) {
    assert.ok(parsed.agents[agentId], `expected agent ${agentId}`);
  }
  assert.equal(parsed.agents['rex-planner'].model, 'sonnet');
});


test('generateCompatibilityExport stays in sync with canonical markdown sources', async () => {
  const source = await loadCanonicalFixture();
  const compat = await import('../lib/agents/compat-export.mjs');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const rendered = compat.renderCompatibilityExport(source);
  const actual = await fs.readFile(path.join(resolveRepoRoot(), 'scripts/lib/specs/orchestrator-agents.json'), 'utf8');

  assert.equal(actual, rendered);
});

test('canonical agents support ECC-style native pack metadata and token/smoke roles', async () => {
  const source = await loadCanonicalFixture();
  const mod = await import('../lib/agents/compat-export.mjs');
  const text = mod.renderCompatibilityExport(source);
  const parsed = JSON.parse(text);

  assert.equal(parsed.roleMap['token-steward'], 'rex-token-steward');
  assert.equal(parsed.roleMap['smoke-runner'], 'rex-smoke-runner');
  for (const agentId of [
    'rex-architect',
    'rex-build-error-resolver',
    'rex-implementer',
    'rex-planner',
    'rex-reviewer',
    'rex-security-reviewer',
    'rex-smoke-runner',
    'rex-tdd-guide',
    'rex-token-steward',
  ]) {
    assert.ok(parsed.agents[agentId], `expected ECC-inspired default agent ${agentId}`);
  }
  assert.ok(Object.keys(parsed.agents).length >= 14);

  const tokenSteward = parsed.agents['rex-token-steward'];
  assert.equal(tokenSteward.tokenProfile, 'minimal');
  assert.equal(tokenSteward.recommendedModel, 'sonnet');
  assert.equal(tokenSteward.fallbackModel, 'haiku');
  assert.match(tokenSteward.promptDefense, /claim parity/i);
  assert.ok(tokenSteward.workflowSteps.includes('inspect-mcp-budget'));
  assert.ok(tokenSteward.activationHints.includes('token-budget'));
  assert.match(tokenSteward.outputContract, /JSON/);
});

test('turn compression metrics preserve agent_id for catalogue promotion evidence', async () => {
  const rootDir = await makeRootDir();
  const { compressPreSendTurn, compressPostReceiveTurn } = await import('../lib/interception/turn/turn-gateway.mjs');
  const { readMetricsRecords } = await import('../lib/interception/metrics/metrics-sink.mjs');
  const common = {
    workspaceRoot: rootDir,
    cwd: rootDir,
    sessionId: 'agent-turn-proof',
    clientId: 'codex',
    agentId: 'rex-planner',
    hostLevel: 'L2',
    thresholds: { minRawBytes: 16 },
    metrics: { enabled: true },
  };

  await compressPreSendTurn({ ...common, prompt: 'planner prompt '.repeat(20) });
  await compressPostReceiveTurn({ ...common, output: 'planner output '.repeat(20) });

  const records = await readMetricsRecords({ workspaceRoot: rootDir, sessionId: 'agent-turn-proof' });
  assert.deepEqual(records.map((record) => record.agent_id), ['rex-planner', 'rex-planner']);
  assert.deepEqual(records.map((record) => record.event_kind), ['pre_send', 'post_receive']);
});

test('agents smoke --dry-run covers every canonical role without writing evidence', async () => {
  const rootDir = await makeRootDir();
  await copyCanonicalSource(rootDir);

  const { parseArgs } = await import('../lib/cli/parse-args.mjs');
  const { runAgentsCommand } = await import('../lib/lifecycle/agents.mjs');
  const parsed = parseArgs(['agents', 'smoke', '--dry-run', '--json']);
  assert.equal(parsed.options.subcommand, 'smoke');
  assert.equal(parsed.options.dryRun, true);

  let output = '';
  const result = await runAgentsCommand(parsed.options, {
    rootDir,
    stdout: { write: (chunk) => { output += String(chunk); } },
  });

  assert.equal(result.exitCode, 0);
  const report = JSON.parse(output);
  assert.equal(report.kind, 'aios.agents.smoke-plan.v1');
  assert.equal(report.dryRun, true);
  assert.equal(report.agents.length, 19);
  assert.equal(new Set(report.agents.map((agent) => agent.agentId)).size, 19);
  assert.ok(report.agents.some((agent) => agent.agentId === 'rex-evidence-auditor'));
  assert.ok(report.agents.some((agent) => agent.agentId === 'rex-install-governance-reviewer'));
  await assert.rejects(() => fs.readFile(path.join(rootDir, '.aios', 'agents', 'smoke', 'rex-planner.json'), 'utf8'));
});

test('agents smoke requires explicit live execution before it can record promotion evidence', async () => {
  const rootDir = await makeRootDir();
  await copyCanonicalSource(rootDir);

  const { parseArgs } = await import('../lib/cli/parse-args.mjs');
  const { runAgentsCommand } = await import('../lib/lifecycle/agents.mjs');
  const parsed = parseArgs(['agents', 'smoke', '--json']);
  assert.equal(parsed.options.subcommand, 'smoke');
  assert.equal(parsed.options.dryRun, false);

  const liveParsed = parseArgs(['agents', 'smoke', '--live', '--client', 'codex', '--json']);
  assert.equal(liveParsed.options.live, true);
  assert.equal(liveParsed.options.clientId, 'codex');

  let output = '';
  const result = await runAgentsCommand(parsed.options, {
    rootDir,
    stdout: { write: (chunk) => { output += String(chunk); } },
  });

  assert.equal(result.exitCode, 1);
  const report = JSON.parse(output);
  assert.equal(report.kind, 'aios.agents.smoke-plan.v1');
  assert.equal(report.dryRun, false);
  assert.equal(report.status, 'blocked');
  assert.equal(report.recorded, 0);

  await assert.rejects(() => fs.readFile(path.join(rootDir, '.aios', 'agents', 'smoke', 'rex-planner.json'), 'utf8'));
  await assert.rejects(() => fs.readFile(path.join(rootDir, '.aios', 'agents', 'provenance', 'rex-planner.json'), 'utf8'));
  await assert.rejects(() => fs.readdir(path.join(rootDir, '.aios', 'interception', 'metrics')));
});

test('agents smoke emits schema-v2 evidence only from a managed live invocation', async () => {
  const rootDir = await makeRootDir();
  await copyCanonicalSource(rootDir);
  const { runAgentsSmoke } = await import('../lib/agents/smoke.mjs');
  const { readMetricsRecords } = await import('../lib/interception/metrics/metrics-sink.mjs');
  const { buildAgentCatalogue } = await import('../lib/agents/catalogue.mjs');
  const stdout = `AIOS_AGENT_SMOKE_OK ${'planner-audit-payload '.repeat(96)}`;
  const result = await runAgentsSmoke({
    rootDir,
    roles: ['planner'],
    live: true,
    clientId: 'codex',
    now: new Date('2026-07-19T00:00:00.000Z'),
    runOneShotImpl: async (clientId, options) => {
      assert.equal(clientId, 'codex');
      assert.match(options.userPrompt, /AIOS_AGENT_SMOKE_OK/);
      return {
        exitCode: 0,
        stdout,
        stderr: '',
        managedInvocation: {
          runner: 'aios.harness.one-shot.v1',
          command: 'codex',
          args: ['exec', '--dangerously-bypass-approvals-and-sandbox', '-'],
        },
      };
    },
  });

  assert.equal(result.status, 'pass');
  assert.equal(result.recorded, 1);
  const smoke = JSON.parse(await fs.readFile(path.join(rootDir, '.aios', 'agents', 'smoke', 'rex-planner.json'), 'utf8'));
  const provenance = JSON.parse(await fs.readFile(path.join(rootDir, '.aios', 'agents', 'provenance', 'rex-planner.json'), 'utf8'));
  const digest = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

  assert.equal(smoke.schemaVersion, 2);
  assert.equal(smoke.kind, 'aios.agent-live-smoke.v2');
  assert.equal(smoke.execution.runner, 'aios.harness.one-shot.v1');
  assert.equal(smoke.execution.invocation.command, 'codex');
  assert.equal(smoke.execution.invocation.argsSha256, digest(JSON.stringify(['exec', '--dangerously-bypass-approvals-and-sandbox', '-'])));
  assert.equal(smoke.execution.stdoutSha256, digest(stdout));
  assert.equal(smoke.execution.stderrSha256, digest(''));
  assert.equal(provenance.receiptId, smoke.execution.receiptId);

  const metrics = await readMetricsRecords({ workspaceRoot: rootDir, sessionId: smoke.sessionId });
  assert.deepEqual(metrics.map((record) => record.event_kind), ['pre_send', 'post_receive']);
  assert.deepEqual(metrics.map((record) => record.ref_id), [smoke.metrics.preSendRefId, smoke.metrics.postReceiveRefId]);
  assert.ok(metrics.every((record) => record.agent_id === 'rex-planner' && record.client_id === 'codex'));

  const catalogue = await buildAgentCatalogue({ rootDir });
  const planner = catalogue.agents.find((agent) => agent.agentId === 'rex-planner');
  assert.equal(planner.workflowEnabled, true);
});

test('agents smoke does not mint promotion files when a live result lacks managed invocation proof', async () => {
  const rootDir = await makeRootDir();
  await copyCanonicalSource(rootDir);
  const { runAgentsSmoke } = await import('../lib/agents/smoke.mjs');
  const result = await runAgentsSmoke({
    rootDir,
    roles: ['planner'],
    live: true,
    clientId: 'codex',
    runOneShotImpl: async () => ({
      exitCode: 0,
      stdout: `AIOS_AGENT_SMOKE_OK ${'unbound-output '.repeat(96)}`,
      stderr: '',
    }),
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.recorded, 0);
  assert.equal(result.agents[0].blocker, 'managed-runner-proof-missing');
  await assert.rejects(() => fs.readFile(path.join(rootDir, '.aios', 'agents', 'smoke', 'rex-planner.json'), 'utf8'));
  await assert.rejects(() => fs.readFile(path.join(rootDir, '.aios', 'agents', 'provenance', 'rex-planner.json'), 'utf8'));
});

test('agents smoke accepts an ACK wrapped inside output-contract JSON', async () => {
  const rootDir = await makeRootDir();
  await copyCanonicalSource(rootDir);
  const { runAgentsSmoke } = await import('../lib/agents/smoke.mjs');
  const result = await runAgentsSmoke({
    rootDir,
    roles: ['planner'],
    live: true,
    clientId: 'codex',
    runOneShotImpl: async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        schemaVersion: 1,
        agentId: 'rex-planner',
        role: 'planner',
        status: 'ok',
        findings: [],
        blockers: [],
        evidenceRefs: ['AIOS_AGENT_SMOKE_OK'],
        filesReviewed: [],
        recommendedNextSteps: [],
      }),
      stderr: '',
      managedInvocation: {
        runner: 'aios.harness.one-shot.v1',
        command: 'codex',
        args: ['exec', '-'],
      },
    }),
  });

  assert.equal(result.status, 'pass');
  assert.equal(result.recorded, 1);
});

test('agents smoke prompt overrides the JSON output contract for probes', async () => {
  const rootDir = await makeRootDir();
  await copyCanonicalSource(rootDir);
  const { runAgentsSmoke } = await import('../lib/agents/smoke.mjs');
  let seenPrompt = '';
  await runAgentsSmoke({
    rootDir,
    roles: ['planner'],
    live: true,
    clientId: 'codex',
    runOneShotImpl: async (clientId, options) => {
      seenPrompt = options.userPrompt;
      return {
        exitCode: 0,
        stdout: `AIOS_AGENT_SMOKE_OK ${'probe-audit-payload '.repeat(96)}`,
        stderr: '',
        managedInvocation: {
          runner: 'aios.harness.one-shot.v1',
          command: 'codex',
          args: ['exec', '-'],
        },
      };
    },
  });

  assert.match(seenPrompt, /Do NOT return a JSON handoff object/);
  assert.match(seenPrompt, /reply with the ACK marker only/);
});

test('agents smoke escalates timeout on transient slow probes and recovers', async () => {
  const rootDir = await makeRootDir();
  await copyCanonicalSource(rootDir);
  const { runAgentsSmoke } = await import('../lib/agents/smoke.mjs');
  const seenTimeouts = [];
  const result = await runAgentsSmoke({
    rootDir,
    roles: ['planner'],
    live: true,
    clientId: 'codex',
    runOneShotImpl: async (clientId, options) => {
      seenTimeouts.push(options.timeoutMs);
      if (seenTimeouts.length === 1) {
        return {
          exitCode: 124,
          stdout: '',
          stderr: '',
          error: `Timed out after ${options.timeoutMs} ms`,
        };
      }
      return {
        exitCode: 0,
        stdout: `AIOS_AGENT_SMOKE_OK ${'probe-audit-payload '.repeat(96)}`,
        stderr: '',
        managedInvocation: {
          runner: 'aios.harness.one-shot.v1',
          command: 'codex',
          args: ['exec', '-'],
        },
      };
    },
  });

  // 第一次 60s 超时 -> 自动升级到 120s 重试 -> 成功
  assert.equal(result.status, 'pass');
  assert.equal(result.recorded, 1);
  assert.deepEqual(seenTimeouts, [60000, 120000]);
  assert.equal(result.agents[0].attempts, 2);
});

test('agents smoke blocks with recovery hint after exhausting all timeout escalations', async () => {
  const rootDir = await makeRootDir();
  await copyCanonicalSource(rootDir);
  const { runAgentsSmoke } = await import('../lib/agents/smoke.mjs');
  const seenTimeouts = [];
  const result = await runAgentsSmoke({
    rootDir,
    roles: ['planner'],
    live: true,
    clientId: 'codex',
    runOneShotImpl: async (clientId, options) => {
      seenTimeouts.push(options.timeoutMs);
      return {
        exitCode: 124,
        stdout: '',
        stderr: '',
        error: `Timed out after ${options.timeoutMs} ms`,
      };
    },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.recorded, 0);
  // 60s -> 120s -> 240s 全耗尽
  assert.deepEqual(seenTimeouts, [60000, 120000, 240000]);
  assert.equal(result.agents[0].attempts, 3);
  assert.match(result.agents[0].blocker, /timed out after 240000 ms \(attempt 3\/3\)/);
  assert.match(result.agents[0].blocker, /--timeout-ms <ms>/);
  assert.match(result.agents[0].blocker, /AIOS_AGENT_SMOKE_TIMEOUT_MS/);
});


test('generate-orchestrator-agents --export-only skips generated target sync', () => {
  const result = run(process.execPath, ['scripts/generate-orchestrator-agents.mjs', '--export-only'], {
    cwd: resolveRepoRoot(),
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const lines = result.stdout.trim().split('\n');
  const summary = JSON.parse(lines.slice(1).join('\n'));

  assert.deepEqual(summary.targets, []);
  assert.deepEqual(summary.totals, { installed: 0, updated: 0, skipped: 0, removed: 0 });
});

test('syncGeneratedAgents renders from rootDir canonical source', async () => {
  const agents = await importAgentModule();
  assert.ok(agents, 'expected orchestrator-agents module');

  const rootDir = await makeRootDir();
  await copyCanonicalSource(rootDir);
  await replaceInFile(
    rootDir,
    'agent-sources/roles/rex-planner.md',
    'description: "Planner role card for AIOS orchestrations (scope, risks, ordering)."',
    'description: "Planner role from temp canonical source."'
  );

  const codexDir = path.join(rootDir, '.codex', 'agents');
  await fs.mkdir(codexDir, { recursive: true });

  const result = await agents.syncGeneratedAgents({ rootDir, targets: ['.codex/agents'] });
  assert.equal(result.ok, true);
  assert.equal(result.targets.includes('.codex/agents'), true);

  const generated = await fs.readFile(path.join(codexDir, 'rex-planner.toml'), 'utf8');
  assert.match(generated, /Planner role from temp canonical source/);
});

test('syncGeneratedAgents rejects unmanaged conflicts', async () => {
  const agents = await importAgentModule();
  assert.ok(agents, 'expected orchestrator-agents module');

  const rootDir = await makeRootDir();
  await copyCanonicalSource(rootDir);
  const claudeDir = path.join(rootDir, '.claude', 'agents');
  const codexDir = path.join(rootDir, '.codex', 'agents');
  await fs.mkdir(claudeDir, { recursive: true });
  await fs.mkdir(codexDir, { recursive: true });
  await fs.writeFile(path.join(claudeDir, 'rex-planner.md'), 'manual\n', 'utf8');

  await assert.rejects(
    () => agents.syncGeneratedAgents({ rootDir, targets: ['.claude/agents'] }),
    /unmanaged conflict/i
  );

  const manual = await fs.readFile(path.join(claudeDir, 'rex-planner.md'), 'utf8');
  assert.equal(manual, 'manual\n');
  await assert.rejects(() => fs.readFile(path.join(codexDir, 'rex-planner.toml'), 'utf8'));
});

test('buildLocalDispatchPlan injects agentRefId into phase job launchSpec', () => {
  const orchestration = buildOrchestrationPlan({ blueprint: 'feature', taskTitle: 'Ship blueprints' });
  const dispatch = buildLocalDispatchPlan(orchestration);

  const phaseJobs = dispatch.jobs.filter((job) => job.jobType === 'phase');
  assert.equal(phaseJobs.length > 0, true);
  assert.equal(phaseJobs.every((job) => typeof job.launchSpec.agentRefId === 'string' && job.launchSpec.agentRefId.length > 0), true);
});

test('buildLocalDispatchPlan applies phase executor override to phase jobs only', () => {
  const orchestration = buildOrchestrationPlan({
    blueprint: 'feature',
    taskTitle: 'Ship blueprints',
    contextSummary: '- implement core behavior\n- add tests',
  });
  const dispatch = buildLocalDispatchPlan(orchestration, { phaseExecutor: 'local-control' });

  const phaseJobs = dispatch.jobs.filter((job) => job.jobType === 'phase');
  const mergeJobs = dispatch.jobs.filter((job) => job.jobType === 'merge-gate');
  assert.equal(phaseJobs.length > 0, true);
  assert.equal(mergeJobs.length > 0, true);
  assert.equal(phaseJobs.every((job) => job.launchSpec.executor === 'local-control'), true);
  assert.equal(mergeJobs.every((job) => job.launchSpec.executor === 'local-merge-gate'), true);
  assert.equal(dispatch.phaseExecutor.requested_executor, 'local-control');
  assert.equal(dispatch.phaseExecutor.applied_executor, 'local-control');
  assert.equal(dispatch.phaseExecutor.fallback_applied, false);
});

test('buildLocalDispatchPlan falls back to local-phase when phase executor override is unsupported', () => {
  const orchestration = buildOrchestrationPlan({ blueprint: 'feature', taskTitle: 'Ship blueprints' });
  const dispatch = buildLocalDispatchPlan(orchestration, { phaseExecutor: 'unknown-executor' });

  const phaseJobs = dispatch.jobs.filter((job) => job.jobType === 'phase');
  assert.equal(phaseJobs.length > 0, true);
  assert.equal(phaseJobs.every((job) => job.launchSpec.executor === 'local-phase'), true);
  assert.equal(dispatch.phaseExecutor.requested_executor, 'unknown-executor');
  assert.equal(dispatch.phaseExecutor.applied_executor, 'local-phase');
  assert.equal(dispatch.phaseExecutor.fallback_applied, true);
  assert.match(dispatch.phaseExecutor.reason, /unsupported_phase_executor/);
});
