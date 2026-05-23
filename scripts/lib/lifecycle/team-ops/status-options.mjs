import {
  DEFAULT_SKILL_CANDIDATE_LIMIT,
  FAST_WATCH_MINIMAL_SKILL_CANDIDATE_LIMIT,
  MAX_SKILL_CANDIDATE_LIMIT,
  normalizeSkillCandidateView,
  normalizeText,
} from './shared.mjs';

// 纯函数：统一收敛团队状态里的技能候选展示选项，避免 watch / 导出 / 详情分支重复维护同一组规则。
export function resolveStatusSkillCandidateOptions({
  showSkillCandidates = false,
  requestedSkillCandidateLimit = 0,
  skillCandidateView = 'inline',
  exportSkillCandidatePatchTemplate = false,
  draftId = '',
  fastWatchMinimal = false,
} = {}) {
  const requestedLimit = Number.isFinite(requestedSkillCandidateLimit)
    ? Math.max(0, Math.floor(requestedSkillCandidateLimit))
    : 0;
  const normalizedDraftId = normalizeText(draftId);
  const shouldExportPatchTemplate = exportSkillCandidatePatchTemplate === true;
  const shouldShowSkillCandidates = showSkillCandidates === true
    || requestedLimit > 0
    || shouldExportPatchTemplate
    || Boolean(normalizedDraftId);
  const boundedRequestedLimit = Math.min(MAX_SKILL_CANDIDATE_LIMIT, requestedLimit);
  const defaultLimit = fastWatchMinimal
    ? FAST_WATCH_MINIMAL_SKILL_CANDIDATE_LIMIT
    : DEFAULT_SKILL_CANDIDATE_LIMIT;
  const skillCandidateLimit = shouldShowSkillCandidates
    ? Math.max(1, boundedRequestedLimit || defaultLimit)
    : 0;
  const resolvedSkillCandidateView = shouldShowSkillCandidates
    ? normalizeSkillCandidateView(skillCandidateView, 'inline')
    : 'inline';

  return {
    showSkillCandidates: shouldShowSkillCandidates,
    skillCandidateLimit,
    skillCandidateView: resolvedSkillCandidateView,
    exportSkillCandidatePatchTemplate: shouldExportPatchTemplate && shouldShowSkillCandidates,
    draftId: normalizedDraftId,
  };
}
