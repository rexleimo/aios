import { clipLine, normalizeText } from './shared.mjs';

export function formatTelemetry(telemetry = null) {
  if (!telemetry || typeof telemetry !== 'object') return '';
  const parts = [];
  const verification = telemetry.verification && typeof telemetry.verification === 'object'
    ? telemetry.verification
    : null;
  if (verification?.result) {
    parts.push(`verify=${normalizeText(verification.result)}`);
  }
  if (Number.isFinite(telemetry.retryCount)) {
    parts.push(`retries=${Math.max(0, Math.floor(telemetry.retryCount))}`);
  }
  if (telemetry.failureCategory) {
    parts.push(`fail=${normalizeText(telemetry.failureCategory)}`);
  }
  if (Number.isFinite(telemetry.elapsedMs)) {
    parts.push(`elapsedMs=${Math.max(0, Math.floor(telemetry.elapsedMs))}`);
  }
  const cost = telemetry.cost && typeof telemetry.cost === 'object' ? telemetry.cost : null;
  if (cost) {
    const tokenPart = Number.isFinite(cost.totalTokens) && cost.totalTokens > 0
      ? `tokens=${Math.max(0, Math.floor(cost.totalTokens))}`
      : '';
    const usdPart = Number.isFinite(cost.usd) && cost.usd > 0
      ? `usd=${Number(cost.usd).toFixed(4)}`
      : '';
    const costParts = [tokenPart, usdPart].filter(Boolean);
    if (costParts.length > 0) {
      parts.push(`cost(${costParts.join(' ')})`);
    }
  }
  return parts.join(' ');
}

export function formatSessionLine(state) {
  const session = state?.session || null;
  const selection = state?.selection || {};
  const sessionId = normalizeText(selection.sessionId || session?.sessionId);
  const agent = normalizeText(selection.agent || session?.agent);
  const provider = normalizeText(selection.provider);
  const status = normalizeText(session?.status);
  const updatedAt = normalizeText(session?.updatedAt);
  const bits = [
    sessionId ? `session=${sessionId}` : '',
    provider ? `provider=${provider}` : '',
    agent ? `agent=${agent}` : '',
    status ? `status=${status}` : '',
    updatedAt ? `updatedAt=${updatedAt}` : '',
  ].filter(Boolean);
  return bits.length > 0 ? bits.join(' | ') : '(no session selected)';
}

export function formatCheckpointLine(state) {
  const checkpoint = state?.latestCheckpoint || null;
  if (!checkpoint) return 'Checkpoint: (none)';
  const seq = Number.isFinite(checkpoint.seq) ? `#${checkpoint.seq}` : '';
  const status = normalizeText(checkpoint.status);
  const summary = clipLine(checkpoint.summary, 120);
  const telemetry = formatTelemetry(checkpoint.telemetry);
  const bits = [
    'Checkpoint:',
    seq,
    status,
    telemetry ? `[${telemetry}]` : '',
    summary ? `- ${summary}` : '',
  ].filter(Boolean);
  return bits.join(' ');
}
