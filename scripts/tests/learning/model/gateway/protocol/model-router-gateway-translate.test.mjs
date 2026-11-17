import test from 'node:test';
import assert from 'node:assert/strict';

import {
  claudeToOpenAIChatRequest,
  claudeToOpenAIChatResponse,
  openAIChatToClaudeRequest,
  openAIChatToClaudeResponse,
} from '../../../../../lib/tooling/model-router/gateway/translate.mjs';

// 中文注释：夹具照抄真实 wire 信封（claude messages / openai chat.completion），不是按内层对象臆造。

const claudeRequest = {
  model: 'claude-sonnet-5',
  max_tokens: 1024,
  system: 'You are helpful.',
  messages: [
    { role: 'user', content: 'Read file a.txt' },
    { role: 'assistant', content: [
      { type: 'text', text: 'Reading.' },
      { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'a.txt' } },
    ] },
    { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'toolu_1', content: 'file contents' },
    ] },
  ],
  tools: [{ name: 'read_file', description: 'Read a file', input_schema: { type: 'object', properties: { path: { type: 'string' } } } }],
};

test('claude request → openai-chat: system, tool_use→tool_calls, tool_result→tool message, tools', () => {
  const openai = claudeToOpenAIChatRequest(claudeRequest);
  assert.equal(openai.model, 'claude-sonnet-5');
  assert.equal(openai.max_tokens, 1024);
  assert.equal(openai.messages[0].role, 'system');
  assert.equal(openai.messages[0].content, 'You are helpful.');
  const assistant = openai.messages.find((m) => m.role === 'assistant');
  assert.equal(assistant.tool_calls[0].function.name, 'read_file');
  assert.deepEqual(JSON.parse(assistant.tool_calls[0].function.arguments), { path: 'a.txt' });
  const toolMsg = openai.messages.find((m) => m.role === 'tool');
  assert.equal(toolMsg.tool_call_id, 'toolu_1');
  assert.equal(toolMsg.content, 'file contents');
  assert.equal(openai.tools[0].function.parameters.properties.path.type, 'string');
});

test('openai-chat response → claude: content + tool_calls + usage + stop_reason', () => {
  const openaiResponse = {
    id: 'chatcmpl-1',
    model: 'gpt-6.1-sol',
    choices: [{ message: { role: 'assistant', content: 'Done.', tool_calls: [{ id: 'call_1', function: { name: 'read_file', arguments: '{"path":"a.txt"}' } }] }, finish_reason: 'tool_calls' }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };
  const claude = openAIChatToClaudeResponse(openaiResponse, 'gpt-6.1-sol');
  assert.equal(claude.role, 'assistant');
  assert.equal(claude.stop_reason, 'tool_use');
  assert.equal(claude.content[0].text, 'Done.');
  assert.equal(claude.content[1].type, 'tool_use');
  assert.deepEqual(claude.content[1].input, { path: 'a.txt' });
  assert.equal(claude.usage.input_tokens, 10);
  assert.equal(claude.usage.output_tokens, 5);
});

test('round trip claude→openai→claude preserves tool call intent', () => {
  const openai = claudeToOpenAIChatRequest(claudeRequest);
  const back = openAIChatToClaudeRequest(openai);
  assert.equal(back.system, 'You are helpful.');
  const assistant = back.messages.find((m) => m.role === 'assistant');
  const toolUse = assistant.content.find((b) => b.type === 'tool_use');
  assert.equal(toolUse.name, 'read_file');
  assert.deepEqual(toolUse.input, { path: 'a.txt' });
  const toolResult = back.messages.flatMap((m) => Array.isArray(m.content) ? m.content : []).find((b) => b.type === 'tool_result');
  assert.equal(toolResult.tool_use_id, 'toolu_1');
  assert.equal(back.tools[0].input_schema.properties.path.type, 'string');
});

test('reverse response claude→openai preserves text and tool_calls', () => {
  const claudeResponse = {
    id: 'msg_1', model: 'claude-opus-5', stop_reason: 'tool_use',
    content: [{ type: 'text', text: 'hi' }, { type: 'tool_use', id: 't1', name: 'f', input: { x: 1 } }],
    usage: { input_tokens: 3, output_tokens: 4 },
  };
  const openai = claudeToOpenAIChatResponse(claudeResponse);
  assert.equal(openai.choices[0].finish_reason, 'tool_calls');
  assert.equal(openai.choices[0].message.content, 'hi');
  assert.deepEqual(JSON.parse(openai.choices[0].message.tool_calls[0].function.arguments), { x: 1 });
  assert.equal(openai.usage.prompt_tokens, 3);
});

test('plain text round trip without tools stays clean', () => {
  const simple = { model: 'claude-sonnet-5', max_tokens: 100, messages: [{ role: 'user', content: 'hello' }] };
  const openai = claudeToOpenAIChatRequest(simple);
  assert.equal(openai.messages.length, 1);
  assert.equal(openai.messages[0].content, 'hello');
  assert.equal(openai.tools, undefined);
  const back = openAIChatToClaudeRequest(openai);
  assert.equal(back.messages[0].content, 'hello');
});
