import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROTOCOLS,
  ProtocolCompatibilityError,
  supportsProtocolTranslation,
  translateRequest,
  translateResponse,
  protocolError,
  extractProtocolUserText,
} from '../../../../../lib/tooling/model-router/gateway/compatibility/protocol-codec.mjs';

const schema = { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] };
const instructions = 'Be careful.';
const tools = {
  claude: [{ name: 'read_file', description: 'Read a file', input_schema: schema }],
  'openai-chat': [{ type: 'function', function: { name: 'read_file', description: 'Read a file', parameters: schema } }],
  'openai-response': [{ type: 'function', name: 'read_file', description: 'Read a file', parameters: schema, strict: false }],
  gemini: [{ functionDeclarations: [{ name: 'read_file', description: 'Read a file', parameters: schema }] }],
};
const plainRequests = {
  claude: { model: 'test-model', system: instructions, max_tokens: 128, temperature: 0.4, top_p: 0.8, messages: [{ role: 'user', content: 'Hello' }] },
  'openai-chat': { model: 'test-model', max_tokens: 128, temperature: 0.4, top_p: 0.8, messages: [{ role: 'system', content: instructions }, { role: 'user', content: 'Hello' }] },
  'openai-response': { model: 'test-model', max_output_tokens: 128, temperature: 0.4, top_p: 0.8, instructions, input: 'Hello' },
  gemini: { systemInstruction: { parts: [{ text: instructions }] }, generationConfig: { maxOutputTokens: 128, temperature: 0.4, topP: 0.8 }, contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] },
};

// Each fixture is independently written in the vendor wire format, not produced by the codec.
const toolRequests = {
  claude: {
    ...plainRequests.claude, tools: tools.claude, tool_choice: { type: 'tool', name: 'read_file' },
    messages: [
      { role: 'user', content: 'Read two files' },
      { role: 'assistant', content: [{ type: 'text', text: 'Reading' }, { type: 'tool_use', id: 'call_a', name: 'read_file', input: { path: 'a' } }, { type: 'tool_use', id: 'call_b', name: 'read_file', input: { path: 'b' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_a', content: 'A' }, { type: 'tool_result', tool_use_id: 'call_b', content: [{ type: 'text', text: 'B' }] }, { type: 'text', text: 'Summarize' }] },
    ],
  },
  'openai-chat': {
    ...plainRequests['openai-chat'], tools: tools['openai-chat'], tool_choice: { type: 'function', function: { name: 'read_file' } },
    messages: [
      { role: 'system', content: instructions }, { role: 'user', content: 'Read two files' },
      { role: 'assistant', content: 'Reading', tool_calls: [{ id: 'call_a', type: 'function', function: { name: 'read_file', arguments: '{"path":"a"}' } }, { id: 'call_b', type: 'function', function: { name: 'read_file', arguments: '{"path":"b"}' } }] },
      { role: 'tool', tool_call_id: 'call_a', content: 'A' }, { role: 'tool', tool_call_id: 'call_b', content: 'B' }, { role: 'user', content: 'Summarize' },
    ],
  },
  'openai-response': {
    ...plainRequests['openai-response'], tools: tools['openai-response'], tool_choice: { type: 'function', name: 'read_file' },
    input: [
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Read two files' }] },
      { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Reading', annotations: [] }] },
      { type: 'function_call', id: 'fc_a', call_id: 'call_a', name: 'read_file', arguments: '{"path":"a"}', status: 'completed' },
      { type: 'function_call', id: 'fc_b', call_id: 'call_b', name: 'read_file', arguments: '{"path":"b"}', status: 'completed' },
      { type: 'function_call_output', call_id: 'call_a', output: 'A' }, { type: 'function_call_output', call_id: 'call_b', output: 'B' },
      { role: 'user', content: 'Summarize' },
    ],
  },
  gemini: {
    ...plainRequests.gemini, tools: tools.gemini, toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['read_file'] } },
    contents: [
      { role: 'user', parts: [{ text: 'Read two files' }] },
      { role: 'model', parts: [{ text: 'Reading' }, { functionCall: { id: 'call_a', name: 'read_file', args: { path: 'a' } } }, { functionCall: { id: 'call_b', name: 'read_file', args: { path: 'b' } } }] },
      { role: 'user', parts: [{ functionResponse: { id: 'call_a', name: 'read_file', response: { content: 'A' } } }, { functionResponse: { id: 'call_b', name: 'read_file', response: { content: 'B' } } }, { text: 'Summarize' }] },
    ],
  },
};

const plainResponses = {
  claude: { id: 'upstream_1', type: 'message', role: 'assistant', model: 'test-model', content: [{ type: 'text', text: 'Hello!' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 11, output_tokens: 7 } },
  'openai-chat': { id: 'upstream_1', object: 'chat.completion', created: 1700000000, model: 'test-model', choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }], usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } },
  'openai-response': { id: 'upstream_1', object: 'response', created_at: 1700000000, model: 'test-model', status: 'completed', error: null, output: [{ type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Hello!', annotations: [] }] }], usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 } },
  gemini: { responseId: 'upstream_1', modelVersion: 'test-model', createTime: '2023-11-14T22:13:20Z', candidates: [{ index: 0, content: { role: 'model', parts: [{ text: 'Hello!' }] }, finishReason: 'STOP', safetyRatings: [] }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 } },
};

const toolResponses = {
  claude: { ...plainResponses.claude, stop_reason: 'tool_use', content: [{ type: 'text', text: 'Reading' }, { type: 'tool_use', id: 'call_a', name: 'read_file', input: { path: 'a' } }, { type: 'tool_use', id: 'call_b', name: 'read_file', input: { path: 'b' } }] },
  'openai-chat': { ...plainResponses['openai-chat'], choices: [{ index: 0, message: { role: 'assistant', content: 'Reading', tool_calls: [{ id: 'call_a', type: 'function', function: { name: 'read_file', arguments: '{"path":"a"}' } }, { id: 'call_b', type: 'function', function: { name: 'read_file', arguments: '{"path":"b"}' } }] }, finish_reason: 'tool_calls' }] },
  'openai-response': { ...plainResponses['openai-response'], output: [{ type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Reading', annotations: [] }] }, { type: 'function_call', id: 'fc_a', call_id: 'call_a', name: 'read_file', arguments: '{"path":"a"}', status: 'completed' }, { type: 'function_call', id: 'fc_b', call_id: 'call_b', name: 'read_file', arguments: '{"path":"b"}', status: 'completed' }] },
  gemini: { ...plainResponses.gemini, candidates: [{ content: { role: 'model', parts: [{ text: 'Reading' }, { functionCall: { id: 'call_a', name: 'read_file', args: { path: 'a' } } }, { functionCall: { id: 'call_b', name: 'read_file', args: { path: 'b' } } }] }, finishReason: 'STOP' }] },
};

function inspectRequest(body, protocol) {
  let messages;
  let system;
  let declarations;
  let choice;
  let params;
  if (protocol === 'claude') {
    system = typeof body.system === 'string' ? body.system : body.system?.map((part) => part.text).join('');
    messages = body.messages.flatMap((message) => (typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content).map((part) => ({ ...part, role: message.role })));
    declarations = body.tools;
    choice = body.tool_choice?.name;
    params = [body.max_tokens, body.temperature, body.top_p];
  } else if (protocol === 'openai-chat') {
    system = body.messages.filter((message) => ['system', 'developer'].includes(message.role)).map((message) => typeof message.content === 'string' ? message.content : message.content.map((part) => part.text).join('')).join('\n');
    messages = body.messages.filter((message) => !['system', 'developer'].includes(message.role)).flatMap((message) => [
      ...(message.role === 'tool' ? [{ type: 'tool_result', tool_use_id: message.tool_call_id, content: message.content }] : typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content || []),
      ...(message.tool_calls || []).map((call) => ({ type: 'tool_use', id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments) })),
    ]);
    declarations = body.tools?.map((entry) => ({ ...entry.function, input_schema: entry.function.parameters }));
    choice = body.tool_choice?.function?.name;
    params = [body.max_tokens ?? body.max_completion_tokens, body.temperature, body.top_p];
  } else if (protocol === 'openai-response') {
    const input = typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : body.input;
    system = [body.instructions, ...input.filter((item) => ['system', 'developer'].includes(item.role)).map((item) => typeof item.content === 'string' ? item.content : item.content.map((part) => part.text).join(''))].filter(Boolean).join('\n');
    messages = input.filter((item) => !['system', 'developer'].includes(item.role)).flatMap((item) => item.type === 'function_call' ? [{ type: 'tool_use', id: item.call_id, name: item.name, input: JSON.parse(item.arguments) }] : item.type === 'function_call_output' ? [{ type: 'tool_result', tool_use_id: item.call_id, content: item.output }] : typeof item.content === 'string' ? [{ type: 'text', text: item.content }] : item.content.map((part) => part.type.endsWith('_text') ? { ...part, type: 'text' } : part));
    declarations = body.tools?.map((entry) => ({ ...entry, input_schema: entry.parameters }));
    choice = body.tool_choice?.name;
    params = [body.max_output_tokens, body.temperature, body.top_p];
  } else {
    system = body.systemInstruction?.parts.map((part) => part.text).join('\n');
    messages = body.contents.flatMap((message) => message.parts.map((part) => part.functionCall ? { type: 'tool_use', id: part.functionCall.id, name: part.functionCall.name, input: part.functionCall.args } : part.functionResponse ? { type: 'tool_result', tool_use_id: part.functionResponse.id, name: part.functionResponse.name, content: part.functionResponse.response.content } : own(part, 'text') ? { type: 'text', text: part.text } : part));
    declarations = body.tools?.flatMap((entry) => entry.functionDeclarations.map((fn) => ({ ...fn, input_schema: fn.parametersJsonSchema ?? fn.parameters })));
    choice = body.toolConfig?.functionCallingConfig?.allowedFunctionNames?.[0];
    params = [body.generationConfig?.maxOutputTokens, body.generationConfig?.temperature, body.generationConfig?.topP];
  }
  return { system, messages, declarations, choice, params };
}

const own = (value, key) => Object.hasOwn(value, key);

function inspectResponse(body, protocol) {
  if (protocol === 'claude') return { text: body.content.filter((part) => part.type === 'text').map((part) => part.text).join(''), calls: body.content.filter((part) => part.type === 'tool_use').map((part) => ({ id: part.id, name: part.name, args: part.input })), stop: body.stop_reason, usage: [body.usage.input_tokens, body.usage.output_tokens], model: body.model };
  if (protocol === 'openai-chat') return { text: body.choices[0].message.content || '', calls: (body.choices[0].message.tool_calls || []).map((call) => ({ id: call.id, name: call.function.name, args: JSON.parse(call.function.arguments) })), stop: body.choices[0].finish_reason, usage: [body.usage.prompt_tokens, body.usage.completion_tokens], total: body.usage.total_tokens, model: body.model };
  if (protocol === 'openai-response') return { text: body.output.filter((item) => item.type === 'message').flatMap((item) => item.content).filter((part) => part.type === 'output_text').map((part) => part.text).join(''), calls: body.output.filter((item) => item.type === 'function_call').map((call) => ({ id: call.call_id, name: call.name, args: JSON.parse(call.arguments) })), stop: body.status, usage: [body.usage.input_tokens, body.usage.output_tokens], total: body.usage.total_tokens, model: body.model };
  return { text: body.candidates[0].content.parts.filter((part) => own(part, 'text')).map((part) => part.text).join(''), calls: body.candidates[0].content.parts.filter((part) => part.functionCall).map((part) => ({ id: part.functionCall.id, name: part.functionCall.name, args: part.functionCall.args })), stop: body.candidates[0].finishReason, usage: [body.usageMetadata.promptTokenCount, body.usageMetadata.candidatesTokenCount], total: body.usageMetadata.totalTokenCount, model: body.modelVersion };
}

function expectError(fn, code, pattern) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ProtocolCompatibilityError, error?.stack);
    assert.equal(error.code, code);
    assert.equal(error.status, code === 'INVALID_UPSTREAM_RESPONSE' ? 502 : 400);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

test('capability matrix covers every valid pair including streaming; identities preserve extensions', () => {
  assert.deepEqual(PROTOCOLS, ['claude', 'openai-response', 'openai-chat', 'gemini']);
  for (const from of PROTOCOLS) for (const to of PROTOCOLS) {
    assert.equal(supportsProtocolTranslation(from, to), true);
    assert.equal(supportsProtocolTranslation(from, to, { stream: true }), true);
  }
  for (const protocol of PROTOCOLS) {
    const body = { vendor_extension: { opaque: true } };
    assert.equal(translateRequest(body, protocol, protocol), body);
    assert.equal(translateResponse(body, protocol, protocol), body);
  }
  assert.equal(supportsProtocolTranslation('responses', 'claude'), false);
  expectError(() => translateRequest({}, 'unknown', 'claude'), 'UNSUPPORTED_PROTOCOL_FEATURE', /Unknown protocol/u);
  assert.equal(new ProtocolCompatibilityError('unsupported').code, 'UNSUPPORTED_PROTOCOL_FEATURE');
});

for (const from of PROTOCOLS) for (const to of PROTOCOLS) {
  if (from === to) continue;
  test(`${from} -> ${to}: text, instructions, and generation request fields`, () => {
    const source = structuredClone(plainRequests[from]);
    const before = structuredClone(source);
    const translated = translateRequest(source, from, to);
    const actual = inspectRequest(translated, to);
    assert.deepEqual(actual.params, [128, 0.4, 0.8]);
    assert.equal(actual.system, instructions);
    assert.deepEqual(actual.messages.filter((part) => part.type === 'text').map((part) => part.text), ['Hello']);
    assert.equal(extractProtocolUserText(translated, to), 'Hello');
    assert.deepEqual(source, before, 'translation must not mutate the source');
    if (to === 'gemini') assert.equal(translated.model, undefined);
  });

  test(`${from} -> ${to}: multi-turn parallel tools preserve IDs, arguments, results, choice, and names`, () => {
    const source = structuredClone(toolRequests[from]);
    const before = structuredClone(source);
    const translated = translateRequest(source, from, to);
    const actual = inspectRequest(translated, to);
    assert.equal(actual.system, instructions);
    assert.equal(actual.choice, 'read_file');
    assert.deepEqual(actual.declarations[0].input_schema, schema);
    assert.equal(actual.declarations[0].description, 'Read a file');
    assert.deepEqual(actual.messages.filter((part) => part.type === 'tool_use').map(({ id: callId, name, input }) => ({ id: callId, name, input })), [{ id: 'call_a', name: 'read_file', input: { path: 'a' } }, { id: 'call_b', name: 'read_file', input: { path: 'b' } }]);
    assert.deepEqual(actual.messages.filter((part) => part.type === 'tool_result').map((part) => [part.tool_use_id, Array.isArray(part.content) ? part.content.map((block) => block.text).join('') : part.content]), [['call_a', 'A'], ['call_b', 'B']]);
    if (to === 'gemini') assert.deepEqual(actual.messages.filter((part) => part.type === 'tool_result').map((part) => part.name), ['read_file', 'read_file']);
    assert.deepEqual(actual.messages.filter((part) => part.type === 'text').map((part) => part.text), ['Read two files', 'Reading', 'Summarize']);
    if (to === 'openai-chat') {
      const callTurns = translated.messages.filter((message) => message.tool_calls?.length);
      assert.equal(callTurns.length, 1, 'parallel Responses function_call items must be a single valid Chat assistant turn');
      assert.equal(callTurns[0].tool_calls.length, 2);
    }
    assert.deepEqual(source, before);
  });

  test(`${from} -> ${to}: non-stream text response has final wire envelope, usage, and model override`, () => {
    const source = structuredClone(plainResponses[from]);
    const before = structuredClone(source);
    const translated = translateResponse(source, from, to, 'routed-model');
    const actual = inspectResponse(translated, to);
    assert.equal(actual.text, 'Hello!');
    assert.equal(actual.model, 'routed-model');
    assert.deepEqual(actual.usage, [11, 7]);
    assert.deepEqual(actual.calls, []);
    if (to !== 'claude') assert.equal(actual.total, 18);
    if (to === 'openai-chat') assert.ok(Number.isInteger(translated.created));
    if (to === 'openai-response') {
      assert.equal(translated.object, 'response');
      assert.equal(translated.status, 'completed');
      assert.equal(translated.error, null);
      assert.ok(Number.isInteger(translated.created_at));
      assert.ok(translated.output[0].id);
    }
    assert.deepEqual(source, before);
  });

  test(`${from} -> ${to}: non-stream tool calls retain all calls and valid tool finish`, () => {
    const translated = translateResponse(toolResponses[from], from, to);
    const actual = inspectResponse(translated, to);
    assert.equal(actual.text, 'Reading');
    assert.deepEqual(actual.calls, [{ id: 'call_a', name: 'read_file', args: { path: 'a' } }, { id: 'call_b', name: 'read_file', args: { path: 'b' } }]);
    assert.equal(actual.stop, { claude: 'tool_use', 'openai-chat': 'tool_calls', 'openai-response': 'completed', gemini: 'STOP' }[to]);
    assert.deepEqual(actual.usage, [11, 7]);
  });
}

function imageRequest(protocol, remote = false) {
  const body = structuredClone(plainRequests[protocol]);
  const url = remote ? 'https://example.invalid/image.png' : 'data:image/png;base64,aGk=';
  if (protocol === 'claude') body.messages[0].content = [{ type: 'text', text: 'Look' }, { type: 'image', source: remote ? { type: 'url', url } : { type: 'base64', media_type: 'image/png', data: 'aGk=' } }, { type: 'text', text: 'Please' }];
  if (protocol === 'openai-chat') body.messages[1].content = [{ type: 'text', text: 'Look' }, { type: 'image_url', image_url: { url } }, { type: 'text', text: 'Please' }];
  if (protocol === 'openai-response') body.input = [{ role: 'user', content: [{ type: 'input_text', text: 'Look' }, { type: 'input_image', image_url: url }, { type: 'input_text', text: 'Please' }] }];
  if (protocol === 'gemini') body.contents[0].parts = [{ text: 'Look' }, remote ? { fileData: { fileUri: url, mimeType: 'image/png' } } : { inlineData: { mimeType: 'image/png', data: 'aGk=' } }, { text: 'Please' }];
  return body;
}

for (const from of PROTOCOLS) for (const to of PROTOCOLS) {
  if (from === to) continue;
  test(`${from} -> ${to}: inline and HTTP image requests remain images in order`, () => {
    for (const remote of [false, true]) {
      const output = translateRequest(imageRequest(from, remote), from, to);
      const serialized = JSON.stringify(output);
      assert.match(serialized, remote ? /https:\/\/example\.invalid\/image\.png/u : /aGk=/u);
      assert.match(serialized, new RegExp({ claude: '"type":"image"', 'openai-chat': '"type":"image_url"', 'openai-response': '"type":"input_image"', gemini: remote ? '"fileData"' : '"inlineData"' }[to], 'u'));
      assert.ok(serialized.indexOf('Look') < serialized.indexOf(remote ? 'example.invalid' : 'aGk='));
      assert.ok(serialized.indexOf('Please') > serialized.indexOf(remote ? 'example.invalid' : 'aGk='));
    }
  });
}

test('developer instructions and multi-part system content translate instead of disappearing', () => {
  const chat = { messages: [{ role: 'system', content: [{ type: 'text', text: 'System.' }] }, { role: 'developer', content: 'Developer.' }, { role: 'user', content: 'Hi' }] };
  for (const to of ['claude', 'openai-response', 'gemini']) assert.match(inspectRequest(translateRequest(chat, 'openai-chat', to), to).system, /System\.\nDeveloper\./u);
  const responses = { instructions: 'System.', input: [{ role: 'developer', content: 'Developer.' }, { role: 'user', content: [{ type: 'input_text', text: 'Hi' }] }] };
  assert.deepEqual(translateRequest(responses, 'openai-response', 'openai-chat').messages.slice(0, 2).map((message) => message.role), ['system', 'developer']);
  const claude = { system: [{ type: 'text', text: 'First.' }, { type: 'text', text: 'Second.', cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: 'Hi' }] };
  assert.equal(translateRequest(claude, 'claude', 'openai-chat').messages[0].content, 'First.Second.');
});

test('standard stop sequences translate where available; Responses stop loss is explicit', () => {
  const sources = { claude: { ...plainRequests.claude, stop_sequences: ['END'] }, 'openai-chat': { ...plainRequests['openai-chat'], stop: 'END' }, gemini: { ...plainRequests.gemini, generationConfig: { stopSequences: ['END'] } } };
  for (const from of Object.keys(sources)) for (const to of PROTOCOLS) {
    if (from === to) continue;
    if (to === 'openai-response') expectError(() => translateRequest(sources[from], from, to), 'UNSUPPORTED_PROTOCOL_FEATURE', /stop/u);
    else {
      const body = translateRequest(sources[from], from, to);
      assert.deepEqual(to === 'gemini' ? body.generationConfig.stopSequences : body[to === 'claude' ? 'stop_sequences' : 'stop'], ['END']);
    }
  }
});

test('Claude target gets a default token limit but malformed token values are never coerced', () => {
  assert.equal(translateRequest({ messages: [{ role: 'user', content: 'Hi' }] }, 'openai-chat', 'claude').max_tokens, 4096);
  assert.equal(translateRequest({ messages: [{ role: 'user', content: 'Hi' }], max_completion_tokens: 63 }, 'openai-chat', 'claude').max_tokens, 63);
  for (const max_tokens of ['100', null, true, 0, -1, 1.5, Infinity, NaN]) expectError(() => translateRequest({ ...plainRequests.claude, max_tokens }, 'claude', 'openai-chat'), 'INVALID_PROTOCOL_REQUEST', /max_tokens/u);
  expectError(() => translateRequest({ ...plainRequests['openai-chat'], max_completion_tokens: 1 }, 'openai-chat', 'claude'), 'INVALID_PROTOCOL_REQUEST', /conflicting/u);
});

test('tool choice modes translate, including explicit no tools and no parallel execution', () => {
  for (const mode of ['auto', 'none', 'required']) {
    const source = { ...toolRequests['openai-chat'], tool_choice: mode };
    assert.equal(translateRequest(source, 'openai-chat', 'claude').tool_choice.type, mode === 'required' ? 'any' : mode);
    assert.equal(translateRequest(source, 'openai-chat', 'openai-response').tool_choice, mode);
    assert.equal(translateRequest(source, 'openai-chat', 'gemini').toolConfig.functionCallingConfig.mode, { auto: 'AUTO', none: 'NONE', required: 'ANY' }[mode]);
  }
  const source = { ...toolRequests['openai-chat'], parallel_tool_calls: false };
  assert.equal(translateRequest(source, 'openai-chat', 'claude').tool_choice.disable_parallel_tool_use, true);
  assert.equal(translateRequest(source, 'openai-chat', 'openai-response').parallel_tool_calls, false);
  expectError(() => translateRequest(source, 'openai-chat', 'gemini'), 'UNSUPPORTED_PROTOCOL_FEATURE', /parallel/u);
});

test('Gemini missing call IDs are unique and name-only results resolve in history order', () => {
  const source = structuredClone(toolRequests.gemini);
  for (const part of source.contents[1].parts) if (part.functionCall) delete part.functionCall.id;
  for (const part of source.contents[2].parts) if (part.functionResponse) delete part.functionResponse.id;
  for (const to of ['claude', 'openai-chat', 'openai-response']) {
    const parts = inspectRequest(translateRequest(source, 'gemini', to), to).messages;
    const ids = parts.filter((part) => part.type === 'tool_use').map((part) => part.id);
    assert.equal(ids.length, 2);
    assert.ok(ids.every((callId) => typeof callId === 'string' && callId.length));
    assert.notEqual(ids[0], ids[1]);
    assert.deepEqual(parts.filter((part) => part.type === 'tool_result').map((part) => part.tool_use_id), ids);
  }
});

test('structured Gemini function results are serialized, not replaced with empty text', () => {
  const source = structuredClone(toolRequests.gemini);
  source.contents[2].parts[0].functionResponse.response = { output: { size: 12, ok: true } };
  const output = translateRequest(source, 'gemini', 'openai-chat');
  assert.deepEqual(JSON.parse(output.messages.find((message) => message.role === 'tool').content), { output: { size: 12, ok: true } });
});

test('legacy Chat functions and function_call history get linked IDs in all other protocols', () => {
  const source = {
    functions: [{ name: 'read_file', parameters: schema }], function_call: { name: 'read_file' },
    messages: [{ role: 'user', content: 'Read a' }, { role: 'assistant', content: null, function_call: { name: 'read_file', arguments: '{"path":"a"}' } }, { role: 'function', name: 'read_file', content: 'A' }],
  };
  for (const to of ['claude', 'openai-response', 'gemini']) {
    const actual = inspectRequest(translateRequest(source, 'openai-chat', to), to);
    assert.equal(actual.choice, 'read_file');
    assert.deepEqual(actual.declarations[0].input_schema, schema);
    const call = actual.messages.find((part) => part.type === 'tool_use');
    const result = actual.messages.find((part) => part.type === 'tool_result');
    assert.ok(call.id);
    assert.equal(call.id, result.tool_use_id);
    assert.deepEqual(call.input, { path: 'a' });
    if (to === 'gemini') assert.equal(result.name, 'read_file');
    assert.equal(extractProtocolUserText(source, 'openai-chat'), '');
  }
  const response = { choices: [{ message: { role: 'assistant', content: null, function_call: { name: 'read_file', arguments: '{"path":"a"}' } }, finish_reason: 'function_call' }] };
  for (const to of ['claude', 'openai-response', 'gemini']) {
    const actual = inspectResponse(translateResponse(response, 'openai-chat', to), to);
    assert.ok(actual.calls[0].id);
    assert.equal(actual.calls[0].name, 'read_file');
    assert.deepEqual(actual.calls[0].args, { path: 'a' });
  }
});

test('Gemini OpenAPI schemas normalize type enums but JSON schemas are not guessed', () => {
  const source = structuredClone(toolRequests.gemini);
  source.tools[0].functionDeclarations[0].parameters = { type: 'OBJECT', properties: { path: { type: 'STRING' } }, required: ['path'] };
  assert.deepEqual(translateRequest(source, 'gemini', 'claude').tools[0].input_schema, schema);
  const source2 = structuredClone(toolRequests['openai-chat']);
  source2.tools[0].function.parameters = { ...schema, additionalProperties: false };
  assert.deepEqual(translateRequest(source2, 'openai-chat', 'gemini').tools[0].functionDeclarations[0].parametersJsonSchema, { ...schema, additionalProperties: false });
  const nullable = structuredClone(toolRequests.gemini);
  nullable.tools[0].functionDeclarations[0].parameters = { type: 'OBJECT', properties: { path: { type: 'STRING', nullable: true } }, default: { type: 'OBJECT' }, example: { type: 'STRING' } };
  const actual = translateRequest(nullable, 'gemini', 'claude').tools[0].input_schema;
  assert.deepEqual(actual.properties.path, { anyOf: [{ type: 'string' }, { type: 'null' }] });
  assert.deepEqual(actual.default, { type: 'OBJECT' }, 'schema conversion must not rewrite literal default data');
  assert.deepEqual(actual.example, { type: 'STRING' });
});

test('safe transport and audit metadata do not leak vendor-specific request fields', () => {
  const source = { ...plainRequests['openai-response'], stream: true, stream_options: { include_usage: true }, metadata: { trace: 'test' }, user: 'test', safety_identifier: 'test', store: false, background: false, previous_response_id: null, include: [], truncation: 'disabled', text: { format: { type: 'text' } } };
  const chat = translateRequest(source, 'openai-response', 'openai-chat');
  assert.equal(chat.stream, true);
  assert.equal(chat.previous_response_id, undefined);
  assert.equal(chat.store, undefined);
  assert.equal(chat.text, undefined);
  const gemini = translateRequest(source, 'openai-response', 'gemini');
  assert.equal(gemini.stream, undefined);
  assert.equal(gemini.model, undefined);
  assert.equal(extractProtocolUserText(gemini, 'gemini'), 'Hello');
});

test('strict schemas survive OpenAI dialects and reject unsupported guarantees elsewhere', () => {
  const source = structuredClone(toolRequests['openai-response']);
  source.tools[0].strict = true;
  assert.equal(translateRequest(source, 'openai-response', 'openai-chat').tools[0].function.strict, true);
  for (const to of ['claude', 'gemini']) expectError(() => translateRequest(source, 'openai-response', to), 'UNSUPPORTED_PROTOCOL_FEATURE', /strict/u);
});

const unsupportedRequests = [
  ['openai-response', { ...plainRequests['openai-response'], previous_response_id: 'resp_old' }, /previous_response_id/u],
  ['openai-response', { ...plainRequests['openai-response'], conversation: 'conv_old' }, /conversation/u],
  ['openai-response', { ...plainRequests['openai-response'], reasoning: { effort: 'high' } }, /reasoning/u],
  ['openai-response', { ...plainRequests['openai-response'], tools: [{ type: 'web_search' }] }, /built-in\/stateful/u],
  ['openai-response', { ...plainRequests['openai-response'], input: [{ type: 'item_reference', id: 'old' }] }, /item_reference/u],
  ['openai-response', { ...plainRequests['openai-response'], store: true }, /store/u],
  ['openai-response', { ...plainRequests['openai-response'], background: true }, /background/u],
  ['openai-response', { ...plainRequests['openai-response'], text: { format: { type: 'json_schema', name: 'test', schema: {} } } }, /text\.format/u],
  ['claude', { ...plainRequests.claude, thinking: { type: 'enabled', budget_tokens: 1000 } }, /thinking/u],
  ['claude', { ...plainRequests.claude, messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'text', data: 'private' } }] }] }, /document/u],
  ['claude', { ...plainRequests.claude, messages: [{ role: 'assistant', content: [{ type: 'thinking', thinking: 'secret' }] }] }, /thinking/u],
  ['openai-chat', { ...plainRequests['openai-chat'], reasoning_effort: 'high' }, /reasoning_effort/u],
  ['openai-chat', { ...plainRequests['openai-chat'], response_format: { type: 'json_object' } }, /response_format/u],
  ['openai-chat', { ...plainRequests['openai-chat'], messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'aGk=', format: 'wav' } }] }] }, /input_audio/u],
  ['openai-chat', { ...plainRequests['openai-chat'], messages: [{ role: 'user', content: 'Hi', name: 'named_person' }] }, /name/u],
  ['openai-chat', { messages: [{ role: 'user', content: 'Hi' }, { role: 'developer', content: 'Later instruction' }] }, /mid-conversation/u],
  ['openai-chat', { ...plainRequests['openai-chat'], n: 2 }, /multiple/u],
  ['openai-chat', { ...plainRequests['openai-chat'], frequency_penalty: 1 }, /frequency_penalty/u],
  ['gemini', { ...plainRequests.gemini, generationConfig: { thinkingConfig: { thinkingBudget: 100 } } }, /thinkingConfig/u],
  ['gemini', { ...plainRequests.gemini, cachedContent: 'cachedContents/private' }, /cachedContent/u],
  ['gemini', { ...plainRequests.gemini, safetySettings: [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }] }, /safetySettings/u],
  ['gemini', { ...plainRequests.gemini, contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/wav', data: 'aGk=' } }] }] }, /media type/u],
  ['gemini', { ...plainRequests.gemini, tools: [{ googleSearch: {} }] }, /googleSearch/u],
];
for (const [from, body, pattern] of unsupportedRequests) {
  test(`${from}: unsupported request fails explicitly (${pattern.source})`, () => {
    expectError(() => translateRequest(body, from, from === 'claude' ? 'openai-chat' : 'claude'), 'UNSUPPORTED_PROTOCOL_FEATURE', pattern);
  });
}

test('invalid shapes are boundary errors, not JS exceptions or string coercion', () => {
  const cases = [
    ['claude', null], ['openai-chat', []], ['openai-response', 7], ['gemini', 'body'],
    ['claude', { messages: 'hello' }], ['claude', { messages: [] }], ['claude', { messages: [{ role: 'user', content: 12 }] }],
    ['claude', { messages: [{ role: 'user', content: [{ type: 'text', text: false }] }] }],
    ['openai-chat', { messages: [{ role: 'user', content: null }] }], ['openai-chat', { messages: [null] }], ['openai-chat', { messages: [{ role: 'assistant', content: null }] }],
    ['openai-chat', { messages: [{ role: 'bogus', content: 'text' }] }], ['openai-chat', { messages: [{ role: 'user', content: 'hi', tool_calls: [] }] }],
    ['openai-response', { input: {} }], ['openai-response', { input: [{ role: 'user', content: [null] }] }],
    ['gemini', { contents: [{ role: 'assistant', parts: [{ text: 'hi' }] }] }], ['gemini', { contents: [{ parts: [{ text: 1 }] }] }],
    ['gemini', { contents: [{ parts: [{ text: 'hi', inlineData: { mimeType: 'image/png', data: 'aGk=' } }] }] }],
    ['gemini', { ...plainRequests.gemini, generationConfig: null }],
    ['openai-chat', { ...plainRequests['openai-chat'], stream: 'true' }], ['openai-chat', { ...plainRequests['openai-chat'], stream_options: { include_usage: 1 } }],
    ['openai-response', { ...plainRequests['openai-response'], metadata: { trace: [] } }],
    ['claude', { ...plainRequests.claude, stop_sequences: [7] }], ['openai-chat', { ...plainRequests['openai-chat'], temperature: '0.4' }],
    ['claude', { ...plainRequests.claude, tools: [{ name: 'fn', input_schema: [] }] }],
  ];
  for (const [from, body] of cases) expectError(() => translateRequest(body, from, from === 'claude' ? 'openai-chat' : 'claude'), 'INVALID_PROTOCOL_REQUEST');
});

test('malformed nested JSON, timestamps, and file data cannot escape as internal exceptions', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  const source = structuredClone(toolRequests.claude);
  source.messages[1].content[1].input = cyclic;
  expectError(() => translateRequest(source, 'claude', 'openai-chat'), 'INVALID_PROTOCOL_REQUEST', /acyclic/u);
  let nested = {};
  for (let i = 0; i < 120; i++) nested = { child: nested };
  source.messages[1].content[1].input = nested;
  expectError(() => translateRequest(source, 'claude', 'openai-chat'), 'INVALID_PROTOCOL_REQUEST', /depth/u);
  expectError(() => translateResponse({ ...plainResponses['openai-chat'], created: Number.MAX_SAFE_INTEGER }, 'openai-chat', 'gemini'), 'INVALID_UPSTREAM_RESPONSE', /timestamp/u);
  const inlineFile = { contents: [{ parts: [{ fileData: { fileUri: 'data:image/png;base64,aGk=' } }] }] };
  const output = translateRequest(inlineFile, 'gemini', 'claude');
  assert.equal(output.messages[0].content[0].source.data, 'aGk=');
});

test('orphan, duplicate, conflicting, or malformed tool call histories are rejected', () => {
  const orphan = { messages: [{ role: 'tool', tool_call_id: 'missing', content: 'result' }] };
  expectError(() => translateRequest(orphan, 'openai-chat', 'gemini'), 'INVALID_PROTOCOL_REQUEST', /preceding/u);
  const duplicates = structuredClone(toolRequests['openai-chat']);
  duplicates.messages[2].tool_calls[1].id = 'call_a';
  expectError(() => translateRequest(duplicates, 'openai-chat', 'claude'), 'INVALID_PROTOCOL_REQUEST', /duplicate/u);
  for (const argumentsValue of ['{', '[]', 'null', '"text"', '42', {}]) {
    const source = structuredClone(toolRequests['openai-chat']);
    source.messages[2].tool_calls[0].function.arguments = argumentsValue;
    expectError(() => translateRequest(source, 'openai-chat', 'claude'), 'INVALID_PROTOCOL_REQUEST', /arguments/u);
  }
  const mismatch = structuredClone(toolRequests.gemini);
  mismatch.contents[2].parts[0].functionResponse.name = 'wrong_name';
  expectError(() => translateRequest(mismatch, 'gemini', 'claude'), 'INVALID_PROTOCOL_REQUEST', /name does not match/u);
  const duplicateResults = structuredClone(toolRequests.claude);
  duplicateResults.messages[2].content[1].tool_use_id = 'call_a';
  expectError(() => translateRequest(duplicateResults, 'claude', 'openai-chat'), 'INVALID_PROTOCOL_REQUEST', /duplicate result/u);
  const choice = { ...toolRequests['openai-response'], tool_choice: { type: 'function', name: 'missing' } };
  expectError(() => translateRequest(choice, 'openai-response', 'claude'), 'INVALID_PROTOCOL_REQUEST', /undefined function/u);
  const interrupted = structuredClone(toolRequests.claude);
  interrupted.messages[2].content.unshift({ type: 'text', text: 'New instructions before results' });
  expectError(() => translateRequest(interrupted, 'claude', 'openai-chat'), 'INVALID_PROTOCOL_REQUEST', /pending tool results/u);
});

test('tool error flags and multimodal tool output never silently turn into successful text results', () => {
  const source = structuredClone(toolRequests.claude);
  source.messages[2].content[0].is_error = true;
  for (const to of ['openai-chat', 'openai-response', 'gemini']) expectError(() => translateRequest(source, 'claude', to), 'UNSUPPORTED_PROTOCOL_FEATURE', /is_error/u);
  const image = structuredClone(toolRequests.claude);
  image.messages[2].content[0].content = [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGk=' } }];
  for (const to of ['openai-chat', 'gemini']) expectError(() => translateRequest(image, 'claude', to), 'UNSUPPORTED_PROTOCOL_FEATURE', /multimodal/u);
  const responses = translateRequest(image, 'claude', 'openai-response');
  const result = responses.input.find((item) => item.type === 'function_call_output');
  assert.equal(result.call_id, 'call_a');
  assert.deepEqual(result.output, [{ type: 'input_image', image_url: 'data:image/png;base64,aGk=', detail: 'auto' }]);
  const restored = translateRequest(responses, 'openai-response', 'claude');
  assert.equal(restored.messages[2].content[0].content[0].type, 'image');
});

test('stored images, explicit image detail, invalid image sources, and documents are not dropped', () => {
  const stored = { input: [{ role: 'user', content: [{ type: 'input_image', file_id: 'file_private' }] }] };
  expectError(() => translateRequest(stored, 'openai-response', 'claude'), 'UNSUPPORTED_PROTOCOL_FEATURE', /file_id/u);
  const detailed = imageRequest('openai-chat');
  detailed.messages[1].content[1].image_url.detail = 'high';
  assert.equal(translateRequest(detailed, 'openai-chat', 'openai-response').input[1].content[1].detail, 'high');
  for (const to of ['claude', 'gemini']) expectError(() => translateRequest(detailed, 'openai-chat', to), 'UNSUPPORTED_PROTOCOL_FEATURE', /image detail/u);
  for (const url of ['data:image/png;base64,!', 'not a url', 12]) {
    const source = imageRequest('openai-chat');
    source.messages[1].content[1].image_url.url = url;
    expectError(() => translateRequest(source, 'openai-chat', 'claude'), 'INVALID_PROTOCOL_REQUEST');
  }
  const source = imageRequest('gemini', true);
  source.contents[0].parts[1].fileData.fileUri = 'gs://private/image.png';
  expectError(() => translateRequest(source, 'gemini', 'claude'), 'UNSUPPORTED_PROTOCOL_FEATURE', /HTTP/u);
});

test('response truncation and filtering remain explicit in every client protocol', () => {
  for (const from of PROTOCOLS) for (const to of PROTOCOLS) {
    if (from === to) continue;
    for (const stop of ['length', 'filter']) {
      const source = structuredClone(plainResponses[from]);
      if (from === 'claude') source.stop_reason = stop === 'length' ? 'max_tokens' : 'refusal';
      if (from === 'openai-chat') source.choices[0].finish_reason = stop === 'length' ? 'length' : 'content_filter';
      if (from === 'openai-response') {
        source.status = 'incomplete';
        source.incomplete_details = { reason: stop === 'length' ? 'max_output_tokens' : 'content_filter' };
        source.output[0].status = 'incomplete';
      }
      if (from === 'gemini') source.candidates[0].finishReason = stop === 'length' ? 'MAX_TOKENS' : 'SAFETY';
      const translated = translateResponse(source, from, to);
      const refusal = from === 'claude' && stop === 'filter';
      assert.equal(inspectResponse(translated, to).stop, (stop === 'length' ? { claude: 'max_tokens', 'openai-chat': 'length', 'openai-response': 'incomplete', gemini: 'MAX_TOKENS' } : { claude: 'refusal', 'openai-chat': refusal ? 'stop' : 'content_filter', 'openai-response': refusal ? 'completed' : 'incomplete', gemini: 'SAFETY' })[to]);
      if (to === 'openai-response') {
        if (refusal) assert.equal(translated.incomplete_details, null);
        else assert.equal(translated.incomplete_details.reason, stop === 'length' ? 'max_output_tokens' : 'content_filter');
      }
    }
  }
});

test('explicit safety blocks without content map to filtering, never fake normal success', () => {
  for (const to of ['claude', 'openai-chat', 'openai-response']) {
    const translated = translateResponse({ promptFeedback: { blockReason: 'SAFETY' } }, 'gemini', to);
    assert.equal(inspectResponse(translated, to).stop, { claude: 'refusal', 'openai-chat': 'content_filter', 'openai-response': 'incomplete' }[to]);
  }
  const refused = { ...plainResponses['openai-chat'], choices: [{ message: { role: 'assistant', content: null, refusal: 'Cannot help' }, finish_reason: 'stop' }] };
  const responses = translateResponse(refused, 'openai-chat', 'openai-response');
  assert.deepEqual(responses.output[0].content, [{ type: 'refusal', refusal: 'Cannot help' }]);
  assert.equal(responses.status, 'completed', 'a complete refusal is not a truncated response');
});

test('minimal Gemini response with real content works without finishReason; empty candidates do not', () => {
  const output = translateResponse({ candidates: [{ content: { parts: [{ text: 'Hello' }] } }] }, 'gemini', 'claude');
  assert.equal(output.content[0].text, 'Hello');
  assert.equal(output.stop_reason, 'end_turn');
  expectError(() => translateResponse({ candidates: [{}] }, 'gemini', 'claude'), 'INVALID_UPSTREAM_RESPONSE', /no supported/u);
  expectError(() => translateResponse({ candidates: [{ content: { parts: [{ text: '' }] } }] }, 'gemini', 'claude'), 'INVALID_UPSTREAM_RESPONSE', /no supported/u);
});

test('missing upstream IDs get unique wire IDs and missing totals are calculated', () => {
  const source = { candidates: [{ content: { parts: [{ functionCall: { name: 'read_file', args: { path: 'a' } } }, { functionCall: { name: 'read_file', args: { path: 'b' } } }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 } };
  for (const to of ['claude', 'openai-chat', 'openai-response']) {
    const translated = translateResponse(source, 'gemini', to);
    assert.ok(translated.id);
    const calls = inspectResponse(translated, to).calls;
    assert.ok(calls[0].id);
    assert.notEqual(calls[0].id, calls[1].id);
    if (to !== 'claude') assert.equal(translated.usage.total_tokens, 18);
  }
});

test('cache usage retains totals and Claude uncached input semantics across protocols', () => {
  const source = { ...plainResponses.claude, usage: { input_tokens: 11, output_tokens: 7, cache_read_input_tokens: 4, cache_creation_input_tokens: 2 } };
  const chat = translateResponse(source, 'claude', 'openai-chat');
  assert.deepEqual(chat.usage, { prompt_tokens: 17, completion_tokens: 7, total_tokens: 24, prompt_tokens_details: { cached_tokens: 4 } });
  const claude = translateResponse(chat, 'openai-chat', 'claude');
  assert.equal(claude.usage.input_tokens, 13);
  assert.equal(claude.usage.cache_read_input_tokens, 4);
});

test('malformed and unsupported upstreams never become empty successful replies', () => {
  const cases = [
    ['claude', null], ['claude', {}], ['claude', { ...plainResponses.claude, content: 'wrong' }], ['claude', { ...plainResponses.claude, content: [] }],
    ['claude', { ...plainResponses.claude, stop_reason: null }], ['claude', { ...plainResponses.claude, content: [{ type: 'thinking', thinking: 'secret' }] }],
    ['claude', { ...plainResponses.claude, content: [{ type: 'text', text: 4 }] }], ['claude', { ...plainResponses.claude, stop_reason: 'tool_use' }],
    ['openai-chat', { choices: [] }], ['openai-chat', { choices: [{}] }], ['openai-chat', { ...plainResponses['openai-chat'], choices: [{ message: { role: 'assistant', content: null }, finish_reason: 'stop' }] }],
    ['openai-chat', { ...plainResponses['openai-chat'], choices: [{ message: { role: 'assistant', content: 'Hi', reasoning_content: 'secret' }, finish_reason: 'stop' }] }],
    ['openai-chat', { ...plainResponses['openai-chat'], choices: [{ message: { role: 'assistant', content: [{ type: 'audio', data: 'test' }] }, finish_reason: 'stop' }] }],
    ['openai-chat', { ...plainResponses['openai-chat'], choices: [{ message: { role: 'assistant', content: 'Hi' }, finish_reason: null }] }],
    ['openai-response', { ...plainResponses['openai-response'], status: 'failed' }], ['openai-response', { ...plainResponses['openai-response'], status: 'queued' }],
    ['openai-response', { ...plainResponses['openai-response'], status: 'in_progress' }], ['openai-response', { ...plainResponses['openai-response'], status: 'cancelled' }],
    ['openai-response', { ...plainResponses['openai-response'], output: [] }], ['openai-response', { ...plainResponses['openai-response'], output: [{ type: 'reasoning', summary: [] }] }],
    ['openai-response', { ...plainResponses['openai-response'], status: 'incomplete', incomplete_details: { reason: 'unknown' } }],
    ['openai-response', { ...plainResponses['openai-response'], output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hi', annotations: [{ type: 'url_citation', url: 'https://example.invalid' }] }] }] }],
    ['gemini', {}], ['gemini', { candidates: [] }], ['gemini', { candidates: [{ content: { parts: [] }, finishReason: 'STOP' }] }],
    ['gemini', { candidates: [{ content: { parts: [{ text: 'secret', thought: true }] }, finishReason: 'STOP' }] }],
    ['gemini', { candidates: [{ content: { parts: [{ text: 'hi', thoughtSignature: 'signature' }] }, finishReason: 'STOP' }] }],
    ['gemini', { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'aGk=' } }] }, finishReason: 'STOP' }] }],
    ['gemini', { candidates: [{ finishReason: 'MALFORMED_FUNCTION_CALL' }] }],
  ];
  for (const [from, body] of cases) expectError(() => translateResponse(body, from, from === 'claude' ? 'openai-chat' : 'claude'), 'INVALID_UPSTREAM_RESPONSE');
  for (const from of PROTOCOLS) {
    expectError(() => translateResponse({ error: { message: 'Upstream exploded' } }, from, from === 'claude' ? 'openai-chat' : 'claude'), 'INVALID_UPSTREAM_RESPONSE', /Upstream exploded/u);
    for (const usage of [{ input_tokens: '11', prompt_tokens: '11', promptTokenCount: '11' }, null, []]) {
      const source = { ...plainResponses[from], [from === 'gemini' ? 'usageMetadata' : 'usage']: usage };
      expectError(() => translateResponse(source, from, from === 'claude' ? 'openai-chat' : 'claude'), 'INVALID_UPSTREAM_RESPONSE');
    }
  }
  const badArgs = structuredClone(toolResponses['openai-response']);
  badArgs.output[1].arguments = '{';
  expectError(() => translateResponse(badArgs, 'openai-response', 'claude'), 'INVALID_UPSTREAM_RESPONSE', /JSON/u);
});

test('error bodies use client protocol envelopes and retain a machine-readable code', () => {
  for (const protocol of PROTOCOLS) {
    const error = protocolError(protocol, { code: 'INVALID_UPSTREAM_RESPONSE', message: 'Bad upstream', status: 502 });
    assert.equal(error.error.message, 'Bad upstream');
    if (protocol === 'gemini') {
      assert.equal(error.error.code, 502);
      assert.equal(error.error.status, 'INTERNAL');
      assert.equal(error.error.details[0].reason, 'INVALID_UPSTREAM_RESPONSE');
    } else {
      assert.equal(error.error.code, 'INVALID_UPSTREAM_RESPONSE');
      assert.equal(error.error.type, 'api_error');
      if (protocol === 'claude') assert.equal(error.type, 'error');
      else assert.equal(error.error.param, null);
    }
  }
  assert.equal(protocolError('gemini', { status: 429 }).error.status, 'RESOURCE_EXHAUSTED');
  assert.equal(protocolError('claude', { status: 429 }).error.type, 'rate_limit_error');
});

test('user text extraction looks only at the last turn and never revives tool continuations', () => {
  for (const protocol of PROTOCOLS) {
    assert.equal(extractProtocolUserText(plainRequests[protocol], protocol), 'Hello');
    const source = structuredClone(toolRequests[protocol]);
    if (protocol === 'claude') {
      assert.equal(extractProtocolUserText(source, protocol), '');
      source.messages.push({ role: 'user', content: 'Newest' });
      assert.equal(extractProtocolUserText(source, protocol), 'Newest');
      source.messages.push({ role: 'assistant', content: 'answer' });
    } else if (protocol === 'openai-chat') {
      assert.equal(extractProtocolUserText(source, protocol), 'Summarize');
      source.messages.pop();
      assert.equal(extractProtocolUserText(source, protocol), '');
      source.messages.push({ role: 'assistant', content: 'answer' });
    } else if (protocol === 'openai-response') {
      assert.equal(extractProtocolUserText(source, protocol), 'Summarize');
      source.input.pop();
      assert.equal(extractProtocolUserText(source, protocol), '');
      source.input.push({ type: 'function_call', call_id: 'new', name: 'fn', arguments: '{}' });
    } else {
      assert.equal(extractProtocolUserText(source, protocol), '');
      source.contents.push({ role: 'user', parts: [{ text: 'Newest' }] });
      assert.equal(extractProtocolUserText(source, protocol), 'Newest');
      source.contents.push({ role: 'model', parts: [{ text: 'answer' }] });
    }
    assert.equal(extractProtocolUserText(source, protocol), '');
  }
});

test('regression: translated Responses requests always disable default persistence', () => {
  for (const from of ['claude', 'openai-chat', 'gemini']) {
    const source = structuredClone(plainRequests[from]);
    assert.equal(translateRequest(source, from, 'openai-response').store, false);
    if (from === 'openai-chat') {
      source.store = false;
      assert.equal(translateRequest(source, from, 'openai-response').store, false);
      source.store = true;
      expectError(() => translateRequest(source, from, 'openai-response'), 'UNSUPPORTED_PROTOCOL_FEATURE', /store/u);
    }
  }
  const native = { input: 'Hi', store: true };
  assert.equal(translateRequest(native, 'openai-response', 'openai-response'), native);
});

test('regression: Gemini keeps associated parallel results in one response turn', () => {
  for (const from of ['claude', 'openai-chat', 'openai-response']) {
    const source = structuredClone(toolRequests[from]);
    const before = structuredClone(source);
    const output = translateRequest(source, from, 'gemini');
    assert.deepEqual(output.contents.map((entry) => entry.role), ['user', 'model', 'user']);
    assert.deepEqual(output.contents[2].parts.filter((part) => part.functionResponse).map((part) => [part.functionResponse.id, part.functionResponse.name, part.functionResponse.response]), [
      ['call_a', 'read_file', { content: 'A' }], ['call_b', 'read_file', { content: 'B' }],
    ]);
    assert.deepEqual(output.contents[2].parts.at(-1), { text: 'Summarize' });
    const roundtrip = translateRequest(output, 'gemini', 'openai-chat');
    assert.deepEqual(roundtrip.messages.filter((entry) => entry.role === 'tool').map((entry) => [entry.tool_call_id, entry.content]), [['call_a', 'A'], ['call_b', 'B']]);
    assert.deepEqual(source, before);
  }
  const separate = { messages: [{ role: 'user', content: 'First' }, { role: 'user', content: 'Second' }] };
  assert.equal(translateRequest(separate, 'openai-chat', 'gemini').contents.length, 2, 'unrelated user messages must not be coalesced');
});

test('regression: explicitly incomplete Responses calls cannot become executable calls', () => {
  const source = {
    status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
    output: [{ type: 'function_call', call_id: 'c', name: 'delete_files', arguments: '{}', status: 'incomplete' }],
  };
  for (const to of ['claude', 'openai-chat', 'gemini']) {
    expectError(() => translateResponse(source, 'openai-response', to), 'INVALID_UPSTREAM_RESPONSE', /incomplete.*function.call|function.call.*incomplete/u);
    expectError(() => translateRequest({ input: source.output }, 'openai-response', to), 'UNSUPPORTED_PROTOCOL_FEATURE', /completed/u);
    const completed = structuredClone(source);
    completed.output[0].status = 'completed';
    assert.equal(inspectResponse(translateResponse(completed, 'openai-response', to), to).calls[0].id, 'c');
  }
  assert.equal(translateResponse(source, 'openai-response', 'openai-response'), source);
});

test('regression: native Gemini cardinality strings normalize without unsafe coercion', () => {
  const source = {
    contents: [{ parts: [{ text: 'go' }] }],
    tools: [{ functionDeclarations: [{ name: 'f', parameters: {
      type: 'OBJECT', minProperties: '0', maxProperties: '2',
      properties: { xs: { type: 'ARRAY', minItems: '1', maxItems: '4', items: { type: 'STRING', minLength: '0', maxLength: '12' } } },
      default: { minItems: 'literal' }, example: { maxItems: 'literal' },
    } }] }],
  };
  const before = structuredClone(source);
  for (const to of ['claude', 'openai-chat', 'openai-response']) {
    const actual = inspectRequest(translateRequest(source, 'gemini', to), to).declarations[0].input_schema;
    assert.equal(actual.minProperties, 0);
    assert.equal(actual.maxProperties, 2);
    assert.equal(actual.properties.xs.minItems, 1);
    assert.equal(actual.properties.xs.maxItems, 4);
    assert.equal(actual.properties.xs.items.minLength, 0);
    assert.equal(actual.properties.xs.items.maxLength, 12);
    assert.deepEqual(actual.default, { minItems: 'literal' });
    assert.deepEqual(actual.example, { maxItems: 'literal' });
  }
  for (const value of ['-1', '1.5', '1e2', '', ' 1 ', '9007199254740993', -1, 1.5, Number.MAX_SAFE_INTEGER + 1, null, true]) {
    const malformed = structuredClone(source);
    malformed.tools[0].functionDeclarations[0].parameters.properties.xs.minItems = value;
    expectError(() => translateRequest(malformed, 'gemini', 'openai-chat'), 'INVALID_PROTOCOL_REQUEST', /minItems/u);
  }
  const numeric = structuredClone(source);
  numeric.tools[0].functionDeclarations[0].parameters.properties.xs.maxItems = Number.MAX_SAFE_INTEGER;
  assert.equal(translateRequest(numeric, 'gemini', 'claude').tools[0].input_schema.properties.xs.maxItems, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(source, before);
});

test('regression: Responses implicit strict mode normalizes schemas and never loses its guarantee', () => {
  const parameters = {
    type: 'object', additionalProperties: true,
    properties: {
      optional: { type: 'string' },
      rows: { type: 'array', items: { type: 'object', properties: { value: { type: 'number' } } } },
      choice: { anyOf: [{ type: 'object', properties: { ok: { type: 'boolean' } } }, { type: 'null' }] },
      reference: { $ref: '#/$defs/Nested' },
    },
    $defs: { Nested: { type: 'object', properties: { label: { type: 'string' } } } },
    default: { type: 'object', properties: { literal: true }, required: [] },
  };
  for (const strict of [undefined, null]) {
    const source = { input: 'go', tools: [{ type: 'function', name: 'f', parameters, ...(strict === undefined ? {} : { strict }) }] };
    const before = structuredClone(source);
    const actual = translateRequest(source, 'openai-response', 'openai-chat').tools[0].function;
    assert.equal(actual.strict, true);
    assert.deepEqual(actual.parameters.required, ['optional', 'rows', 'choice', 'reference']);
    assert.equal(actual.parameters.additionalProperties, false);
    assert.deepEqual(actual.parameters.properties.rows.items.required, ['value']);
    assert.equal(actual.parameters.properties.rows.items.additionalProperties, false);
    assert.deepEqual(actual.parameters.properties.choice.anyOf[0].required, ['ok']);
    assert.equal(actual.parameters.properties.choice.anyOf[0].additionalProperties, false);
    assert.deepEqual(actual.parameters.$defs.Nested.required, ['label']);
    assert.equal(actual.parameters.$defs.Nested.additionalProperties, false);
    assert.deepEqual(actual.parameters.default, parameters.default);
    for (const to of ['claude', 'gemini']) expectError(() => translateRequest(source, 'openai-response', to), 'UNSUPPORTED_PROTOCOL_FEATURE', /strict/u);
    assert.deepEqual(source, before);
    source.tools[0].strict = false;
    for (const to of ['claude', 'openai-chat', 'gemini']) {
      const definition = inspectRequest(translateRequest(source, 'openai-response', to), to).declarations[0];
      assert.deepEqual(definition.input_schema, parameters);
      if (to === 'openai-chat') assert.equal(definition.strict, false);
    }
  }
  const noParameters = translateRequest({ input: 'go', tools: [{ type: 'function', name: 'f' }] }, 'openai-response', 'openai-chat').tools[0].function;
  assert.equal(noParameters.strict, true);
  assert.deepEqual(noParameters.parameters, { type: 'object', properties: {}, required: [], additionalProperties: false });
});

test('regression: target name constraints apply to declarations, histories, choices, and output', () => {
  for (const to of ['claude', 'openai-chat', 'openai-response']) {
    const declaration = { contents: [{ parts: [{ text: 'go' }] }], tools: [{ functionDeclarations: [{ name: 'file.read' }] }] };
    expectError(() => translateRequest(declaration, 'gemini', to), 'UNSUPPORTED_PROTOCOL_FEATURE', /name.*cannot be represented/u);
    const history = { contents: [
      { role: 'model', parts: [{ functionCall: { id: 'c', name: 'file.read', args: {} } }] },
      { role: 'user', parts: [{ functionResponse: { id: 'c', name: 'file.read', response: { output: 'ok' } } }] },
    ] };
    expectError(() => translateRequest(history, 'gemini', to), 'UNSUPPORTED_PROTOCOL_FEATURE', /name.*cannot be represented/u);
    const output = { candidates: [{ content: history.contents[0], finishReason: 'STOP' }] };
    expectError(() => translateResponse(output, 'gemini', to), 'INVALID_UPSTREAM_RESPONSE', /name.*cannot be represented/u);
  }
  for (const name of ['1tool', '-tool', 'x'.repeat(65)]) {
    const source = { messages: [{ role: 'assistant', content: null, function_call: { name, arguments: '{}' } }, { role: 'function', name, content: 'ok' }] };
    expectError(() => translateRequest(source, 'openai-chat', 'gemini'), 'UNSUPPORTED_PROTOCOL_FEATURE', /name/u);
    const response = { choices: [{ message: source.messages[0], finish_reason: 'function_call' }] };
    expectError(() => translateResponse(response, 'openai-chat', 'gemini'), 'INVALID_UPSTREAM_RESPONSE', /name/u);
  }
  const longName = 'f'.repeat(65);
  const claude = { messages: [{ role: 'user', content: 'go' }], tools: [{ name: longName, input_schema: schema }] };
  for (const to of ['openai-chat', 'openai-response', 'gemini']) expectError(() => translateRequest(claude, 'claude', to), 'UNSUPPORTED_PROTOCOL_FEATURE', /name/u);
  const legal = { messages: [{ role: 'user', content: 'go' }], tools: [{ type: 'function', function: { name: `_${'x'.repeat(63)}`, parameters: schema } }] };
  assert.equal(translateRequest(legal, 'openai-chat', 'gemini').tools[0].functionDeclarations[0].name.length, 64);
});

test('regression: GIF is rejected for Gemini but remains portable between other image APIs', () => {
  const data = 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  for (const url of [`data:image/gif;base64,${data}`, 'https://example.invalid/image.GIF?download=1']) {
    const source = { messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url } }] }] };
    expectError(() => translateRequest(source, 'openai-chat', 'gemini'), 'UNSUPPORTED_PROTOCOL_FEATURE', /GIF|image\/gif/u);
    const claude = translateRequest(source, 'openai-chat', 'claude');
    expectError(() => translateRequest(claude, 'claude', 'gemini'), 'UNSUPPORTED_PROTOCOL_FEATURE', /GIF|image\/gif/u);
    const responses = translateRequest(source, 'openai-chat', 'openai-response');
    expectError(() => translateRequest(responses, 'openai-response', 'gemini'), 'UNSUPPORTED_PROTOCOL_FEATURE', /GIF|image\/gif/u);
    assert.equal(translateRequest(claude, 'claude', 'openai-chat').messages[0].content[0].image_url.url, url);
  }
});

test('regression: unsupported portable requests are refused by proxy qualification before fetch', async () => {
  const { createRoutingGatewayApp } = await import('../../../../../lib/tooling/model-router/gateway/compatibility/proxy.mjs');
  const cases = [
    ['openai-response', 'claude', { input: 'go', tools: [{ type: 'function', name: 'f', parameters: schema }] }],
    ['gemini', 'openai-chat', { contents: [{ parts: [{ text: 'go' }] }], tools: [{ functionDeclarations: [{ name: 'file.read' }] }] }],
    ['openai-chat', 'gemini', { messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' } }] }] }],
    ['gemini', 'claude', { contents: [{ parts: [{ text: 'go' }] }], tools: [{ functionDeclarations: [{ name: 'f', parameters: { type: 'ARRAY', minItems: '9007199254740993', items: { type: 'STRING' } } }] }] }],
  ];
  for (const [from, to, body] of cases) {
    let fetchCalls = 0;
    const registry = {
      models: { only: { source: 'custom', provider: 'fixture', protocols: [to], upstreamModel: 'fixture-model' } },
      providers: { fixture: { baseUrl: 'https://fixture.invalid', protocols: [to], authMode: 'none', endpointStyle: 'standard' } },
    };
    const { app } = createRoutingGatewayApp({ registry, env: {}, masking: false, fetchImpl: async () => { fetchCalls++; return Response.json({}); } });
    const path = { claude: '/v1/messages', 'openai-chat': '/v1/chat/completions', 'openai-response': '/v1/responses', gemini: '/v1beta/models/client:generateContent' }[from];
    const response = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 400, `${from} -> ${to}`);
    assert.equal(fetchCalls, 0, `${from} -> ${to} must not reach upstream`);
  }
});
