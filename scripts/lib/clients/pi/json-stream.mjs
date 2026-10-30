// scripts/lib/clients/pi/json-stream.mjs
//
// Pi `--mode json` emits strict JSONL: one `session` header, then session events,
// ending with `agent_settled`. AIOS uses that mode because it carries facts the
// text mode throws away (final assistant text, tool calls, usage, stop reason).
//
// Boundary: this module is pure. It never spawns, never reads env, never writes.
// Callers pass raw stdout; a malformed or truncated stream degrades to "no text"
// instead of throwing, so a broken stream can never take a worker turn down.

/**
 * Split JSONL on LF only. Pi's framing is LF-terminated and Unicode line
 * separators are legal inside strings, so `splitlines`-style handling is wrong.
 */
function splitJsonLines(raw = '') {
  return String(raw)
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim().length > 0);
}

function parseRecord(line) {
  try {
    const value = JSON.parse(line);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function messageText(message) {
  if (!message || typeof message !== 'object') return '';
  const content = message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block && typeof block === 'object' && (block.type === 'text' || typeof block.text === 'string'))
    .map((block) => String(block.text || ''))
    .join('');
}

function collectToolCalls(message) {
  if (!message || typeof message !== 'object' || !Array.isArray(message.content)) return [];
  return message.content
    .filter((block) => block && typeof block === 'object' && (block.type === 'toolCall' || block.type === 'tool_use'))
    .map((block) => String(block.name || block.toolName || 'unknown'));
}

/**
 * Pure: raw JSONL -> structured facts.
 *
 * `assistantText` is the last assistant message body (the authoritative final
 * answer: `message_end` is authoritative per Pi's docs; deltas are not).
 */
export function parsePiJsonStream(raw = '') {
  const records = [];
  const unparsedLines = [];
  for (const line of splitJsonLines(raw)) {
    const record = parseRecord(line);
    if (record) records.push(record);
    else unparsedLines.push(line);
  }

  const header = records.find((record) => record.type === 'session') || null;
  let assistantText = '';
  let usage = null;
  let stopReason = '';
  let model = '';
  let errorMessage = '';
  let retryCount = 0;
  const toolCalls = [];

  for (const record of records) {
    if (record.type === 'auto_retry_start') retryCount += 1;
    const message = record?.message;
    if (!message || typeof message !== 'object') continue;
    if (message.role !== 'assistant') continue;

    if (record.type === 'message_end' || record.type === 'turn_end') {
      const text = messageText(message);
      if (text) assistantText = text;
      toolCalls.push(...collectToolCalls(message));
      if (message.usage) usage = message.usage;
      if (message.stopReason) stopReason = String(message.stopReason);
      if (message.model) model = String(message.model);
      if (message.errorMessage) errorMessage = String(message.errorMessage);
    }
  }

  const settled = records.find((record) => record.type === 'agent_settled') || null;
  return {
    kind: 'aios.pi-json-stream.v1',
    sessionId: header?.id ? String(header.id) : '',
    sessionVersion: header?.version ?? null,
    recordCount: records.length,
    unparsedLineCount: unparsedLines.length,
    assistantText,
    toolCalls,
    usage,
    model,
    stopReason,
    errorMessage,
    retryCount,
    aborted: settled?.aborted === true,
    sawSettle: settled !== null,
  };
}
