/**
 * Recall budget control — pure functions for character-based truncation.
 * No LLM calls, no external dependencies.
 */

/**
 * Truncate text to a max character budget, appending "…" if truncated.
 * @param {string} text - The text to truncate.
 * @param {number} maxChars - Maximum character budget (Infinity = no truncation).
 * @returns {string} Truncated text with "…" suffix if cut short.
 */
export function truncateToCharBudget(text, maxChars) {
  if (!Number.isFinite(maxChars) || maxChars <= 0) return String(text || '');
  const str = String(text || '');
  if (str.length <= maxChars) return str;
  return `${str.slice(0, maxChars)}…`;
}

/**
 * Apply recall budget to an array of scored events.
 * Sorts by score descending, truncates each event's text field to
 * maxCharsPerMemory, then accumulates events until maxTotalChars is reached.
 *
 * @param {Array<Object>} events - Events with `text` and `matchScore` fields.
 * @param {{ maxCharsPerMemory?: number, maxTotalChars?: number }} budget
 * @returns {Array<Object>} Budget-constrained events (shallow copies with truncated text).
 */
export function applyRecallBudget(events, { maxCharsPerMemory = Infinity, maxTotalChars = Infinity } = {}) {
  if (!Array.isArray(events) || events.length === 0) return [];

  // Sort by score descending (stable sort preserves original order for equal scores)
  const sorted = [...events].sort((a, b) => {
    const scoreCompare = Number(b.matchScore || 0) - Number(a.matchScore || 0);
    if (scoreCompare !== 0) return scoreCompare;
    return String(b.ts || '').localeCompare(String(a.ts || ''));
  });

  // Truncate each event's text to per-memory budget
  const truncated = sorted.map((event) => ({
    ...event,
    text: truncateToCharBudget(event.text || '', maxCharsPerMemory),
  }));

  // Accumulate until total character budget is reached
  if (!Number.isFinite(maxTotalChars) || maxTotalChars <= 0) return truncated;

  const result = [];
  let totalChars = 0;
  for (const event of truncated) {
    const eventTextLen = String(event.text || '').length;
    if (totalChars + eventTextLen > maxTotalChars && result.length > 0) {
      // Skip this event — it would exceed the total budget
      break;
    }
    result.push(event);
    totalChars += eventTextLen;
  }
  return result;
}
