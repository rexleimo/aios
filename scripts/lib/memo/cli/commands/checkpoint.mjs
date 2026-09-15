import { appendPinnedMemo } from '../../storage/pinned.mjs';
import { usageError } from '../shared.mjs';

// Mirrors the memory_checkpoint MCP tool: one locked read-modify-write
// append carrying the [checkpoint] prefix, so CLI callers and MCP callers
// land identical bytes in the pinned workspace-memory recall surface.
export async function handleMemoCheckpointCommand({ secondary = '', rest = [], workspaceRoot, io }) {
  const text = [secondary, ...rest].filter((part) => part !== undefined).join(' ').trim();
  if (!text) throw usageError('Usage: memo checkpoint "<durable takeaway>"');
  await appendPinnedMemo(workspaceRoot, { content: `[checkpoint] ${text}` });
  io.log('Checkpoint pinned to workspace memory.');
  return true;
}
