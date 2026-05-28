import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
  assert.deepEqual(Object.keys(parsed.roleMap), [
    'planner',
    'implementer',
    'reviewer',
    'security-reviewer',
  ]);
  assert.deepEqual(Object.keys(parsed.agents), [
    'rex-implementer',
    'rex-planner',
    'rex-reviewer',
    'rex-security-reviewer',
  ]);
  assert.equal(parsed.agents['rex-planner'].model, 'sonnet');
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
  const source = await loadCanonicalFixture();
  const planner = source.agentsById[source.roleMap.planner];
  await copyCanonicalSource(rootDir);
  await writeJson(rootDir, 'agent-sources/roles/rex-planner.json', {
    ...planner,
    description: 'Planner role from temp canonical source.',
  });

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
