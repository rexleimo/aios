import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildAgentCatalogue } from '../lib/agents/catalogue.mjs';
import { buildClientCapabilityReport } from '../lib/clients/capability-report.mjs';
import { buildAiosStatus } from '../lib/lifecycle/status.mjs';
import { buildWorkflowDryRun, listWorkflowRecipes } from '../lib/workflows/recipes.mjs';
import { parseArgs } from '../lib/cli/parse-args.mjs';
import { getCommandHelpText } from '../lib/cli/help.mjs';

async function writeAgentEvidence(rootDir, agentId, {
  smokeStatus = 'pass',
  metricsEvents = ['pre_send', 'post_receive'],
  provenanceAgentId = agentId,
} = {}) {
  const timestamp = '2026-06-15T00:00:00.000Z';
  await writeFile(
    path.join(rootDir, '.aios', 'agents', 'smoke', `${agentId}.json`),
    `${JSON.stringify({ schemaVersion: 1, agentId, status: smokeStatus, timestamp }, null, 2)}\n`,
    'utf8'
  );
  await writeFile(
    path.join(rootDir, '.aios', 'agents', 'provenance', `${agentId}.json`),
    `${JSON.stringify({ schemaVersion: 1, agentId: provenanceAgentId, status: 'verified', timestamp }, null, 2)}\n`,
    'utf8'
  );
  const metricLines = metricsEvents.map((eventKind) => JSON.stringify({
    ts: timestamp,
    event_kind: eventKind,
    client_id: 'aios-agent-runner',
    agent_id: agentId,
    mode: 'tight',
    uncontrolled: false,
    policy_violation: false,
    saved_bytes: 128,
    saving_ratio: 0.75,
  })).join('\n');
  await writeFile(
    path.join(rootDir, '.aios', 'interception', 'metrics', `${agentId}-proof.jsonl`),
    `${metricLines}\n`,
    'utf8'
  );
}

async function writeQualityGateEvidence(rootDir, gate, payload = {}) {
  await mkdir(path.join(rootDir, '.aios', 'evidence', 'quality-gates'), { recursive: true });
  await writeFile(
    path.join(rootDir, '.aios', 'evidence', 'quality-gates', `${gate}.json`),
    `${JSON.stringify({
      schemaVersion: 1,
      gate,
      status: 'pass',
      artifactRefs: [`artifact:${gate}`],
      metricRefs: [`metric:${gate}`],
      commandRefs: [`command:${gate}`],
      ...payload,
    }, null, 2)}\n`,
    'utf8'
  );
}

async function writeEvidenceManifest(rootDir, payload = {}) {
  await mkdir(path.join(rootDir, '.aios', 'evidence', 'run-1'), { recursive: true });
  await writeFile(
    path.join(rootDir, '.aios', 'evidence', 'run-1', 'manifest.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      status: 'verified',
      commandRefs: ['command:test'],
      artifactRefs: ['artifact:test'],
      metricRefs: ['metric:test'],
      ...payload,
    }, null, 2)}\n`,
    'utf8'
  );
}

function readyCatalogueForRoles(roles) {
  return {
    agents: roles.map((role) => ({
      agentId: `mock-${role}`,
      role,
      lifecycleState: 'projected',
      workflowEnabled: true,
    })),
  };
}

test('agent catalogue exposes ECC-inspired default agent families with strict lifecycle states', async () => {
  const catalogue = await buildAgentCatalogue({ rootDir: process.cwd() });

  assert.equal(catalogue.schemaVersion, 1);
  assert.equal(catalogue.kind, 'aios.agent-catalogue.v1');
  assert.ok(catalogue.summary.totalAgents >= 14);
  assert.ok(catalogue.summary.byLifecycle.projected >= 4);
  assert.ok(catalogue.summary.byLifecycle.candidate >= 8);

  const byId = Object.fromEntries(catalogue.agents.map((agent) => [agent.agentId, agent]));
  for (const id of [
    'rex-planner',
    'rex-architect',
    'rex-tdd-guide',
    'rex-code-reviewer',
    'rex-security-reviewer',
    'rex-build-error-resolver',
    'rex-evidence-auditor',
    'rex-loop-operator',
    'rex-typescript-reviewer',
    'rex-react-reviewer',
  ]) {
    assert.ok(byId[id], `expected ${id}`);
    assert.ok(byId[id].sourceProvenance?.eccInspired, `${id} must carry ECC provenance`);
  }

  assert.equal(byId['rex-planner'].lifecycleState, 'projected');
  assert.equal(byId['rex-evidence-auditor'].lifecycleState, 'candidate');
  assert.equal(byId['rex-evidence-auditor'].workflowEnabled, false);
  assert.match(byId['rex-evidence-auditor'].blockers.join('\n'), /smoke evidence/i);
});

test('agent promotion evidence must be passing, agent-scoped, and bidirectional before workflow enablement', async () => {
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-agent-invalid-evidence-'));
  await mkdir(path.join(evidenceRoot, '.aios', 'agents', 'smoke'), { recursive: true });
  await mkdir(path.join(evidenceRoot, '.aios', 'agents', 'provenance'), { recursive: true });
  await mkdir(path.join(evidenceRoot, '.aios', 'interception', 'metrics'), { recursive: true });
  await writeAgentEvidence(evidenceRoot, 'rex-planner', {
    smokeStatus: 'fail',
    metricsEvents: ['pre_send'],
    provenanceAgentId: 'rex-reviewer',
  });

  const catalogue = await buildAgentCatalogue({
    rootDir: process.cwd(),
    evidenceRoot,
  });
  const planner = catalogue.agents.find((agent) => agent.agentId === 'rex-planner');

  assert.equal(planner.verification.status, 'blocked');
  assert.deepEqual(planner.verification.missing, ['smoke', 'metrics', 'provenance']);
  assert.equal(planner.workflowEnabled, false);
});

test('valid agent evidence can promote projected agents but not candidate-only agents', async () => {
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-agent-valid-evidence-'));
  await mkdir(path.join(evidenceRoot, '.aios', 'agents', 'smoke'), { recursive: true });
  await mkdir(path.join(evidenceRoot, '.aios', 'agents', 'provenance'), { recursive: true });
  await mkdir(path.join(evidenceRoot, '.aios', 'interception', 'metrics'), { recursive: true });
  await writeAgentEvidence(evidenceRoot, 'rex-planner');
  await writeAgentEvidence(evidenceRoot, 'rex-evidence-auditor');

  const catalogue = await buildAgentCatalogue({
    rootDir: process.cwd(),
    evidenceRoot,
  });
  const byId = Object.fromEntries(catalogue.agents.map((agent) => [agent.agentId, agent]));

  assert.equal(byId['rex-planner'].verification.status, 'verified');
  assert.equal(byId['rex-planner'].workflowEnabled, true);
  assert.equal(byId['rex-evidence-auditor'].verification.status, 'verified');
  assert.equal(byId['rex-evidence-auditor'].workflowEnabled, false);
  assert.match(byId['rex-evidence-auditor'].blockers.join('\n'), /candidate/i);
});

test('projected agents stay workflow-blocked until local smoke and metrics evidence exists', async () => {
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-agent-blocked-evidence-'));
  const catalogue = await buildAgentCatalogue({
    rootDir: process.cwd(),
    evidenceRoot,
  });
  const byId = Object.fromEntries(catalogue.agents.map((agent) => [agent.agentId, agent]));

  assert.equal(byId['rex-planner'].lifecycleState, 'projected');
  assert.equal(byId['rex-planner'].workflowEnabled, false);
  assert.equal(byId['rex-planner'].verification.status, 'blocked');
  assert.match(byId['rex-planner'].blockers.join('\n'), /smoke evidence|metrics evidence|provenance evidence/i);
});

test('canonical default agents use ECC-aligned rich prompts, not short role labels', async () => {
  const { loadCanonicalAgents, validateCanonicalAgent } = await import('../lib/agents/source-tree.mjs');
  const source = await loadCanonicalAgents({ rootDir: process.cwd() });

  for (const agent of Object.values(source.agentsById)) {
    assert.ok(
      agent.systemPrompt.length >= 900,
      `${agent.id} systemPrompt should be a detailed ECC-style role card`
    );
    for (const marker of ['When to use', 'Workflow', 'Hard constraints', 'Output contract', 'Evidence']) {
      assert.match(agent.systemPrompt, new RegExp(marker, 'i'), `${agent.id} missing ${marker} section`);
    }
    assert.ok(agent.workflowSteps.length >= 4, `${agent.id} should have concrete workflow steps`);
    assert.match(agent.outputContract, /JSON/i, `${agent.id} outputContract must require structured JSON`);
  }

  assert.throws(() => validateCanonicalAgent({
    schemaVersion: 1,
    id: 'rex-planner',
    role: 'planner',
    name: 'rex-planner',
    description: 'planner',
    tools: ['Read'],
    model: 'sonnet',
    handoffTarget: 'next-phase',
    systemPrompt: 'plan',
  }), /systemPrompt.*ECC-style|systemPrompt.*rich/i);
});

test('workflow recipes include ECC orchestrate-style agent choreography and block unverified live agents', async () => {
  const recipes = await listWorkflowRecipes({ rootDir: process.cwd() });

  assert.equal(recipes.kind, 'aios.workflow-recipe.v1');
  assert.equal(recipes.summary.totalRecipes, recipes.recipes.length);
  assert.equal(
    recipes.summary.blockedRecipes,
    recipes.recipes.filter((recipe) => !recipe.liveReady).length
  );
  assert.ok(recipes.summary.blockedWorkflowIds.includes('ecc-uplift-governed'));
  const byId = Object.fromEntries(recipes.recipes.map((recipe) => [recipe.workflowId, recipe]));
  assert.ok(byId['ecc-uplift-governed']);
  assert.ok(byId['adaptive-software-delivery']);
  assert.equal(byId['adaptive-software-delivery'].source, 'rex-harness');
  assert.equal(byId['adaptive-software-delivery'].runtimeManaged, true);
  assert.equal(byId['adaptive-software-delivery'].readinessScope, 'current-command');
  assert.ok(byId['adaptive-software-delivery'].stages.every((stage) => stage.mode === 'conditional'));
  assert.deepEqual(
    byId['ecc-uplift-governed'].stages.map((stage) => stage.agentRole),
    [
      'planner',
      'client-surface-reviewer',
      'install-governance-reviewer',
      'interception-reviewer',
      'security-reviewer',
      'evidence-auditor',
    ]
  );
  assert.ok(byId['ecc-uplift-governed'].qualityGateEvidence.length >= byId['ecc-uplift-governed'].qualityGates.length);
  for (const gate of byId['ecc-uplift-governed'].qualityGateEvidence) {
    assert.ok(gate.producer, `${gate.gate} should declare an evidence producer`);
    assert.ok(gate.artifactRefPattern, `${gate.gate} should declare an artifact ref pattern`);
    assert.ok(gate.validator, `${gate.gate} should declare a validator`);
  }

  const dryRun = await buildWorkflowDryRun({
    rootDir: process.cwd(),
    workflowId: 'ecc-uplift-governed',
    task: 'Borrow ECC safely',
  });
  assert.equal(dryRun.kind, 'aios.orchestration-run.v1');
  assert.equal(dryRun.executionMode, 'dry-run');
  assert.equal(dryRun.status, 'blocked');
  assert.ok(dryRun.blockers.some((blocker) => blocker.includes('rex-evidence-auditor')));
  assert.ok(dryRun.stages.every((stage) => stage.status === 'ready' || stage.status === 'blocked'));
  assert.ok(dryRun.qualityGateEvidence.every((gate) => gate.status === 'blocked'));
});

test('adaptive rex workflow readiness is command-scoped instead of requiring every conditional Provider', async () => {
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-workflow-missing-gates-'));
  const agentCatalogue = readyCatalogueForRoles([]);

  const recipes = await listWorkflowRecipes({
    rootDir: process.cwd(),
    evidenceRoot,
    agentCatalogue,
  });
  const recipe = recipes.recipes.find((item) => item.workflowId === 'adaptive-software-delivery');

  assert.equal(recipe.liveReady, true);
  assert.deepEqual(recipe.blockers, []);
  assert.deepEqual(recipe.qualityGateEvidence, []);
  assert.ok(recipe.stages.every((stage) => stage.workflowEnabled === false));
});

test('adaptive rex workflow dry-run asks the runtime for one current Command', async () => {
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-workflow-valid-gates-'));
  const dryRun = await buildWorkflowDryRun({
    rootDir: process.cwd(),
    evidenceRoot,
    workflowId: 'adaptive-software-delivery',
    task: 'Implement checkout safely',
  });

  assert.equal(dryRun.status, 'ready');
  assert.ok(dryRun.stages.every((stage) => stage.status === 'conditional'));
  assert.match(dryRun.nextAction, /current Command/u);
});

test('ECC uplift workflow rejects shallow pass-only quality-gate evidence', async () => {
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ecc-shallow-gates-'));
  for (const gate of [
    'ecc-borrowing-manifest-present',
    'projection-state-verified',
    'mcp-inventory-clean',
    'interception-metrics-present',
  ]) {
    await writeQualityGateEvidence(evidenceRoot, gate);
  }
  await writeEvidenceManifest(evidenceRoot);
  const agentCatalogue = readyCatalogueForRoles([
    'planner',
    'client-surface-reviewer',
    'install-governance-reviewer',
    'interception-reviewer',
    'security-reviewer',
    'evidence-auditor',
  ]);

  const recipes = await listWorkflowRecipes({
    rootDir: process.cwd(),
    evidenceRoot,
    agentCatalogue,
  });
  const recipe = recipes.recipes.find((item) => item.workflowId === 'ecc-uplift-governed');

  assert.equal(recipe.liveReady, false);
  const blockedGates = recipe.qualityGateEvidence
    .filter((gate) => gate.status === 'blocked')
    .map((gate) => gate.gate);
  assert.deepEqual(blockedGates, [
    'ecc-borrowing-manifest-present',
    'projection-state-verified',
    'mcp-inventory-clean',
    'interception-metrics-present',
  ]);
  assert.match(recipe.blockers.join('\n'), /borrowedPattern|projection|mcp|pre_send/i);
});

test('ECC uplift workflow accepts content-verified anti-RTK quality-gate evidence', async () => {
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ecc-valid-gates-'));
  await writeQualityGateEvidence(evidenceRoot, 'ecc-borrowing-manifest-present', {
    borrowedPattern: 'default-agent-catalogue-and-command-workflow',
    aiosNativeReplacement: 'AIOS agent catalogue, workflow recipes, and fail-closed readiness gates',
  });
  await writeQualityGateEvidence(evidenceRoot, 'projection-state-verified', {
    projectionHashes: { codex: 'sha256:codex', claude: 'sha256:claude' },
    provenanceRefs: ['.aios/agents/provenance/rex-planner.json'],
  });
  await writeQualityGateEvidence(evidenceRoot, 'mcp-inventory-clean', {
    staleAliases: [],
    forbiddenAliasesPresent: false,
  });
  await writeQualityGateEvidence(evidenceRoot, 'interception-metrics-present', {
    metricEvents: ['pre_send', 'post_receive'],
    savedBytes: 512,
  });
  await writeEvidenceManifest(evidenceRoot);
  const agentCatalogue = readyCatalogueForRoles([
    'planner',
    'client-surface-reviewer',
    'install-governance-reviewer',
    'interception-reviewer',
    'security-reviewer',
    'evidence-auditor',
  ]);

  const recipes = await listWorkflowRecipes({
    rootDir: process.cwd(),
    evidenceRoot,
    agentCatalogue,
  });
  const recipe = recipes.recipes.find((item) => item.workflowId === 'ecc-uplift-governed');

  assert.equal(recipe.liveReady, true);
  assert.deepEqual(recipe.blockers, []);
  assert.ok(recipe.qualityGateEvidence.every((gate) => gate.status === 'verified'));
});

test('client capability report includes ECC-inspired agent and workflow readiness summary', async () => {
  const report = await buildClientCapabilityReport({ rootDir: process.cwd() });

  assert.equal(report.agentCatalogue.kind, 'aios.agent-catalogue.v1');
  assert.ok(report.agentCatalogue.totalAgents >= 14);
  assert.ok(report.agentCatalogue.blockedAgentIds.includes('rex-evidence-auditor'));

  assert.equal(report.workflowRecipes.kind, 'aios.workflow-recipe.v1');
  assert.ok(report.workflowRecipes.blockedWorkflowIds.includes('ecc-uplift-governed'));
  assert.match(report.claimPolicy, /No ECC-inspired capability claim/i);
});

test('client live gates fail closed without smoke, metrics, and provenance evidence', async () => {
  const report = await buildClientCapabilityReport({
    rootDir: process.cwd(),
    env: {},
    evidenceRoot: process.cwd(),
  });

  for (const clientId of ['codex', 'claude', 'opencode']) {
    const client = report.clients.find((item) => item.clientId === clientId);
    assert.equal(client.status, 'supported-candidate');
    assert.equal(client.staticProjectionAllowed, true);
    assert.equal(client.liveExecutionAllowed, false);
    assert.equal(client.skillTrainingAllowed, false);
    assert.equal(client.qualityGateRunnerAllowed, false);
    assert.equal(client.harnessLiveAllowed, false);
    assert.equal(client.verification.status, 'blocked');
    assert.ok(client.verification.missing.length > 0, `${clientId} should list missing evidence`);
  }

  const gemini = report.clients.find((item) => item.clientId === 'gemini');
  assert.equal(gemini.status, 'compatibility');
  assert.equal(gemini.liveExecutionAllowed, false);
  assert.equal(gemini.qualityGateRunnerAllowed, false);
  assert.match(gemini.reasons.join('\n'), /compatibility-tier/i);
});

test('CLI parses agents and workflow commands', () => {
  const agents = parseArgs(['agents', 'doctor', '--strict', '--json']);
  assert.equal(agents.command, 'agents');
  assert.equal(agents.options.subcommand, 'doctor');
  assert.equal(agents.options.strict, true);
  assert.equal(agents.options.json, true);

  const workflow = parseArgs(['workflow', 'run', 'ecc-uplift-governed', '--task', 'Borrow ECC', '--dry-run', '--json']);
  assert.equal(workflow.command, 'workflow');
  assert.equal(workflow.options.subcommand, 'run');
  assert.equal(workflow.options.workflowId, 'ecc-uplift-governed');
  assert.equal(workflow.options.task, 'Borrow ECC');
  assert.equal(workflow.options.dryRun, true);

  const status = parseArgs(['status', '--json']);
  assert.equal(status.command, 'status');
  assert.equal(status.options.json, true);

  assert.match(getCommandHelpText('status'), /aios\.status\.v1/);
  assert.match(getCommandHelpText('agents'), /agent catalogue/i);
  assert.match(getCommandHelpText('workflow'), /workflow recipes/i);
});

test('aios status exposes ECC-style unified readiness surface', async () => {
  const status = await buildAiosStatus({ rootDir: process.cwd() });

  assert.equal(status.kind, 'aios.status.v1');
  assert.equal(status.agentCatalogue.kind, 'aios.agent-catalogue.v1');
  assert.equal(status.workflowRecipes.kind, 'aios.workflow-recipe.v1');
  assert.equal(status.clientCapabilities.kind, 'aios.client-surface-summary.v1');
  assert.equal(status.overallStatus, 'blocked');
  assert.ok(status.blockers.some((blocker) => blocker.includes('candidate agents')));
});

test('aios agents doctor, workflow dry-run, and status are callable from the real CLI', () => {
  const agents = spawnSync(process.execPath, ['scripts/aios.mjs', 'agents', 'doctor', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(agents.status, 1, agents.stderr || agents.stdout);
  const agentReport = JSON.parse(agents.stdout);
  assert.equal(agentReport.kind, 'aios.agent-catalogue.v1');
  assert.ok(agentReport.strict.blocked);

  const workflow = spawnSync(process.execPath, ['scripts/aios.mjs', 'workflow', 'run', 'ecc-uplift-governed', '--task', 'Borrow ECC', '--dry-run', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(workflow.status, 1, workflow.stderr || workflow.stdout);
  const run = JSON.parse(workflow.stdout);
  assert.equal(run.kind, 'aios.orchestration-run.v1');
  assert.equal(run.status, 'blocked');

  const status = spawnSync(process.execPath, ['scripts/aios.mjs', 'status', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(status.status, 1, status.stderr || status.stdout);
  const statusReport = JSON.parse(status.stdout);
  assert.equal(statusReport.kind, 'aios.status.v1');
  assert.equal(statusReport.overallStatus, 'blocked');
});
