import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { buildAgentCatalogue } from '../agents/catalogue.mjs';

const QUALITY_GATE_EVIDENCE = Object.freeze({
  'tests-pass': {
    producer: 'quality-gate-runner',
    artifactRefPattern: '.aios/context-db/**/events.jsonl or quality-gate-*.json',
    validator: 'verification.quality-gate result=passed',
  },
  'security-review-pass': {
    producer: 'rex-security-reviewer',
    artifactRefPattern: 'structured security-reviewer handoff JSON',
    validator: 'status=pass with zero high/critical findings',
  },
  'evidence-manifest-present': {
    producer: 'rex-evidence-auditor',
    artifactRefPattern: '.aios/evidence/**/manifest.json',
    validator: 'manifest contains command, artifact, and metric refs',
  },
  'failing-test-observed': {
    producer: 'rex-tdd-guide',
    artifactRefPattern: 'test red-phase output ref',
    validator: 'test failed for expected missing behavior before implementation',
  },
  'review-pass': {
    producer: 'rex-code-reviewer',
    artifactRefPattern: 'structured code-reviewer handoff JSON',
    validator: 'status=pass or accepted-risk with explicit owner',
  },
  'ecc-borrowing-manifest-present': {
    producer: 'rex-client-surface-reviewer',
    artifactRefPattern: 'docs/reports/competitor-watchlist.json and ECC uplift plan refs',
    validator: 'borrowedPattern and AIOS-native replacement are both recorded',
  },
  'projection-state-verified': {
    producer: 'rex-install-governance-reviewer',
    artifactRefPattern: '.aios/agents/provenance/*.json',
    validator: 'client projection hash/provenance exists for promoted surfaces',
  },
  'mcp-inventory-clean': {
    producer: 'rex-client-surface-reviewer',
    artifactRefPattern: 'mcp migration or doctor report',
    validator: 'no stale RTK/Caveman/legacy MCP aliases in active config',
  },
  'interception-metrics-present': {
    producer: 'rex-interception-reviewer',
    artifactRefPattern: '.aios/interception/metrics/*.jsonl',
    validator: 'pre_send and post_receive metric events exist for managed runs',
  },
  'root-cause-recorded': {
    producer: 'rex-build-error-resolver',
    artifactRefPattern: 'debug/root-cause handoff JSON',
    validator: 'rootCause field is populated before fixes',
  },
  'checkpoint-written': {
    producer: 'rex-loop-operator',
    artifactRefPattern: '.aios/context-db/**/checkpoints.jsonl',
    validator: 'latest checkpoint includes status and next action',
  },
  'status-readable': {
    producer: 'rex-loop-operator',
    artifactRefPattern: 'aios.status.v1 JSON output',
    validator: 'status command exits with expected ready/blocked code',
  },
  'resume-token-present': {
    producer: 'rex-loop-operator',
    artifactRefPattern: '.aios/context-db/**/handoff*.json',
    validator: 'handoff includes session id and resume command',
  },
});

const RECIPES = Object.freeze([
  {
    workflowId: 'plan-build-review',
    trigger: 'orchestrate feature',
    description: 'Plan, architecture review, implementation, code review, security review, and evidence audit.',
    stages: [
      { id: 'plan', agentRole: 'planner', mode: 'sequential' },
      { id: 'architecture', agentRole: 'architect', mode: 'sequential' },
      { id: 'implementation', agentRole: 'implementer', mode: 'sequential' },
      { id: 'code-review', agentRole: 'code-reviewer', mode: 'parallel', group: 'final-checks' },
      { id: 'security-review', agentRole: 'security-reviewer', mode: 'parallel', group: 'final-checks' },
      { id: 'evidence-audit', agentRole: 'evidence-auditor', mode: 'sequential' },
    ],
    qualityGates: ['tests-pass', 'security-review-pass', 'evidence-manifest-present'],
  },
  {
    workflowId: 'tdd-implementation',
    trigger: 'tdd',
    description: 'Define failing tests, implement minimally, resolve build failures, and review coverage.',
    stages: [
      { id: 'test-design', agentRole: 'tdd-guide', mode: 'sequential' },
      { id: 'implementation', agentRole: 'implementer', mode: 'sequential' },
      { id: 'build-resolution', agentRole: 'build-error-resolver', mode: 'sequential' },
      { id: 'review', agentRole: 'code-reviewer', mode: 'parallel', group: 'final-checks' },
    ],
    qualityGates: ['failing-test-observed', 'tests-pass', 'review-pass'],
  },
  {
    workflowId: 'ecc-uplift-governed',
    trigger: 'orchestrate ecc-uplift',
    description: 'Borrow ECC capabilities with anti-RTK evidence gates across client, install, interception, security, and claim audit.',
    stages: [
      { id: 'plan', agentRole: 'planner', mode: 'sequential' },
      { id: 'client-surface', agentRole: 'client-surface-reviewer', mode: 'parallel', group: 'governance' },
      { id: 'install-governance', agentRole: 'install-governance-reviewer', mode: 'parallel', group: 'governance' },
      { id: 'interception', agentRole: 'interception-reviewer', mode: 'parallel', group: 'governance' },
      { id: 'security', agentRole: 'security-reviewer', mode: 'parallel', group: 'governance' },
      { id: 'evidence-audit', agentRole: 'evidence-auditor', mode: 'sequential' },
    ],
    qualityGates: [
      'ecc-borrowing-manifest-present',
      'projection-state-verified',
      'mcp-inventory-clean',
      'interception-metrics-present',
      'evidence-manifest-present',
    ],
  },
  {
    workflowId: 'build-failure-resolution',
    trigger: 'build-error',
    description: 'Root-cause build/type/test failures before proposing implementation fixes.',
    stages: [
      { id: 'failure-analysis', agentRole: 'build-error-resolver', mode: 'sequential' },
      { id: 'implementation-plan', agentRole: 'planner', mode: 'sequential' },
      { id: 'review', agentRole: 'code-reviewer', mode: 'parallel', group: 'final-checks' },
    ],
    qualityGates: ['root-cause-recorded', 'tests-pass'],
  },
  {
    workflowId: 'loop-operation',
    trigger: 'loop-start',
    description: 'Long-running checkpointed operation with status, stop conditions, and resume evidence.',
    stages: [
      { id: 'loop-plan', agentRole: 'loop-operator', mode: 'sequential' },
      { id: 'smoke', agentRole: 'e2e-runner', mode: 'parallel', group: 'verification' },
      { id: 'evidence-audit', agentRole: 'evidence-auditor', mode: 'sequential' },
    ],
    qualityGates: ['checkpoint-written', 'status-readable', 'resume-token-present'],
  },
]);

function agentForRole(catalogue, role) {
  return catalogue.agents.find((agent) => agent.role === role) || null;
}

function summarizeRecipes(recipes) {
  const blockedWorkflowIds = recipes
    .filter((recipe) => !recipe.liveReady)
    .map((recipe) => recipe.workflowId);
  return {
    totalRecipes: recipes.length,
    liveReadyRecipes: recipes.length - blockedWorkflowIds.length,
    blockedRecipes: blockedWorkflowIds.length,
    blockedWorkflowIds,
  };
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return null;
    return null;
  }
}

function isPassingStatus(value) {
  return ['pass', 'passed', 'verified'].includes(String(value || '').trim().toLowerCase());
}

function hasEntries(value) {
  return Array.isArray(value) && value.length > 0;
}

function hasCommandArtifactAndMetricRefs(payload = {}) {
  return hasEntries(payload.commandRefs || payload.commands)
    && hasEntries(payload.artifactRefs || payload.artifacts)
    && hasEntries(payload.metricRefs || payload.metrics);
}

async function findEvidenceManifests(rootPath) {
  const matches = [];
  async function walk(dirPath) {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return;
      throw error;
    }
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name === 'manifest.json') {
        matches.push(entryPath);
      }
    }
  }
  await walk(rootPath);
  return matches;
}

async function validateEvidenceManifest({ rootDir, evidenceRoot }) {
  const manifestFiles = await findEvidenceManifests(path.join(evidenceRoot, '.aios', 'evidence'));
  for (const filePath of manifestFiles) {
    const parsed = await readJsonFile(filePath);
    if (parsed && isPassingStatus(parsed.status || parsed.result) && hasCommandArtifactAndMetricRefs(parsed)) {
      return {
        status: 'verified',
        refs: [path.relative(rootDir, filePath)],
      };
    }
  }
  return {
    status: 'blocked',
    refs: [],
    missing: 'verified evidence manifest with command, artifact, and metric refs',
  };
}

function validateGatePayload(gate, payload) {
  if (!payload || typeof payload !== 'object') {
    return { status: 'blocked', missing: 'missing gate evidence JSON' };
  }
  if (payload.gate && payload.gate !== gate) {
    return { status: 'blocked', missing: 'gate evidence must match gate id' };
  }
  if (!isPassingStatus(payload.status || payload.result)) {
    return { status: 'blocked', missing: 'gate evidence status must pass' };
  }
  if (gate === 'security-review-pass') {
    const findings = payload.findings || {};
    const high = Number(findings.high ?? payload.highFindings ?? 0);
    const critical = Number(findings.critical ?? payload.criticalFindings ?? 0);
    if (high > 0 || critical > 0) {
      return { status: 'blocked', missing: 'security review has high or critical findings' };
    }
  }
  if (gate === 'ecc-borrowing-manifest-present') {
    if (!payload.borrowedPattern || !payload.aiosNativeReplacement) {
      return { status: 'blocked', missing: 'borrowedPattern and aiosNativeReplacement are required' };
    }
  }
  if (gate === 'projection-state-verified') {
    if (!payload.projectionHashes || Object.keys(payload.projectionHashes).length === 0 || !hasEntries(payload.provenanceRefs)) {
      return { status: 'blocked', missing: 'projection hashes and provenance refs are required' };
    }
  }
  if (gate === 'mcp-inventory-clean') {
    if (payload.forbiddenAliasesPresent === true || !Array.isArray(payload.staleAliases) || payload.staleAliases.length > 0) {
      return { status: 'blocked', missing: 'mcp inventory must explicitly report no stale RTK/Caveman aliases' };
    }
  }
  if (gate === 'interception-metrics-present') {
    const events = new Set(payload.metricEvents || []);
    if (!events.has('pre_send') || !events.has('post_receive') || Number(payload.savedBytes ?? payload.saved_bytes ?? 0) <= 0) {
      return { status: 'blocked', missing: 'interception metrics require pre_send, post_receive, and saved bytes' };
    }
  }
  return { status: 'verified', missing: '' };
}

async function evidenceForQualityGate(gate, { rootDir, evidenceRoot }) {
  const base = {
    gate,
    ...(QUALITY_GATE_EVIDENCE[gate] || {
      producer: 'merge-gate',
      artifactRefPattern: '.aios/evidence/**/manifest.json',
      validator: 'manual evidence review required',
    }),
  };

  if (gate === 'evidence-manifest-present') {
    return {
      ...base,
      ...(await validateEvidenceManifest({ rootDir, evidenceRoot })),
    };
  }

  const gatePath = path.join(evidenceRoot, '.aios', 'evidence', 'quality-gates', `${gate}.json`);
  const parsed = await readJsonFile(gatePath);
  const validation = validateGatePayload(gate, parsed);
  return {
    ...base,
    status: validation.status,
    refs: validation.status === 'verified' ? [path.relative(rootDir, gatePath)] : [],
    missing: validation.missing || '',
  };
}

async function evidenceForQualityGates(qualityGates = [], { rootDir, evidenceRoot }) {
  return Promise.all(qualityGates.map((gate) => evidenceForQualityGate(gate, { rootDir, evidenceRoot })));
}

export async function listWorkflowRecipes({
  rootDir = process.cwd(),
  evidenceRoot = rootDir,
  generatedAt = new Date().toISOString(),
  agentCatalogue = null,
} = {}) {
  const catalogue = agentCatalogue || await buildAgentCatalogue({ rootDir, evidenceRoot, generatedAt });
  const recipes = await Promise.all(RECIPES.map(async (recipe) => {
    const stages = recipe.stages.map((stage) => {
      const agent = agentForRole(catalogue, stage.agentRole);
      return {
        ...stage,
        agentId: agent?.agentId || '',
        agentLifecycleState: agent?.lifecycleState || 'missing',
        workflowEnabled: Boolean(agent?.workflowEnabled),
      };
    });
    const blockers = stages
      .filter((stage) => !stage.workflowEnabled)
      .map((stage) => `${stage.id} requires ${stage.agentId || stage.agentRole} to be smoke-verified before live workflow`);
    const qualityGateEvidence = await evidenceForQualityGates(recipe.qualityGates, { rootDir, evidenceRoot });
    const qualityGateBlockers = qualityGateEvidence
      .filter((gate) => gate.status !== 'verified')
      .map((gate) => `quality gate ${gate.gate} requires verified evidence: ${gate.missing || gate.validator}`);
    return {
      ...recipe,
      stages,
      qualityGateEvidence,
      liveReady: blockers.length === 0 && qualityGateBlockers.length === 0,
      blockers: [...blockers, ...qualityGateBlockers],
    };
  }));
  return {
    schemaVersion: 1,
    kind: 'aios.workflow-recipe.v1',
    generatedAt,
    policy: 'workflow-recipes-require-agent-catalogue-evidence',
    summary: summarizeRecipes(recipes),
    recipes,
  };
}

export async function buildWorkflowDryRun({
  rootDir = process.cwd(),
  evidenceRoot = rootDir,
  workflowId = 'plan-build-review',
  task = '',
  generatedAt = new Date().toISOString(),
} = {}) {
  const recipes = await listWorkflowRecipes({ rootDir, evidenceRoot, generatedAt });
  const recipe = recipes.recipes.find((item) => item.workflowId === workflowId);
  if (!recipe) {
    throw new Error(`unknown workflow recipe: ${workflowId}`);
  }
  const stages = recipe.stages.map((stage) => ({
    ...stage,
    status: stage.workflowEnabled ? 'ready' : 'blocked',
    evidenceRequired: [
      'structured-handoff',
      'aios-managed-runner-metrics',
      'claim-evidence-ref',
    ],
  }));
  const blockers = [...recipe.blockers];
  return {
    schemaVersion: 1,
    kind: 'aios.orchestration-run.v1',
    runId: `dry-run-${randomUUID()}`,
    workflowId: recipe.workflowId,
    task,
    executionMode: 'dry-run',
    status: blockers.length > 0 ? 'blocked' : 'ready',
    generatedAt,
    stages,
    qualityGates: recipe.qualityGates,
    qualityGateEvidence: recipe.qualityGateEvidence,
    blockers,
    nextAction: blockers.length > 0
      ? 'run agents doctor --strict and record smoke evidence before live execution'
      : 'rerun with --apply to start managed orchestration',
  };
}
