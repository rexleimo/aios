// Restore at JSON value boundaries, never in serialized SSE bytes. Only known
// argument fields have an additional JSON-string escaping layer.
const PROTOCOLS = new Set(['claude', 'openai-chat', 'openai-response', 'gemini']);
const MAX_FRAME = 1024 * 1024;
const MAX_CHANNELS = 4096;
const MAX_DEPTH = 100;
const encoder = new TextEncoder();

function fail(message, code = 'MALFORMED_PROTOCOL_STREAM') {
  const error = new Error(message);
  error.name = 'ProtocolMaskError';
  error.code = code;
  throw error;
}

function checkProtocol(protocol) {
  if (!PROTOCOLS.has(protocol)) fail('Unknown masking protocol', 'UNSUPPORTED_PROTOCOL');
}

// The trie also bounds each channel's carry by the longest *known* placeholder.
function replacements(store) {
  const root = { next: new Map() };
  for (const [key, value] of store || []) {
    if (!/^\{\{[A-Z_]+_[a-f0-9]{8}\}\}$/.test(key)) continue;
    if (key.length > 128) fail('Mask placeholder limit exceeded', 'STREAM_LIMIT_EXCEEDED');
    let node = root;
    for (const char of key) {
      if (!node.next.has(char)) node.next.set(char, { next: new Map() });
      node = node.next.get(char);
    }
    node.value = String(value);
  }
  return root;
}

class Prefix {
  constructor(root, escaped = false) {
    this.root = root;
    this.escaped = escaped;
    this.pending = [];
  }

  unit(char, raw = char) {
    if (!this.pending.length && !this.root.next.has(char)) return raw;
    this.pending.push({ char, raw });
    let out = '';
    while (this.pending.length) {
      let node = this.root;
      for (const unit of this.pending) {
        node = node.next.get(unit.char);
        if (!node) break;
      }
      if (node) {
        if (Object.hasOwn(node, 'value')) {
          out += this.escaped ? JSON.stringify(node.value).slice(1, -1) : node.value;
          this.pending = [];
        }
        break;
      }
      out += this.pending.shift().raw;
    }
    return out;
  }

  push(text) {
    const out = [];
    for (let i = 0; i < text.length; i++) out.push(this.unit(text[i]));
    return out.join('');
  }

  finish() {
    const tail = this.pending.map((unit) => unit.raw).join('');
    this.pending = [];
    return tail;
  }
}

function restored(text, root) {
  const prefix = new Prefix(root);
  return prefix.push(text) + prefix.finish();
}

// A bounded JSON lexer/parser for fragmented argument strings. It retains only
// grammar state, one escape (at most six characters), and a placeholder prefix.
// Decoding escapes here also handles placeholders spelled with \u007b, etc.
class Arguments {
  constructor(root) {
    this.prefix = new Prefix(root, true);
    this.stack = [];
    this.rootState = 'value';
    this.mode = '';
    this.escape = '';
    this.any = false;
  }

  state() { return this.stack.at(-1)?.state || this.rootState; }

  value() {
    if (!['value', 'valueOrEnd'].includes(this.state())) fail('Invalid tool argument JSON');
  }

  complete() {
    const top = this.stack.at(-1);
    if (top) top.state = 'commaOrEnd';
    else this.rootState = 'end';
  }

  number(char) {
    const digit = char >= '0' && char <= '9';
    const state = this.numberState;
    if (state === 'sign' && digit) this.numberState = char === '0' ? 'zero' : 'int';
    else if (state === 'int' && digit) return true;
    else if (['zero', 'int'].includes(state) && char === '.') this.numberState = 'dot';
    else if (['zero', 'int', 'frac'].includes(state) && /[eE]/.test(char)) this.numberState = 'e';
    else if (['dot', 'frac'].includes(state) && digit) this.numberState = 'frac';
    else if (state === 'e' && ['+', '-'].includes(char)) this.numberState = 'esign';
    else if (['e', 'esign', 'exp'].includes(state) && digit) this.numberState = 'exp';
    else return false;
    return true;
  }

  endNumber() {
    if (!['zero', 'int', 'frac', 'exp'].includes(this.numberState)) fail('Invalid tool argument JSON number');
    this.mode = '';
    this.complete();
  }

  push(text) {
    const out = [];
    if (text.length) this.any = true;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (this.mode === 'string') {
        if (this.escape) {
          this.escape += char;
          if (this.escape[1] === 'u') {
            if (this.escape.length > 2 && !/[a-fA-F0-9]/.test(char)) fail('Invalid tool argument JSON escape');
            if (this.escape.length < 6) continue;
            out.push(this.prefix.unit(String.fromCharCode(parseInt(this.escape.slice(2), 16)), this.escape));
          } else {
            const escapes = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
            if (!Object.hasOwn(escapes, char)) fail('Invalid tool argument JSON escape');
            out.push(this.prefix.unit(escapes[char], this.escape));
          }
          this.escape = '';
        } else if (char === '\\') this.escape = char;
        else if (char === '"') {
          out.push(this.prefix.finish(), char);
          this.mode = '';
          if (this.key) this.stack.at(-1).state = 'colon';
          else this.complete();
        } else {
          if (char.charCodeAt(0) < 32) fail('Invalid tool argument JSON string');
          out.push(this.prefix.unit(char));
        }
        continue;
      }
      if (this.mode === 'number') {
        if (this.number(char)) { out.push(char); continue; }
        this.endNumber();
      }
      if (this.mode === 'literal') {
        if (char !== this.literal[0]) fail('Invalid tool argument JSON literal');
        this.literal = this.literal.slice(1);
        out.push(char);
        if (!this.literal) { this.mode = ''; this.complete(); }
        continue;
      }
      out.push(char);
      if (/^[\t\r\n ]$/.test(char)) continue;
      const top = this.stack.at(-1);
      if (char === '"') {
        this.key = top?.type === 'object' && ['key', 'keyOrEnd'].includes(top.state);
        if (!this.key) this.value();
        this.mode = 'string';
      } else if (char === '{' || char === '[') {
        this.value();
        if (this.stack.length >= MAX_DEPTH) fail('Tool argument nesting limit exceeded', 'STREAM_LIMIT_EXCEEDED');
        this.stack.push({ type: char === '{' ? 'object' : 'array', state: char === '{' ? 'keyOrEnd' : 'valueOrEnd' });
      } else if (char === '}' || char === ']') {
        if (!top || top.type !== (char === '}' ? 'object' : 'array')
          || !['commaOrEnd', char === '}' ? 'keyOrEnd' : 'valueOrEnd'].includes(top.state)) fail('Invalid tool argument JSON');
        this.stack.pop();
        this.complete();
      } else if (char === ':') {
        if (top?.state !== 'colon') fail('Invalid tool argument JSON');
        top.state = 'value';
      } else if (char === ',') {
        if (top?.state !== 'commaOrEnd') fail('Invalid tool argument JSON');
        top.state = top.type === 'object' ? 'key' : 'value';
      } else if (char === '-' || /^[0-9]$/.test(char)) {
        this.value();
        this.mode = 'number';
        this.numberState = char === '-' ? 'sign' : char === '0' ? 'zero' : 'int';
      } else if ('tfn'.includes(char)) {
        this.value();
        this.mode = 'literal';
        this.literal = { t: 'rue', f: 'alse', n: 'ull' }[char];
      } else fail('Invalid tool argument JSON');
    }
    return out.join('');
  }

  incomplete() {
    if (this.mode === 'number' && ['zero', 'int', 'frac', 'exp'].includes(this.numberState)) this.endNumber();
    return this.any && Boolean(this.mode || this.stack.length || this.rootState !== 'end');
  }

  finish(allowIncomplete = false) {
    if (this.incomplete() && !allowIncomplete) fail('Incomplete tool argument JSON');
    // A token limit may split either a placeholder or a JSON escape. Both are
    // literal source bytes until completed; never drop them or invent closers.
    const tail = this.prefix.finish() + this.escape;
    this.escape = '';
    return tail;
  }
}

function lengthResponse(body) {
  return body?.status === 'incomplete' && body.incomplete_details?.reason === 'max_output_tokens';
}

function argumentFields(body, protocol, set) {
  const add = (holder, allowIncomplete = false) => {
    if (holder && typeof holder.arguments === 'string') set(holder, 'arguments', allowIncomplete);
  };
  if (protocol === 'openai-chat') {
    for (const choice of body?.choices || []) {
      for (const message of [choice.message, choice.delta]) {
        for (const call of message?.tool_calls || []) add(call.function, choice.finish_reason === 'length');
        add(message?.function_call, choice.finish_reason === 'length');
      }
    }
  } else if (protocol === 'openai-response') {
    for (const response of [body, body?.response]) {
      for (const item of response?.output || []) if (item.type === 'function_call') add(item, lengthResponse(response));
    }
    if (body?.item?.type === 'function_call') add(body.item);
    if (body?.type === 'response.function_call_arguments.done') add(body);
  }
}

function walk(value, root, overrides = new Map(), depth = 0) {
  if (depth > MAX_DEPTH) fail('Response nesting limit exceeded', 'STREAM_LIMIT_EXCEEDED');
  if (typeof value === 'string') return restored(value, root);
  if (Array.isArray(value)) return value.map((child) => walk(child, root, overrides, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    const name = restored(key, root);
    const result = overrides.get(value)?.has(key)
      ? overrides.get(value).get(key)(child, out, name) : walk(child, root, overrides, depth + 1);
    Object.defineProperty(out, name, { value: result, enumerable: true, configurable: true, writable: true });
  }
  return out;
}

function override(overrides, holder, key, operation) {
  if (!overrides.has(holder)) overrides.set(holder, new Map());
  overrides.get(holder).set(key, operation);
}

function fullArguments(text, root, allowIncomplete = false, onIncomplete = () => {}) {
  // Empty arguments occur on Responses' in-progress item snapshots.
  if (text === '') return text;
  const parser = new Arguments(root);
  const out = parser.push(text);
  if (parser.incomplete()) onIncomplete();
  return out + parser.finish(allowIncomplete);
}

export function unmaskProtocolResponse(body, protocol, store = null) {
  checkProtocol(protocol);
  const root = replacements(store);
  if (!root.next.size) return body;
  const overrides = new Map();
  argumentFields(body, protocol, (holder, key, allowIncomplete) => override(overrides, holder, key, (text) => fullArguments(text, root, allowIncomplete)));
  return walk(body, root, overrides);
}

class Channels {
  constructor(protocol, root, emit) {
    this.protocol = protocol;
    this.root = root;
    this.emit = emit;
    this.channels = new Map();
    this.sequenceOffset = 0;
    this.nextSequence = undefined;
    // Claude block stops and Responses item snapshots precede the stop reason.
    // Retain only this verdict, not closed argument text or parser state.
    this.pendingIncomplete = false;
  }

  delta(overrides, holder, field, key, template, event, args = false) {
    if (typeof holder?.[field] !== 'string') return;
    if (!this.channels.has(key)) {
      const data = walk(template(''), this.root);
      if (this.channels.size >= MAX_CHANNELS || JSON.stringify([key, data, event]).length > 4096) {
        fail('Mask channel limit exceeded', 'STREAM_LIMIT_EXCEEDED');
      }
      this.channels.set(key, { parser: args ? new Arguments(this.root) : new Prefix(this.root), data, event, args });
    }
    const channel = this.channels.get(key);
    override(overrides, holder, field, (text, out, name) => {
      channel.last = { out, name };
      return channel.parser.push(text);
    });
  }

  close(predicate = () => true, beforeSequence, policy = 'strict') {
    for (const [key, channel] of this.channels) {
      if (!predicate(key)) continue;
      if (channel.args && channel.parser.incomplete() && policy === 'defer') this.pendingIncomplete = true;
      const tail = channel.parser.finish(policy !== 'strict');
      this.channels.delete(key);
      if (!tail) continue;
      if (channel.last) {
        channel.last.out[channel.last.name] += tail;
        continue;
      }
      const data = channel.data;
      if (this.protocol === 'openai-chat') {
        const delta = data.choices[0].delta;
        if (delta.tool_calls) delta.tool_calls[0].function.arguments = tail;
        else if (delta.function_call) delta.function_call.arguments = tail;
        else delta[Object.keys(delta)[0]] = tail;
      } else if (this.protocol === 'claude') data.delta[Object.keys(data.delta).find((field) => field !== 'type')] = tail;
      else if (this.protocol === 'openai-response') data.delta = tail;
      else data.candidates[0].content.parts[0].text = tail;
      if (this.protocol === 'openai-response' && this.nextSequence !== undefined) {
        data.sequence_number = beforeSequence === undefined ? this.nextSequence : beforeSequence + this.sequenceOffset;
        this.nextSequence = data.sequence_number + 1;
        this.sequenceOffset++;
      }
      this.emit(`${channel.event ? `event: ${channel.event}\n` : ''}data: ${JSON.stringify(data)}\n\n`);
    }
  }

  verdict(allowIncomplete = false) {
    if (this.pendingIncomplete && !allowIncomplete) fail('Incomplete tool argument JSON');
    this.pendingIncomplete = false;
  }

  end(beforeSequence) {
    this.close(undefined, beforeSequence);
    this.verdict();
  }

  accept(body, event, final = false) {
    const overrides = new Map();
    const closing = [];
    const close = (...params) => closing.push(() => this.close(...params));
    const type = body?.type || event;
    const sequence = this.protocol === 'openai-response' && Number.isSafeInteger(body?.sequence_number) ? body.sequence_number : undefined;
    const failure = type === 'error' || event === 'error' || body?.error != null
      || this.protocol === 'openai-response' && type === 'response.failed';
    const deferSnapshots = this.protocol === 'openai-response'
      && ['response.function_call_arguments.done', 'response.output_item.done'].includes(type);
    argumentFields(body, this.protocol, (holder, key, allowIncomplete) => {
      const length = allowIncomplete && (this.protocol !== 'openai-response' || type === 'response.incomplete');
      override(overrides, holder, key, (text) => fullArguments(
        text, this.root, length || deferSnapshots || failure, () => { if (deferSnapshots) this.pendingIncomplete = true; },
      ));
    });
    // An announced upstream failure explains partial args without manufacturing
    // a new local parser error. Flush carry before the failure, then forget only
    // the closed channels' deferred verdict; later content remains strict.
    if (failure) {
      close(undefined, sequence, 'allow');
      closing.push(() => this.verdict(true));
    }
    const delta = (...params) => this.delta(overrides, ...params);
    if (this.protocol === 'openai-chat') {
      for (const [n, choice] of (body?.choices || []).entries()) {
        const base = `chat:${choice.index ?? n}:`;
        const template = (patch) => ({
          ...Object.fromEntries(['id', 'object', 'created', 'model'].filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]])),
          choices: [{ index: choice.index ?? n, delta: patch, finish_reason: null }],
        });
        if (choice.finish_reason != null) close((key) => key.startsWith(base), undefined, choice.finish_reason === 'length' ? 'allow' : 'strict');
        for (const field of ['content', 'refusal', 'reasoning_content']) delta(choice.delta, field, base + field, (tail) => template({ [field]: tail }), event, false);
        for (const [i, call] of (choice.delta?.tool_calls || []).entries()) {
          const index = call.index ?? i;
          delta(call.function, 'arguments', `${base}tool:${index}`, (tail) => template({ tool_calls: [{ index, function: { arguments: tail } }] }), event, true);
        }
        delta(choice.delta?.function_call, 'arguments', base + 'legacy', (tail) => template({ function_call: { arguments: tail } }), event, true);
      }
    } else if (this.protocol === 'claude') {
      const base = `claude:${body?.index}:`;
      if (type === 'content_block_stop') close((key) => key.startsWith(base), undefined, 'defer');
      if (type === 'message_stop' || type === 'message_delta' && body.delta?.stop_reason) {
        const length = type === 'message_delta' && body.delta.stop_reason === 'max_tokens';
        close(undefined, undefined, length ? 'allow' : 'strict');
        closing.push(() => this.verdict(length));
      }
      if (type === 'content_block_start' && body.content_block?.type === 'text') {
        delta(body.content_block, 'text', base + 'text', (tail) => ({ type: 'content_block_delta', index: body.index, delta: { type: 'text_delta', text: tail } }), 'content_block_delta', false);
      }
      if (type === 'content_block_start' && body.content_block?.type === 'thinking') {
        delta(body.content_block, 'thinking', base + 'thinking', (tail) => ({ type: 'content_block_delta', index: body.index, delta: { type: 'thinking_delta', thinking: tail } }), 'content_block_delta', false);
      }
      for (const [typeName, field, args] of [['text_delta', 'text', false], ['thinking_delta', 'thinking', false], ['input_json_delta', 'partial_json', true]]) {
        if (type === 'content_block_delta' && body.delta?.type === typeName) {
          delta(body.delta, field, base + (field === 'text' ? 'text' : field), (tail) => ({ type, index: body.index, delta: { type: typeName, [field]: tail } }), event || type, args);
        }
      }
    } else if (this.protocol === 'openai-response') {
      const base = `response:${body?.output_index ?? body?.item_id}:`;
      if (sequence !== undefined) this.nextSequence = sequence + this.sequenceOffset + 1;
      if (type === 'response.output_item.done') close((key) => key.startsWith(base), sequence, 'defer');
      if (!failure && /^response\.(completed|incomplete|failed)$/.test(type)) {
        const length = type === 'response.incomplete' && lengthResponse(body.response);
        close(undefined, sequence, length ? 'allow' : 'strict');
        closing.push(() => this.verdict(length));
      }
      if (type === 'response.output_item.added' && body.item?.type === 'function_call') {
        const fields = { output_index: body.output_index, item_id: body.item.id };
        delta(body.item, 'arguments', base + 'arguments', (tail) => ({ type: 'response.function_call_arguments.delta', ...fields, delta: tail }), 'response.function_call_arguments.delta', true);
      }
      if (type === 'response.content_part.added' && ['output_text', 'refusal'].includes(body.part?.type)) {
        const name = body.part.type;
        const field = name === 'output_text' ? 'text' : 'refusal';
        const fields = { output_index: body.output_index, item_id: body.item_id, content_index: body.content_index };
        delta(body.part, field, base + `${name}:${body.content_index ?? 0}`, (tail) => ({ type: `response.${name}.delta`, ...fields, delta: tail }), `response.${name}.delta`, false);
      }
      if (type === 'response.content_part.done') {
        close((key) => key === base + `${body.part?.type}:${body.content_index ?? 0}`, sequence);
      }
      for (const name of ['output_text', 'refusal', 'reasoning_text', 'function_call_arguments']) {
        const args = name === 'function_call_arguments';
        const key = base + (args ? 'arguments' : `${name}:${body?.content_index ?? 0}`);
        if (type === `response.${name}.done`) close((candidate) => candidate === key, sequence, args ? 'defer' : 'strict');
        if (type === `response.${name}.delta`) {
          const fields = Object.fromEntries(['item_id', 'output_index', 'content_index'].filter((field) => Object.hasOwn(body, field)).map((field) => [field, body[field]]));
          delta(body, 'delta', key, (tail) => ({ type, ...fields, delta: tail }), event || type, args);
        }
      }
      if (sequence !== undefined) override(overrides, body, 'sequence_number', () => sequence + this.sequenceOffset);
    } else {
      for (const [i, candidate] of (body?.candidates || []).entries()) {
        const index = candidate.index ?? i;
        const base = `gemini:${index}:`;
        if (candidate.finishReason) close((key) => key.startsWith(base));
        for (const part of candidate.content?.parts || []) {
          const thought = part.thought === true;
          const fields = Object.fromEntries(['responseId', 'modelVersion'].filter((field) => Object.hasOwn(body, field)).map((field) => [field, body[field]]));
          delta(part, 'text', base + thought, (tail) => ({ ...fields, candidates: [{ index, content: { role: 'model', parts: [{ text: tail, ...(thought ? { thought } : {}) }] } }] }), event, false);
        }
      }
    }
    const value = walk(body, this.root, overrides);
    for (const operation of closing) operation();
    if (final) this.end(sequence);
    if (this.protocol === 'openai-response' && Number.isSafeInteger(body?.sequence_number)) {
      value.sequence_number = body.sequence_number + this.sequenceOffset;
      this.nextSequence = value.sequence_number + 1;
    }
    // Never keep an already-emitted frame alive via a channel's last field.
    for (const channel of this.channels.values()) channel.last = null;
    return value;
  }
}

// Keep raw lines and their original delimiters, including comments, id, retry,
// unknown fields, and unterminated EOF frames. Only data payloads are rewritten.
class Frames {
  constructor(accept) {
    this.accept = accept;
    this.lines = [];
    this.parts = [];
    this.size = 0;
    this.cr = false;
  }

  reserve(text) {
    this.size += encoder.encode(text).byteLength;
    if (this.size > MAX_FRAME) fail('Mask SSE frame limit exceeded', 'STREAM_LIMIT_EXCEEDED');
  }

  line(eol) {
    this.reserve(eol);
    const text = this.parts.join('');
    this.parts = [];
    this.lines.push({ text, eol });
    if (!text) this.dispatch();
  }

  dispatch(final = false) {
    this.accept(this.lines, final);
    this.lines = [];
    this.size = 0;
  }

  push(text, final = false) {
    let start = 0;
    if (this.cr && (text.length || final)) {
      const lf = text[0] === '\n';
      this.line(lf ? '\r\n' : '\r');
      if (lf) start++;
      this.cr = false;
    }
    for (let i = start; i < text.length; i++) {
      if (text[i] !== '\r' && text[i] !== '\n') continue;
      const part = text.slice(start, i);
      this.parts.push(part);
      this.reserve(part);
      if (text[i] === '\r' && i === text.length - 1) this.cr = true;
      else if (text[i] === '\r' && text[i + 1] === '\n') { this.line('\r\n'); i++; }
      else this.line(text[i]);
      start = i + 1;
    }
    if (start < text.length) {
      const part = text.slice(start);
      this.parts.push(part);
      this.reserve(part);
    }
    if (final) {
      if (this.parts.length) this.line('');
      if (this.lines.length) this.dispatch(true);
    }
  }
}

/**
 * Escaping-only SSE transform, for native wire or the output of translation.
 * Limits: 1 MiB/frame, 4096 live delta channels, depth 100. Known text channels
 * retain at most 127 characters; extensions are preserved and restored within
 * each event, not interpreted as additional JSON or cross-event delta channels.
 * Incomplete text prefixes are emitted as nonterminal deltas at channel end.
 * Incomplete argument prefixes require an explicit token-limit stop or upstream
 * failure; block/item stops defer this verdict without retaining snapshots.
 * Impossible JSON syntax always fails, including on token limits and failures.
 * This is not a protocol lifecycle validator and never manufactures a terminal.
 * An empty store is byte-opaque. onError observes local failures only; source
 * read errors propagate through pipeThrough without calling the observer.
 */
export function createProtocolUnmaskTransform(protocol, store = null, options = {}) {
  checkProtocol(protocol);
  const root = replacements(store);
  if (!root.next.size) return new TransformStream({ transform(chunk, controller) { controller.enqueue(chunk); } });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const observed = (operation) => {
    try { return operation(); } catch (error) {
      try { options.onError?.(error); } catch { /* Observers cannot change stream failure. */ }
      throw error;
    }
  };
  let emit;
  const channels = new Channels(protocol, root, (wire) => emit(wire));
  const frames = new Frames((lines, final) => {
    const data = [];
    const positions = [];
    let event = '';
    for (const [i, line] of lines.entries()) {
      const colon = line.text.indexOf(':');
      const field = colon < 0 ? line.text : line.text.slice(0, colon);
      let value = colon < 0 ? '' : line.text.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') event = value;
      if (field === 'data') { data.push(value); positions.push(i); }
    }
    if (positions.length) {
      const payload = data.join('\n');
      if (payload.trim() === '[DONE]') channels.end();
      else {
        let body;
        try { body = JSON.parse(payload); } catch { fail('Invalid SSE JSON payload'); }
        const serialized = JSON.stringify(channels.accept(body, event, final));
        // Keep every data line and its delimiter. Empty continuation lines are
        // valid SSE and add only insignificant JSON whitespace after the value.
        for (const [n, position] of positions.entries()) {
          const line = lines[position];
          const colon = line.text.indexOf(':');
          const prefix = colon < 0 ? 'data:' : line.text.slice(0, colon + 1) + (line.text[colon + 1] === ' ' ? ' ' : '');
          line.text = prefix + (n === 0 ? serialized : '');
        }
      }
    }
    if (final && !positions.length) channels.end();
    emit(lines.map(({ text, eol }) => text + eol).join(''));
  });
  return new TransformStream({
    transform(chunk, controller) {
      observed(() => {
        emit = (text) => { if (text) controller.enqueue(encoder.encode(text)); };
        if (!(chunk instanceof Uint8Array)) fail('Expected SSE byte chunks');
        for (let i = 0; i < chunk.byteLength; i += 65536) {
          frames.push(decoder.decode(chunk.subarray(i, i + 65536), { stream: true }));
        }
      });
    },
    flush(controller) {
      observed(() => {
        emit = (text) => { if (text) controller.enqueue(encoder.encode(text)); };
        frames.push(decoder.decode(), true);
        channels.end();
      });
    },
  });
}
