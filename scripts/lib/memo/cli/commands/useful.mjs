import { markMemoUseful } from '../../autopilot.mjs';
import { safePrintText, usageError } from '../shared.mjs';

// Explicit adoption mark for recalled memos: `memo useful <eventId...>`.
// Complements the automatic impression trail written by turn recall; search
// boosts useful events and decays impressions that never get one.
export async function handleMemoUsefulCommand({
  secondary,
  rest,
  workspaceRoot,
  io,
}) {
  const eventIds = [secondary, ...rest].map((id) => String(id || '').trim()).filter(Boolean);
  if (eventIds.length === 0) throw usageError('Usage: memo useful <eventId> [moreEventIds...]');
  const result = await markMemoUseful({
    workspaceRoot,
    eventIds,
  });
  if (result.status !== 'recorded') {
    throw usageError(`memo useful failed: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
  }
  safePrintText(io, `Recorded useful marks for ${result.recorded} event(s).`);
  return true;
}
