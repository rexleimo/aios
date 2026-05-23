import { normalizeOrchestratorBlueprint } from '../../harness/orchestrator.mjs';

// 纯函数：从 learn-eval recommendation id 中提取蓝图名，避免主流程重复解析 targetId 约定。
export function extractBlueprintFromTargetId(targetId) {
  const match = /^blueprint\.([a-z0-9-]+)$/i.exec(String(targetId || '').trim());
  return match ? normalizeOrchestratorBlueprint(match[1]) : null;
}

// 纯函数：按显式 recommendation 优先，否则选择第一条建议，统一 overlay 选择规则。
export function selectOverlayRecommendation(recommendations, recommendationId = '') {
  if (recommendationId) {
    const selected = recommendations.find((item) => item.targetId === recommendationId);
    if (!selected) {
      throw new Error(`Unknown learn-eval recommendation: ${recommendationId}`);
    }
    return selected;
  }

  return recommendations.find((item) => item.kind === 'promote' && item.targetType === 'blueprint') || null;
}

// 纯函数：把 learn-eval overlay 压缩进 orchestrate 的上下文摘要，避免 runOrchestrate 负责展示细节。
export function buildOverlayContext(overlay) {
  if (!overlay || overlay.appliedRecommendations.length === 0) {
    return '';
  }

  const topItems = overlay.appliedRecommendations
    .slice(0, 3)
    .map((item) => `[${item.kind}] ${item.targetId}`)
    .join(', ');

  return `learn-eval overlay: session=${overlay.sourceSessionId}; selected=${overlay.selectedRecommendationId || 'none'}; top=${topItems}`;
}

// 纯函数：把 learn-eval 报告转换成 orchestrate 可消费的轻量 overlay。
export function buildLearnEvalOverlay(report, recommendationId = '') {
  const appliedRecommendations = Array.isArray(report.recommendations?.all)
    ? report.recommendations.all.map((item) => ({ ...item }))
    : [];
  const selectedRecommendation = selectOverlayRecommendation(appliedRecommendations, recommendationId);
  return {
    sourceSessionId: report.session.sessionId,
    sourceGoal: report.session.goal,
    selectedRecommendationId: selectedRecommendation?.targetId || null,
    appliedRecommendationIds: appliedRecommendations.map((item) => item.targetId),
    appliedRecommendations,
  };
}
