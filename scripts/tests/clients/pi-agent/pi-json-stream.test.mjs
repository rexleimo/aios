import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePiJsonStream } from '../../../lib/clients/pi/json-stream.mjs';

const HEADER = { type: 'session', version: 3, id: 'sess-1', timestamp: '2026-10-30T00:00:00.000Z', cwd: '/repo' };

function jsonl(records) {
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

test('parsePiJsonStream reads header, final assistant text, and settle state', () => {
  const raw = jsonl([
    HEADER,
    { type: 'agent_start' },
    { type: 'turn_start' },
    { type: 'message_start', message: { role: 'user', content: 'hi' } },
    { type: 'message_end', message: { role: 'user', content: 'hi' } },
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        model: 'openai/gpt-5',
        stopReason: 'stop',
        content: [{ type: 'text', text: 'first' }],
      },
    },
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        model: 'openai/gpt-5',
        stopReason: 'stop',
        usage: { input: 10, output: 5, totalTokens: 15, cost: { total: 0.01 } },
        content: [{ type: 'text', text: 'final answer' }],
      },
    },
    { type: 'agent_settled', aborted: false },
  ]);

  const parsed = parsePiJsonStream(raw);
  assert.equal(parsed.kind, 'aios.pi-json-stream.v1');
  assert.equal(parsed.sessionId, 'sess-1');
  assert.equal(parsed.sessionVersion, 3);
  assert.equal(parsed.assistantText, 'final answer', 'last assistant message wins');
  assert.equal(parsed.model, 'openai/gpt-5');
  assert.equal(parsed.usage.totalTokens, 15);
  assert.equal(parsed.sawSettle, true);
  assert.equal(parsed.aborted, false);
  assert.equal(parsed.unparsedLineCount, 0);
});

test('parsePiJsonStream concatenates text blocks and records tool calls', () => {
  const raw = jsonl([
    HEADER,
    {
      type: 'turn_end',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'part one ' },
          { type: 'toolCall', name: 'bash' },
          { type: 'text', text: 'part two' },
        ],
      },
      toolResults: [],
    },
    { type: 'agent_settled', aborted: true },
  ]);
  const parsed = parsePiJsonStream(raw);
  assert.equal(parsed.assistantText, 'part one part two');
  assert.deepEqual(parsed.toolCalls, ['bash']);
  assert.equal(parsed.aborted, true);
});

test('parsePiJsonStream degrades on a truncated or noisy stream instead of throwing', () => {
  const raw = [
    JSON.stringify(HEADER),
    'not json at all',
    '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"partial',
    JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } }),
    '',
  ].join('\n');

  const parsed = parsePiJsonStream(raw);
  assert.equal(parsed.assistantText, 'ok');
  assert.equal(parsed.unparsedLineCount, 2);
  assert.equal(parsed.sawSettle, false);
});

test('parsePiJsonStream returns empty text (never a throw) when there is no assistant message', () => {
  const parsed = parsePiJsonStream('Error loading config.toml: duplicate key\n');
  assert.equal(parsed.assistantText, '');
  assert.equal(parsed.recordCount, 0);
  assert.equal(parsed.unparsedLineCount, 1);
  assert.equal(parsePiJsonStream('').assistantText, '');
  assert.equal(parsePiJsonStream(undefined).assistantText, '');
});

test('parsePiJsonStream surfaces provider errors and retry count', () => {
  // 实测样本（2026-10-30）：provider 不可达时 pi 只回空内容 + stopReason=error。
  const raw = jsonl([
    HEADER,
    { type: 'agent_start' },
    { type: 'turn_start' },
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        model: 'workbuddy/hy3',
        provider: 'magpie',
        content: [],
        stopReason: 'error',
        errorMessage: 'Connection error.',
      },
    },
    { type: 'turn_end', message: { role: 'assistant', content: [] }, toolResults: [] },
    { type: 'agent_end', messages: [], willRetry: true },
    { type: 'auto_retry_start' },
    { type: 'agent_settled', aborted: false },
  ]);
  const parsed = parsePiJsonStream(raw);
  assert.equal(parsed.assistantText, '');
  assert.equal(parsed.stopReason, 'error');
  assert.equal(parsed.errorMessage, 'Connection error.');
  assert.equal(parsed.retryCount, 1);
  assert.equal(parsed.sawSettle, true);
});
