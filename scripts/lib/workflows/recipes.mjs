// scripts/lib/workflows/recipes.mjs — barrel index + listWorkflowRecipes/buildWorkflowDryRun
// 原文件 381 行拆分为 definitions.mjs + evidence.mjs + 本文件（组装+导出）

import { randomUUID } from 'node:crypto';

import { buildAgentCatalogue } from '../agents/catalogue.mjs';
import { RECIPES, agentForRole, summarizeRecipes } from './recipes/definitions.mjs';
import { evidenceForQualityGates } from './recipes/evidence.mjs';

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
