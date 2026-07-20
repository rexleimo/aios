// scripts/lib/workflows/recipes/definitions.mjs — 工作流配方定义
// 从 recipes.mjs 拆分：QUALITY_GATE_EVIDENCE 常量 + RECIPES 数据 + 辅助函数

import { buildRexWorkflowDefinitions } from '../rex-harness-adapter.mjs';

/** 质量门常规定义 */
export const QUALITY_GATE_EVIDENCE = Object.freeze({
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
});

/**
 * 默认工作流注册表：软件工程 Recipe 只读投影自 rex-harness；
 * AIOS 仅保留宿主治理 Recipe；长运行软件循环由 Rex 定义和推进。
 */
export const RECIPES = Object.freeze([
  ...buildRexWorkflowDefinitions(),
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
]);

/** 从目录中按 role 查找 agent */
export function agentForRole(catalogue, role) {
  return catalogue.agents.find((agent) => agent.role === role) || null;
}

/** 汇总配方列表状态 */
export function summarizeRecipes(recipes) {
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
