import { normalizeStringArray, normalizeText } from './shared.mjs';

export const QUALITY_GATE_EVENT_KIND = 'verification.quality-gate';

export function normalizeQualityGateEvent(rawEvent = null) {
  if (!rawEvent || typeof rawEvent !== 'object') return null;
  if (normalizeText(rawEvent.kind) !== QUALITY_GATE_EVENT_KIND) return null;
  const turn = rawEvent.turn && typeof rawEvent.turn === 'object' ? rawEvent.turn : null;
  if (!turn) return null;
  const nextStateRefs = normalizeStringArray(turn.nextStateRefs);
  const categoryRef = nextStateRefs.find((item) => item.startsWith('category:')) || '';
  const failureCategory = categoryRef.startsWith('category:') ? categoryRef.slice('category:'.length) : '';
  return {
    kind: QUALITY_GATE_EVENT_KIND,
    eventId: normalizeText(rawEvent.id),
    seq: Number.isFinite(rawEvent.seq) ? Math.max(0, Math.floor(rawEvent.seq)) : 0,
    ts: normalizeText(rawEvent.ts),
    turnId: normalizeText(turn.turnId),
    outcome: normalizeText(turn.outcome),
    environment: normalizeText(turn.environment),
    nextStateRefs,
    categoryRef,
    failureCategory,
  };
}
