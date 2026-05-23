import { normalizeText } from './shared.mjs';

export function formatMinimalQualityLabel(state) {
  const qualityGate = state?.latestQualityGate && typeof state.latestQualityGate === 'object'
    ? state.latestQualityGate
    : null;
  if (!qualityGate) return '';

  const outcome = normalizeText(qualityGate.outcome).toLowerCase();
  const categoryRef = normalizeText(qualityGate.categoryRef);
  const outcomeLabel = outcome === 'retry-needed'
    ? 'failed'
    : outcome === 'success'
      ? 'ok'
      : outcome;

  if (!outcomeLabel || outcomeLabel === 'ok') {
    return '';
  }

  if (categoryRef) {
    return `quality=${outcomeLabel}(${categoryRef})`;
  }

  return `quality=${outcomeLabel}`;
}

export function formatQualityGateLine(state) {
  const qualityGate = state?.latestQualityGate && typeof state.latestQualityGate === 'object'
    ? state.latestQualityGate
    : null;
  if (!qualityGate) return '';

  const outcomeRaw = normalizeText(qualityGate.outcome).toLowerCase();
  const outcomeLabel = outcomeRaw === 'retry-needed'
    ? 'failed'
    : outcomeRaw === 'success'
      ? 'ok'
      : outcomeRaw;
  if (!outcomeLabel) return '';

  const failureCategory = normalizeText(qualityGate.failureCategory);
  const categoryRef = normalizeText(qualityGate.categoryRef).replace(/^category:/, '');
  const category = failureCategory || categoryRef;
  return category
    ? `Quality: ${outcomeLabel} (${category})`
    : `Quality: ${outcomeLabel}`;
}
