import test from 'node:test';
import assert from 'node:assert/strict';

import { createRoutingGatewayApp } from '../../../../../lib/tooling/model-router/gateway/compatibility/proxy.mjs';

const PROTOCOLS = ['claude', 'openai-response', 'openai-chat', 'gemini'];
const UPSTREAM_MODEL = 'vendor/model x';
const SYSTEM = 'Use the file tool when necessary.';
const PROMPT = 'Read the fixture file.';
const TEXT = 'Reading the file.';
const TOOL = 'read_file';
const ARGS = { path: 'src/matrix.txt', limit: 2 };
const ARGUMENTS = JSON.stringify(ARGS);
const ARGUMENT_DELTAS = [ARGUMENTS.slice(0, 13), ARGUMENTS.slice(13)];
const SCHEMA = {
  type: 'object',
  properties: { path: { type: 'string' }, limit: { type: 'integer' } },
  required: ['path'],
};
const CREATED_AT = 1_700_000_000;

function entrypoint(protocol, stream = false, version = 'v1') {
  if (protocol === 'claude') return '/v1/messages';
  if (protocol === 'openai-response') return '/v1/responses';
  if (protocol === 'openai-chat') return '/v1/chat/completions';
  return `/${version}/models/client-model:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
}

function requestBody(protocol, stream = false) {
  if (protocol === 'claude') return {
    model: 'client-model', stream, max_tokens: 128, system: SYSTEM,
    messages: [{ role: 'user', content: PROMPT }],
    tools: [{ name: TOOL, description: 'Read a file', input_schema: SCHEMA }],
  };
  if (protocol === 'openai-response') return {
    model: 'client-model', stream, max_output_tokens: 128, instructions: SYSTEM, store: false,
    input: [{ role: 'user', content: [{ type: 'input_text', text: PROMPT }] }],
    tools: [{ type: 'function', name: TOOL, description: 'Read a file', parameters: SCHEMA, strict: false }],
  };
  if (protocol === 'openai-chat') return {
    model: 'client-model', stream, max_tokens: 128,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: PROMPT }],
    tools: [{ type: 'function', function: { name: TOOL, description: 'Read a file', parameters: SCHEMA } }],
  };
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: PROMPT }] }],
    generationConfig: { maxOutputTokens: 128 },
    tools: [{ functionDeclarations: [{ name: TOOL, description: 'Read a file', parameters: SCHEMA }] }],
  };
}

function jsonFixture(protocol) {
  if (protocol === 'claude') return {
    id: 'msg_fixture', type: 'message', role: 'assistant', model: UPSTREAM_MODEL,
    content: [{ type: 'text', text: TEXT }, { type: 'tool_use', id: 'call_fixture', name: TOOL, input: ARGS }],
    stop_reason: 'tool_use', stop_sequence: null,
    usage: { input_tokens: 11, output_tokens: 7 },
  };
  if (protocol === 'openai-chat') return {
    id: 'chatcmpl_fixture', object: 'chat.completion', created: CREATED_AT, model: UPSTREAM_MODEL,
    choices: [{ index: 0, message: {
      role: 'assistant', content: TEXT,
      tool_calls: [{ id: 'call_fixture', type: 'function', function: { name: TOOL, arguments: ARGUMENTS } }],
    }, finish_reason: 'tool_calls' }],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
  };
  if (protocol === 'openai-response') return {
    id: 'resp_fixture', object: 'response', created_at: CREATED_AT, model: UPSTREAM_MODEL,
    status: 'completed', error: null, incomplete_details: null,
    output: [
      { id: 'msg_fixture', type: 'message', status: 'completed', role: 'assistant',
        content: [{ type: 'output_text', text: TEXT, annotations: [] }] },
      { id: 'fc_fixture', type: 'function_call', status: 'completed',
        call_id: 'call_fixture', name: TOOL, arguments: ARGUMENTS },
    ],
    usage: { input_tokens: 11, input_tokens_details: { cached_tokens: 0 }, output_tokens: 7,
      output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 18 },
  };
  return {
    responseId: 'gemini_fixture', modelVersion: UPSTREAM_MODEL,
    candidates: [{ index: 0, content: { role: 'model', parts: [
      { text: TEXT }, { functionCall: { id: 'call_fixture', name: TOOL, args: ARGS } },
    ] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 },
  };
}

function event(data, name = '') {
  return `${name ? `event: ${name}\r\n` : ''}data: ${JSON.stringify(data)}\r\n\r\n`;
}

function sseFixture(protocol) {
  const full = jsonFixture(protocol);
  if (protocol === 'openai-chat') {
    const chunk = (delta, finishReason = null) => ({
      id: full.id, object: 'chat.completion.chunk', created: CREATED_AT, model: UPSTREAM_MODEL,
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    });
    return [
      event(chunk({ role: 'assistant', content: '' })),
      event(chunk({ content: 'Reading ' })),
      event(chunk({ content: 'the file.' })),
      event(chunk({ tool_calls: [{ index: 0, id: 'call_fixture', type: 'function', function: { name: TOOL, arguments: '' } }] })),
      ...ARGUMENT_DELTAS.map(argumentsDelta => event(chunk({ tool_calls: [{ index: 0, function: { arguments: argumentsDelta } }] }))),
      event(chunk({}, 'tool_calls')),
      event({ id: full.id, object: 'chat.completion.chunk', created: CREATED_AT, model: UPSTREAM_MODEL, choices: [], usage: full.usage }),
      'data: [DONE]\r\n\r\n',
    ].join('');
  }
  if (protocol === 'claude') {
    const named = data => event(data, data.type);
    return [
      named({ type: 'message_start', message: { ...full, content: [], stop_reason: null,
        usage: { input_tokens: 11, output_tokens: 0 } } }),
      named({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      named({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Reading ' } }),
      named({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'the file.' } }),
      named({ type: 'content_block_stop', index: 0 }),
      named({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'call_fixture', name: TOOL, input: {} } }),
      ...ARGUMENT_DELTAS.map(partial_json => named({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json } })),
      named({ type: 'content_block_stop', index: 1 }),
      named({ type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 7 } }),
      named({ type: 'message_stop' }),
    ].join('');
  }
  if (protocol === 'openai-response') {
    let sequence = 0;
    const named = (type, fields) => event({ type, sequence_number: sequence++, ...fields }, type);
    const message = full.output[0];
    const call = full.output[1];
    const textLocation = { item_id: message.id, output_index: 0, content_index: 0 };
    const callLocation = { item_id: call.id, output_index: 1 };
    const pending = { ...full, status: 'in_progress', output: [], usage: null };
    return [
      named('response.created', { response: pending }),
      named('response.in_progress', { response: pending }),
      named('response.output_item.added', { output_index: 0, item: { ...message, status: 'in_progress', content: [] } }),
      named('response.content_part.added', { ...textLocation, part: { type: 'output_text', text: '', annotations: [] } }),
      named('response.output_text.delta', { ...textLocation, delta: 'Reading ' }),
      named('response.output_text.delta', { ...textLocation, delta: 'the file.' }),
      named('response.output_text.done', { ...textLocation, text: TEXT }),
      named('response.content_part.done', { ...textLocation, part: message.content[0] }),
      named('response.output_item.done', { output_index: 0, item: message }),
      named('response.output_item.added', { output_index: 1, item: { ...call, status: 'in_progress', arguments: '' } }),
      ...ARGUMENT_DELTAS.map(delta => named('response.function_call_arguments.delta', { ...callLocation, delta })),
      named('response.function_call_arguments.done', { ...callLocation, arguments: ARGUMENTS }),
      named('response.output_item.done', { output_index: 1, item: call }),
      named('response.completed', { response: full }),
    ].join('');
  }
  return [
    event({ responseId: full.responseId, modelVersion: UPSTREAM_MODEL,
      candidates: [{ index: 0, content: { role: 'model', parts: [{ text: 'Reading ' }] } }] }),
    event({ responseId: full.responseId, modelVersion: UPSTREAM_MODEL,
      candidates: [{ index: 0, content: { role: 'model', parts: [{ text: 'the file.' }] } }] }),
    event({ responseId: full.responseId, modelVersion: UPSTREAM_MODEL,
      candidates: [{ index: 0, content: { role: 'model', parts: [full.candidates[0].content.parts[1]] }, finishReason: 'STOP' }],
      usageMetadata: full.usageMetadata }),
  ].join('');
}

function fragmentedStream(text) {
  const bytes = new TextEncoder().encode(`: fixture heartbeat\r\n\r\n${text}`);
  const widths = [1, 17, 3, 97, 11, 251];
  return new ReadableStream({
    start(controller) {
      for (let offset = 0, index = 0; offset < bytes.length; index++) {
        const end = Math.min(bytes.length, offset + widths[index % widths.length]);
        controller.enqueue(bytes.slice(offset, end));
        offset = end;
      }
      controller.close();
    },
  });
}

function fixtureGateway(target, { stream = false, provider = {}, reply = null } = {}) {
  const calls = [];
  const registry = {
    models: { only: { source: 'custom', provider: 'upstream', protocols: [target], upstreamModel: UPSTREAM_MODEL } },
    providers: { upstream: { baseUrl: 'https://upstream.invalid', protocols: [target],
      authMode: 'none', endpointStyle: 'standard', ...provider } },
  };
  const fetchImpl = async (url, init) => {
    const call = { url: String(url), method: init.method, headers: new Headers(init.headers), body: await new Response(init.body).json() };
    calls.push(call);
    if (reply) return reply(call);
    return stream
      ? new Response(fragmentedStream(sseFixture(target)), { headers: { 'content-type': 'text/event-stream' } })
      : Response.json(jsonFixture(target));
  };
  // Exercise the production default paths; a named native client can impose own-mode restrictions.
  return { ...createRoutingGatewayApp({ registry, env: {}, fetchImpl, masking: false }), calls };
}

function send(app, client, stream = false, body = requestBody(client, stream), path = entrypoint(client, stream)) {
  return app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

function contentText(content) {
  if (typeof content === 'string') return content;
  return (content || []).filter(part => ['text', 'input_text', 'output_text'].includes(part.type)).map(part => part.text).join('');
}

function nonemptyString(value, label) {
  assert.equal(typeof value, 'string', label);
  assert.ok(value.length > 0, label);
}

function assertToolSchema(tool, schema) {
  assert.equal(tool, TOOL);
  assert.equal(schema.type, 'object');
  assert.deepEqual(schema.properties, SCHEMA.properties);
  assert.deepEqual(schema.required, SCHEMA.required);
}

function assertOutgoing(call, target, stream, base = 'https://upstream.invalid') {
  assert.equal(call.method, 'POST');
  assert.equal(call.headers.get('content-type'), 'application/json');
  assert.equal(call.headers.get('authorization'), null);
  assert.equal(call.headers.get('x-api-key'), null);
  assert.equal(call.headers.get('x-goog-api-key'), null);
  const body = call.body;
  if (target === 'gemini') {
    assert.equal(call.url, `${base}/v1beta/models/vendor/model%20x:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`);
    assert.equal(Object.hasOwn(body, 'model'), false, 'standard Gemini carries the model only in the URL');
    assert.equal(Object.hasOwn(body, 'stream'), false, 'standard Gemini selects streaming through the operation');
    assert.equal(body.contents[0].role, 'user');
    assert.equal(body.contents[0].parts.map(part => part.text || '').join(''), PROMPT);
    assert.equal(body.systemInstruction.parts.map(part => part.text || '').join(''), SYSTEM);
    assert.equal(body.generationConfig.maxOutputTokens, 128);
    const tool = body.tools.flatMap(item => item.functionDeclarations || [])[0];
    assertToolSchema(tool.name, tool.parametersJsonSchema ?? tool.parameters);
    assert.equal(body.messages, undefined);
    assert.equal(body.input, undefined);
    return;
  }
  const suffix = target === 'claude' ? 'messages' : target === 'openai-chat' ? 'chat/completions' : 'responses';
  assert.equal(call.url, `${base}/v1/${suffix}`);
  assert.equal(body.model, UPSTREAM_MODEL, 'the bound real model replaces the client alias');
  assert.equal(body.stream, stream);
  assert.equal(body.contents, undefined);
  if (target === 'claude') {
    assert.equal(contentText(body.system), SYSTEM);
    assert.equal(body.messages[0].role, 'user');
    assert.equal(contentText(body.messages[0].content), PROMPT);
    assert.equal(body.max_tokens, 128);
    assertToolSchema(body.tools[0].name, body.tools[0].input_schema);
    assert.equal(body.input, undefined);
  } else if (target === 'openai-chat') {
    const system = body.messages.filter(message => ['system', 'developer'].includes(message.role));
    assert.equal(system.map(message => contentText(message.content)).join(''), SYSTEM);
    assert.equal(contentText(body.messages.find(message => message.role === 'user').content), PROMPT);
    assert.equal(body.max_tokens ?? body.max_completion_tokens, 128);
    assert.equal(body.tools[0].type, 'function');
    assertToolSchema(body.tools[0].function.name, body.tools[0].function.parameters);
    assert.equal(body.input, undefined);
  } else {
    const system = body.instructions ?? body.input.filter(item => ['system', 'developer'].includes(item.role)).map(item => contentText(item.content)).join('');
    assert.equal(system, SYSTEM);
    assert.equal(contentText(body.input.find(item => item.role === 'user').content), PROMPT);
    assert.equal(body.max_output_tokens, 128);
    assert.equal(body.tools[0].type, 'function');
    assertToolSchema(body.tools[0].name, body.tools[0].parameters);
    assert.equal(body.messages, undefined);
  }
}

function assertUsage(protocol, usage) {
  assert.ok(usage, 'usage is not lost during translation');
  if (protocol === 'claude') {
    assert.equal(usage.input_tokens, 11);
    assert.equal(usage.output_tokens, 7);
  } else if (protocol === 'gemini') {
    assert.equal(usage.promptTokenCount, 11);
    assert.equal(usage.candidatesTokenCount, 7);
    assert.equal(usage.totalTokenCount, 18);
  } else if (protocol === 'openai-chat') {
    assert.equal(usage.prompt_tokens, 11);
    assert.equal(usage.completion_tokens, 7);
    assert.equal(usage.total_tokens, 18);
  } else {
    assert.equal(usage.input_tokens, 11);
    assert.equal(usage.output_tokens, 7);
    assert.equal(usage.total_tokens, 18);
  }
}

function assertNotForeign(body, protocol) {
  if (protocol !== 'openai-chat') assert.equal(body.choices, undefined, 'not a foreign Chat envelope');
  if (protocol !== 'openai-response') assert.equal(body.output, undefined, 'not a foreign Responses envelope');
  if (protocol !== 'gemini') assert.equal(body.candidates, undefined, 'not a foreign Gemini envelope');
  if (protocol !== 'claude') assert.notEqual(body.type, 'message', 'not a foreign Claude envelope');
}

function assertJsonEnvelope(body, protocol) {
  assertNotForeign(body, protocol);
  if (protocol === 'claude') {
    assert.equal(body.type, 'message');
    assert.equal(body.role, 'assistant');
    nonemptyString(body.id, 'Claude message ID');
    assert.equal(contentText(body.content), TEXT);
    const calls = body.content.filter(part => part.type === 'tool_use');
    assert.equal(calls.length, 1);
    nonemptyString(calls[0].id, 'Claude tool ID');
    assert.equal(calls[0].name, TOOL);
    assert.deepEqual(calls[0].input, ARGS);
    assert.equal(body.stop_reason, 'tool_use');
    assertUsage(protocol, body.usage);
  } else if (protocol === 'openai-chat') {
    assert.equal(body.object, 'chat.completion');
    nonemptyString(body.id, 'Chat completion ID');
    assert.equal(body.choices.length, 1);
    const choice = body.choices[0];
    assert.equal(choice.message.role, 'assistant');
    assert.equal(choice.message.content, TEXT);
    assert.equal(choice.finish_reason, 'tool_calls');
    assert.equal(choice.message.tool_calls.length, 1);
    const call = choice.message.tool_calls[0];
    nonemptyString(call.id, 'Chat tool ID');
    assert.equal(call.type, 'function');
    assert.equal(call.function.name, TOOL);
    assert.deepEqual(JSON.parse(call.function.arguments), ARGS);
    assertUsage(protocol, body.usage);
  } else if (protocol === 'openai-response') {
    assert.equal(body.object, 'response');
    nonemptyString(body.id, 'Responses response ID');
    assert.equal(body.status, 'completed');
    assert.equal(body.error, null);
    const messages = body.output.filter(item => item.type === 'message');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].role, 'assistant');
    assert.equal(messages[0].status, 'completed');
    assert.equal(contentText(messages[0].content), TEXT);
    const calls = body.output.filter(item => item.type === 'function_call');
    assert.equal(calls.length, 1);
    nonemptyString(calls[0].call_id, 'Responses tool correlation ID');
    assert.equal(calls[0].name, TOOL);
    assert.deepEqual(JSON.parse(calls[0].arguments), ARGS);
    assertUsage(protocol, body.usage);
  } else {
    assert.equal(body.candidates.length, 1);
    const candidate = body.candidates[0];
    assert.equal(candidate.content.role, 'model');
    assert.equal(candidate.content.parts.map(part => part.text || '').join(''), TEXT);
    const calls = candidate.content.parts.filter(part => part.functionCall).map(part => part.functionCall);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, TOOL);
    assert.deepEqual(calls[0].args, ARGS);
    assert.equal(candidate.finishReason, 'STOP');
    assertUsage(protocol, body.usageMetadata);
  }
}

function parseSse(text) {
  return text.replace(/\r\n/g, '\n').split(/\n\n+/).flatMap(block => {
    const lines = block.split('\n');
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
    if (!data) return [];
    const name = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message';
    return [{ event: name, data: data === '[DONE]' ? data : JSON.parse(data) }];
  });
}

function assertChatStream(frames) {
  assert.equal(frames.at(-1).data, '[DONE]', 'Chat stream ends with its own sentinel');
  assert.equal(frames.filter(frame => frame.data === '[DONE]').length, 1);
  const chunks = frames.slice(0, -1).map(frame => frame.data);
  let text = '';
  let role;
  let finish;
  let usage;
  const calls = new Map();
  for (const chunk of chunks) {
    assertNotForeign(chunk, 'openai-chat');
    assert.equal(chunk.object, 'chat.completion.chunk');
    assert.ok(Array.isArray(chunk.choices));
    if (chunk.usage) usage = chunk.usage;
    for (const choice of chunk.choices) {
      assert.equal(choice.index, 0);
      assert.ok(choice.delta && typeof choice.delta === 'object');
      if (choice.delta.role) role = choice.delta.role;
      text += choice.delta.content || '';
      if (choice.finish_reason) finish = choice.finish_reason;
      for (const part of choice.delta.tool_calls || []) {
        const call = calls.get(part.index) || { id: '', name: '', arguments: '' };
        call.id += part.id || '';
        call.name += part.function?.name || '';
        call.arguments += part.function?.arguments || '';
        calls.set(part.index, call);
      }
    }
  }
  assert.equal(role, 'assistant');
  assert.equal(text, TEXT);
  assert.equal(finish, 'tool_calls');
  assert.equal(calls.size, 1);
  const call = [...calls.values()][0];
  nonemptyString(call.id, 'streamed Chat tool ID');
  assert.equal(call.name, TOOL);
  assert.deepEqual(JSON.parse(call.arguments), ARGS);
  assertUsage('openai-chat', usage);
}

function assertClaudeStream(frames) {
  assert.equal(frames[0].event, 'message_start');
  assert.equal(frames.at(-1).event, 'message_stop');
  const blocks = new Map();
  const open = new Set();
  let stopReason;
  let usage = {};
  for (const { event: name, data } of frames) {
    assertNotForeign(data, 'claude');
    assert.equal(name, data.type);
    if (name === 'message_start') {
      assert.equal(data.message.type, 'message');
      assert.equal(data.message.role, 'assistant');
      usage = { ...data.message.usage };
    } else if (name === 'content_block_start') {
      assert.equal(blocks.has(data.index), false, 'each content block starts once');
      blocks.set(data.index, { ...data.content_block, arguments: '' });
      open.add(data.index);
    } else if (name === 'content_block_delta') {
      assert.ok(open.has(data.index), 'a delta belongs to an open content block');
      const block = blocks.get(data.index);
      if (data.delta.type === 'text_delta') block.text += data.delta.text;
      else {
        assert.equal(data.delta.type, 'input_json_delta');
        assert.equal(block.type, 'tool_use');
        block.arguments += data.delta.partial_json;
      }
    } else if (name === 'content_block_stop') {
      assert.ok(open.delete(data.index), 'a block closes exactly once');
    } else if (name === 'message_delta') {
      stopReason = data.delta.stop_reason;
      usage = { ...usage, ...data.usage };
    }
  }
  assert.equal(open.size, 0);
  assert.equal([...blocks.values()].filter(block => block.type === 'text').map(block => block.text).join(''), TEXT);
  const calls = [...blocks.values()].filter(block => block.type === 'tool_use');
  assert.equal(calls.length, 1);
  nonemptyString(calls[0].id, 'streamed Claude tool ID');
  assert.equal(calls[0].name, TOOL);
  assert.deepEqual(calls[0].arguments ? JSON.parse(calls[0].arguments) : calls[0].input, ARGS);
  assert.equal(stopReason, 'tool_use');
  assertUsage('claude', usage);
}

function assertResponsesStream(frames) {
  assert.equal(frames[0].event, 'response.created');
  assert.equal(frames.at(-1).event, 'response.completed');
  const items = new Map();
  const done = new Set();
  let text = '';
  let textDone = false;
  let argumentsDone = false;
  for (const { event: name, data } of frames) {
    assert.equal(name, data.type);
    assert.ok(name.startsWith('response.'), 'Responses uses named lifecycle events, not foreign chunks');
    assertNotForeign(data, 'openai-response');
    if (name === 'response.created') {
      assert.equal(data.response.object, 'response');
      assert.equal(data.response.status, 'in_progress');
    } else if (name === 'response.output_item.added') {
      assert.equal(items.has(data.output_index), false);
      items.set(data.output_index, { ...data.item, arguments: data.item.arguments || '' });
    } else if (name === 'response.output_text.delta') {
      assert.ok(items.has(data.output_index));
      assert.equal(items.get(data.output_index).type, 'message');
      assert.equal(done.has(data.output_index), false);
      text += data.delta;
    } else if (name === 'response.output_text.done') {
      assert.equal(data.text, TEXT);
      textDone = true;
    } else if (name === 'response.function_call_arguments.delta') {
      assert.ok(items.has(data.output_index));
      const call = items.get(data.output_index);
      assert.equal(call.type, 'function_call');
      assert.equal(done.has(data.output_index), false);
      call.arguments += data.delta;
    } else if (name === 'response.function_call_arguments.done') {
      assert.deepEqual(JSON.parse(data.arguments), ARGS);
      argumentsDone = true;
    } else if (name === 'response.output_item.done') {
      assert.ok(items.has(data.output_index));
      assert.equal(done.has(data.output_index), false);
      done.add(data.output_index);
    }
  }
  assert.equal(text, TEXT);
  assert.equal(textDone, true);
  assert.equal(argumentsDone, true);
  assert.equal(done.size, items.size, 'all output items complete before response.completed');
  const calls = [...items.values()].filter(item => item.type === 'function_call');
  assert.equal(calls.length, 1);
  nonemptyString(calls[0].call_id, 'streamed Responses tool correlation ID');
  assert.equal(calls[0].name, TOOL);
  assert.deepEqual(JSON.parse(calls[0].arguments), ARGS);
  assertJsonEnvelope(frames.at(-1).data.response, 'openai-response');
}

function assertGeminiStream(frames) {
  let text = '';
  let finish;
  let usage;
  const calls = [];
  for (const { event: name, data } of frames) {
    assert.equal(name, 'message', 'Gemini streams GenerateContentResponse data, not named Responses/Claude events');
    assertNotForeign(data, 'gemini');
    assert.notEqual(data, '[DONE]');
    if (data.usageMetadata) usage = data.usageMetadata;
    assert.ok(Array.isArray(data.candidates));
    for (const candidate of data.candidates) {
      if (candidate.content) assert.equal(candidate.content.role, 'model');
      for (const part of candidate.content?.parts || []) {
        text += part.text || '';
        if (part.functionCall) calls.push(part.functionCall);
      }
      if (candidate.finishReason) finish = candidate.finishReason;
    }
  }
  assert.equal(text, TEXT);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, TOOL);
  assert.deepEqual(calls[0].args, ARGS);
  assert.equal(finish, 'STOP');
  assertUsage('gemini', usage);
}

function assertStreamEnvelope(text, protocol) {
  const frames = parseSse(text);
  assert.ok(frames.length > 0, 'the client receives parseable SSE');
  if (protocol === 'claude') assertClaudeStream(frames);
  else if (protocol === 'openai-chat') assertChatStream(frames);
  else if (protocol === 'openai-response') assertResponsesStream(frames);
  else assertGeminiStream(frames);
}

for (const client of PROTOCOLS) {
  for (const target of PROTOCOLS) {
    for (const stream of [false, true]) {
      test(`production protocol matrix ${stream ? 'SSE' : 'JSON'}: ${client} -> ${target}`, async () => {
        const { app, calls } = fixtureGateway(target, { stream });
        const response = await send(app, client, stream);
        assert.equal(response.status, 200);
        assert.equal(calls.length, 1);
        assertOutgoing(calls[0], target, stream);
        if (stream) {
          assert.match(response.headers.get('content-type'), /^text\/event-stream\b/);
          assertStreamEnvelope(await response.text(), client);
        } else {
          assert.match(response.headers.get('content-type'), /^application\/json\b/);
          assertJsonEnvelope(await response.json(), client);
        }
      });
    }
  }
}

for (const stream of [false, true]) {
  test(`Gemini /v1beta production alias selects ${stream ? 'streamGenerateContent' : 'generateContent'}`, async () => {
    const { app, calls } = fixtureGateway('openai-chat', { stream });
    const response = await send(app, 'gemini', stream, requestBody('gemini', stream), entrypoint('gemini', stream, 'v1beta'));
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assertOutgoing(calls[0], 'openai-chat', stream);
    if (stream) assertStreamEnvelope(await response.text(), 'gemini');
    else assertJsonEnvelope(await response.json(), 'gemini');
  });
}

for (const target of PROTOCOLS) {
  test(`protocolBaseUrls selects the explicit ${target} host and SDK base`, async () => {
    const sdk = target === 'gemini' ? 'v1beta' : 'v1';
    const { app, calls } = fixtureGateway(target, { provider: {
      baseUrl: 'https://unused.invalid',
      protocolBaseUrls: { [target]: `https://wire.invalid/sdk/${sdk}` },
    } });
    const response = await send(app, 'openai-chat');
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assertOutgoing(calls[0], target, false, 'https://wire.invalid/sdk');
    assertJsonEnvelope(await response.json(), 'openai-chat');
  });
}

for (const client of PROTOCOLS.filter(protocol => protocol !== 'openai-response')) {
  test(`production ${client} translation to Responses explicitly disables response persistence`, async () => {
    const { app, calls } = fixtureGateway('openai-response');
    const body = { ...requestBody(client), ...(client === 'openai-chat' ? { store: false } : {}) };
    const response = await send(app, client, false, body);
    assert.equal(response.status, 200);
    await response.json();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.store, false);
  });
}

for (const client of ['openai-chat', 'openai-response']) {
  test(`production parallel ${client} results form one associated Gemini response turn`, async () => {
    const { app, calls } = fixtureGateway('gemini');
    const body = requestBody(client);
    const ids = ['call_a', 'call_b'];
    if (client === 'openai-chat') {
      body.messages.push({ role: 'assistant', content: null, tool_calls: ids.map(id => ({
        id, type: 'function', function: { name: TOOL, arguments: ARGUMENTS },
      })) });
      body.messages.push(...ids.map(id => ({ role: 'tool', tool_call_id: id, content: `result ${id}` })));
    } else {
      body.input.push(...ids.map(call_id => ({ type: 'function_call', call_id, name: TOOL, arguments: ARGUMENTS })));
      body.input.push(...ids.map(call_id => ({ type: 'function_call_output', call_id, output: `result ${call_id}` })));
    }
    const response = await send(app, client, false, body);
    assert.equal(response.status, 200);
    await response.json();
    assert.equal(calls.length, 1);
    const contents = calls[0].body.contents;
    assert.equal(contents.length, 3);
    assert.equal(contents[1].role, 'model');
    assert.deepEqual(contents[1].parts.map(part => part.functionCall.id), ids);
    assert.equal(contents[2].role, 'user');
    assert.deepEqual(contents[2].parts.map(part => part.functionResponse.id), ids);
    assert.deepEqual(contents[2].parts.map(part => part.functionResponse.name), [TOOL, TOOL]);
  });
}

function errorFixture(protocol, status) {
  const message = `fixture upstream failure ${status}`;
  if (protocol === 'claude') return { type: 'error', error: { type: status === 429 ? 'rate_limit_error' : 'api_error', message } };
  if (protocol === 'gemini') return { error: { code: status, message, status: status === 429 ? 'RESOURCE_EXHAUSTED' : 'UNAVAILABLE' } };
  return { error: { message, type: status === 429 ? 'rate_limit_error' : 'server_error', code: 'fixture_upstream_error', param: null } };
}

for (const client of PROTOCOLS) {
  for (const target of PROTOCOLS.filter(protocol => protocol !== client)) {
    for (const [status, stream] of [[429, false], [503, true]]) {
      test(`cross-protocol upstream ${status} stays an error: ${client} -> ${target}${stream ? ' streaming request' : ''}`, async () => {
        const { app, calls } = fixtureGateway(target, { reply: () => Response.json(errorFixture(target, status), { status }) });
        const response = await send(app, client, stream);
        assert.equal(response.status, status);
        assert.equal(calls.length, 1);
        const body = await response.json();
        assert.equal(body.error.message, `fixture upstream failure ${status}`);
        assert.equal(body.choices, undefined);
        assert.equal(body.output, undefined);
        assert.equal(body.candidates, undefined);
        assert.equal(body.content, undefined);
        if (client === 'claude') {
          assert.equal(body.type, 'error');
          nonemptyString(body.error.type, 'Claude error type');
        } else if (client === 'gemini') {
          assert.equal(body.error.code, status);
          nonemptyString(body.error.status, 'Gemini RPC error status');
        } else {
          nonemptyString(body.error.type, 'OpenAI error type');
        }
      });
    }
  }
}

for (const client of PROTOCOLS) {
  test(`malformed JSON is refused before fetch at the default ${client} entrypoint`, async () => {
    const { app, calls } = fixtureGateway('claude');
    const response = await app.request(entrypoint(client), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"broken":',
    });
    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
    assert.ok((await response.json()).error);
  });
}

for (const target of PROTOCOLS.filter(protocol => protocol !== 'openai-response')) {
  test(`stateful Responses previous_response_id cannot silently cross to ${target}`, async () => {
    const { app, calls } = fixtureGateway(target);
    const response = await send(app, 'openai-response', false, {
      ...requestBody('openai-response'), previous_response_id: 'resp_previous_fixture',
    });
    assert.ok([400, 422, 501].includes(response.status), `expected local rejection, received ${response.status}`);
    assert.equal(calls.length, 0, 'unavailable server-side conversation state must never reach another protocol');
    assert.ok((await response.json()).error);
  });
}

for (const [label, path, body, statuses] of [
  ['generateContent contradicts stream:true', entrypoint('gemini'), { ...requestBody('gemini'), stream: true }, [400]],
  ['streamGenerateContent contradicts stream:false', entrypoint('gemini', true), { ...requestBody('gemini'), stream: false }, [400]],
  ['unsupported operation', '/v1/models/client-model:countTokens', requestBody('gemini'), [400, 404, 501]],
  ['invalid contents', entrypoint('gemini'), { contents: 'not-an-array' }, [400, 422]],
  ['nonobject body', entrypoint('gemini'), [], [400]],
]) {
  test(`Gemini rejects ${label} before fetch`, async () => {
    const { app, calls } = fixtureGateway('openai-chat');
    const response = await send(app, 'gemini', false, body, path);
    assert.ok(statuses.includes(response.status), `expected ${statuses.join('/')}, received ${response.status}`);
    assert.equal(calls.length, 0);
    assert.ok((await response.json()).error);
  });
}

for (const protocol of PROTOCOLS) {
  test(`same-protocol ${protocol} keeps request and JSON response extensions`, async () => {
    const extension = { trace: 'keep-me', knobs: [1, 2] };
    const upstream = { ...jsonFixture(protocol), vendor_extension: extension };
    const { app, calls } = fixtureGateway(protocol, { reply: () => Response.json(upstream) });
    const response = await send(app, protocol, false, { ...requestBody(protocol), vendor_extension: extension });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assertOutgoing(calls[0], protocol, false);
    assert.deepEqual(calls[0].body.vendor_extension, extension);
    assert.deepEqual(await response.json(), upstream);
  });

  test(`same-protocol ${protocol} keeps streaming event extensions`, async () => {
    const frames = parseSse(sseFixture(protocol));
    const extended = frames.map(frame => frame.data === '[DONE]' ? 'data: [DONE]\r\n\r\n'
      : event({ ...frame.data, vendor_extension: { trace: 'stream-extension' } }, frame.event === 'message' ? '' : frame.event)).join('');
    const { app, calls } = fixtureGateway(protocol, { reply: () => new Response(fragmentedStream(extended), {
      headers: { 'content-type': 'text/event-stream' },
    }) });
    const response = await send(app, protocol, true, { ...requestBody(protocol, true), vendor_extension: 'request-extension' });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assertOutgoing(calls[0], protocol, true);
    assert.equal(calls[0].body.vendor_extension, 'request-extension');
    const text = await response.text();
    assertStreamEnvelope(text, protocol);
    const data = parseSse(text).filter(frame => frame.data !== '[DONE]');
    assert.equal(data.length, frames.filter(frame => frame.data !== '[DONE]').length);
    for (const frame of data) assert.deepEqual(frame.data.vendor_extension, { trace: 'stream-extension' });
  });
}

function toolContinuation(client, firstResponse) {
  const body = requestBody(client);
  if (client === 'claude') {
    const call = firstResponse.content.find(part => part.type === 'tool_use');
    body.messages.push({ role: 'assistant', content: firstResponse.content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: call.id, content: 'fixture file contents' }] });
  } else if (client === 'openai-chat') {
    const message = firstResponse.choices[0].message;
    body.messages.push(message, { role: 'tool', tool_call_id: message.tool_calls[0].id, content: 'fixture file contents' });
  } else if (client === 'openai-response') {
    const call = firstResponse.output.find(item => item.type === 'function_call');
    body.input.push(...firstResponse.output, { type: 'function_call_output', call_id: call.call_id, output: 'fixture file contents' });
  } else {
    const content = firstResponse.candidates[0].content;
    const call = content.parts.find(part => part.functionCall).functionCall;
    body.contents.push(content, { role: 'user', parts: [{ functionResponse: {
      ...(call.id ? { id: call.id } : {}), name: call.name, response: { result: 'fixture file contents' },
    } }] });
  }
  return body;
}

function assertToolContinuation(body, target) {
  if (target === 'claude') {
    const assistant = body.messages.find(message => message.role === 'assistant');
    assert.equal(contentText(assistant.content), TEXT);
    const call = assistant.content.find(part => part.type === 'tool_use');
    assert.equal(call.name, TOOL);
    assert.deepEqual(call.input, ARGS);
    const result = body.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).find(part => part.type === 'tool_result');
    assert.equal(result.tool_use_id, call.id);
    assert.match(contentText(result.content), /fixture file contents/);
  } else if (target === 'openai-chat') {
    const assistant = body.messages.find(message => message.role === 'assistant');
    assert.equal(contentText(assistant.content), TEXT);
    const call = assistant.tool_calls[0];
    assert.equal(call.function.name, TOOL);
    assert.deepEqual(JSON.parse(call.function.arguments), ARGS);
    const result = body.messages.find(message => message.role === 'tool');
    assert.equal(result.tool_call_id, call.id);
    assert.match(contentText(result.content), /fixture file contents/);
  } else if (target === 'openai-response') {
    const assistant = body.input.find(item => item.role === 'assistant');
    assert.equal(contentText(assistant.content), TEXT);
    const call = body.input.find(item => item.type === 'function_call');
    assert.equal(call.name, TOOL);
    assert.deepEqual(JSON.parse(call.arguments), ARGS);
    const result = body.input.find(item => item.type === 'function_call_output');
    assert.equal(result.call_id, call.call_id);
    assert.match(result.output, /fixture file contents/);
  } else {
    const assistant = body.contents.find(content => content.role === 'model');
    assert.equal(assistant.parts.map(part => part.text || '').join(''), TEXT);
    const call = assistant.parts.find(part => part.functionCall).functionCall;
    assert.equal(call.name, TOOL);
    assert.deepEqual(call.args, ARGS);
    const result = body.contents.flatMap(content => content.parts).find(part => part.functionResponse).functionResponse;
    assert.equal(result.name, call.name);
    if (call.id) assert.equal(result.id, call.id);
    assert.match(JSON.stringify(result.response), /fixture file contents/);
  }
}

for (const client of PROTOCOLS) {
  for (const target of PROTOCOLS) {
    test(`two-turn tool correlation survives ${client} -> ${target}`, async () => {
      const { app, calls } = fixtureGateway(target);
      const first = await send(app, client);
      assert.equal(first.status, 200);
      const firstBody = await first.json();
      assertJsonEnvelope(firstBody, client);
      const second = await send(app, client, false, toolContinuation(client, firstBody));
      assert.equal(second.status, 200);
      assert.equal(calls.length, 2);
      assertOutgoing(calls[1], target, false);
      assertToolContinuation(calls[1].body, target);
      assertJsonEnvelope(await second.json(), client);
    });
  }
}
