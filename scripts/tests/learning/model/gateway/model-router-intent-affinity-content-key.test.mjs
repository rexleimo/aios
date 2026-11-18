import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { createRoutingAffinity } from '../../../../lib/tooling/model-router/gateway/compatibility/affinity.mjs';

describe('affinity content-derived session key', () => {
  const affinity = createRoutingAffinity({});

  const request = (protocol, sessionId, body) =>
    affinity({ protocol, client: 'claude', role: 'default', sessionId, body });

  it('derives a stable key from the OpenAI chat user message', () => {
    const first = request('openai-chat', null, { messages: [{ role: 'user', content: 'hello world' }] });
    const second = request('openai-chat', null, { messages: [{ role: 'user', content: 'hello world' }] });
    assert.ok(first.intentSessionKey);
    assert.equal(first.intentSessionKey, second.intentSessionKey);
    assert.equal(first.sessionKey, null, 'group affinity stays header-only');
  });

  it('derives different keys for different user messages', () => {
    const a = request('openai-chat', null, { messages: [{ role: 'user', content: 'task A' }] });
    const b = request('openai-chat', null, { messages: [{ role: 'user', content: 'task B' }] });
    assert.notEqual(a.intentSessionKey, b.intentSessionKey);
  });

  it('uses the first user message so tool continuations keep the same key', () => {
    const initial = request('claude', null, { messages: [{ role: 'user', content: 'run tests' }] });
    const toolRound = request('claude', null, {
      messages: [
        { role: 'user', content: 'run tests' },
        { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'x', input: {} }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'done' }] },
      ],
    });
    assert.ok(initial.intentSessionKey);
    assert.equal(toolRound.intentSessionKey, initial.intentSessionKey, 'the task text is stable across tool rounds');
  });

  it('ignores tool_result blocks and multi-modal blocks when deriving the key', () => {
    const textOnly = request('claude', null, { messages: [{ role: 'user', content: 'inspect this' }] });
    const withImage = request('claude', null, {
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
        { type: 'text', text: 'inspect this' },
      ] }],
    });
    assert.equal(withImage.intentSessionKey, textOnly.intentSessionKey);
  });

  it('returns null when there is no user text message', () => {
    const onlySystem = request('openai-chat', null, { messages: [{ role: 'system', content: 'be helpful' }] });
    assert.equal(onlySystem.intentSessionKey, null);
    const onlyToolResult = request('claude', null, {
      messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'done' }] }],
    });
    assert.equal(onlyToolResult.intentSessionKey, null);
  });

  it('prefers an explicit session header over the content key', () => {
    const body = { messages: [{ role: 'user', content: 'hello' }] };
    const explicit = request('openai-chat', 'explicit-123', body);
    const derived = request('openai-chat', null, body);
    assert.ok(explicit.intentSessionKey.includes('explicit-123'));
    assert.ok(derived.intentSessionKey);
    assert.ok(!derived.intentSessionKey.includes('explicit-123'));
  });

  it('returns null for protocols without content derivation support', () => {
    const unsupported = request('openai-response', null, { input: [{ role: 'user', content: 'hello' }] });
    assert.equal(unsupported.intentSessionKey, null);
  });
});
