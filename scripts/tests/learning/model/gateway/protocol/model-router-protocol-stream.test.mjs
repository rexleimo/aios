import test from 'node:test';
import assert from 'node:assert/strict';

import { translateProtocolStream } from '../../../../../lib/tooling/model-router/gateway/compatibility/protocol-stream.mjs';

const protocols = ['claude', 'openai-response', 'openai-chat', 'gemini'];
const encoder = new TextEncoder();
const textParts = ['H\u00e9', '\u4e16\u754c\ud83d\ude42'];
const argumentsParts = ['{"city":', '"\u6771\u4eac"}'];

function frame(data, event = '') {
  return `${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`;
}

function named(type, fields = {}) { return frame({ type, ...fields }, type); }

function bytes(wire, fragmented = false) {
  const data = encoder.encode(wire);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset === data.length) return controller.close();
      const length = fragmented ? (offset % 5) + 1 : data.length;
      controller.enqueue(data.slice(offset, offset + length));
      offset = Math.min(offset + length, data.length);
    },
  });
}

function events(wire) {
  return wire.split('\n\n').filter(Boolean).map((event) => {
    const data = event.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(6)).join('\n');
    return data === '[DONE]' ? '[DONE]' : JSON.parse(data);
  });
}

const tools = [
  { id: 'call_weather', name: 'get_weather', args: { city: '\u6771\u4eac' } },
  { id: 'call_empty', name: 'empty_tool', args: {} },
];

function source(protocol, reason = 'length', withText = true) {
  if (protocol === 'openai-chat') {
    const chunk = (delta, finish_reason = null) => frame({ id: 'upstream_id', model: 'source_model', choices: [{ index: 0, delta, finish_reason }] });
    return chunk({ role: 'assistant' })
      + (withText ? textParts.map((content) => chunk({ content })).join('') : '')
      + chunk({ tool_calls: [{ index: 0, id: 'call_', type: 'function', function: { name: 'get_', arguments: '' } }] })
      + chunk({ tool_calls: [{ index: 1, function: { arguments: '' } }] })
      + chunk({ tool_calls: [{ index: 0, id: 'weather', function: { name: 'weather', arguments: argumentsParts[0] } }] })
      + chunk({ tool_calls: [{ index: 1, id: 'call_empty', function: { name: 'empty_tool', arguments: '' } }, { index: 0, function: { arguments: argumentsParts[1] } }] })
      + chunk({}, { length: 'length', stop: 'tool_calls', filter: 'content_filter' }[reason])
      + frame({ id: 'upstream_id', choices: [], usage: { prompt_tokens: 13, completion_tokens: 8, total_tokens: 21 } })
      + 'data: [DONE]\n\n';
  }
  if (protocol === 'claude') {
    let wire = named('message_start', { message: { id: 'upstream_id', model: 'source_model', role: 'assistant', content: [], usage: { input_tokens: 13, output_tokens: 0 } } });
    let n = 0;
    if (withText) {
      wire += named('content_block_start', { index: n, content_block: { type: 'text', text: '' } });
      for (const text of textParts) wire += named('content_block_delta', { index: n, delta: { type: 'text_delta', text } });
      wire += named('content_block_stop', { index: n++ });
    }
    tools.forEach((tool, toolIndex) => {
      wire += named('content_block_start', { index: n, content_block: { type: 'tool_use', id: tool.id, name: tool.name, input: {} } });
      if (toolIndex === 0) for (const partial_json of argumentsParts) wire += named('content_block_delta', { index: n, delta: { type: 'input_json_delta', partial_json } });
      wire += named('content_block_stop', { index: n++ });
    });
    return wire + named('message_delta', { delta: { stop_reason: { length: 'max_tokens', stop: 'tool_use', filter: 'refusal' }[reason] }, usage: { output_tokens: 8 } }) + named('message_stop');
  }
  if (protocol === 'gemini') {
    const chunk = (parts, finishReason) => frame({ responseId: 'upstream_id', modelVersion: 'source_model', candidates: [{ index: 0, content: { role: 'model', parts }, ...(finishReason ? { finishReason } : {}) }] });
    return (withText ? textParts.map((text) => chunk([{ text }])).join('') : '')
      + tools.map((tool) => chunk([{ functionCall: { id: tool.id, name: tool.name, args: tool.args } }])).join('')
      + chunk([], { length: 'MAX_TOKENS', stop: 'STOP', filter: 'SAFETY' }[reason])
      + frame({ usageMetadata: { promptTokenCount: 13, candidatesTokenCount: 8, totalTokenCount: 21 } });
  }
  let wire = named('response.created', { response: { id: 'upstream_id', model: 'source_model', status: 'in_progress', output: [] } });
  const output = [];
  let n = 0;
  if (withText) {
    const item = { id: 'msg_1', type: 'message', role: 'assistant', status: 'in_progress', content: [] };
    const part = { type: 'output_text', text: '', annotations: [], logprobs: [] };
    const base = { output_index: n, item_id: item.id, content_index: 0 };
    wire += named('response.output_item.added', { output_index: n, item });
    wire += named('response.content_part.added', { ...base, part });
    for (const delta of textParts) wire += named('response.output_text.delta', { ...base, delta });
    const fullPart = { ...part, text: textParts.join('') };
    wire += named('response.output_text.done', { ...base, text: fullPart.text });
    wire += named('response.content_part.done', { ...base, part: fullPart });
    const fullItem = { ...item, status: 'completed', content: [fullPart] };
    wire += named('response.output_item.done', { output_index: n++, item: fullItem });
    output.push(fullItem);
  }
  tools.forEach((tool, toolIndex) => {
    const item = { id: `fc_${toolIndex}`, type: 'function_call', call_id: tool.id, name: tool.name, arguments: '', status: 'in_progress' };
    const base = { output_index: n, item_id: item.id };
    wire += named('response.output_item.added', { output_index: n, item });
    for (const delta of toolIndex === 0 ? argumentsParts : ['{}']) wire += named('response.function_call_arguments.delta', { ...base, delta });
    const fullItem = { ...item, arguments: JSON.stringify(tool.args), status: 'completed' };
    wire += named('response.function_call_arguments.done', { ...base, arguments: fullItem.arguments });
    wire += named('response.output_item.done', { output_index: n++, item: fullItem });
    output.push(fullItem);
  });
  const incomplete = reason !== 'stop';
  return wire + named(incomplete ? 'response.incomplete' : 'response.completed', { response: {
    id: 'upstream_id', status: incomplete ? 'incomplete' : 'completed', output,
    ...(incomplete ? { incomplete_details: { reason: reason === 'length' ? 'max_output_tokens' : 'content_filter' } } : {}),
    usage: { input_tokens: 13, output_tokens: 8, total_tokens: 21 },
  } });
}

function normalized(protocol, data) {
  const result = { text: '', tools: [], input: 0, output: 0, finish: null };
  if (protocol === 'claude') {
    const blocks = new Map();
    let active = null;
    for (const event of data) {
      if (event.type === 'message_start') result.input = event.message.usage.input_tokens;
      if (event.type === 'content_block_start') {
        assert.equal(active, null, 'Claude blocks must be serialized');
        active = event.index;
        blocks.set(event.index, { ...event.content_block, args: '' });
      }
      if (event.type === 'content_block_delta') {
        assert.equal(active, event.index, 'Claude delta must follow its block start');
        const block = blocks.get(event.index);
        if (event.delta.type === 'text_delta') result.text += event.delta.text;
        else block.args += event.delta.partial_json;
      }
      if (event.type === 'content_block_stop') {
        assert.equal(active, event.index);
        active = null;
      }
      if (event.type === 'message_delta') {
        result.input = event.usage.input_tokens ?? result.input;
        result.output = event.usage.output_tokens;
        result.finish = event.delta.stop_reason;
      }
    }
    assert.equal(active, null);
    result.tools = [...blocks.values()].filter((block) => block.type === 'tool_use').map((block) => ({ id: block.id, name: block.name, args: JSON.parse(block.args || '{}') }));
    assert.equal(data.at(-1).type, 'message_stop');
  } else if (protocol === 'openai-chat') {
    const calls = new Map();
    for (const event of data) {
      if (event === '[DONE]') continue;
      if (event.usage) { result.input = event.usage.prompt_tokens; result.output = event.usage.completion_tokens; }
      const choice = event.choices[0];
      if (!choice) continue;
      result.text += choice.delta.content || '';
      if (choice.finish_reason) result.finish = choice.finish_reason;
      for (const tool of choice.delta.tool_calls || []) {
        if (!calls.has(tool.index)) calls.set(tool.index, { id: '', name: '', args: '' });
        const call = calls.get(tool.index);
        call.id += tool.id || '';
        call.name += tool.function?.name || '';
        call.args += tool.function?.arguments || '';
      }
    }
    result.tools = [...calls.values()].map((call) => ({ ...call, args: JSON.parse(call.args || '{}') }));
    assert.equal(data.at(-1), '[DONE]');
    assert.equal(data[0].choices[0].delta.role, 'assistant');
  } else if (protocol === 'openai-response') {
    const added = new Set();
    const parts = new Set();
    const done = new Set();
    data.forEach((event, n) => {
      assert.equal(event.sequence_number, n);
      if (event.type === 'response.output_item.added') {
        assert.ok(event.item.id);
        assert.equal(event.item.status, 'in_progress');
        added.add(event.output_index);
      }
      if (event.type === 'response.content_part.added') {
        assert.ok(added.has(event.output_index));
        assert.deepEqual(event.part, { type: 'output_text', text: '', annotations: [], logprobs: [] });
        parts.add(event.output_index);
      }
      if (event.type === 'response.output_text.delta') {
        assert.ok(parts.has(event.output_index));
        result.text += event.delta;
      }
      if (event.type === 'response.function_call_arguments.delta') assert.ok(added.has(event.output_index));
      if (event.type === 'response.output_item.done') done.add(event.output_index);
    });
    const final = data.at(-1);
    assert.ok(['response.completed', 'response.incomplete'].includes(final.type));
    assert.equal(done.size, added.size);
    assert.equal(final.response.output.length, added.size);
    result.tools = final.response.output.filter((item) => item.type === 'function_call').map((item) => ({ id: item.call_id, name: item.name, args: JSON.parse(item.arguments) }));
    const finalText = final.response.output.filter((item) => item.type === 'message').flatMap((item) => item.content).map((part) => part.text).join('');
    assert.equal(finalText, result.text);
    result.input = final.response.usage.input_tokens;
    result.output = final.response.usage.output_tokens;
    result.finish = final.response.incomplete_details?.reason ?? 'completed';
  } else {
    for (const event of data) {
      if (event.usageMetadata) { result.input = event.usageMetadata.promptTokenCount; result.output = event.usageMetadata.candidatesTokenCount; }
      for (const candidate of event.candidates || []) {
        if (candidate.finishReason) result.finish = candidate.finishReason;
        for (const part of candidate.content.parts) {
          result.text += part.text || '';
          if (part.functionCall) result.tools.push({ id: part.functionCall.id, name: part.functionCall.name, args: part.functionCall.args });
        }
      }
    }
  }
  return result;
}

for (const from of protocols) for (const to of protocols) {
  if (from === to) continue;
  test(`${from} -> ${to}: fragmented UTF-8 text, parallel tools, empty args, usage and length finish`, async () => {
    const wire = source(from).replaceAll('\n', '\r\n');
    const result = await new Response(translateProtocolStream(bytes(wire, true), from, to, 'client_model')).text();
    const actual = normalized(to, events(result));
    assert.equal(actual.text, textParts.join(''));
    assert.deepEqual(actual.tools, tools);
    assert.equal(actual.input, 13);
    assert.equal(actual.output, 8);
    assert.equal(actual.finish, { claude: 'max_tokens', 'openai-chat': 'length', 'openai-response': 'max_output_tokens', gemini: 'MAX_TOKENS' }[to]);
  });
  test(`${from} -> ${to}: tools without text and successful tool finish`, async () => {
    const wire = await new Response(translateProtocolStream(bytes(source(from, 'stop', false)), from, to)).text();
    const actual = normalized(to, events(wire));
    assert.equal(actual.text, '');
    assert.deepEqual(actual.tools, tools);
    assert.equal(actual.finish, { claude: 'tool_use', 'openai-chat': 'tool_calls', 'openai-response': 'completed', gemini: 'STOP' }[to]);
  });
}

test('same-protocol stream is the original body without reading, validating or observing it', () => {
  for (const protocol of protocols) {
    const body = bytes('not even SSE');
    assert.equal(translateProtocolStream(body, protocol, protocol, '', { onError() { assert.fail('should not observe passthrough'); } }), body);
    assert.equal(body.locked, false);
  }
});

test('SSE comments, multiline data, CR and unterminated final event are handled', async () => {
  const wire = ': heartbeat\r\nid: 9\r\nretry: 20\r\n\r\ndata: {"id":"x",\r\ndata: "choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\r\n\r\n'
    + 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\r\rdata: [DONE]';
  const actual = normalized('claude', events(await new Response(translateProtocolStream(bytes(wire, true), 'openai-chat', 'claude')).text()));
  assert.equal(actual.text, 'ok');
});

test('text is delivered before upstream ends, and cancellation cancels the source', async () => {
  let controller;
  let cancelled;
  const upstream = new ReadableStream({ start(c) { controller = c; }, cancel(reason) { cancelled = reason; } });
  const reader = translateProtocolStream(upstream, 'openai-chat', 'claude').getReader();
  controller.enqueue(encoder.encode(frame({ choices: [{ index: 0, delta: { content: 'first' }, finish_reason: null }] })));
  let wire = '';
  while (!wire.includes('"text":"first"')) wire += new TextDecoder().decode((await reader.read()).value);
  assert.ok(wire.includes('content_block_delta'));
  assert.ok(!wire.includes('message_stop'));
  await reader.cancel('client left');
  assert.equal(cancelled, 'client left');
});

test('Claude and Responses argument deltas are delivered before source block or item ends', async () => {
  for (const from of ['claude', 'openai-response']) for (const to of ['claude', 'openai-response', 'openai-chat']) {
    if (from === to) continue;
    let controller;
    const upstream = new ReadableStream({ start(c) { controller = c; } });
    const reader = translateProtocolStream(upstream, from, to).getReader();
    const wire = from === 'claude'
      ? named('message_start', { message: { id: 'x', role: 'assistant', content: [], usage: {} } })
        + named('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'call_1', name: 'f', input: {} } })
        + named('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: '{"x":' } })
      : named('response.created', { response: { id: 'x', output: [] } })
        + named('response.output_item.added', { output_index: 0, item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'f', arguments: '' } })
        + named('response.function_call_arguments.delta', { output_index: 0, item_id: 'fc_1', delta: '{"x":' });
    controller.enqueue(encoder.encode(wire));
    let actual = '';
    while (!actual.includes('{\\"x\\":')) actual += new TextDecoder().decode((await reader.read()).value);
    assert.ok(!actual.includes('response.completed'));
    await reader.cancel();
  }
});

const errorSources = {
  claude: named('message_start', { message: { id: 'x', role: 'assistant', content: [], usage: {} } }) + named('error', { error: { type: 'overloaded_error', message: 'capacity exhausted' } }),
  'openai-chat': frame({ choices: [{ index: 0, delta: { content: 'hi' } }] }) + frame({ error: { message: 'capacity exhausted' } }),
  'openai-response': named('response.created', { response: { id: 'x', output: [] } }) + named('response.failed', { response: { error: { message: 'capacity exhausted' } } }),
  gemini: frame({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }) + frame({ error: { code: 500, message: 'capacity exhausted' } }),
};

function assertError(protocol, wire) {
  const data = events(wire);
  if (protocol === 'openai-response') assert.equal(data.at(-1).type, 'response.failed');
  else assert.ok(data.at(-1).error);
  assert.ok(!data.some((event) => event === '[DONE]' || ['message_stop', 'response.completed', 'response.incomplete'].includes(event.type)));
}

for (const from of protocols) for (const to of protocols) {
  if (from === to) continue;
  test(`${from} -> ${to}: midstream upstream error is not success and calls onError`, async () => {
    const errors = [];
    const wire = await new Response(translateProtocolStream(bytes(errorSources[from], true), from, to, '', { onError(error) { errors.push(error); } })).text();
    assertError(to, wire);
    assert.match(wire, /capacity exhausted/);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 'UPSTREAM_STREAM_ERROR');
  });
}

for (const to of ['claude', 'openai-response', 'gemini']) {
  for (const [label, wire] of Object.entries({
    malformed: 'data: {broken}\n\n',
    truncated: frame({ choices: [{ index: 0, delta: { content: 'partial' } }] }),
    missing_done: frame({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
    done_without_finish: 'data: [DONE]\n\n',
    invalid_argument: frame({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'f', arguments: '{bad}' } }] }, finish_reason: 'tool_calls' }] }) + 'data: [DONE]\n\n',
  })) test(`Chat -> ${to}: ${label} produces an error event`, async () => {
    assertError(to, await new Response(translateProtocolStream(bytes(wire, true), 'openai-chat', to)).text());
  });
}

test('upstream read exception is rendered and observed, even after finish_reason', async () => {
  let controller;
  const upstream = new ReadableStream({ start(c) { controller = c; } });
  const observed = [];
  const response = new Response(translateProtocolStream(upstream, 'openai-chat', 'claude', '', { onError(error) { observed.push(error); } }));
  controller.enqueue(encoder.encode(frame({ choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: 'stop' }] })));
  const reading = response.text();
  await Promise.resolve();
  controller.error(new Error('transport broke'));
  const wire = await reading;
  assertError('claude', wire);
  assert.match(wire, /transport broke/);
  assert.equal(observed.length, 1);
});

test('usage-only Gemini chunk after finish and Chat usage before DONE survive', async () => {
  for (const from of ['gemini', 'openai-chat']) {
    const wire = await new Response(translateProtocolStream(bytes(source(from)), from, 'openai-response')).text();
    const final = events(wire).at(-1);
    assert.equal(final.response.usage.input_tokens, 13);
    assert.equal(final.response.usage.output_tokens, 8);
  }
});

test('frame size is bounded and rejected input cancels its source', async () => {
  let cancelled = false;
  const upstream = new ReadableStream({
    start(controller) { controller.enqueue(encoder.encode(`data: ${'x'.repeat(1024 * 1024 + 1)}`)); },
    cancel() { cancelled = true; },
  });
  const wire = await new Response(translateProtocolStream(upstream, 'openai-chat', 'claude')).text();
  assertError('claude', wire);
  assert.match(wire, /STREAM_LIMIT_EXCEEDED/);
  assert.equal(cancelled, true);
});

test('invalid UTF-8 is not silently replaced', async () => {
  const upstream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([0xc3, 0x28])); controller.close(); } });
  assertError('claude', await new Response(translateProtocolStream(upstream, 'openai-chat', 'claude')).text());
});

test('unsupported multimodal/thinking/refusal content fails explicitly', async () => {
  const examples = [
    ['openai-chat', frame({ choices: [{ index: 0, delta: { reasoning_content: 'secret' } }] })],
    ['openai-chat', frame({ choices: [{ index: 0, delta: { content: [{ type: 'image_url', image_url: 'x' }] } }] })],
    ['claude', named('message_start', { message: { id: 'x', role: 'assistant', content: [], usage: {} } }) + named('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '' } })],
    ['openai-response', named('response.created', { response: { id: 'x', output: [] } }) + named('response.output_item.added', { output_index: 0, item: { id: 'r1', type: 'reasoning' } })],
    ['gemini', frame({ candidates: [{ content: { parts: [{ text: 'hidden', thought: true }] } }] })],
    ['gemini', frame({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'x' } }] } }] })],
  ];
  for (const [from, wire] of examples) {
    const to = from === 'claude' ? 'openai-chat' : 'claude';
    assertError(to, await new Response(translateProtocolStream(bytes(wire), from, to)).text());
  }
});

test('Responses truncation cannot become completion, including a missing output_item.done', async () => {
  for (const wire of [
    named('response.created', { response: { id: 'x', output: [] } }),
    source('openai-response').replace(/event: response\.incomplete[\s\S]*$/, ''),
    source('openai-response').replace(/event: response\.output_item\.done\ndata: [^\n]*\n\n/g, ''),
  ]) assertError('claude', await new Response(translateProtocolStream(bytes(wire), 'openai-response', 'claude')).text());
});

test('interleaved Responses tool arguments become legal serialized Claude blocks', async () => {
  let wire = named('response.created', { response: { id: 'x', output: [] } });
  const output = tools.map((tool, n) => ({ id: `fc_${n}`, type: 'function_call', call_id: tool.id, name: tool.name, arguments: JSON.stringify(tool.args), status: 'completed' }));
  output.forEach((item, output_index) => { wire += named('response.output_item.added', { output_index, item: { ...item, status: 'in_progress', arguments: '' } }); });
  wire += named('response.function_call_arguments.delta', { output_index: 0, item_id: 'fc_0', delta: argumentsParts[0] });
  wire += named('response.function_call_arguments.delta', { output_index: 1, item_id: 'fc_1', delta: '{}' });
  wire += named('response.output_item.done', { output_index: 1, item: output[1] });
  wire += named('response.function_call_arguments.delta', { output_index: 0, item_id: 'fc_0', delta: argumentsParts[1] });
  wire += named('response.output_item.done', { output_index: 0, item: output[0] });
  wire += named('response.completed', { response: { id: 'x', status: 'completed', output, usage: { input_tokens: 1, output_tokens: 2 } } });
  const actual = normalized('claude', events(await new Response(translateProtocolStream(bytes(wire, true), 'openai-response', 'claude')).text()));
  assert.deepEqual(actual.tools, tools);
});

for (const from of protocols) for (const to of protocols) {
  if (from === to) continue;
  test(`${from} -> ${to}: content filtering remains an explicit filtered finish`, async () => {
    const wire = await new Response(translateProtocolStream(bytes(source(from, 'filter')), from, to)).text();
    const actual = normalized(to, events(wire));
    assert.equal(actual.finish, { claude: 'refusal', 'openai-chat': 'content_filter', 'openai-response': 'content_filter', gemini: 'SAFETY' }[to]);
  });
}

test('late Chat metadata after argument fragments is retained exactly, not guessed', async () => {
  const chunk = (tool_calls, finish_reason = null) => frame({ choices: [{ index: 0, delta: tool_calls ? { tool_calls } : {}, finish_reason }] });
  const wire = chunk([{ index: 0, function: { arguments: '{"x":' } }])
    + chunk([{ index: 0, id: 'call_', function: { name: 'read_', arguments: '1' } }])
    + chunk([{ index: 0, id: 'late', function: { name: 'file', arguments: '}' } }])
    + chunk(null, 'tool_calls') + 'data: [DONE]\n\n';
  for (const to of ['claude', 'openai-response', 'gemini']) {
    const actual = normalized(to, events(await new Response(translateProtocolStream(bytes(wire, true), 'openai-chat', to)).text()));
    assert.deepEqual(actual.tools, [{ id: 'call_late', name: 'read_file', args: { x: 1 } }]);
  }
});

test('Gemini terminal can be followed by usage with an empty candidate list', async () => {
  const wire = frame({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] })
    + frame({ candidates: [], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3, totalTokenCount: 15 } });
  const actual = normalized('claude', events(await new Response(translateProtocolStream(bytes(wire, true), 'gemini', 'claude')).text()));
  assert.equal(actual.input, 12);
  assert.equal(actual.output, 3);
});

test('Gemini without a function ID gets a stable ID and omitted args become an empty object', async () => {
  const wire = frame({ candidates: [{ content: { parts: [{ functionCall: { name: 'empty' } }] }, finishReason: 'STOP' }] });
  const actual = normalized('openai-response', events(await new Response(translateProtocolStream(bytes(wire), 'gemini', 'openai-response')).text()));
  assert.match(actual.tools[0].id, /^call_gateway_[a-f0-9]{32}$/u);
  assert.deepEqual(actual.tools, [{ id: actual.tools[0].id, name: 'empty', args: {} }]);
});

for (const to of ['claude', 'openai-response', 'openai-chat']) {
  test(`Gemini -> ${to}: generated tool IDs are unique across streams and preserve supplied IDs`, async () => {
    const input = frame({ candidates: [{ content: { parts: [
      { functionCall: { name: 'first' } }, { functionCall: { name: 'second' } },
      { functionCall: { id: 'call_upstream', name: 'supplied', args: {} } },
    ] }, finishReason: 'STOP' }] });
    const generated = [];
    for (let conversation = 0; conversation < 3; conversation++) {
      const data = events(await new Response(translateProtocolStream(bytes(input, true), 'gemini', to)).text());
      const actual = normalized(to, data);
      assert.deepEqual(actual.tools.map(({ name, args }) => ({ name, args })), [
        { name: 'first', args: {} }, { name: 'second', args: {} }, { name: 'supplied', args: {} },
      ]);
      assert.equal(actual.tools[2].id, 'call_upstream');
      generated.push(...actual.tools.slice(0, 2).map((tool) => tool.id));
      if (to === 'openai-response') {
        for (const type of ['response.output_item.added', 'response.output_item.done']) {
          assert.deepEqual(data.filter((event) => event.type === type).map((event) => event.item.call_id), actual.tools.map((tool) => tool.id));
        }
      }
    }
    assert.equal(new Set(generated).size, 6);
  });
}

test('malformed content after a terminal source event cannot produce a successful client terminal', async () => {
  const wire = source('openai-chat') + 'data: {bad}\n\n';
  assertError('claude', await new Response(translateProtocolStream(bytes(wire), 'openai-chat', 'claude')).text());
});

test('a throwing onError observer cannot erase the protocol error', async () => {
  const wire = await new Response(translateProtocolStream(bytes('data: broken\n\n'), 'openai-chat', 'claude', '', { onError() { throw new Error('observer failure'); } })).text();
  assertError('claude', wire);
  assert.match(wire, /Malformed SSE JSON/);
});

test('cancellation while an upstream read is pending is propagated without an error callback', async () => {
  let cancelled;
  let errors = 0;
  const upstream = new ReadableStream({ cancel(reason) { cancelled = reason; } });
  const reader = translateProtocolStream(upstream, 'openai-chat', 'claude', '', { onError() { errors++; } }).getReader();
  const read = reader.read();
  await reader.cancel('cancel pending');
  assert.deepEqual(await read, { value: undefined, done: true });
  assert.equal(cancelled, 'cancel pending');
  assert.equal(errors, 0);
  assert.equal(upstream.locked, false);
});

test('an error cancels upstream, releases its reader and reports one validation failure', async () => {
  let cancelled;
  let errors = 0;
  const upstream = new ReadableStream({
    start(controller) { controller.enqueue(encoder.encode('data: broken\n\n')); },
    cancel(reason) { cancelled = reason; },
  });
  assertError('claude', await new Response(translateProtocolStream(upstream, 'openai-chat', 'claude', '', { onError() { errors++; } })).text());
  assert.equal(errors, 1);
  assert.equal(cancelled.code, 'MALFORMED_PROTOCOL_STREAM');
  assert.equal(upstream.locked, false);
});

test('Responses terminal status or final content inconsistent with the stream is an error', async () => {
  for (const wire of [
    source('openai-response', 'stop').replace('"status":"completed","output":', '"status":"failed","output":'),
    source('openai-response', 'stop').replace('"arguments":"{\\"city\\":\\"\u6771\u4eac\\"}","status":"completed"', '"arguments":"{}","status":"completed"'),
  ]) assertError('claude', await new Response(translateProtocolStream(bytes(wire), 'openai-response', 'claude')).text());
});

test('prototype property names are not accepted as valid finish reasons', async () => {
  for (const reason of ['toString', 'constructor', '__proto__']) {
    const chat = frame({ choices: [{ index: 0, delta: {}, finish_reason: reason }] }) + 'data: [DONE]\n\n';
    assertError('claude', await new Response(translateProtocolStream(bytes(chat), 'openai-chat', 'claude')).text());
    const claude = named('message_start', { message: { role: 'assistant', content: [], usage: {} } })
      + named('message_delta', { delta: { stop_reason: reason }, usage: {} }) + named('message_stop');
    assertError('openai-chat', await new Response(translateProtocolStream(bytes(claude), 'claude', 'openai-chat')).text());
    const response = named('response.created', { response: { output: [] } })
      + named('response.incomplete', { response: { status: 'incomplete', output: [], incomplete_details: { reason } } });
    assertError('claude', await new Response(translateProtocolStream(bytes(response), 'openai-response', 'claude')).text());
  }
});

async function observedTranslation(from, to, wire) {
  const errors = [];
  const result = await new Response(translateProtocolStream(bytes(wire, true), from, to, 'client_model', {
    onError(error) { errors.push(error); },
  })).text();
  return { wire: result, data: events(result), errors };
}

function responseTextSource({ itemStatus = 'completed', finalItemStatus = itemStatus, status = 'completed', usage, logprobs } = {}) {
  const part = { type: 'output_text', text: 'ok', annotations: [] };
  const item = { id: 'msg_1', type: 'message', role: 'assistant', status: itemStatus, content: [part] };
  const location = { item_id: item.id, output_index: 0, content_index: 0 };
  return named('response.created', { response: { id: 'resp_1', output: [] } })
    + named('response.output_item.added', { output_index: 0, item: { ...item, status: 'in_progress', content: [] } })
    + named('response.content_part.added', { ...location, part: { ...part, text: '' } })
    + named('response.output_text.delta', { ...location, delta: 'ok' })
    + named('response.output_text.done', { ...location, text: 'ok', ...(logprobs ? { logprobs } : {}) })
    + named('response.content_part.done', { ...location, part })
    + named('response.output_item.done', { output_index: 0, item })
    + named(status === 'completed' ? 'response.completed' : 'response.incomplete', { response: {
      id: 'resp_1', status, output: [{ ...item, status: finalItemStatus }], usage,
      ...(status === 'incomplete' ? { incomplete_details: { reason: 'max_output_tokens' } } : {}),
    } });
}

function toolArgumentSource(protocol, reason = 'length', args = '{"x":"par') {
  const fragments = [args.slice(0, 3), args.slice(3)];
  if (protocol === 'openai-chat') {
    const chunk = (delta, finish_reason = null) => frame({ choices: [{ index: 0, delta, finish_reason }] });
    return chunk({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'f', arguments: '' } }] })
      + fragments.map((argumentsDelta) => chunk({ tool_calls: [{ index: 0, function: { arguments: argumentsDelta } }] })).join('')
      + chunk({}, reason === 'length' ? 'length' : 'tool_calls') + 'data: [DONE]\n\n';
  }
  if (protocol === 'claude') {
    return named('message_start', { message: { id: 'msg_1', role: 'assistant', content: [], usage: {} } })
      + named('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'call_1', name: 'f', input: {} } })
      + fragments.map((partial_json) => named('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json } })).join('')
      + named('content_block_stop', { index: 0 })
      + named('message_delta', { delta: { stop_reason: reason === 'length' ? 'max_tokens' : 'tool_use' }, usage: {} })
      + named('message_stop');
  }
  const item = { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'f', arguments: args, status: reason === 'length' ? 'incomplete' : 'completed' };
  return named('response.created', { response: { id: 'resp_1', output: [] } })
    + named('response.output_item.added', { output_index: 0, item: { ...item, status: 'in_progress', arguments: '' } })
    + fragments.map((delta) => named('response.function_call_arguments.delta', { output_index: 0, item_id: item.id, delta })).join('')
    + named('response.function_call_arguments.done', { output_index: 0, item_id: item.id, arguments: args })
    + named('response.output_item.done', { output_index: 0, item })
    + named(reason === 'length' ? 'response.incomplete' : 'response.completed', { response: {
      id: 'resp_1', status: reason === 'length' ? 'incomplete' : 'completed', output: [item],
      ...(reason === 'length' ? { incomplete_details: { reason: 'max_output_tokens' } } : {}),
    } });
}

for (const to of protocols.filter((protocol) => protocol !== 'openai-response')) {
  test(`Responses -> ${to}: retained item IDs share the aggregate state limit`, async () => {
    let next = -1;
    let cancelled;
    const errors = [];
    const upstream = new ReadableStream({
      pull(controller) {
        if (next === -1) {
          next++;
          controller.enqueue(encoder.encode(named('response.created', { response: { id: 'resp_1', output: [] } })));
        } else if (next < 24) {
          const n = next++;
          controller.enqueue(encoder.encode(named('response.output_item.added', { output_index: n,
            item: { id: `msg_${n}_${'x'.repeat(700 * 1024)}`, type: 'message', role: 'assistant', content: [] },
          })));
        } else {
          controller.enqueue(encoder.encode(named('error', { message: 'fixture exhausted IDs without a limit' })));
          controller.close();
        }
      },
      cancel(reason) { cancelled = reason; },
    });
    const wire = await new Response(translateProtocolStream(upstream, 'openai-response', to, '', { onError(error) { errors.push(error); } })).text();
    assertError(to, wire);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 'STREAM_LIMIT_EXCEEDED');
    assert.equal(cancelled, errors[0]);
    assert.equal(upstream.locked, false);
  });
}

for (const to of protocols.filter((protocol) => protocol !== 'openai-chat')) {
  test(`Chat -> ${to}: pending tool fragments and emitted text share one state budget`, async () => {
    const payload = 'x'.repeat(700 * 1024);
    const errors = [];
    let next = 0;
    let cancelled;
    const upstream = new ReadableStream({
      pull(controller) {
        if (next >= 24) {
          controller.enqueue(encoder.encode(frame({ error: { message: 'fixture exhausted buffers without a limit' } })));
          controller.close();
          return;
        }
        const n = next++;
        const delta = n % 2 === 0 ? { content: payload } : { tool_calls: [{ index: 0,
          ...(n === 1 ? { id: 'call_1', type: 'function' } : {}),
          function: { ...(n === 1 ? { name: 'f' } : {}), arguments: payload },
        }] };
        controller.enqueue(encoder.encode(frame({ choices: [{ index: 0, delta, finish_reason: null }] })));
      },
      cancel(reason) { cancelled = reason; },
    });
    const wire = await new Response(translateProtocolStream(upstream, 'openai-chat', to, '', { onError(error) { errors.push(error); } })).text();
    assertError(to, wire);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 'STREAM_LIMIT_EXCEEDED');
    assert.equal(cancelled, errors[0]);
    assert.equal(upstream.locked, false);
  });
}

const inclusiveUsage = { input: 100, cached: 80, output: 3, total: 103 };
function cachedUsageSource(protocol) {
  if (protocol === 'claude') return named('message_start', { message: { id: 'msg_1', role: 'assistant', content: [],
    usage: { input_tokens: 10, cache_read_input_tokens: 80, cache_creation_input_tokens: 20, output_tokens: 0 },
  } }) + named('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } }) + named('message_stop');
  if (protocol === 'openai-response') return responseTextSource({ usage: {
    input_tokens: 100, output_tokens: 3, total_tokens: 103, input_tokens_details: { cached_tokens: 80 },
  } });
  if (protocol === 'openai-chat') return frame({ choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }] })
    + frame({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 3, total_tokens: 103, prompt_tokens_details: { cached_tokens: 80 } } })
    + 'data: [DONE]\n\n';
  return frame({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] })
    + frame({ usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 3, totalTokenCount: 103, cachedContentTokenCount: 80 } });
}

for (const from of protocols) for (const to of protocols) {
  if (from === to) continue;
  test(`${from} -> ${to}: cached usage uses inclusive input without double counting partial updates`, async () => {
    const { data, errors } = await observedTranslation(from, to, cachedUsageSource(from));
    assert.deepEqual(errors, []);
    const expected = from === 'claude' ? { input: 110, cached: 80, cacheCreation: 20, output: 3, total: 113 } : { ...inclusiveUsage, cacheCreation: 0 };
    if (to === 'claude') {
      const usage = data.findLast((event) => event.type === 'message_delta').usage;
      assert.equal(usage.input_tokens, expected.input - expected.cached - expected.cacheCreation);
      assert.equal(usage.output_tokens, expected.output);
      assert.equal(usage.cache_read_input_tokens, expected.cached);
      assert.equal(usage.cache_creation_input_tokens ?? 0, expected.cacheCreation);
    } else if (to === 'openai-chat') {
      const usage = data.findLast((event) => event.usage).usage;
      assert.deepEqual(usage, { prompt_tokens: expected.input, completion_tokens: expected.output, total_tokens: expected.total,
        prompt_tokens_details: { cached_tokens: expected.cached } });
    } else if (to === 'openai-response') {
      const usage = data.at(-1).response.usage;
      assert.equal(usage.input_tokens, expected.input);
      assert.equal(usage.output_tokens, expected.output);
      assert.equal(usage.total_tokens, expected.total);
      assert.equal(usage.input_tokens_details.cached_tokens, expected.cached);
    } else {
      const usage = data.at(-1).usageMetadata;
      assert.deepEqual(usage, { promptTokenCount: expected.input, candidatesTokenCount: expected.output, totalTokenCount: expected.total,
        cachedContentTokenCount: expected.cached });
    }
  });
}

for (const from of ['claude', 'openai-chat', 'openai-response']) for (const to of protocols) {
  if (from === to) continue;
  test(`${from} -> ${to}: length-truncated tool arguments retain deltas or explicitly reject Gemini`, async () => {
    const { wire, data, errors } = await observedTranslation(from, to, toolArgumentSource(from));
    if (to === 'gemini') {
      assertError(to, wire);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].code, 'UNSUPPORTED_STREAM_CONTENT');
      assert.ok(!data.some((event) => event.candidates?.some((candidate) => candidate.finishReason || candidate.content?.parts.some((part) => part.functionCall))));
      return;
    }
    assert.deepEqual(errors, []);
    if (to === 'claude') {
      const fragments = data.filter((event) => event.type === 'content_block_delta').map((event) => event.delta.partial_json);
      assert.deepEqual(fragments, ['{"x', '":"par']);
      assert.equal(data.at(-2).delta.stop_reason, 'max_tokens');
      assert.equal(data.at(-1).type, 'message_stop');
    } else if (to === 'openai-chat') {
      const fragments = data.flatMap((event) => event.choices?.[0]?.delta.tool_calls || []).map((call) => call.function.arguments).filter(Boolean);
      assert.deepEqual(fragments, ['{"x', '":"par']);
      assert.ok(data.some((event) => event.choices?.[0]?.finish_reason === 'length'));
      assert.equal(data.at(-1), '[DONE]');
    } else {
      assert.deepEqual(data.filter((event) => event.type === 'response.function_call_arguments.delta').map((event) => event.delta), ['{"x', '":"par']);
      assert.equal(data.at(-1).type, 'response.incomplete');
      assert.equal(data.at(-1).response.incomplete_details.reason, 'max_output_tokens');
      assert.equal(data.at(-1).response.output[0].arguments, '{"x":"par');
      assert.equal(data.at(-1).response.output[0].status, 'incomplete');
      assert.equal(data.find((event) => event.type === 'response.output_item.done').item.status, 'incomplete');
    }
  });

  test(`${from} -> ${to}: malformed arguments with a successful tool finish still fail`, async () => {
    const { wire, errors } = await observedTranslation(from, to, toolArgumentSource(from, 'stop', '{bad}'));
    assertError(to, wire);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 'MALFORMED_PROTOCOL_STREAM');
  });

  test(`${from} -> ${to}: a length finish does not permit non-object JSON arguments`, async () => {
    const { wire, errors } = await observedTranslation(from, to, toolArgumentSource(from, 'length', '[]'));
    assertError(to, wire);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 'MALFORMED_PROTOCOL_STREAM');
  });
}

const logprobs = [{ token: 'ok', logprob: -0.2, top_logprobs: [] }];
const unsupportedMetadata = [
  ['openai-chat', 'choice logprobs', frame({ choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop', logprobs: { content: logprobs } }] }) + 'data: [DONE]\n\n'],
  ['openai-response', 'text done logprobs', responseTextSource({ logprobs })],
  ...['citationMetadata', 'groundingMetadata', 'logprobsResult'].map((field) => ['gemini', field,
    frame({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP', [field]: { fixture: true } }] }),
  ]),
];
for (const [from, label, input] of unsupportedMetadata) for (const to of protocols.filter((protocol) => protocol !== from)) {
  test(`${from} -> ${to}: unsupported ${label} is not silently discarded`, async () => {
    const { wire, errors } = await observedTranslation(from, to, input);
    assertError(to, wire);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 'UNSUPPORTED_STREAM_CONTENT');
  });
}

for (const to of protocols.filter((protocol) => protocol !== 'gemini')) {
  test(`Gemini -> ${to}: unspecified prompt blocking is not an actual block`, async () => {
    const { data, errors } = await observedTranslation('gemini', to, frame({ promptFeedback: { blockReason: 'BLOCK_REASON_UNSPECIFIED' },
      candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
    }));
    assert.deepEqual(errors, []);
    assert.equal(normalized(to, data).text, 'ok');
    const incomplete = await observedTranslation('gemini', to, frame({ promptFeedback: { blockReason: 'BLOCK_REASON_UNSPECIFIED' }, candidates: [], usageMetadata: {} }));
    assertError(to, incomplete.wire);
    assert.equal(incomplete.errors[0].code, 'TRUNCATED_PROTOCOL_STREAM');
  });

  test(`Gemini -> ${to}: known prompt blocks remain filtered and unknown block reasons fail`, async () => {
    const blocked = await observedTranslation('gemini', to, frame({ promptFeedback: { blockReason: 'SAFETY' } }));
    assert.deepEqual(blocked.errors, []);
    assert.equal(normalized(to, blocked.data).finish, { claude: 'refusal', 'openai-chat': 'content_filter', 'openai-response': 'content_filter' }[to]);
    const unknown = await observedTranslation('gemini', to, frame({ promptFeedback: { blockReason: 'NOT_A_REASON' } }));
    assertError(to, unknown.wire);
    assert.equal(unknown.errors[0].code, 'UNSUPPORTED_STREAM_CONTENT');
  });
}

const invalidResponseStatuses = [
  ['incomplete item in completed response', { itemStatus: 'incomplete' }],
  ['in-progress item stop', { itemStatus: 'in_progress' }],
  ['unknown item stop', { itemStatus: 'unknown' }],
  ['null item stop', { itemStatus: null }],
  ['final item becomes in-progress', { finalItemStatus: 'in_progress' }],
  ['final item becomes incomplete', { finalItemStatus: 'incomplete', status: 'incomplete' }],
  ['final item becomes completed', { itemStatus: 'incomplete', finalItemStatus: 'completed', status: 'incomplete' }],
];
for (const to of protocols.filter((protocol) => protocol !== 'openai-response')) {
  for (const [label, options] of invalidResponseStatuses) test(`Responses -> ${to}: reject ${label}`, async () => {
    const { wire, errors } = await observedTranslation('openai-response', to, responseTextSource(options));
    assertError(to, wire);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 'MALFORMED_PROTOCOL_STREAM');
  });

  test(`Responses -> ${to}: consistent incomplete item status remains a length finish`, async () => {
    const { data, errors } = await observedTranslation('openai-response', to, responseTextSource({ itemStatus: 'incomplete', status: 'incomplete' }));
    assert.deepEqual(errors, []);
    assert.equal(normalized(to, data).finish, { claude: 'max_tokens', 'openai-chat': 'length', gemini: 'MAX_TOKENS' }[to]);
  });

  test(`Responses -> ${to}: optional function-call status may be omitted in finalized items`, async () => {
    const input = events(toolArgumentSource('openai-response', 'stop', '{}')).map((event) => {
      if (event.item?.type === 'function_call') delete event.item.status;
      for (const item of event.response?.output || []) if (item.type === 'function_call') delete item.status;
      return named(event.type, event);
    }).join('');
    const { data, errors } = await observedTranslation('openai-response', to, input);
    assert.deepEqual(errors, []);
    assert.deepEqual(normalized(to, data).tools, [{ id: 'call_1', name: 'f', args: {} }]);
  });

  test(`Responses -> ${to}: null function-call status is malformed at item stop and terminal snapshot`, async () => {
    for (const at of ['response.output_item.done', 'response.completed']) {
      const input = events(toolArgumentSource('openai-response', 'stop', '{}')).map((event) => {
        if (event.type === at) {
          if (event.item) event.item.status = null;
          else event.response.output[0].status = null;
        }
        return named(event.type, event);
      }).join('');
      const invalidItem = await observedTranslation('openai-response', to, input);
      assertError(to, invalidItem.wire);
      assert.equal(invalidItem.errors[0].code, 'MALFORMED_PROTOCOL_STREAM');
      assert.match(invalidItem.errors[0].message, /item status is not final/);
    }
  });

  test(`Responses -> ${to}: completed response cannot carry incomplete_details`, async () => {
    const invalidDetails = await observedTranslation('openai-response', to,
      responseTextSource().replace('"status":"completed","output":', '"status":"completed","incomplete_details":{"reason":"max_output_tokens"},"output":'));
    assertError(to, invalidDetails.wire);
    assert.equal(invalidDetails.errors[0].code, 'MALFORMED_PROTOCOL_STREAM');
  });
}

for (const to of ['claude', 'openai-chat', 'openai-response']) {
  test(`Gemini -> ${to}: a native dotted tool name is refused, not renamed`, async () => {
    const input = frame({ candidates: [{ content: { parts: [{ functionCall: { id: 'call_1', name: 'file.read', args: {} } }] }, finishReason: 'STOP' }] });
    const { wire, errors } = await observedTranslation('gemini', to, input);
    assertError(to, wire);
    assert.equal(errors[0].code, 'UNSUPPORTED_STREAM_CONTENT');
    assert.match(errors[0].message, /file\.read/);
    assert.doesNotMatch(wire, /"name":"file_read"/);
  });
}

for (const from of protocols) for (const to of protocols) {
  if (from === to) continue;
  const maxLength = to === 'claude' ? 128 : 64;
  test(`${from} -> ${to}: target tool names enforce their alphabet and ${maxLength}-character limit`, async () => {
    const fixture = (name) => from === 'gemini'
      ? frame({ candidates: [{ content: { parts: [{ functionCall: { name, args: {} } }] }, finishReason: 'STOP' }] })
      : toolArgumentSource(from, 'stop', '{}').replaceAll('"name":"f"', `"name":${JSON.stringify(name)}`);
    for (const name of ['f'.repeat(maxLength + 1), 'file/read', 'read\n', 'read\u00e9', ...(to === 'gemini' ? ['1read', 'file:read'] : ['file.read'])]) {
      const { wire, errors } = await observedTranslation(from, to, fixture(name));
      assertError(to, wire);
      assert.equal(errors[0].code, 'UNSUPPORTED_STREAM_CONTENT');
    }
    for (const length of to === 'claude' ? [64, 65, 128] : [64]) {
      const name = `_${'a'.repeat(length - 3)}-1`;
      const valid = await observedTranslation(from, to, fixture(name));
      assert.deepEqual(valid.errors, []);
      assert.equal(normalized(to, valid.data).tools[0].name, name);
    }
    if (to !== 'gemini') {
      const digit = await observedTranslation(from, to, fixture('1read'));
      assert.deepEqual(digit.errors, []);
      assert.equal(normalized(to, digit.data).tools[0].name, '1read');
    }
    if (to === 'gemini') {
      const dotted = await observedTranslation(from, to, fixture('file.read-v2'));
      assert.deepEqual(dotted.errors, []);
      assert.equal(normalized(to, dotted.data).tools[0].name, 'file.read-v2');
    }
  });
}

test('same-protocol Gemini keeps native tool names opaque', () => {
  const body = bytes(frame({ candidates: [{ content: { parts: [{ functionCall: { name: 'file.read', args: {} } }] }, finishReason: 'STOP' }] }));
  assert.equal(translateProtocolStream(body, 'gemini', 'gemini'), body);
  assert.equal(body.locked, false);
});
