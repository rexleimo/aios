import { normalizeText } from './text.mjs';

export function detectSessionIdFromPlan(plan) {
  const overlay = plan?.learnEvalOverlay;
  const sessionId = normalizeText(overlay?.sourceSessionId || overlay?.sessionId || '');
  return sessionId || null;
}
