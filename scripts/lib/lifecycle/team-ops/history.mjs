import { listContextDbSessions, readHudDispatchSummary } from '../../hud/state.mjs';
import { getClientRuntimeId } from '../../clients/registry.mjs';
import {
  hasFailedQualityGate,
  mapWithConcurrency,
  matchesQualityCategory,
  matchesQualityCategoryPrefix,
  normalizeConcurrency,
  normalizeCounter,
  normalizeProvider,
  normalizeQualityCategory,
  normalizeQualityCategoryPrefixMode,
  normalizeQualityCategoryPrefixes,
  normalizeText,
} from './shared.mjs';
import { formatHistoryLine, mapDispatchInsightsRecord } from './history-format.mjs';
import { summarizeHistory } from './history-summary.mjs';

export async function runTeamHistory(rawOptions = {}, { rootDir, io = console } = {}) {
  const provider = normalizeProvider(rawOptions.provider);
  const limit = Number.isFinite(rawOptions.limit)
    ? Math.max(1, Math.floor(rawOptions.limit))
    : Number.parseInt(String(rawOptions.limit ?? '').trim(), 10);
  const resolvedLimit = Number.isFinite(limit) && limit > 0 ? limit : 10;
  const json = rawOptions.json === true;
  const concurrency = normalizeConcurrency(rawOptions.concurrency, 4);
  const fast = rawOptions.fast === true;
  const qualityFailedOnly = rawOptions.qualityFailedOnly === true;
  const qualityCategory = normalizeText(rawOptions.qualityCategory);
  const qualityCategoryFilter = normalizeQualityCategory(qualityCategory);
  const qualityCategoryPrefix = normalizeText(rawOptions.qualityCategoryPrefix);
  const qualityCategoryPrefixFilters = normalizeQualityCategoryPrefixes(
    Array.isArray(rawOptions.qualityCategoryPrefixes)
      ? rawOptions.qualityCategoryPrefixes
      : qualityCategoryPrefix
  );
  const qualityCategoryPrefixMode = normalizeQualityCategoryPrefixMode(rawOptions.qualityCategoryPrefixMode);
  const qualityCategoryPrefixEnabled = qualityCategoryPrefixFilters.length > 0;
  const draftIdFilter = normalizeText(rawOptions.draftId);
  const sinceIso = normalizeText(rawOptions.since);
  const statusFilter = normalizeText(rawOptions.status);

  const agent = getClientRuntimeId(provider);

  const scanLimit = (sinceIso || statusFilter || qualityFailedOnly || qualityCategoryFilter || qualityCategoryPrefixEnabled || draftIdFilter)
    ? Math.max(resolvedLimit, resolvedLimit * 8)
    : resolvedLimit;
  const sessions = await listContextDbSessions(rootDir, { agent, limit: scanLimit });
  const sinceMs = sinceIso ? Date.parse(sinceIso) : NaN;

  const filteredSessions = sessions.filter((meta) => {
    if (statusFilter && normalizeText(meta?.status) !== statusFilter) return false;
    if (sinceIso) {
      const updatedAt = normalizeText(meta?.updatedAt) || normalizeText(meta?.createdAt);
      const updatedMs = updatedAt ? Date.parse(updatedAt) : NaN;
      if (!Number.isFinite(updatedMs) || !Number.isFinite(sinceMs) || updatedMs < sinceMs) return false;
    }
    return true;
  });
  const targetSessions = (qualityFailedOnly || qualityCategoryFilter || qualityCategoryPrefixEnabled)
    ? filteredSessions
    : filteredSessions.slice(0, resolvedLimit);

  const records = await mapWithConcurrency(targetSessions, concurrency, async (meta) => {
    const sessionId = normalizeText(meta.sessionId);
    const state = await readHudDispatchSummary({ rootDir, sessionId, provider, meta, includeHindsight: !fast });
    const hindsight = state.dispatchHindsight && typeof state.dispatchHindsight === 'object'
      ? state.dispatchHindsight
      : null;
    const topFailure = Array.isArray(hindsight?.topRepeatedFailureClasses) && hindsight.topRepeatedFailureClasses.length > 0
      ? hindsight.topRepeatedFailureClasses[0]
      : null;
    const topJob = Array.isArray(hindsight?.topRepeatedJobs) && hindsight.topRepeatedJobs.length > 0
      ? hindsight.topRepeatedJobs[0]
      : null;
    const fixHint = state.dispatchFixHint && typeof state.dispatchFixHint === 'object'
      ? state.dispatchFixHint
      : null;
    const qualityGate = state.latestQualityGate && typeof state.latestQualityGate === 'object'
      ? state.latestQualityGate
      : null;
    const skillCandidate = state.latestSkillCandidate && typeof state.latestSkillCandidate === 'object'
      ? state.latestSkillCandidate
      : null;
    return {
      sessionId,
      updatedAt: normalizeText(meta.updatedAt) || normalizeText(meta.createdAt),
      status: normalizeText(meta.status),
      goal: normalizeText(meta.goal),
      dispatchInsights: mapDispatchInsightsRecord(state.latestDispatch?.dispatchInsights),
      dispatch: state.latestDispatch
        ? {
          ok: state.latestDispatch.ok === true,
          jobCount: Number.isFinite(state.latestDispatch.jobCount) ? state.latestDispatch.jobCount : 0,
          blockedJobs: Number.isFinite(state.latestDispatch.blockedJobs) ? state.latestDispatch.blockedJobs : 0,
          artifactPath: normalizeText(state.latestDispatch.artifactPath),
        }
        : null,
      dispatchHindsight: hindsight
        ? {
          pairsAnalyzed: normalizeCounter(hindsight.pairsAnalyzed),
          comparedJobs: normalizeCounter(hindsight.comparedJobs),
          resolvedBlockedTurns: normalizeCounter(hindsight.resolvedBlockedTurns),
          repeatedBlockedTurns: normalizeCounter(hindsight.repeatedBlockedTurns),
          regressions: normalizeCounter(hindsight.regressions),
          topFailureClass: normalizeText(topFailure?.failureClass) || null,
          topRepeatedJobId: normalizeText(topJob?.jobId) || null,
        }
        : null,
      qualityGate: qualityGate
        ? {
          outcome: normalizeText(qualityGate.outcome) || null,
          categoryRef: normalizeText(qualityGate.categoryRef) || null,
          failureCategory: normalizeText(qualityGate.failureCategory) || null,
        }
        : null,
      dispatchFixHint: fixHint
        ? {
          targetId: normalizeText(fixHint.targetId) || null,
          evidence: normalizeText(fixHint.evidence) || null,
          nextCommand: normalizeText(fixHint.nextCommand) || null,
          nextArtifact: normalizeText(fixHint.nextArtifact) || null,
        }
        : null,
      skillCandidate: skillCandidate
        ? {
          skillId: normalizeText(skillCandidate.skillId) || null,
          scope: normalizeText(skillCandidate.scope) || null,
          failureClass: normalizeText(skillCandidate.failureClass) || null,
          lessonKind: normalizeText(skillCandidate.lessonKind) || null,
          lessonCount: normalizeCounter(skillCandidate.lessonCount),
          reviewMode: normalizeText(skillCandidate.reviewMode) || null,
          reviewStatus: normalizeText(skillCandidate.reviewStatus) || null,
          sourceDraftTargetId: normalizeText(skillCandidate.sourceDraftTargetId) || null,
          artifactPath: normalizeText(skillCandidate.artifactPath) || null,
        }
        : null,
    };
  });

  const filteredByQualityFailed = qualityFailedOnly
    ? records.filter((record) => hasFailedQualityGate(record))
    : records;
  const filteredByCategory = qualityCategoryFilter
    ? filteredByQualityFailed.filter((record) => matchesQualityCategory(record, qualityCategoryFilter))
    : filteredByQualityFailed;
  const filteredByCategoryPrefix = qualityCategoryPrefixEnabled
    ? filteredByCategory.filter((record) => matchesQualityCategoryPrefix(record, qualityCategoryPrefixFilters, qualityCategoryPrefixMode))
    : filteredByCategory;
  const filteredByDraftId = draftIdFilter
    ? filteredByCategoryPrefix.filter((record) => normalizeText(record?.skillCandidate?.sourceDraftTargetId) === draftIdFilter)
    : filteredByCategoryPrefix;
  const selectedRecords = (qualityFailedOnly || qualityCategoryFilter || qualityCategoryPrefixEnabled || draftIdFilter)
    ? filteredByDraftId.slice(0, resolvedLimit)
    : filteredByDraftId;
  const summary = summarizeHistory(selectedRecords);
  if (json) {
    io.log(JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      provider,
      agent,
      limit: resolvedLimit,
      fast,
      qualityFailedOnly,
      qualityCategory: qualityCategory || null,
      qualityCategoryPrefix: qualityCategoryPrefix || null,
      qualityCategoryPrefixes: qualityCategoryPrefixEnabled ? qualityCategoryPrefixFilters : null,
      qualityCategoryPrefixMode,
      draftId: draftIdFilter || null,
      since: sinceIso || null,
      status: statusFilter || null,
      summary,
      records: selectedRecords,
    }, null, 2));
    return { exitCode: 0 };
  }

  const filterLabels = [];
  if (qualityFailedOnly) filterLabels.push('quality-gate failed only');
  if (qualityCategoryFilter) filterLabels.push(`quality-category=${qualityCategory}`);
  if (qualityCategoryPrefixEnabled) filterLabels.push(`quality-category-prefix=${qualityCategoryPrefixFilters.join(',')}`);
  if (qualityCategoryPrefixEnabled) filterLabels.push(`quality-category-prefix-mode=${qualityCategoryPrefixMode}`);
  if (draftIdFilter) filterLabels.push(`draft-id=${draftIdFilter}`);

  const lines = [
    `AIOS Team History (provider=${provider} agent=${agent})`,
    filterLabels.length > 0 ? `Filter: ${filterLabels.join('; ')}` : '',
    `Summary: sessions=${summary.total} dispatchBlocked=${summary.dispatchBlocked} hindsightUnstable=${summary.hindsightUnstable} topFailures=${summary.topFailures.map((item) => `${item.failureClass}=${item.count}`).join(', ') || 'none'} topQualityFailures=${summary.topQualityFailures.map((item) => `${item.failureCategory}=${item.count}`).join(', ') || 'none'} topFixHints=${summary.topFixHints.map((item) => `${item.targetId}=${item.count}`).join(', ') || 'none'} topJobs=${summary.topJobs.map((item) => `${item.jobId}=${item.count}`).join(', ') || 'none'} topSkillCandidates=${summary.topSkillCandidates.map((item) => `${item.skillId}${item.failureClass ? `/${item.failureClass}` : item.scope ? `/${item.scope}` : ''}=${item.count}`).join(', ') || 'none'} topInsightSignals=${summary.topInsightSignals.map((item) => `${item.signalId}=${item.count}`).join(', ') || 'none'}`,
    ...(selectedRecords.length > 0 ? selectedRecords.map((record) => formatHistoryLine(record)) : ['- (none)']),
  ];
  io.log(lines.join('\n') + '\n');
  return { exitCode: 0 };
}
