import { clipLine, formatCompletionPercent, normalizeProgressCounts, normalizeText } from './shared.mjs';

export function formatDispatchLine(state) {
  const dispatch = state?.latestDispatch || null;
  if (!dispatch) return 'Dispatch: (none)';
  const ok = dispatch.ok === true ? 'ok' : 'blocked';
  const mode = normalizeText(dispatch.mode) || 'unknown';
  const jobs = Number.isFinite(dispatch.jobCount) ? String(dispatch.jobCount) : '0';
  const blocked = Number.isFinite(dispatch.blockedJobs) ? String(dispatch.blockedJobs) : '0';
  const executors = Array.isArray(dispatch.executors) && dispatch.executors.length > 0
    ? dispatch.executors.join(',')
    : 'none';
  const artifact = normalizeText(dispatch.artifactPath);
  return [
    'Dispatch:',
    `${ok}`,
    `mode=${mode}`,
    `jobs=${jobs}`,
    `blocked=${blocked}`,
    `executors=${executors}`,
    artifact ? `artifact=${artifact}` : '',
  ].filter(Boolean).join(' ');
}

export function formatDispatchInsightsSignals(insights = null) {
  const signals = Array.isArray(insights?.signals) ? insights.signals : [];
  if (signals.length === 0) return 'signals=(none)';

  const parts = signals.slice(0, 3).map((signal) => {
    const id = normalizeText(signal?.id) || 'unknown';
    const severity = normalizeText(signal?.severity) || 'info';
    const count = Number.isFinite(signal?.count) && signal.count > 1 ? `#${Math.max(0, Math.floor(signal.count))}` : '';
    return `${id}:${severity}${count}`;
  });

  return `signals=${parts.join(', ')}`;
}

export function formatDispatchInsightsActions(insights = null) {
  const actions = Array.isArray(insights?.suggestedActions) ? insights.suggestedActions : [];
  if (actions.length === 0) return 'actions=(none)';

  const parts = actions.slice(0, 3).map((action) => normalizeText(action?.id) || normalizeText(action?.label) || 'unknown');
  return `actions=${parts.join(', ')}`;
}

export function formatDispatchInsightsLine(state) {
  const insights = state?.latestDispatch?.dispatchInsights && typeof state.latestDispatch.dispatchInsights === 'object'
    ? state.latestDispatch.dispatchInsights
    : null;
  if (!insights) return '';

  const status = normalizeText(insights.status) || 'attention';
  const score = Number.isFinite(insights.score) ? Math.max(0, Math.floor(insights.score)) : 0;
  return clipLine(
    `Dispatch Insights: status=${status} score=${score} ${formatDispatchInsightsSignals(insights)} ${formatDispatchInsightsActions(insights)}`,
    260
  );
}

export function formatMinimalDispatchProgressLabel(state) {
  const dispatch = state?.latestDispatch || null;
  const progress = normalizeProgressCounts(dispatch?.jobProgress);
  if (!dispatch || !progress) return '';

  const parts = [
    `jobs=${progress.done}/${progress.total}`,
  ];
  if (progress.running > 0) parts.push(`run=${progress.running}`);
  if (progress.blocked > 0) parts.push(`blk=${progress.blocked}`);
  if (progress.queued > 0) parts.push(`q=${progress.queued}`);

  const tools = Array.isArray(dispatch.toolProgress)
    ? dispatch.toolProgress.map((item) => ({
      tool: normalizeText(item?.tool),
      progress: normalizeProgressCounts(item),
    }))
      .filter((item) => item.tool && item.progress)
    : [];
  if (tools.length > 0) {
    const primary = tools[0];
    parts.push(`tool=${primary.tool}:${primary.progress.done}/${primary.progress.total}`);
    if (tools.length > 1) parts.push(`+${tools.length - 1}`);
  }

  return parts.join(' ');
}

export function formatDispatchProgressLine(state) {
  const progress = normalizeProgressCounts(state?.latestDispatch?.jobProgress);
  if (!progress) return '';
  return [
    'Dispatch Progress:',
    `jobs total=${progress.total}`,
    `done=${progress.done}`,
    `running=${progress.running}`,
    `blocked=${progress.blocked}`,
    `queued=${progress.queued}`,
    `completion=${formatCompletionPercent(progress.completionRatio)}`,
  ].join(' ');
}

export function formatToolProgressLine(state) {
  const toolProgress = Array.isArray(state?.latestDispatch?.toolProgress)
    ? state.latestDispatch.toolProgress
    : [];
  const normalized = toolProgress
    .map((item) => ({
      tool: normalizeText(item?.tool),
      progress: normalizeProgressCounts(item),
    }))
    .filter((item) => item.tool && item.progress);
  if (normalized.length === 0) return '';

  const top = normalized.slice(0, 3).map((item) =>
    `${item.tool} ${item.progress.done}/${item.progress.total} (r=${item.progress.running} b=${item.progress.blocked} q=${item.progress.queued})`
  );
  if (normalized.length > 3) {
    top.push(`+${normalized.length - 3} more`);
  }
  return clipLine(`Tool Progress: ${top.join(' | ')}`, 220);
}

export function formatDispatchHindsightLine(state) {
  const hindsight = state?.dispatchHindsight && typeof state.dispatchHindsight === 'object'
    ? state.dispatchHindsight
    : null;
  if (!hindsight) return '';

  const pairs = Number.isFinite(hindsight.pairsAnalyzed) ? Math.max(0, Math.floor(hindsight.pairsAnalyzed)) : 0;
  if (pairs <= 0) return '';

  const comparedJobs = Number.isFinite(hindsight.comparedJobs) ? Math.max(0, Math.floor(hindsight.comparedJobs)) : 0;
  const repeatBlocked = Number.isFinite(hindsight.repeatedBlockedTurns) ? Math.max(0, Math.floor(hindsight.repeatedBlockedTurns)) : 0;
  const regressions = Number.isFinite(hindsight.regressions) ? Math.max(0, Math.floor(hindsight.regressions)) : 0;
  const resolved = Number.isFinite(hindsight.resolvedBlockedTurns) ? Math.max(0, Math.floor(hindsight.resolvedBlockedTurns)) : 0;
  const topFailures = Array.isArray(hindsight.topRepeatedFailureClasses) && hindsight.topRepeatedFailureClasses.length > 0
    ? hindsight.topRepeatedFailureClasses
      .slice(0, 3)
      .map((item) => `${normalizeText(item.failureClass) || 'unknown'}=${Number.isFinite(item.count) ? Math.max(0, Math.floor(item.count)) : 0}`)
      .join(', ')
    : 'none';
  const topJobs = Array.isArray(hindsight.topRepeatedJobs) && hindsight.topRepeatedJobs.length > 0
    ? hindsight.topRepeatedJobs
      .slice(0, 3)
      .map((item) => `${normalizeText(item.jobId) || 'unknown'}=${Number.isFinite(item.count) ? Math.max(0, Math.floor(item.count)) : 0}`)
      .join(', ')
    : 'none';

  return clipLine(
    `Dispatch Hindsight: pairs=${pairs} comparedJobs=${comparedJobs} repeatBlocked=${repeatBlocked} regressions=${regressions} resolved=${resolved} topFailures=${topFailures} topJobs=${topJobs}`,
    200
  );
}

export function formatDispatchFixHintLine(state) {
  const fixHint = state?.dispatchFixHint && typeof state.dispatchFixHint === 'object'
    ? state.dispatchFixHint
    : null;
  if (!fixHint) return '';

  const targetId = normalizeText(fixHint.targetId);
  if (!targetId) return '';
  const title = normalizeText(fixHint.title) || targetId;
  const evidence = normalizeText(fixHint.evidence);
  const nextCommand = normalizeText(fixHint.nextCommand);
  const suffixParts = [];
  if (evidence) suffixParts.push(`(${evidence})`);
  if (nextCommand) suffixParts.push(`Next: ${nextCommand}`);
  const suffix = suffixParts.length > 0 ? ` ${suffixParts.join(' ')}` : '';
  return clipLine(`FixHint: [${targetId}] ${title}${suffix}`, 200);
}

export function formatDispatchHindsightLessons(state) {
  const hindsight = state?.dispatchHindsight && typeof state.dispatchHindsight === 'object'
    ? state.dispatchHindsight
    : null;
  if (!hindsight) return [];

  const lessons = Array.isArray(hindsight.lessons) ? hindsight.lessons : [];
  if (lessons.length === 0) return [];

  const lines = ['Hindsight lessons:'];
  for (const lesson of lessons.slice(0, 3)) {
    const kind = normalizeText(lesson?.kind) || 'unknown';
    const jobId = normalizeText(lesson?.jobId) || 'unknown';
    const failureClass = normalizeText(lesson?.from?.failureClass) || 'unknown';
    const workItemRefs = Array.isArray(lesson?.workItemRefs)
      ? lesson.workItemRefs.map((ref) => normalizeText(ref)).filter(Boolean)
      : [];
    const wiLabel = workItemRefs.length > 0 ? ` wi=${workItemRefs.join(',')}` : '';
    const hint = normalizeText(lesson?.hint);
    lines.push(`- ${kind} job=${jobId} fail=${failureClass}${wiLabel}${hint ? `: ${clipLine(hint, 120)}` : ''}`);
  }
  return lines;
}

export function formatWorkItemsLine(state) {
  const totals = state?.latestDispatch?.workItems || null;
  if (!totals) return '';
  const parts = [];
  for (const key of ['total', 'queued', 'running', 'blocked', 'done']) {
    const value = totals[key];
    if (Number.isFinite(value)) parts.push(`${key}=${value}`);
  }
  return parts.length > 0 ? `WorkItems: ${parts.join(' ')}` : '';
}

export function formatBlockedJobs(state) {
  const blocked = Array.isArray(state?.latestDispatch?.blocked) ? state.latestDispatch.blocked : [];
  if (blocked.length === 0) return [];
  const lines = ['Blocked jobs:'];
  for (const job of blocked.slice(0, 10)) {
    const role = normalizeText(job.role) || 'unknown';
    const jobType = normalizeText(job.jobType) || 'unknown';
    const error = normalizeText(job.error);
    const failureClass = normalizeText(job.failureClass);
    const retryClass = normalizeText(job.retryClass);
    const failureLabel = failureClass ? ` fail=${failureClass}` : '';
    const retryLabel = retryClass ? ` retry=${retryClass}` : '';
    const workItemRefs = Array.isArray(job.workItemRefs) ? job.workItemRefs.map((ref) => normalizeText(ref)).filter(Boolean) : [];
    const wiLabel = workItemRefs.length > 0 ? ` wi=${workItemRefs.join(',')}` : '';
    const attempts = Number.isFinite(job.attempts) ? Math.max(0, Math.floor(job.attempts)) : 0;
    const attemptLabel = attempts > 0 ? ` a=${attempts}` : '';
    const turnId = normalizeText(job.turnId);
    const turnLabel = turnId ? ` turn=${clipLine(turnId, 90)}` : '';
    lines.push(`- ${job.jobId} (${role}/${jobType}${wiLabel}${attemptLabel}${failureLabel}${retryLabel})${turnLabel}${error ? `: ${clipLine(error, 120)}` : ''}`);
  }
  if (blocked.length > 10) {
    lines.push(`- +${blocked.length - 10} more`);
  }
  return lines;
}
