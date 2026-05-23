import { readHudState } from '../../hud/state.mjs';
import {
  filterSkillCandidateState,
  formatSkillCandidateDetails,
} from '../../hud/skill-candidates.mjs';
import {
  DEFAULT_SKILL_CANDIDATE_LIMIT,
  normalizeCounter,
  normalizeProvider,
  normalizeText,
} from './shared.mjs';
import { persistSkillCandidatePatchTemplateArtifact } from './status-artifacts.mjs';
import { resolveStatusSkillCandidateOptions } from './status-options.mjs';

// 纯函数：优先使用 recent 列表，缺省时退回 latest，统一技能候选来源选择规则。
function collectSkillCandidateItems(state = null, limit = DEFAULT_SKILL_CANDIDATE_LIMIT) {
  const resolvedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.floor(limit))
    : DEFAULT_SKILL_CANDIDATE_LIMIT;
  const recent = Array.isArray(state?.recentSkillCandidates)
    ? state.recentSkillCandidates
    : [];
  if (recent.length > 0) {
    return recent.slice(0, resolvedLimit);
  }
  const latest = state?.latestSkillCandidate && typeof state.latestSkillCandidate === 'object'
    ? [state.latestSkillCandidate]
    : [];
  return latest.slice(0, resolvedLimit);
}

// 纯函数：把 HUD 内部候选结构映射成 CLI JSON 输出需要的稳定字段。
function mapSkillCandidateRecord(candidate = null) {
  return {
    skillId: normalizeText(candidate?.skillId) || null,
    scope: normalizeText(candidate?.scope) || null,
    failureClass: normalizeText(candidate?.failureClass) || null,
    lessonKind: normalizeText(candidate?.lessonKind) || null,
    lessonCount: normalizeCounter(candidate?.lessonCount),
    reviewMode: normalizeText(candidate?.reviewMode) || null,
    reviewStatus: normalizeText(candidate?.reviewStatus) || null,
    sourceDraftTargetId: normalizeText(candidate?.sourceDraftTargetId) || null,
    sourceArtifactPath: normalizeText(candidate?.sourceArtifactPath) || null,
    artifactPath: normalizeText(candidate?.artifactPath) || null,
    patchHint: normalizeText(candidate?.patchHint) || null,
  };
}

export async function runTeamSkillCandidatesList(rawOptions = {}, { rootDir, io = console } = {}) {
  const provider = normalizeProvider(rawOptions.provider);
  const sessionId = normalizeText(rawOptions.sessionId || rawOptions.resumeSessionId);
  const json = rawOptions.json === true;
  const draftId = normalizeText(rawOptions.draftId);
  const { skillCandidateLimit } = resolveStatusSkillCandidateOptions({
    showSkillCandidates: true,
    requestedSkillCandidateLimit: rawOptions.skillCandidateLimit,
    skillCandidateView: 'detail',
    exportSkillCandidatePatchTemplate: false,
    draftId,
    fastWatchMinimal: false,
  });

  const state = await readHudState({
    rootDir,
    sessionId,
    provider,
    fast: false,
    skillCandidateLimit,
  });
  const filteredState = filterSkillCandidateState(state, { draftId });
  const resolvedSessionId = normalizeText(filteredState?.selection?.sessionId) || normalizeText(filteredState?.session?.sessionId);
  const candidates = collectSkillCandidateItems(filteredState, skillCandidateLimit).map((candidate) => mapSkillCandidateRecord(candidate));
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    provider,
    sessionId: resolvedSessionId || null,
    draftId: draftId || null,
    skillCandidateLimit,
    candidateCount: candidates.length,
    candidates,
  };

  if (json) {
    io.log(JSON.stringify(result, null, 2));
  } else {
    io.log(`${formatSkillCandidateDetails(filteredState, {
      limit: skillCandidateLimit,
      standalone: true,
      draftId,
    })}\n`);
  }

  return { exitCode: resolvedSessionId ? 0 : 1, result };
}

export async function runTeamSkillCandidatesExport(rawOptions = {}, { rootDir, io = console } = {}) {
  const provider = normalizeProvider(rawOptions.provider);
  const sessionId = normalizeText(rawOptions.sessionId || rawOptions.resumeSessionId);
  const json = rawOptions.json === true;
  const draftId = normalizeText(rawOptions.draftId);
  const outputPath = normalizeText(rawOptions.outputPath);
  const { skillCandidateLimit } = resolveStatusSkillCandidateOptions({
    showSkillCandidates: true,
    requestedSkillCandidateLimit: rawOptions.skillCandidateLimit,
    skillCandidateView: 'detail',
    exportSkillCandidatePatchTemplate: true,
    draftId,
    fastWatchMinimal: false,
  });

  const state = await readHudState({
    rootDir,
    sessionId,
    provider,
    fast: false,
    skillCandidateLimit,
  });
  const filteredState = filterSkillCandidateState(state, { draftId });
  const artifact = await persistSkillCandidatePatchTemplateArtifact({
    rootDir,
    state: filteredState,
    skillCandidateLimit,
    draftId,
    outputPath,
  });

  const candidates = collectSkillCandidateItems(filteredState, skillCandidateLimit);
  const candidateCount = candidates.length;
  const resolvedSessionId = normalizeText(filteredState?.selection?.sessionId) || normalizeText(filteredState?.session?.sessionId);
  const exported = Boolean(artifact?.artifactPath);
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    provider,
    sessionId: resolvedSessionId || null,
    draftId: draftId || null,
    skillCandidateLimit,
    candidateCount,
    exported,
    requestedOutputPath: outputPath || null,
    artifactPath: artifact?.artifactPath || null,
    message: exported
      ? `Skill candidate patch template artifact: ${artifact.artifactPath}`
      : 'Skill candidate patch template export skipped: no session selected.',
  };

  if (json) {
    io.log(JSON.stringify(result, null, 2));
  } else {
    io.log(result.message);
  }

  return { exitCode: exported ? 0 : 1, result };
}
