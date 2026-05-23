import { getHarnessTarget } from '../../targets.mjs';
import { RECOMMENDATION_KIND_BASE_PRIORITY } from './shared.mjs';

export function createRecommendation({
  kind,
  targetType,
  targetId,
  title,
  reason,
  evidence,
  nextCommand,
  nextArtifact,
  draftAction,
  priority = 0,
}) {
  const targetDefinition = targetId ? getHarnessTarget(targetId) : null;
  const resolvedTitle = title || targetDefinition?.title || targetId;
  const resolvedNextCommand = nextCommand || targetDefinition?.nextCommand;
  return {
    kind,
    targetType,
    targetId,
    title: resolvedTitle,
    reason,
    evidence,
    priority: RECOMMENDATION_KIND_BASE_PRIORITY[kind] + Math.max(0, Math.floor(priority)),
    ...(resolvedNextCommand ? { nextCommand: resolvedNextCommand } : {}),
    ...(nextArtifact ? { nextArtifact } : {}),
    ...(draftAction && typeof draftAction === 'object' ? { draftAction: { ...draftAction } } : {}),
  };
}


function getEvidenceStrength(item) {
  const matches = String(item?.evidence || '').match(/-?\d+(?:\.\d+)?/g);
  return matches
    ? matches.reduce((total, value) => total + Number(value), 0)
    : 0;
}

function sortRecommendations(items) {
  return [...items].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority;
    }

    const evidenceDelta = getEvidenceStrength(right) - getEvidenceStrength(left);
    if (evidenceDelta !== 0) {
      return evidenceDelta;
    }

    const targetDelta = String(left.targetId || '').localeCompare(String(right.targetId || ''));
    if (targetDelta !== 0) {
      return targetDelta;
    }

    return left.title.localeCompare(right.title);
  });
}

export function finalizeRecommendations(items) {
  const all = sortRecommendations(items);
  return {
    all,
    fix: all.filter((item) => item.kind === 'fix'),
    observe: all.filter((item) => item.kind === 'observe'),
    promote: all.filter((item) => item.kind === 'promote'),
  };
}


// 纯函数：根据 learn-eval 汇总信号生成分组推荐，避免评估主流程关心每种推荐分支。
