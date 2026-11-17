// SSE translation deliberately does not share the non-streaming response codec.
// Limits also cover the snapshots required by the Responses terminal event.
import { randomUUID } from 'node:crypto';

const PROTOCOLS = new Set(['claude', 'openai-response', 'openai-chat', 'gemini']);
const MAX_FRAME = 1024 * 1024;
const MAX_STATE = 16 * 1024 * 1024;
const encoder = new TextEncoder();

class StreamProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProtocolCompatibilityError';
    this.code = code;
  }
}

function fail(message, code = 'MALFORMED_PROTOCOL_STREAM') {
  throw new StreamProtocolError(code, message);
}

function unsupported(message) {
  fail(message, 'UNSUPPORTED_STREAM_CONTENT');
}

function finishReason(value, mapping, label) {
  if (typeof value !== 'string' || !Object.hasOwn(mapping, value)) unsupported(`Unsupported ${label}: ${value}`);
  return mapping[value];
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function string(value, label, nonempty = false) {
  if (typeof value !== 'string' || (nonempty && !value)) fail(`Invalid ${label}`);
  return value;
}

function index(value, label = 'index') {
  if (!Number.isSafeInteger(value) || value < 0) fail(`Invalid ${label}`);
  return value;
}

function argsObject(value) {
  if (!object(value)) fail('Tool arguments must be a JSON object');
  return value;
}

function parseArguments(value, deferIncomplete = false) {
  let parsed;
  try { parsed = JSON.parse(value || '{}'); } catch {
    if (deferIncomplete) return null;
    fail('Invalid tool argument JSON');
  }
  return argsObject(parsed);
}

function nonemptyFields(value, allowed, label) {
  for (const [key, field] of Object.entries(value)) {
    if (!allowed.includes(key) && field !== null && field !== undefined) {
      unsupported(`Unsupported ${label}: ${key}`);
    }
  }
}

// A frame is dispatched only on a blank line (or EOF), not once per data line.
// Scan each incoming character once, including one-byte chunks of a long line.
class SSEFrames {
  partial = [];
  partialSize = 0;
  skipLF = false;
  event = '';
  data = [];
  size = 0;

  push(text, final = false) {
    const frames = [];
    let start = 0;
    if (this.skipLF && text.length) {
      if (text[0] === '\n') start = 1;
      this.skipLF = false;
    }
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (c !== '\r' && c !== '\n') continue;
      this.partial.push(text.slice(start, i));
      this.line(this.partial.join(''), frames);
      this.partial = [];
      this.partialSize = 0;
      if (c === '\r') {
        if (i === text.length - 1) this.skipLF = true;
        else if (text[i + 1] === '\n') i++;
      }
      start = i + 1;
    }
    if (start < text.length) {
      const tail = text.slice(start);
      this.partial.push(tail);
      this.partialSize += encoder.encode(tail).byteLength;
    }
    if (this.size + this.partialSize > MAX_FRAME) fail('SSE frame limit exceeded', 'STREAM_LIMIT_EXCEEDED');
    if (final) {
      if (this.partialSize) this.line(this.partial.join(''), frames);
      this.partial = [];
      this.partialSize = 0;
      this.line('', frames);
    }
    return frames;
  }

  line(line, frames) {
    // Two delimiter bytes conservatively account for CRLF, including split CRLF.
    this.size += encoder.encode(line).byteLength + 2;
    if (this.size > MAX_FRAME) fail('SSE frame limit exceeded', 'STREAM_LIMIT_EXCEEDED');
    if (!line) {
      if (this.data.length) frames.push({ event: this.event, data: this.data.join('\n') });
      this.event = '';
      this.data = [];
      this.size = 0;
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') this.event = value;
    if (field === 'data') this.data.push(value);
  }
}

class ProtocolOutput {
  constructor(protocol, model, emit) {
    this.protocol = protocol;
    this.model = model;
    this.emit = emit;
    this.id = 'gateway_stream';
    this.created = Math.floor(Date.now() / 1000);
    this.entries = new Map();
    this.usage = { input: 0, output: 0 };
    this.started = false;
    this.sequence = 0;
    this.size = 0;
    this.claudeCursor = 0;
    this.reserve(model);
  }

  reserve(value) {
    const size = encoder.encode(value).byteLength;
    this.size += size;
    if (this.size > MAX_STATE) fail('Stream snapshot limit exceeded', 'STREAM_LIMIT_EXCEEDED');
    return size;
  }

  release(size) {
    this.size -= size;
  }

  send(event, data) {
    if (this.protocol === 'openai-response') data = { ...data, sequence_number: this.sequence++ };
    this.emit(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`);
  }

  chat(delta, finish = null, extra = {}) {
    this.send('', {
      id: this.id, object: 'chat.completion.chunk', created: this.created, model: this.model,
      choices: [{ index: 0, delta, finish_reason: finish, logprobs: null }], ...extra,
    });
  }

  response(status = 'in_progress', reason = null, error = null) {
    return {
      id: this.id, object: 'response', created_at: this.created, status, error,
      incomplete_details: reason ? { reason } : null, model: this.model,
      output: status === 'in_progress' ? [] : [...this.entries.values()].map((entry) => this.item(entry, status)),
      usage: {
        input_tokens: this.usage.input, output_tokens: this.usage.output,
        total_tokens: this.usage.total ?? this.usage.input + this.usage.output,
        input_tokens_details: { cached_tokens: this.usage.cached ?? 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
      parallel_tool_calls: true, tool_choice: 'auto', tools: [], instructions: null,
      metadata: {}, temperature: 1, top_p: 1, truncation: 'disabled',
    };
  }

  part(entry) {
    return { type: 'output_text', text: entry.value, annotations: [], logprobs: [] };
  }

  item(entry, status = 'completed') {
    const itemStatus = status === 'in_progress' ? 'in_progress' : entry.done ? entry.status : 'incomplete';
    if (entry.type === 'text') {
      return { id: entry.itemId, type: 'message', status: itemStatus, role: 'assistant', content: status === 'in_progress' ? [] : [this.part(entry)] };
    }
    return {
      id: entry.itemId, type: 'function_call', status: itemStatus,
      call_id: entry.id, name: entry.name, arguments: status === 'in_progress' ? '' : entry.value,
    };
  }

  start(meta = {}) {
    if (this.started) return;
    this.started = true;
    if (meta.id) { this.reserve(meta.id); this.id = meta.id; }
    if (!this.model && meta.model) { this.reserve(meta.model); this.model = meta.model; }
    if (this.protocol === 'claude') {
      this.send('message_start', {
        type: 'message_start', message: {
          id: this.id, type: 'message', role: 'assistant', model: this.model, content: [],
          stop_reason: null, stop_sequence: null,
          usage: this.claudeUsage(),
        },
      });
    } else if (this.protocol === 'openai-chat') {
      this.chat({ role: 'assistant', content: '' });
    } else if (this.protocol === 'openai-response') {
      this.send('response.created', { type: 'response.created', response: this.response() });
      this.send('response.in_progress', { type: 'response.in_progress', response: this.response() });
    }
  }

  claudeUsage() {
    return {
      // Partial usage can arrive out of order; finish() checks final consistency.
      input_tokens: Math.max(0, this.usage.input - (this.usage.cached ?? 0) - (this.usage.cacheCreation ?? 0)),
      output_tokens: this.usage.output,
      ...(this.usage.cached !== undefined ? { cache_read_input_tokens: this.usage.cached } : {}),
      ...(this.usage.cacheCreation !== undefined ? { cache_creation_input_tokens: this.usage.cacheCreation } : {}),
    };
  }

  updateUsage(usage, input, output, total, cached, cacheCreation) {
    if (usage === undefined || usage === null) return;
    if (!object(usage)) fail('Invalid stream usage');
    for (const [target, source] of Object.entries({ input, output, total, cached, cacheCreation })) {
      if (source && usage[source] !== undefined && usage[source] !== null) {
        const value = usage[source];
        if (!Number.isSafeInteger(value) || value < 0) fail('Invalid token usage');
        this.usage[target] = value;
      }
    }
  }

  entry(key, type, id, name) {
    if (this.entries.has(key)) fail('Duplicate stream content start');
    this.start();
    const n = this.entries.size;
    if (n >= 4096) fail('Stream content count limit exceeded', 'STREAM_LIMIT_EXCEEDED');
    const entry = { key, type, id, name, index: n, itemId: `gateway_item_${n}`, value: '', pending: [], done: false, opened: false };
    this.entries.set(key, entry);
    if (this.protocol === 'claude') this.drainClaude();
    if (this.protocol === 'openai-chat' && type === 'tool') {
      entry.toolIndex = [...this.entries.values()].filter((item) => item.type === 'tool').length - 1;
      this.chat({ tool_calls: [{ index: entry.toolIndex, id, type: 'function', function: { name, arguments: '' } }] });
    }
    if (this.protocol === 'openai-response') {
      this.send('response.output_item.added', { type: 'response.output_item.added', output_index: n, item: this.item(entry, 'in_progress') });
      if (type === 'text') this.send('response.content_part.added', {
        type: 'response.content_part.added', item_id: entry.itemId, output_index: n,
        content_index: 0, part: this.part(entry),
      });
    }
    return entry;
  }

  textStart(key) { this.entry(key, 'text'); }

  toolStart(key, id, name) {
    string(id, 'tool id', true);
    string(name, 'tool name', true);
    const validName = this.protocol === 'gemini' ? /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/
      : this.protocol === 'claude' ? /^[A-Za-z0-9_-]{1,128}$/ : /^[A-Za-z0-9_-]{1,64}$/;
    if (!validName.test(name)) unsupported(`Tool name is not valid for ${this.protocol}: ${name}`);
    this.reserve(id + name);
    this.entry(key, 'tool', id, name);
  }

  append(key, delta) {
    const entry = this.entries.get(key);
    if (!entry || entry.done) fail('Content delta without an open content block');
    string(delta, 'content delta');
    this.reserve(delta);
    entry.value += delta;
    if (!delta) return;
    if (this.protocol === 'claude') {
      entry.pending.push(delta);
      this.drainClaude();
    } else if (this.protocol === 'openai-chat') {
      if (entry.type === 'text') this.chat({ content: delta });
      else this.chat({ tool_calls: [{ index: entry.toolIndex, function: { arguments: delta } }] });
    } else if (this.protocol === 'openai-response') {
      const type = entry.type === 'text' ? 'response.output_text.delta' : 'response.function_call_arguments.delta';
      this.send(type, {
        type, item_id: entry.itemId, output_index: entry.index,
        ...(entry.type === 'text' ? { content_index: 0, logprobs: [] } : {}), delta,
      });
    } else if (entry.type === 'text') {
      this.gemini([{ text: delta }]);
    }
  }

  done(key, status = 'completed') {
    const entry = this.entries.get(key);
    if (!entry || entry.done) fail('Content stop without an open content block');
    if (entry.type === 'tool') {
      if (!entry.value) this.append(key, '{}');
      // A block can close before the source announces a token-limit finish.
      entry.args = parseArguments(entry.value, true);
      entry.incompleteArguments = entry.args === null;
    }
    entry.status = entry.incompleteArguments ? 'incomplete' : status;
    entry.done = true;
    if (this.protocol === 'claude') this.drainClaude();
    if (this.protocol === 'openai-response') {
      if (entry.type === 'text') {
        this.send('response.output_text.done', { type: 'response.output_text.done', item_id: entry.itemId, output_index: entry.index, content_index: 0, text: entry.value, logprobs: [] });
        this.send('response.content_part.done', { type: 'response.content_part.done', item_id: entry.itemId, output_index: entry.index, content_index: 0, part: this.part(entry) });
      } else {
        this.send('response.function_call_arguments.done', { type: 'response.function_call_arguments.done', item_id: entry.itemId, output_index: entry.index, arguments: entry.value, name: entry.name });
      }
      this.send('response.output_item.done', { type: 'response.output_item.done', output_index: entry.index, item: this.item(entry) });
    }
    if (this.protocol === 'gemini' && entry.type === 'tool' && !entry.incompleteArguments) {
      // Stable Gemini functionCall.args is an object, not a partial-JSON string.
      this.gemini([{ functionCall: { id: entry.id, name: entry.name, args: entry.args } }]);
    }
  }

  // Claude content blocks are serialized even when upstream tools interleave.
  // Later blocks retain their original deltas until the preceding block stops.
  drainClaude() {
    const entries = [...this.entries.values()];
    while (this.claudeCursor < entries.length) {
      const entry = entries[this.claudeCursor];
      if (!entry.opened) {
        entry.opened = true;
        this.send('content_block_start', {
          type: 'content_block_start', index: entry.index,
          content_block: entry.type === 'text' ? { type: 'text', text: '' } : { type: 'tool_use', id: entry.id, name: entry.name, input: {} },
        });
      }
      for (const fragment of entry.pending) this.send('content_block_delta', {
        type: 'content_block_delta', index: entry.index,
        delta: entry.type === 'text' ? { type: 'text_delta', text: fragment } : { type: 'input_json_delta', partial_json: fragment },
      });
      entry.pending = [];
      if (!entry.done) return;
      this.send('content_block_stop', { type: 'content_block_stop', index: entry.index });
      this.claudeCursor++;
    }
  }

  gemini(parts, finishReason) {
    this.send('', {
      responseId: this.id, modelVersion: this.model,
      candidates: [{ index: 0, content: { role: 'model', parts }, ...(finishReason ? { finishReason } : {}) }],
      ...(finishReason ? { usageMetadata: {
        promptTokenCount: this.usage.input, candidatesTokenCount: this.usage.output,
        totalTokenCount: this.usage.total ?? this.usage.input + this.usage.output,
        ...(this.usage.cached !== undefined ? { cachedContentTokenCount: this.usage.cached } : {}),
      } } : {}),
    });
  }

  finish(reason) {
    this.start();
    if ([...this.entries.values()].some((entry) => !entry.done)) fail('Unclosed stream content', 'TRUNCATED_PROTOCOL_STREAM');
    for (const entry of this.entries.values()) if (entry.incompleteArguments) {
      if (reason !== 'length') fail('Invalid tool argument JSON');
      if (this.protocol === 'gemini') unsupported('Gemini cannot represent length-truncated tool argument JSON');
    }
    const { input, output, cached = 0, cacheCreation = 0, total = input + output } = this.usage;
    if (!Number.isSafeInteger(input + output) || cached + cacheCreation > input || total < input + output) fail('Inconsistent token usage');
    if (this.protocol === 'claude') {
      const stop = { stop: 'end_turn', tool: 'tool_use', length: 'max_tokens', filter: 'refusal' }[reason];
      this.send('message_delta', {
        type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null },
        usage: this.claudeUsage(),
      });
      this.send('message_stop', { type: 'message_stop' });
    } else if (this.protocol === 'openai-chat') {
      this.chat({}, { stop: 'stop', tool: 'tool_calls', length: 'length', filter: 'content_filter' }[reason]);
      this.send('', {
        id: this.id, object: 'chat.completion.chunk', created: this.created, model: this.model, choices: [],
        usage: { prompt_tokens: this.usage.input, completion_tokens: this.usage.output,
          total_tokens: this.usage.total ?? this.usage.input + this.usage.output,
          ...(this.usage.cached !== undefined ? { prompt_tokens_details: { cached_tokens: this.usage.cached } } : {}) },
      });
      this.emit('data: [DONE]\n\n');
    } else if (this.protocol === 'openai-response') {
      const incomplete = reason === 'length' || reason === 'filter';
      const type = incomplete ? 'response.incomplete' : 'response.completed';
      this.send(type, { type, response: this.response(incomplete ? 'incomplete' : 'completed', incomplete ? (reason === 'length' ? 'max_output_tokens' : 'content_filter') : null) });
    } else {
      this.gemini([], { stop: 'STOP', tool: 'STOP', length: 'MAX_TOKENS', filter: 'SAFETY' }[reason]);
    }
  }

  error(error) {
    const code = String(error.code || 'UPSTREAM_STREAM_ERROR');
    const message = error.message || 'Upstream stream failed';
    if (this.protocol === 'claude') this.send('error', { type: 'error', error: { type: 'api_error', message, code } });
    else if (this.protocol === 'openai-response') {
      this.send('error', { type: 'error', code, message, param: null });
      this.send('response.failed', { type: 'response.failed', response: this.response('failed', null, { code, message }) });
    } else if (this.protocol === 'openai-chat') this.send('', { error: { message, type: 'server_error', code, param: null } });
    else this.send('', { error: { code: 502, message, status: 'INTERNAL', details: [{ reason: code }] } });
  }
}

class ProtocolInput {
  constructor(protocol, output) {
    this.protocol = protocol;
    this.out = output;
    this.blocks = new Map();
    this.items = new Map();
    this.tools = new Map();
    this.reason = null;
    this.terminal = false;
    this.started = false;
    this.textKey = null;
    this.serial = 0;
    this.claudeInput = 0;
  }

  start(meta = {}) {
    const id = meta.id ?? meta.responseId;
    const model = meta.model ?? meta.modelVersion;
    if (id !== undefined) string(id, 'stream id', true);
    if (model !== undefined) string(model, 'stream model');
    this.started = true;
    this.out.start({ id, model });
  }

  text(delta) {
    if (this.textKey === null) {
      this.textKey = `text:${this.serial++}`;
      this.out.textStart(this.textKey);
    }
    this.out.append(this.textKey, delta);
  }

  closeText() {
    if (this.textKey !== null) this.out.done(this.textKey);
    this.textKey = null;
  }

  usage(value, kind = this.protocol) {
    if (kind === 'claude') {
      this.out.updateUsage(value, 'input_tokens', 'output_tokens', 'total_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens');
      if (value?.input_tokens !== undefined && value.input_tokens !== null) this.claudeInput = this.out.usage.input;
      // Claude reports uncached input separately; all other protocols include it.
      this.out.usage.input = this.claudeInput + (this.out.usage.cached ?? 0) + (this.out.usage.cacheCreation ?? 0);
      if (!Number.isSafeInteger(this.out.usage.input)) fail('Invalid token usage');
    } else if (kind === 'openai-response') {
      this.out.updateUsage(value, 'input_tokens', 'output_tokens', 'total_tokens');
      if (value?.input_tokens_details) this.out.updateUsage(value.input_tokens_details, null, null, null, 'cached_tokens');
      if (value?.output_tokens_details?.reasoning_tokens) unsupported('Reasoning token streams are not translatable');
    } else if (kind === 'openai-chat') {
      this.out.updateUsage(value, 'prompt_tokens', 'completion_tokens', 'total_tokens');
      if (value?.prompt_tokens_details) this.out.updateUsage(value.prompt_tokens_details, null, null, null, 'cached_tokens');
      if (value?.completion_tokens_details?.reasoning_tokens) unsupported('Reasoning token streams are not translatable');
    } else {
      this.out.updateUsage(value, 'promptTokenCount', 'candidatesTokenCount', 'totalTokenCount', 'cachedContentTokenCount');
      if (value?.thoughtsTokenCount) unsupported('Gemini thinking streams are not translatable');
    }
  }

  accept(frame) {
    if (frame.data === '[DONE]') {
      if (this.protocol !== 'openai-chat' || !this.reason || this.terminal) fail('Unexpected [DONE] marker');
      this.terminal = true;
      return;
    }
    let value;
    try { value = JSON.parse(frame.data); } catch { fail('Malformed SSE JSON'); }
    if (!object(value)) fail('SSE data must be a JSON object');
    if (value.error || value.response?.error || frame.event === 'error' || value.type === 'error' || value.type === 'response.failed') {
      const error = value.error || value.response?.error || value;
      fail(typeof error.message === 'string' ? error.message : 'Upstream error event', 'UPSTREAM_STREAM_ERROR');
    }
    if (this.terminal && !(this.protocol === 'gemini' && !value.candidates?.length && value.usageMetadata)) fail('Data after terminal stream event');
    if ((this.protocol === 'claude' || this.protocol === 'openai-response') && frame.event && frame.event !== value.type) fail('SSE event and data type disagree');
    if (this.protocol === 'openai-chat') this.chat(value);
    else if (this.protocol === 'claude') this.claude(value);
    else if (this.protocol === 'openai-response') this.responses(value);
    else this.gemini(value);
  }

  chat(value) {
    this.usage(value.usage);
    if (!this.started) this.start(value);
    if (!Array.isArray(value.choices)) fail('Missing Chat choices');
    if (value.choices.length > 1) unsupported('Multiple Chat choices');
    if (!value.choices.length) {
      if (!value.usage) fail('Empty Chat chunk without usage');
      return;
    }
    const choice = value.choices[0];
    if (choice.index !== undefined && choice.index !== 0) unsupported('Multiple Chat choices');
    if (choice.logprobs !== undefined && choice.logprobs !== null) unsupported('Chat text logprobs');
    if (this.reason) fail('Chat content after finish_reason');
    const delta = choice.delta;
    if (!object(delta)) fail('Invalid Chat delta');
    nonemptyFields(delta, ['role', 'content', 'tool_calls'], 'Chat delta');
    if (delta.role && delta.role !== 'assistant') unsupported('Non-assistant Chat stream');
    if (delta.content !== null && delta.content !== undefined) this.text(string(delta.content, 'Chat content'));
    if (delta.tool_calls !== undefined) {
      if (!Array.isArray(delta.tool_calls)) fail('Invalid Chat tool_calls');
      this.closeText();
      for (const call of delta.tool_calls) {
        if (!object(call)) fail('Invalid Chat tool call');
        const n = index(call.index, 'Chat tool index');
        if (call.type && call.type !== 'function') unsupported('Non-function Chat tool');
        if (!this.tools.has(n)) {
          if (this.tools.size >= 4096) fail('Too many Chat tools', 'STREAM_LIMIT_EXCEEDED');
          this.tools.set(n, { id: '', name: '', fragments: [], size: 0 });
        }
        const tool = this.tools.get(n);
        const fn = call.function;
        if (fn !== undefined && !object(fn)) fail('Invalid Chat tool function');
        const id = call.id === undefined ? '' : string(call.id, 'Chat tool id fragment');
        const name = fn?.name === undefined ? '' : string(fn.name, 'Chat tool name fragment');
        const args = fn?.arguments === undefined ? '' : string(fn.arguments, 'Chat tool argument fragment');
        tool.size += this.out.reserve(id + name + args);
        tool.id += id;
        tool.name += name;
        if (args) tool.fragments.push(args);
      }
    }
    if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
      this.reason = finishReason(choice.finish_reason, { stop: 'stop', tool_calls: 'tool', length: 'length', content_filter: 'filter' }, 'Chat finish reason');
      this.closeText();
      // Chat has no "ID/name complete" event. Immutable-metadata destinations
      // must wait for finish_reason, retaining (not coalescing) argument deltas.
      for (const [n, tool] of this.tools) {
        const key = `tool:${n}`;
        // Transfer the already-budgeted pending metadata and deltas to output.
        this.tools.delete(n);
        this.out.release(tool.size);
        this.out.toolStart(key, tool.id, tool.name);
        for (const fragment of tool.fragments) this.out.append(key, fragment);
        this.out.done(key);
      }
      this.tools.clear();
    }
  }

  claude(value) {
    const type = value.type;
    if (type === 'ping') return;
    if (type === 'message_start') {
      if (this.started || !object(value.message)) fail('Invalid Claude message_start');
      const message = value.message;
      if (message.role !== 'assistant' || (message.content?.length)) unsupported('Nonempty or non-assistant Claude message_start');
      this.usage(message.usage);
      this.start(message);
      return;
    }
    if (!this.started) fail('Claude event before message_start');
    if (type === 'content_block_start') {
      if (this.reason) fail('Claude block after stop reason');
      const n = index(value.index);
      if (this.blocks.has(n)) fail('Duplicate Claude content block');
      const block = value.content_block;
      if (!object(block)) fail('Invalid Claude content block');
      const key = `block:${n}`;
      if (block.type === 'text') {
        this.out.textStart(key);
        this.out.append(key, string(block.text, 'Claude text'));
      } else if (block.type === 'tool_use') {
        this.out.toolStart(key, block.id, block.name);
        const input = argsObject(block.input);
        if (Object.keys(input).length) this.out.append(key, JSON.stringify(input));
      } else unsupported(`Unsupported Claude content: ${block.type}`);
      this.blocks.set(n, { key, type: block.type, done: false });
    } else if (type === 'content_block_delta') {
      const block = this.blocks.get(index(value.index));
      if (!block || block.done) fail('Claude delta without block start');
      const delta = value.delta;
      if (!object(delta)) fail('Invalid Claude block delta');
      if (delta.type === 'text_delta' && block.type === 'text') this.out.append(block.key, string(delta.text, 'Claude text delta'));
      else if (delta.type === 'input_json_delta' && block.type === 'tool_use') this.out.append(block.key, string(delta.partial_json, 'Claude argument delta'));
      else unsupported(`Unsupported Claude delta: ${delta.type}`);
    } else if (type === 'content_block_stop') {
      const block = this.blocks.get(index(value.index));
      if (!block || block.done) fail('Claude stop without block start');
      this.out.done(block.key);
      block.done = true;
    } else if (type === 'message_delta') {
      this.usage(value.usage);
      const reason = value.delta?.stop_reason;
      if (reason !== undefined && reason !== null) {
        if ([...this.blocks.values()].some((block) => !block.done)) fail('Claude stop reason before content blocks stopped');
        this.reason = finishReason(reason, { end_turn: 'stop', stop_sequence: 'stop', tool_use: 'tool', max_tokens: 'length', refusal: 'filter' }, 'Claude stop reason');
      }
    } else if (type === 'message_stop') {
      if (!this.reason || [...this.blocks.values()].some((block) => !block.done)) fail('Incomplete Claude message_stop');
      this.terminal = true;
    } else unsupported(`Unsupported Claude event: ${type}`);
  }

  responseItem(value) {
    const item = this.items.get(index(value.output_index, 'Responses output_index'));
    if (!item || (value.item_id !== undefined && value.item_id !== item.id)) fail('Unknown Responses output item');
    return item;
  }

  responsePart(value) {
    const item = this.responseItem(value);
    const part = item.parts?.get(index(value.content_index, 'Responses content_index'));
    if (!part) fail('Unknown Responses content part');
    return part;
  }

  finalValue(key, value) {
    string(value, 'Responses final content');
    const entry = this.out.entries.get(key);
    if (!entry) fail('Missing Responses content');
    if (entry.value === value || (entry.type === 'tool' && !value && entry.value === '{}')) return;
    if (!entry.value && !entry.done) this.out.append(key, value);
    else fail('Responses final content disagrees with deltas');
  }

  responses(value) {
    const type = value.type;
    if (type === 'response.created' || type === 'response.in_progress') {
      if (!object(value.response)) fail('Missing Responses response');
      if (value.response.output?.length) unsupported('Nonempty initial Responses output');
      this.usage(value.response.usage);
      if (!this.started) this.start(value.response);
      return;
    }
    if (!this.started) fail('Responses event before response.created');
    if (type === 'response.output_item.added') {
      const n = index(value.output_index, 'Responses output_index');
      if (this.items.has(n)) fail('Duplicate Responses output item');
      if (this.items.size >= 4096) fail('Too many Responses items', 'STREAM_LIMIT_EXCEEDED');
      const item = value.item;
      if (!object(item)) fail('Invalid Responses output item');
      string(item.id, 'Responses item id', true);
      this.out.reserve(item.id);
      const state = { id: item.id, type: item.type, parts: new Map(), done: false, key: `item:${n}` };
      if (item.type === 'message') {
        if (item.role !== 'assistant' || item.content?.length) unsupported('Nonempty or non-assistant Responses message start');
      } else if (item.type === 'function_call') {
        state.callId = item.call_id;
        state.name = item.name;
        this.out.toolStart(state.key, item.call_id, item.name);
        this.out.append(state.key, string(item.arguments, 'Responses arguments'));
      } else unsupported(`Unsupported Responses item: ${item.type}`);
      this.items.set(n, state);
    } else if (type === 'response.content_part.added') {
      const item = this.responseItem(value);
      const n = index(value.content_index, 'Responses content_index');
      if (item.type !== 'message' || item.done || item.parts.has(n)) fail('Invalid Responses content part start');
      const part = value.part;
      if (part?.type !== 'output_text') unsupported(`Unsupported Responses part: ${part?.type}`);
      if (part.annotations?.length || part.logprobs?.length) unsupported('Responses text annotations/logprobs');
      const key = `${item.key}:${n}`;
      this.out.textStart(key);
      this.out.append(key, string(part.text, 'Responses text'));
      item.parts.set(n, { key, done: false });
    } else if (type === 'response.output_text.delta') {
      if (value.logprobs?.length) unsupported('Responses text logprobs');
      this.out.append(this.responsePart(value).key, string(value.delta, 'Responses text delta'));
    } else if (type === 'response.output_text.done' || type === 'response.content_part.done') {
      const part = this.responsePart(value);
      if (value.logprobs?.length) unsupported('Responses text logprobs');
      if (type === 'response.content_part.done') {
        if (value.part?.type !== 'output_text') unsupported('Non-text Responses content part');
        if (value.part.annotations?.length || value.part.logprobs?.length) unsupported('Responses text annotations/logprobs');
      }
      this.finalValue(part.key, type === 'response.output_text.done' ? value.text : value.part.text);
      if (!part.done) { this.out.done(part.key); part.done = true; }
    } else if (type === 'response.function_call_arguments.delta' || type === 'response.function_call_arguments.done') {
      const item = this.responseItem(value);
      if (item.type !== 'function_call' || item.done) fail('Invalid Responses tool delta');
      if (type.endsWith('.delta')) this.out.append(item.key, string(value.delta, 'Responses argument delta'));
      else this.finalValue(item.key, value.arguments);
    } else if (type === 'response.output_item.done') {
      const item = this.responseItem(value);
      if (item.done) fail('Duplicate Responses item stop');
      this.checkResponseItem(item, value.item);
      item.status = value.item.status ?? 'completed';
      if (item.type === 'function_call') this.out.done(item.key, item.status);
      else if ([...item.parts.values()].some((part) => !part.done)) fail('Responses item stopped before content');
      item.done = true;
    } else if (type === 'response.completed' || type === 'response.incomplete') {
      const response = value.response;
      if (!object(response) || !Array.isArray(response.output)) fail('Missing final Responses output');
      if (response.status !== (type === 'response.completed' ? 'completed' : 'incomplete')) fail('Responses terminal status disagrees with event');
      if (response.status === 'completed' && response.incomplete_details != null) fail('Completed Responses response has incomplete details');
      this.usage(response.usage);
      if (response.output.length !== this.items.size) fail('Responses final output disagrees with streamed items');
      for (let n = 0; n < response.output.length; n++) {
        const item = this.items.get(n);
        if (!item?.done) fail('Unclosed Responses item');
        this.checkResponseItem(item, response.output[n], response.status);
      }
      if (type === 'response.incomplete') {
        this.reason = finishReason(response.incomplete_details?.reason, { max_output_tokens: 'length', content_filter: 'filter' }, 'Responses incomplete reason');
      } else this.reason = [...this.items.values()].some((item) => item.type === 'function_call') ? 'tool' : 'stop';
      this.terminal = true;
    } else unsupported(`Unsupported Responses event: ${type}`);
  }

  checkResponseItem(state, item, responseStatus) {
    if (!object(item) || item.id !== state.id || item.type !== state.type) fail('Responses item identity changed');
    const status = item.status === undefined && item.type === 'function_call' ? 'completed' : item.status;
    if (!['completed', 'incomplete'].includes(status)) fail('Responses item status is not final');
    if (state.done && status !== state.status) fail('Responses final item status disagrees with item stop');
    if (responseStatus === 'completed' && status !== 'completed') fail('Incomplete Responses item in completed response');
    if (state.type === 'function_call') {
      if (item.call_id !== state.callId || item.name !== state.name) fail('Responses tool identity changed');
      this.finalValue(state.key, item.arguments);
    } else {
      if (item.role !== 'assistant' || !Array.isArray(item.content) || item.content.length !== state.parts.size) fail('Invalid Responses final message');
      item.content.forEach((part, n) => {
        if (part.type !== 'output_text') unsupported(`Unsupported Responses part: ${part.type}`);
        if (part.annotations?.length || part.logprobs?.length) unsupported('Responses text annotations/logprobs');
        const entry = state.parts.get(n);
        if (!entry) fail('Missing Responses final content');
        this.finalValue(entry.key, part.text);
      });
    }
  }

  gemini(value) {
    this.usage(value.usageMetadata);
    if (!this.started) this.start(value);
    const blockReason = value.promptFeedback?.blockReason;
    if (blockReason !== undefined && !['BLOCK_REASON_UNSPECIFIED', 'SAFETY', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY', 'MODEL_ARMOR'].includes(blockReason)) unsupported(`Unsupported Gemini prompt block reason: ${blockReason}`);
    if (blockReason !== undefined && blockReason !== 'BLOCK_REASON_UNSPECIFIED') {
      if (value.candidates?.length) fail('Blocked Gemini prompt with candidates');
      this.closeText();
      this.reason = 'filter';
      this.terminal = true;
      return;
    }
    if (value.usageMetadata && (value.candidates === undefined || (Array.isArray(value.candidates) && !value.candidates.length))) return;
    if (!Array.isArray(value.candidates) || value.candidates.length !== 1) unsupported('Gemini requires one candidate');
    const candidate = value.candidates[0];
    if (candidate.index !== undefined && candidate.index !== 0) unsupported('Multiple Gemini candidates');
    for (const field of ['citationMetadata', 'groundingMetadata', 'logprobsResult']) {
      if (candidate[field] !== undefined && candidate[field] !== null) unsupported(`Gemini ${field}`);
    }
    if (candidate.content !== undefined) {
      if (!object(candidate.content) || !Array.isArray(candidate.content.parts)) fail('Invalid Gemini content');
      if (candidate.content.role && candidate.content.role !== 'model') unsupported('Non-model Gemini content');
      for (const part of candidate.content.parts) {
        if (!object(part)) fail('Invalid Gemini part');
        if (part.thought || part.thoughtSignature) unsupported('Gemini thinking/signature content');
        nonemptyFields(part, ['text', 'functionCall', 'thought'], 'Gemini part');
        if (part.text !== undefined && part.functionCall !== undefined) fail('Ambiguous Gemini part');
        if (part.text !== undefined) this.text(string(part.text, 'Gemini text'));
        else if (part.functionCall !== undefined) {
          this.closeText();
          const call = part.functionCall;
          if (!object(call)) fail('Invalid Gemini functionCall');
          nonemptyFields(call, ['id', 'name', 'args'], 'Gemini functionCall');
          const key = `tool:${this.serial++}`;
          this.out.toolStart(key, call.id ?? `call_gateway_${randomUUID().replaceAll('-', '')}`, call.name);
          this.out.append(key, JSON.stringify(argsObject(call.args === undefined ? {} : call.args)));
          this.out.done(key);
        } else unsupported('Unknown Gemini part');
      }
    }
    if (candidate.finishReason && candidate.finishReason !== 'FINISH_REASON_UNSPECIFIED') {
      this.closeText();
      const reason = candidate.finishReason;
      if (reason === 'STOP') this.reason = [...this.out.entries.values()].some((entry) => entry.type === 'tool') ? 'tool' : 'stop';
      else if (reason === 'MAX_TOKENS') this.reason = 'length';
      else if (['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY'].includes(reason)) this.reason = 'filter';
      else fail(`Gemini generation failed: ${reason}`, 'UPSTREAM_STREAM_ERROR');
      this.terminal = true;
    }
  }

  finish() {
    if (!this.terminal || !this.reason) fail('Upstream SSE ended without a terminal event', 'TRUNCATED_PROTOCOL_STREAM');
    this.out.finish(this.reason);
  }
}

/**
 * Translate UPSTREAM SSE to CLIENT SSE; identical protocols preserve the body.
 * options.onError observes converted wire, validation, truncation and read errors.
 * Chat's fragmentable metadata is retained until finish_reason; standard Gemini
 * args are emitted as complete objects. Neither limitation delays text deltas.
 * Incomplete argument JSON is allowed only on a length finish, never for Gemini.
 */
export function translateProtocolStream(upstreamBody, from, to, model = '', options = {}) {
  if (!PROTOCOLS.has(from) || !PROTOCOLS.has(to)) fail(`Unsupported stream protocol: ${from} -> ${to}`, 'UNSUPPORTED_PROTOCOL');
  if (from === to) return upstreamBody;
  if (!upstreamBody || typeof upstreamBody.getReader !== 'function') fail('Expected a ReadableStream body');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const frames = new SSEFrames();
  let queue = [];
  let finished = false;
  let cancelled = false;
  let pendingChunk = null;
  let offset = 0;
  let released = false;
  let cancelling;
  const release = () => {
    if (!released) { released = true; reader.releaseLock(); }
  };
  const cancelUpstream = (reason) => {
    if (released) return Promise.resolve();
    cancelling ??= reader.cancel(reason).finally(release);
    return cancelling;
  };
  const output = new ProtocolOutput(to, model, (wire) => queue.push(encoder.encode(wire)));
  const reader = upstreamBody.getReader();
  const input = new ProtocolInput(from, output);
  const accept = (text, final = false) => {
    for (const frame of frames.push(text, final)) input.accept(frame);
  };
  return new ReadableStream({
    async pull(controller) {
      try {
        while (!queue.length && !finished && !cancelled) {
          if (pendingChunk === null) {
            const next = await reader.read();
            if (cancelled) return;
            if (next.done) {
              accept(decoder.decode(), true);
              input.finish();
              finished = true;
              release();
              break;
            }
            if (!(next.value instanceof Uint8Array)) fail('Expected byte chunks in SSE stream');
            pendingChunk = next.value;
            offset = 0;
          }
          // Decode in bounded slices even if a caller supplies one large chunk.
          const end = Math.min(offset + 65536, pendingChunk.byteLength);
          accept(decoder.decode(pendingChunk.subarray(offset, end), { stream: true }));
          offset = end;
          if (offset === pendingChunk.byteLength) pendingChunk = null;
        }
      } catch (error) {
        if (cancelled) return;
        finished = true;
        pendingChunk = null;
        if (!(error instanceof Error)) error = new StreamProtocolError('UPSTREAM_STREAM_ERROR', typeof error === 'string' ? error : 'Upstream stream failed');
        try { options.onError?.(error); } catch { /* Observers cannot alter the wire. */ }
        try { output.error(error); } catch (renderError) {
          controller.error(renderError);
          void cancelUpstream(error).catch(() => {});
          return;
        }
        // Do not wait for a remote cancellation before delivering the error.
        void cancelUpstream(error).catch(() => {});
      }
      if (cancelled) return;
      for (const chunk of queue) controller.enqueue(chunk);
      queue = [];
      if (finished) controller.close();
    },
    async cancel(reason) {
      cancelled = true;
      finished = true;
      pendingChunk = null;
      queue = [];
      await cancelUpstream(reason);
    },
  });
}
