import { normalizeText } from './shared.mjs';

export function formatMinimalWatchdogLabel(state) {
  const watchdog = state?.watchdog && typeof state.watchdog === 'object'
    ? state.watchdog
    : null;
  if (!watchdog) return '';
  const readiness = watchdog.readiness && typeof watchdog.readiness === 'object'
    ? watchdog.readiness
    : null;
  const verdict = normalizeText(readiness?.verdict);
  return verdict ? `readiness=${verdict}` : '';
}

export function formatWatchdogLine(state) {
  const watchdog = state?.watchdog && typeof state.watchdog === 'object'
    ? state.watchdog
    : null;
  if (!watchdog) return '';
  const readiness = watchdog.readiness && typeof watchdog.readiness === 'object'
    ? watchdog.readiness
    : null;
  const verdict = normalizeText(readiness?.verdict);
  const decision = normalizeText(watchdog.decision);
  const bits = [
    'Watchdog:',
    decision ? `decision=${decision}` : '',
    verdict ? `readiness=${verdict}` : '',
  ].filter(Boolean);
  return bits.length > 1 ? bits.join(' ') : '';
}

export function formatWatchMetaLine(watchMeta = null) {
  if (!watchMeta || typeof watchMeta !== 'object') return '';
  const renderIntervalMs = Number.isFinite(watchMeta.renderIntervalMs)
    ? Math.max(1, Math.floor(watchMeta.renderIntervalMs))
    : null;
  const renderIntervalLabel = normalizeText(watchMeta.renderIntervalLabel);
  const dataRefreshMs = Number.isFinite(watchMeta.dataRefreshMs)
    ? Math.max(1, Math.floor(watchMeta.dataRefreshMs))
    : null;
  const dataRefreshLabel = normalizeText(watchMeta.dataRefreshLabel);
  const resolvedRenderLabel = renderIntervalLabel || (renderIntervalMs ? `${renderIntervalMs}ms` : '');
  const resolvedDataRefreshLabel = dataRefreshLabel || (dataRefreshMs ? `${dataRefreshMs}ms` : '');
  if (!resolvedRenderLabel || !resolvedDataRefreshLabel) return '';
  const fastEnabled = watchMeta.fast === true ? 'on' : 'off';
  const dataAgeMs = Number.isFinite(watchMeta.dataAgeMs)
    ? `${Math.max(0, Math.floor(watchMeta.dataAgeMs))}ms`
    : 'n/a';
  const stalledEnabled = watchMeta.stalled === true;
  const stalledForMs = Number.isFinite(watchMeta.stalledForMs)
    ? Math.max(0, Math.floor(watchMeta.stalledForMs))
    : 0;
  const stalledThresholdMs = Number.isFinite(watchMeta.stalledThresholdMs)
    ? Math.max(1, Math.floor(watchMeta.stalledThresholdMs))
    : 0;
  const stalledToolSummary = normalizeText(watchMeta.stalledToolSummary);
  const stalledLabel = stalledEnabled
    ? ` stalled=on(${stalledForMs}ms>=${stalledThresholdMs}ms${stalledToolSummary ? ` tools=${stalledToolSummary}` : ''})`
    : '';
  return `watch: render=${resolvedRenderLabel} data-refresh=${resolvedDataRefreshLabel} fast=${fastEnabled} data-age=${dataAgeMs}${stalledLabel}`;
}
