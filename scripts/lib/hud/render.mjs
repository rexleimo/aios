import { clipLine, normalizeText } from './render/shared.mjs';
import { formatCheckpointLine, formatSessionLine } from './render/telemetry.mjs';
import { formatHarnessLine } from './render/harness.mjs';
import {
  formatBlockedJobs,
  formatDispatchFixHintLine,
  formatDispatchHindsightLessons,
  formatDispatchHindsightLine,
  formatDispatchInsightsLine,
  formatDispatchLine,
  formatDispatchProgressLine,
  formatMinimalDispatchProgressLabel,
  formatToolProgressLine,
  formatWorkItemsLine,
} from './render/dispatch.mjs';
import { formatMinimalWatchdogLabel, formatWatchdogLine, formatWatchMetaLine } from './render/watchdog.mjs';
import { formatMinimalQualityLabel, formatQualityGateLine } from './render/quality.mjs';
import { formatMinimalSkillCandidateLabel, formatSkillCandidateLine } from './render/skill-candidate.mjs';
import { formatSuggestedCommands, formatWarnings } from './render/messages.mjs';

export function normalizeHudPreset(raw = 'focused') {
  const value = normalizeText(raw).toLowerCase();
  if (value === 'minimal' || value === 'focused' || value === 'full') return value;
  return 'focused';
}

export function renderHud(state, { preset = 'focused', watchMeta = null } = {}) {
  const resolvedPreset = normalizeHudPreset(preset);
  const resolvedWatchMeta = watchMeta || state?.watchMeta || null;
  const watchLine = formatWatchMetaLine(resolvedWatchMeta);

  if (resolvedPreset === 'minimal') {
    const sessionLine = formatSessionLine(state);
    const dispatch = state?.latestDispatch || null;
    const dispatchLabel = dispatch ? (dispatch.ok === true ? 'dispatch=ok' : `dispatch=blocked(${dispatch.blockedJobs || 0})`) : 'dispatch=none';
    const harnessLine = formatHarnessLine(state);
    const dispatchProgressLabel = formatMinimalDispatchProgressLabel(state);
    const qualityLabel = formatMinimalQualityLabel(state);
    const skillCandidateLabel = formatMinimalSkillCandidateLabel(state);
    const watchdogLabel = formatMinimalWatchdogLabel(state);
    const insights = dispatch?.dispatchInsights && typeof dispatch.dispatchInsights === 'object'
      ? dispatch.dispatchInsights
      : null;
    const insightsLabel = insights && insights.status && insights.status !== 'clear'
      ? `insights=${normalizeText(insights.status)}(${Number.isFinite(insights.score) ? Math.max(0, Math.floor(insights.score)) : 0})`
      : '';
    const statusLine = [
      harnessLine,
      dispatchLabel,
      insightsLabel,
      dispatchProgressLabel,
      qualityLabel,
      skillCandidateLabel,
      watchdogLabel,
    ].filter(Boolean).join(' ');
    return watchLine
      ? `${sessionLine}\n${statusLine}\n${watchLine}\n`
      : `${sessionLine}\n${statusLine}\n`;
  }

  const lines = [
    `AIOS HUD (${resolvedPreset})`,
    formatSessionLine(state),
    ...(watchLine ? [watchLine] : []),
    '',
    `Goal: ${clipLine(state?.session?.goal, 200) || '(none)'}`,
    formatCheckpointLine(state),
    formatHarnessLine(state),
    formatDispatchLine(state),
    formatDispatchInsightsLine(state),
    formatWatchdogLine(state),
  ];

  const dispatchProgressLine = formatDispatchProgressLine(state);
  if (dispatchProgressLine) {
    lines.push(dispatchProgressLine);
  }
  const toolProgressLine = formatToolProgressLine(state);
  if (toolProgressLine) {
    lines.push(toolProgressLine);
  }

  const qualityGateLine = formatQualityGateLine(state);
  if (qualityGateLine) {
    lines.push(qualityGateLine);
  }

  const hindsight = formatDispatchHindsightLine(state);
  if (hindsight) {
    lines.push(hindsight);
  }
  const fixHint = formatDispatchFixHintLine(state);
  if (fixHint) {
    lines.push(fixHint);
  }
  const skillCandidate = formatSkillCandidateLine(state);
  if (skillCandidate) {
    lines.push(skillCandidate);
  }

  const workItems = formatWorkItemsLine(state);
  if (workItems) {
    lines.push(workItems);
  }

  if (resolvedPreset === 'full') {
    lines.push('');
    lines.push(...formatBlockedJobs(state));
    const lessons = formatDispatchHindsightLessons(state);
    if (lessons.length > 0) {
      lines.push('');
      lines.push(...lessons);
    }
  }

  const warnings = formatWarnings(state);
  if (warnings.length > 0) {
    lines.push('');
    lines.push(...warnings);
  }

  const next = formatSuggestedCommands(state);
  if (next.length > 0) {
    lines.push('');
    lines.push(...next);
  }

  return lines.join('\n').trimEnd() + '\n';
}
