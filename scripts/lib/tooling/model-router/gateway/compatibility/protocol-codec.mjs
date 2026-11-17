import { randomUUID } from 'node:crypto';

export const PROTOCOLS = Object.freeze(['claude', 'openai-response', 'openai-chat', 'gemini']);

export class ProtocolCompatibilityError extends Error {
  constructor(message, code = 'UNSUPPORTED_PROTOCOL_FEATURE') {
    super(message);
    this.name = 'ProtocolCompatibilityError';
    this.code = typeof code === 'object' && code !== null ? code.code || 'UNSUPPORTED_PROTOCOL_FEATURE' : code;
    this.status = (typeof code === 'object' && code !== null ? code.status : undefined)
      ?? (this.code === 'INVALID_UPSTREAM_RESPONSE' ? 502 : 400);
  }
}

export function supportsProtocolTranslation(from, to, { stream = false } = {}) {
  return PROTOCOLS.includes(from) && PROTOCOLS.includes(to) && typeof stream === 'boolean';
}

const own = (value, key) => Object.hasOwn(value, key);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '')}`;
const text = (value) => ({ type: 'text', text: value });
const joinedText = (blocks) => blocks.map((block) => block.text).join('');

// A context keeps validation errors at the boundary, never as accidental TypeErrors.
function context(protocol, response = false) {
  const invalid = (message) => {
    throw new ProtocolCompatibilityError(`${protocol}: ${message}`, response ? 'INVALID_UPSTREAM_RESPONSE' : 'INVALID_PROTOCOL_REQUEST');
  };
  const unsupported = (message) => {
    throw new ProtocolCompatibilityError(`${protocol}: ${message}`, response ? 'INVALID_UPSTREAM_RESPONSE' : 'UNSUPPORTED_PROTOCOL_FEATURE');
  };
  const obj = (value, path) => {
    if (!object(value)) invalid(`${path} must be an object`);
    return value;
  };
  const str = (value, path, nonempty = false) => {
    if (typeof value !== 'string' || (nonempty && !value.length)) invalid(`${path} must be ${nonempty ? 'a non-empty' : 'a'} string`);
    return value;
  };
  const arr = (value, path, nonempty = false) => {
    if (!Array.isArray(value) || (nonempty && !value.length)) invalid(`${path} must be ${nonempty ? 'a non-empty' : 'an'} array`);
    return value;
  };
  const bool = (value, path) => {
    if (typeof value !== 'boolean') invalid(`${path} must be a boolean`);
    return value;
  };
  const num = (value, path, { integer = false, min = -Infinity, max = Infinity } = {}) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isSafeInteger(value)) || value < min || value > max) {
      invalid(`${path} must be a finite ${integer ? 'integer' : 'number'} between ${min} and ${max}`);
    }
    return value;
  };
  const keys = (value, allowed, path) => {
    obj(value, path);
    for (const key of Object.keys(value)) if (!allowed.includes(key)) unsupported(`${path}.${key} cannot be translated`);
  };
  const json = (value, path) => {
    const seen = new Set();
    const visit = (entry, depth = 0) => {
      if (depth > 100) invalid(`${path} exceeds the supported JSON nesting depth (100)`);
      if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return;
      if (typeof entry === 'number' && Number.isFinite(entry)) return;
      if (typeof entry !== 'object' || seen.has(entry) || (!Array.isArray(entry) && Object.getPrototypeOf(entry) !== Object.prototype && Object.getPrototypeOf(entry) !== null)) {
        invalid(`${path} must contain only acyclic JSON values`);
      }
      seen.add(entry);
      for (const child of Object.values(entry)) visit(child, depth + 1);
      seen.delete(entry);
    };
    visit(value);
    return value;
  };
  const args = (value, path, encoded = false) => {
    let result = value;
    if (encoded) {
      str(value, path);
      try { result = JSON.parse(value); } catch { invalid(`${path} must contain a complete JSON object`); }
    }
    return json(obj(result, path), path);
  };
  return { protocol, response, invalid, unsupported, obj, str, arr, bool, num, keys, json, args };
}

function checkProtocol(protocol) {
  if (!PROTOCOLS.includes(protocol)) throw new ProtocolCompatibilityError(`Unknown protocol: ${String(protocol)}`);
}

function targetToolName(name, protocol, c) {
  const pattern = protocol === 'gemini' ? /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/u
    : protocol === 'claude' ? /^[A-Za-z0-9_-]{1,128}$/u : /^[A-Za-z0-9_-]{1,64}$/u;
  if (!pattern.test(name)) c.unsupported(`tool function name ${JSON.stringify(name)} cannot be represented by ${protocol}`);
}

function cacheControl(value, c, path) {
  if (value === undefined) return;
  c.keys(value, ['type', 'ttl'], path);
  if (value.type !== 'ephemeral') c.unsupported(`${path}.type must be ephemeral`);
  if (value.ttl !== undefined && !['5m', '1h'].includes(value.ttl)) c.invalid(`${path}.ttl must be 5m or 1h`);
}

function imageSource(source, c, path) {
  c.obj(source, path);
  if (source.type === 'base64') {
    c.keys(source, ['type', 'media_type', 'data'], path);
    const mime = c.str(source.media_type, `${path}.media_type`, true);
    if (!/^image\/(png|jpeg|gif|webp)$/u.test(mime)) c.unsupported(`${path}: image media type ${mime} is not portable`);
    const data = c.str(source.data, `${path}.data`, true);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(data)) c.invalid(`${path}.data must be base64`);
    return { type: 'image', source: { mime, data } };
  }
  if (source.type === 'url') {
    c.keys(source, ['type', 'url'], path);
    return imageURL(source.url, undefined, c, `${path}.url`);
  }
  c.unsupported(`${path}: unsupported image source ${String(source.type)}`);
}

function imageURL(url, detail, c, path) {
  c.str(url, path, true);
  if (detail !== undefined && !['auto', 'low', 'high'].includes(detail)) c.invalid(`${path}: image detail must be auto, low, or high`);
  if (url.startsWith('data:')) {
    const match = /^data:([^;,]+);base64,(.+)$/u.exec(url);
    if (!match) c.invalid(`${path}: expected a base64 image data URL`);
    return { ...imageSource({ type: 'base64', media_type: match[1], data: match[2] }, c, path), ...(detail ? { detail } : {}) };
  }
  let parsed;
  try { parsed = new URL(url); } catch { c.invalid(`${path}: invalid image URL`); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) c.unsupported(`${path}: only HTTP(S) image URLs without credentials can be translated`);
  return { type: 'image', source: { url }, ...(detail ? { detail } : {}) };
}

function wireImage(block, to, c) {
  if (block.detail && block.detail !== 'auto' && !['openai-chat', 'openai-response'].includes(to)) c.unsupported(`image detail=${block.detail} cannot be represented by ${to}`);
  const { source } = block;
  if (to === 'gemini' && (source.mime === 'image/gif' || (source.url && /\.gif$/iu.test(new URL(source.url).pathname)))) c.unsupported('GIF (image/gif) images cannot be represented by gemini');
  const url = source.url || `data:${source.mime};base64,${source.data}`;
  if (to === 'claude') return { type: 'image', source: source.url ? { type: 'url', url } : { type: 'base64', media_type: source.mime, data: source.data } };
  if (to === 'openai-chat') return { type: 'image_url', image_url: { url, ...(block.detail ? { detail: block.detail } : {}) } };
  if (to === 'openai-response') return { type: 'input_image', image_url: url, detail: block.detail || 'auto' };
  return source.url ? { fileData: { fileUri: url, ...(source.mime ? { mimeType: source.mime } : {}) } } : { inlineData: { mimeType: source.mime, data: source.data } };
}

function history(c) {
  const calls = new Map();
  const finished = new Set();
  return {
    call(callId, name, args, { optionalId = false } = {}) {
      if (callId === undefined && optionalId) callId = id('call');
      c.str(callId, 'tool call ID', true);
      c.str(name, 'tool function name', true);
      if (calls.has(callId)) c.invalid(`duplicate tool call ID ${callId}`);
      calls.set(callId, name);
      return { type: 'call', id: callId, name, args };
    },
    result(callId, name, blocks, extra = {}) {
      if (callId === undefined && name !== undefined) {
        callId = [...calls].find(([key, value]) => value === name && !finished.has(key))?.[0];
      }
      c.str(callId, 'tool result call ID', true);
      if (!calls.has(callId)) c.invalid(`tool result ${callId} has no preceding function call; its function name cannot be resolved`);
      if (finished.has(callId)) c.invalid(`duplicate result for tool call ${callId}`);
      if (name !== undefined && name !== calls.get(callId)) c.invalid(`tool result ${callId} function name does not match ${calls.get(callId)}`);
      finished.add(callId);
      return { type: 'result', id: callId, name: calls.get(callId), blocks, ...extra };
    },
  };
}

function claudeBlocks(value, role, c, h, path, resultContent = false) {
  if (typeof value === 'string') return [text(value)];
  return c.arr(value, path, !c.response && !resultContent).map((block, index) => {
    const p = `${path}[${index}]`;
    c.obj(block, p);
    if (block.type === 'text') {
      c.keys(block, ['type', 'text', 'cache_control', 'citations'], p);
      cacheControl(block.cache_control, c, `${p}.cache_control`);
      if (block.citations != null && c.arr(block.citations, `${p}.citations`).length) c.unsupported(`${p}.citations cannot be translated`);
      return text(c.str(block.text, `${p}.text`));
    }
    if (block.type === 'image') {
      c.keys(block, ['type', 'source', 'cache_control'], p);
      cacheControl(block.cache_control, c, `${p}.cache_control`);
      if (role !== 'user') c.unsupported(`${p}: assistant/instruction images cannot be translated`);
      return imageSource(block.source, c, `${p}.source`);
    }
    if (block.type === 'tool_use' && role === 'assistant' && !resultContent) {
      c.keys(block, ['type', 'id', 'name', 'input', 'cache_control'], p);
      cacheControl(block.cache_control, c, `${p}.cache_control`);
      return h.call(block.id, block.name, c.args(block.input, `${p}.input`), { optionalId: c.response });
    }
    if (block.type === 'tool_result' && role === 'user' && !resultContent) {
      c.keys(block, ['type', 'tool_use_id', 'content', 'is_error', 'cache_control'], p);
      cacheControl(block.cache_control, c, `${p}.cache_control`);
      const isError = block.is_error === undefined ? false : c.bool(block.is_error, `${p}.is_error`);
      return h.result(block.tool_use_id, undefined, claudeBlocks(block.content === undefined ? '' : block.content, 'user', c, h, `${p}.content`, true), { isError });
    }
    c.unsupported(`${p}: content block ${String(block.type)} is not supported in ${role} content`);
  });
}

function openAIContent(value, role, c, path, responses = false) {
  if (typeof value === 'string') return [text(value)];
  if (value === null && role === 'assistant' && !responses) return [];
  return c.arr(value, path, !c.response).map((block, index) => {
    const p = `${path}[${index}]`;
    c.obj(block, p);
    if ((!responses && block.type === 'text') || (responses && ['input_text', 'output_text'].includes(block.type))) {
      c.keys(block, ['type', 'text', ...(responses ? ['annotations', 'logprobs'] : [])], p);
      if (responses && c.response && block.type !== 'output_text') c.invalid(`${p}: response messages require output_text, not input_text`);
      if (block.type === 'output_text' && role !== 'assistant') c.invalid(`${p}: output_text requires an assistant message`);
      for (const key of ['annotations', 'logprobs']) if (block[key] != null && c.arr(block[key], `${p}.${key}`).length) c.unsupported(`${p}.${key} cannot be translated`);
      return text(c.str(block.text, `${p}.text`));
    }
    if ((!responses && block.type === 'image_url') || (responses && block.type === 'input_image')) {
      if (role !== 'user') c.unsupported(`${p}: only user images can be translated`);
      if (responses) {
        c.keys(block, ['type', 'image_url', 'file_id', 'detail'], p);
        if (block.file_id != null) c.unsupported(`${p}.file_id is an upstream-specific stored image`);
        return imageURL(block.image_url, block.detail, c, `${p}.image_url`);
      }
      c.keys(block, ['type', 'image_url'], p);
      c.keys(block.image_url, ['url', 'detail'], `${p}.image_url`);
      return imageURL(block.image_url.url, block.image_url.detail, c, `${p}.image_url.url`);
    }
    if (responses && block.type === 'refusal' && c.response) {
      c.keys(block, ['type', 'refusal'], p);
      return { type: 'refusal', text: c.str(block.refusal, `${p}.refusal`) };
    }
    c.unsupported(`${p}: unsupported content block ${String(block.type)}`);
  });
}

function chatCalls(value, c, h, path) {
  return c.arr(value, path).map((call, index) => {
    const p = `${path}[${index}]`;
    c.keys(call, ['id', 'type', 'function'], p);
    if (call.type !== undefined && call.type !== 'function') c.unsupported(`${p}: only function tool calls can be translated`);
    c.keys(call.function, ['name', 'arguments'], `${p}.function`);
    return h.call(call.id, call.function.name, c.args(call.function.arguments, `${p}.function.arguments`, true), { optionalId: c.response });
  });
}

function legacyCall(value, c, h, path) {
  c.keys(value, ['name', 'arguments'], path);
  return h.call(undefined, value.name, c.args(value.arguments, `${path}.arguments`, true), { optionalId: true });
}

function geminiParts(value, role, c, h, path, instructions = false) {
  return c.arr(value, path, !c.response).map((part, index) => {
    const p = `${path}[${index}]`;
    c.keys(part, ['text', 'functionCall', 'functionResponse', 'inlineData', 'fileData', 'thought', 'thoughtSignature'], p);
    if (part.thought !== undefined && c.bool(part.thought, `${p}.thought`)) c.unsupported(`${p}: thinking content cannot be translated`);
    if (part.thoughtSignature != null) c.unsupported(`${p}.thoughtSignature cannot be preserved across protocols`);
    const kinds = ['text', 'functionCall', 'functionResponse', 'inlineData', 'fileData'].filter((key) => own(part, key));
    if (kinds.length !== 1) c.invalid(`${p} must contain exactly one supported content kind`);
    if (kinds[0] === 'text') return text(c.str(part.text, `${p}.text`));
    if (instructions) c.unsupported(`${p}: systemInstruction must contain only text`);
    if (part.functionCall !== undefined) {
      if (role !== 'assistant') c.invalid(`${p}.functionCall requires model role`);
      c.keys(part.functionCall, ['id', 'name', 'args'], `${p}.functionCall`);
      return h.call(part.functionCall.id, part.functionCall.name, c.args(part.functionCall.args === undefined ? {} : part.functionCall.args, `${p}.functionCall.args`), { optionalId: true });
    }
    if (part.functionResponse !== undefined) {
      if (role !== 'user' || c.response) c.invalid(`${p}.functionResponse requires a user request message`);
      const result = part.functionResponse;
      c.keys(result, ['id', 'name', 'response'], `${p}.functionResponse`);
      c.str(result.name, `${p}.functionResponse.name`, true);
      const json = c.json(c.obj(result.response, `${p}.functionResponse.response`), `${p}.functionResponse.response`);
      const content = Object.keys(json).length === 1 && typeof json.content === 'string' ? json.content : JSON.stringify(json);
      return h.result(result.id, result.name, [text(content)], { json });
    }
    if (role !== 'user') c.unsupported(`${p}: generated/assistant images cannot be translated to another protocol`);
    if (part.inlineData !== undefined) {
      c.keys(part.inlineData, ['mimeType', 'data'], `${p}.inlineData`);
      return imageSource({ type: 'base64', media_type: part.inlineData.mimeType, data: part.inlineData.data }, c, `${p}.inlineData`);
    }
    c.keys(part.fileData, ['fileUri', 'mimeType'], `${p}.fileData`);
    const image = imageURL(part.fileData.fileUri, undefined, c, `${p}.fileData.fileUri`);
    if (part.fileData.mimeType !== undefined) {
      const mime = c.str(part.fileData.mimeType, `${p}.fileData.mimeType`, true);
      if (!/^image\/(png|jpeg|gif|webp)$/u.test(mime)) c.unsupported(`${p}: non-image fileData cannot be translated`);
      image.source.mime = mime;
    } else if (!image.source.mime) {
      const pathname = new URL(image.source.url).pathname;
      if (!/\.(png|jpe?g|gif|webp)$/iu.test(pathname)) c.unsupported(`${p}: fileData without an image MIME type or image extension cannot be translated`);
    }
    return image;
  });
}

function generation(body, protocol, c) {
  const params = {};
  const source = protocol === 'gemini' ? body.generationConfig === undefined ? {} : body.generationConfig : body;
  if (protocol === 'gemini') c.keys(source, ['maxOutputTokens', 'temperature', 'topP', 'stopSequences', 'candidateCount'], 'generationConfig');
  const tokenKeys = protocol === 'claude' ? ['max_tokens'] : protocol === 'openai-chat' ? ['max_tokens', 'max_completion_tokens'] : protocol === 'openai-response' ? ['max_output_tokens'] : ['maxOutputTokens'];
  for (const key of tokenKeys) if (source[key] !== undefined) {
    const limit = c.num(source[key], key, { integer: true, min: 1 });
    if (params.maxTokens !== undefined && params.maxTokens !== limit) c.invalid('conflicting token limits');
    params.maxTokens = limit;
  }
  for (const [key, target, max] of [['temperature', 'temperature', 2], [protocol === 'gemini' ? 'topP' : 'top_p', 'topP', 1]]) {
    if (source[key] !== undefined) params[target] = c.num(source[key], key, { min: 0, max: key === 'temperature' && protocol === 'claude' ? 1 : max });
  }
  const stopKey = protocol === 'gemini' ? 'stopSequences' : protocol === 'claude' ? 'stop_sequences' : 'stop';
  if (source[stopKey] !== undefined && !(protocol === 'openai-chat' && source[stopKey] === null)) {
    const stops = typeof source[stopKey] === 'string' && protocol === 'openai-chat' ? [source[stopKey]] : c.arr(source[stopKey], stopKey);
    params.stop = stops.map((entry, index) => c.str(entry, `${stopKey}[${index}]`, true));
  }
  if (source.candidateCount !== undefined && c.num(source.candidateCount, 'candidateCount', { integer: true, min: 1 }) !== 1) c.unsupported('multiple candidates cannot be translated');
  return params;
}

function schemaFromGemini(value, c, path) {
  c.json(c.obj(value, path), path);
  const convert = (node) => {
    c.obj(node, `${path} schema node`);
    const result = { ...node };
    if (own(node, 'type')) {
      const type = c.str(node.type, `${path}.type`).toLowerCase();
      if (!['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(type)) c.unsupported(`${path}: unknown Gemini schema type ${node.type}`);
      result.type = type;
    }
    for (const key of ['minItems', 'maxItems', 'minLength', 'maxLength', 'minProperties', 'maxProperties']) {
      if (node[key] === undefined) continue;
      let value = node[key];
      if (typeof value === 'string') {
        if (!/^[0-9]+$/u.test(value)) c.invalid(`${path}.${key} must be a nonnegative integer`);
        value = Number(value);
      }
      result[key] = c.num(value, `${path}.${key}`, { integer: true, min: 0 });
    }
    if (node.properties !== undefined) result.properties = Object.fromEntries(Object.entries(c.obj(node.properties, `${path}.properties`)).map(([key, entry]) => [key, convert(entry)]));
    if (node.items !== undefined) result.items = convert(node.items);
    if (node.anyOf !== undefined) result.anyOf = c.arr(node.anyOf, `${path}.anyOf`).map(convert);
    if (object(node.additionalProperties)) result.additionalProperties = convert(node.additionalProperties);
    if (node.nullable !== undefined) {
      const nullable = c.bool(node.nullable, `${path}.nullable`);
      delete result.nullable;
      if (nullable) return { anyOf: [result, { type: 'null' }] };
    }
    return result;
  };
  return convert(value);
}

function normalizeResponsesSchema(value, c, path) {
  const convert = (node, p) => {
    c.obj(node, p);
    const result = { ...node };
    for (const key of ['$defs', 'definitions', 'properties', 'patternProperties', 'dependentSchemas']) {
      if (node[key] !== undefined) result[key] = Object.fromEntries(Object.entries(c.obj(node[key], `${p}.${key}`)).map(([name, entry]) => [name, convert(entry, `${p}.${key}.${name}`)]));
    }
    for (const key of ['items', 'contains', 'not', 'if', 'then', 'else']) {
      if (node[key] !== undefined) result[key] = convert(node[key], `${p}.${key}`);
    }
    for (const key of ['anyOf', 'allOf', 'oneOf', 'prefixItems']) {
      if (node[key] !== undefined) result[key] = c.arr(node[key], `${p}.${key}`).map((entry, index) => convert(entry, `${p}.${key}[${index}]`));
    }
    // Responses closes every object and makes every declared property required by default.
    if (node.type === 'object' || (Array.isArray(node.type) && node.type.includes('object')) || node.properties !== undefined) {
      result.properties ??= {};
      result.required = Object.keys(result.properties);
      result.additionalProperties = false;
    }
    return result;
  };
  return convert(value, path);
}

function toolDefinition(value, protocol, c, path) {
  let def = value;
  if (protocol === 'openai-chat') {
    c.keys(value, ['type', 'function'], path);
    if (value.type !== 'function') c.unsupported(`${path}: built-in/stateful tools cannot be translated`);
    def = c.obj(value.function, `${path}.function`);
  } else if (protocol === 'openai-response' && value.type !== 'function') {
    c.unsupported(`${path}: Responses built-in/stateful tool ${String(value.type)} cannot be translated`);
  }
  const allowed = protocol === 'claude' ? ['name', 'description', 'input_schema', 'cache_control']
    : protocol === 'gemini' ? ['name', 'description', 'parameters', 'parametersJsonSchema']
      : ['name', 'description', 'parameters', 'strict', ...(protocol === 'openai-response' ? ['type'] : [])];
  c.keys(def, allowed, path);
  const result = { name: c.str(def.name, `${path}.name`, true), schema: { type: 'object', properties: {} } };
  if (def.description !== undefined) result.description = c.str(def.description, `${path}.description`);
  if (def.strict !== undefined && def.strict !== null) result.strict = c.bool(def.strict, `${path}.strict`);
  const implicitStrict = protocol === 'openai-response' && def.strict == null;
  if (implicitStrict) result.strict = true;
  cacheControl(def.cache_control, c, `${path}.cache_control`);
  const schema = protocol === 'claude' ? def.input_schema : def.parametersJsonSchema === undefined ? def.parameters : def.parametersJsonSchema;
  if (def.parametersJsonSchema !== undefined && def.parameters !== undefined) c.invalid(`${path}: specify only parameters or parametersJsonSchema`);
  if (schema !== undefined) result.schema = protocol === 'gemini' && def.parameters !== undefined ? schemaFromGemini(schema, c, `${path}.parameters`) : c.json(c.obj(schema, `${path}.parameters`), `${path}.parameters`);
  else if (protocol === 'claude') c.invalid(`${path}.input_schema is required`);
  if (implicitStrict) result.schema = normalizeResponsesSchema(result.schema, c, `${path}.parameters`);
  return result;
}

function requestTools(body, protocol, c) {
  let tools = [];
  if (body.tools !== undefined) {
    const entries = c.arr(body.tools, 'tools');
    tools = protocol === 'gemini' ? entries.flatMap((entry, index) => {
      c.keys(entry, ['functionDeclarations'], `tools[${index}]`);
      return c.arr(entry.functionDeclarations, `tools[${index}].functionDeclarations`).map((def, i) => toolDefinition(def, protocol, c, `tools[${index}].functionDeclarations[${i}]`));
    }) : entries.map((entry, index) => toolDefinition(c.obj(entry, `tools[${index}]`), protocol, c, `tools[${index}]`));
  }
  if (protocol === 'openai-chat' && body.functions !== undefined) {
    if (tools.length) c.invalid('specify tools or legacy functions, not both');
    tools = c.arr(body.functions, 'functions').map((fn, index) => toolDefinition({ type: 'function', function: fn }, protocol, c, `functions[${index}]`));
  }
  if (new Set(tools.map((tool) => tool.name)).size !== tools.length) c.invalid('tool names must be unique');
  let choice;
  let parallel;
  if (body.parallel_tool_calls !== undefined) parallel = c.bool(body.parallel_tool_calls, 'parallel_tool_calls');
  if (protocol === 'gemini' && body.toolConfig !== undefined) {
    c.keys(body.toolConfig, ['functionCallingConfig'], 'toolConfig');
    const config = body.toolConfig.functionCallingConfig;
    c.keys(config, ['mode', 'allowedFunctionNames'], 'toolConfig.functionCallingConfig');
    const mode = config.mode ?? 'AUTO';
    if (!['AUTO', 'NONE', 'ANY'].includes(mode)) c.unsupported(`function calling mode ${String(mode)} cannot be translated`);
    const names = config.allowedFunctionNames === undefined ? [] : c.arr(config.allowedFunctionNames, 'allowedFunctionNames').map((name) => c.str(name, 'allowedFunctionNames entry', true));
    if (names.length && (mode !== 'ANY' || names.length !== 1)) c.unsupported('allowedFunctionNames requires exactly one name and mode ANY for cross-protocol requests');
    choice = names.length ? { name: names[0] } : { mode: { AUTO: 'auto', NONE: 'none', ANY: 'required' }[mode] };
  } else if (body.tool_choice !== undefined || (protocol === 'openai-chat' && body.function_call !== undefined)) {
    if (body.tool_choice !== undefined && body.function_call !== undefined) c.invalid('specify tool_choice or legacy function_call, not both');
    const raw = body.tool_choice === undefined ? body.function_call : body.tool_choice;
    if (protocol !== 'claude' && typeof raw === 'string') {
      if (!['auto', 'none', 'required'].includes(raw)) c.invalid('tool_choice must be auto, none, required, or a named function');
      choice = { mode: raw };
    } else {
      c.obj(raw, 'tool_choice');
      if (protocol === 'claude') {
        c.keys(raw, ['type', 'name', 'disable_parallel_tool_use'], 'tool_choice');
        if (raw.disable_parallel_tool_use !== undefined) parallel = !c.bool(raw.disable_parallel_tool_use, 'tool_choice.disable_parallel_tool_use');
        if (raw.type === 'tool') choice = { name: c.str(raw.name, 'tool_choice.name', true) };
        else if (['auto', 'any', 'none'].includes(raw.type)) {
          if (raw.name !== undefined) c.invalid('tool_choice.name requires type tool');
          choice = { mode: raw.type === 'any' ? 'required' : raw.type };
        } else c.unsupported(`tool_choice type ${String(raw.type)} cannot be translated`);
      } else if (protocol === 'openai-chat' && body.function_call !== undefined) {
        c.keys(raw, ['name'], 'function_call');
        choice = { name: c.str(raw.name, 'function_call.name', true) };
      } else if (protocol === 'openai-chat') {
        c.keys(raw, ['type', 'function'], 'tool_choice');
        if (raw.type !== 'function') c.unsupported('only named function tool_choice can be translated');
        c.keys(raw.function, ['name'], 'tool_choice.function');
        choice = { name: c.str(raw.function.name, 'tool_choice.function.name', true) };
      } else {
        c.keys(raw, ['type', 'name'], 'tool_choice');
        if (raw.type !== 'function') c.unsupported('only named function tool_choice can be translated');
        choice = { name: c.str(raw.name, 'tool_choice.name', true) };
      }
    }
  }
  if (choice?.name && !tools.some((tool) => tool.name === choice.name)) c.invalid(`tool_choice names undefined function ${choice.name}`);
  if (choice?.mode === 'required' && !tools.length) c.invalid('required tool_choice needs at least one tool');
  return { tools, choice, parallel };
}

const COMMON_REQUEST = ['model', 'stream', 'metadata'];
const REQUEST_FIELDS = {
  claude: [...COMMON_REQUEST, 'messages', 'system', 'max_tokens', 'temperature', 'top_p', 'stop_sequences', 'tools', 'tool_choice', 'thinking'],
  'openai-chat': [...COMMON_REQUEST, 'messages', 'max_tokens', 'max_completion_tokens', 'temperature', 'top_p', 'stop', 'tools', 'tool_choice', 'functions', 'function_call', 'parallel_tool_calls', 'stream_options', 'user', 'store', 'n', 'frequency_penalty', 'presence_penalty', 'logprobs', 'top_logprobs', 'logit_bias', 'response_format', 'service_tier', 'safety_identifier'],
  'openai-response': [...COMMON_REQUEST, 'input', 'instructions', 'max_output_tokens', 'temperature', 'top_p', 'tools', 'tool_choice', 'parallel_tool_calls', 'stream_options', 'user', 'store', 'previous_response_id', 'conversation', 'include', 'truncation', 'text', 'reasoning', 'background', 'service_tier', 'safety_identifier'],
  gemini: ['model', 'contents', 'systemInstruction', 'tools', 'toolConfig', 'generationConfig', 'labels'],
};

function requestEnvelope(body, protocol, c) {
  c.keys(body, REQUEST_FIELDS[protocol], 'request');
  if (body.model !== undefined) c.str(body.model, 'model', true);
  if (body.stream !== undefined) c.bool(body.stream, 'stream');
  for (const field of ['metadata', 'labels']) if (body[field] !== undefined) {
    c.obj(body[field], field);
    for (const [key, value] of Object.entries(body[field])) c.str(value, `${field}.${key}`);
  }
  for (const field of ['user', 'safety_identifier']) if (body[field] !== undefined) c.str(body[field], field);
  if (body.stream_options !== undefined) {
    c.keys(body.stream_options, ['include_usage', 'include_obfuscation'], 'stream_options');
    for (const [key, value] of Object.entries(body.stream_options)) c.bool(value, `stream_options.${key}`);
  }
  if (body.store !== undefined && c.bool(body.store, 'store')) c.unsupported('store=true requires upstream-specific response persistence');
  for (const field of ['previous_response_id', 'conversation', 'reasoning']) if (body[field] != null) c.unsupported(`${field} is stateful/reasoning data and cannot be translated`);
  if (body.background !== undefined && c.bool(body.background, 'background')) c.unsupported('background responses cannot be translated');
  if (body.include !== undefined && c.arr(body.include, 'include').length) c.unsupported('Responses include expansions cannot be translated');
  if (body.truncation !== undefined && body.truncation !== 'disabled') c.unsupported('automatic Responses truncation cannot be translated');
  if (body.service_tier !== undefined && body.service_tier !== 'auto') c.unsupported('explicit service_tier cannot be guaranteed by another protocol');
  if (body.thinking !== undefined) {
    c.keys(body.thinking, ['type'], 'thinking');
    if (body.thinking.type !== 'disabled') c.unsupported('thinking cannot be translated');
  }
  if (body.n !== undefined && c.num(body.n, 'n', { integer: true, min: 1 }) !== 1) c.unsupported('multiple completion choices cannot be translated');
  for (const key of ['frequency_penalty', 'presence_penalty', 'top_logprobs']) if (body[key] !== undefined && c.num(body[key], key) !== 0) c.unsupported(`${key} cannot be translated`);
  if (body.logprobs !== undefined && c.bool(body.logprobs, 'logprobs')) c.unsupported('logprobs cannot be translated');
  if (body.logit_bias !== undefined && Object.keys(c.obj(body.logit_bias, 'logit_bias')).length) c.unsupported('logit_bias cannot be translated');
  if (body.response_format !== undefined) {
    c.keys(body.response_format, ['type'], 'response_format');
    if (body.response_format.type !== 'text') c.unsupported('structured response_format cannot be translated');
  }
  if (body.text !== undefined) {
    c.keys(body.text, ['format'], 'text');
    if (body.text.format !== undefined) {
      c.keys(body.text.format, ['type'], 'text.format');
      if (body.text.format.type !== 'text') c.unsupported('structured Responses text.format cannot be translated');
    }
  }
}

function readRequest(body, protocol) {
  const c = context(protocol);
  requestEnvelope(body, protocol, c);
  const h = history(c);
  const result = { model: body.model, instructions: [], messages: [], params: generation(body, protocol, c), stream: body.stream, ...requestTools(body, protocol, c) };
  const add = (role, blocks) => {
    if (!blocks.length) c.invalid(`${role} message must contain text, an image, a function call, or a tool result`);
    if (['system', 'developer'].includes(role)) {
      if (result.messages.length) c.unsupported('mid-conversation system/developer instructions cannot be hoisted without changing their meaning');
      if (blocks.some((block) => block.type !== 'text')) c.unsupported('system/developer instructions must be text');
      result.instructions.push({ role, text: joinedText(blocks) });
    } else result.messages.push({ role, blocks });
  };
  if (protocol === 'claude') {
    if (body.system !== undefined) add('system', claudeBlocks(body.system, 'system', c, h, 'system'));
    c.arr(body.messages, 'messages', true).forEach((message, index) => {
      const p = `messages[${index}]`;
      c.keys(message, ['role', 'content'], p);
      if (!['user', 'assistant'].includes(message.role)) c.invalid(`${p}.role must be user or assistant`);
      add(message.role, claudeBlocks(message.content, message.role, c, h, `${p}.content`));
    });
  } else if (protocol === 'openai-chat') {
    c.arr(body.messages, 'messages', true).forEach((message, index) => {
      const p = `messages[${index}]`;
      c.keys(message, ['role', 'content', 'tool_calls', 'tool_call_id', 'name', 'refusal', 'function_call'], p);
      const role = message.role;
      if (!['system', 'developer', 'user', 'assistant', 'tool', 'function'].includes(role)) c.invalid(`${p}.role is not a supported chat role`);
      if (message.name !== undefined && role !== 'function') c.unsupported(`${p}.name has no equivalent in other protocols`);
      if (message.refusal != null) c.unsupported(`${p}.refusal in request history cannot be translated`);
      if (role === 'tool' || role === 'function') {
        if (message.tool_calls !== undefined || message.function_call !== undefined) c.invalid(`${p}: tool/function messages cannot contain function calls`);
        if (role === 'function') {
          if (message.tool_call_id !== undefined) c.invalid(`${p}.tool_call_id is not valid for legacy function results`);
          c.str(message.name, `${p}.name`, true);
        }
        add('user', [h.result(message.tool_call_id, role === 'function' ? message.name : undefined, openAIContent(message.content, 'tool', c, `${p}.content`))]);
      } else {
        if (message.tool_call_id !== undefined) c.invalid(`${p}.tool_call_id requires role tool`);
        const blocks = openAIContent(message.content === undefined && role === 'assistant' && (message.tool_calls != null || message.function_call != null) ? null : message.content, role, c, `${p}.content`);
        if (message.tool_calls != null) {
          if (role !== 'assistant') c.invalid(`${p}.tool_calls requires role assistant`);
          blocks.push(...chatCalls(message.tool_calls, c, h, `${p}.tool_calls`));
        }
        if (message.function_call != null) {
          if (role !== 'assistant') c.invalid(`${p}.function_call requires role assistant`);
          if (message.tool_calls != null) c.invalid(`${p}: cannot mix tool_calls and legacy function_call`);
          blocks.push(legacyCall(message.function_call, c, h, `${p}.function_call`));
        }
        add(role, blocks);
      }
    });
  } else if (protocol === 'openai-response') {
    if (body.instructions !== undefined && body.instructions !== null) add('system', [text(c.str(body.instructions, 'instructions'))]);
    if (typeof body.input === 'string') add('user', [text(body.input)]);
    else c.arr(body.input, 'input', true).forEach((item, index) => {
      const p = `input[${index}]`;
      c.obj(item, p);
      if (item.type === 'function_call') {
        c.keys(item, ['type', 'id', 'call_id', 'name', 'arguments', 'status'], p);
        completedItem(item, c, p);
        add('assistant', [h.call(item.call_id, item.name, c.args(item.arguments, `${p}.arguments`, true))]);
      } else if (item.type === 'function_call_output') {
        c.keys(item, ['type', 'id', 'call_id', 'output', 'status'], p);
        completedItem(item, c, p);
        add('user', [h.result(item.call_id, undefined, openAIContent(item.output, 'user', c, `${p}.output`, true))]);
      } else if (item.type === undefined || item.type === 'message') {
        c.keys(item, ['type', 'id', 'status', 'role', 'content'], p);
        completedItem(item, c, p);
        if (!['user', 'assistant', 'system', 'developer'].includes(item.role)) c.invalid(`${p}.role is not a supported Responses role`);
        add(item.role, openAIContent(item.content, item.role, c, `${p}.content`, true));
      } else c.unsupported(`${p}: Responses item ${String(item.type)} is stateful or unsupported`);
    });
  } else {
    if (body.systemInstruction !== undefined) {
      c.keys(body.systemInstruction, ['parts', 'role'], 'systemInstruction');
      if (body.systemInstruction.role !== undefined) c.str(body.systemInstruction.role, 'systemInstruction.role');
      add('system', geminiParts(body.systemInstruction.parts, 'system', c, h, 'systemInstruction.parts', true));
    }
    c.arr(body.contents, 'contents', true).forEach((content, index) => {
      const p = `contents[${index}]`;
      c.keys(content, ['role', 'parts'], p);
      if (content.role !== undefined && !['user', 'model'].includes(content.role)) c.invalid(`${p}.role must be user or model`);
      const role = content.role === 'model' ? 'assistant' : 'user';
      add(role, geminiParts(content.parts, role, c, h, `${p}.parts`));
    });
  }
  if (!result.messages.length) c.invalid('request must contain at least one conversational message');
  const pendingCalls = new Set();
  let previousRole;
  for (const message of result.messages) {
    if (message.role === 'assistant' && previousRole === 'user' && pendingCalls.size) c.invalid('assistant continues before all preceding tool calls have results');
    for (const block of message.blocks) {
      if (block.type === 'call') pendingCalls.add(block.id);
      else if (block.type === 'result') pendingCalls.delete(block.id);
      else if (message.role === 'user' && pendingCalls.size) c.invalid('user content must follow, not precede, all pending tool results');
    }
    previousRole = message.role;
  }
  return { value: result, c };
}

function completedItem(item, c, path) {
  if (item.id !== undefined) c.str(item.id, `${path}.id`, true);
  if (item.status !== undefined && item.status !== 'completed') c.unsupported(`${path}.status must be completed in request history`);
}

function resultText(block, c) {
  if (block.isError) c.unsupported('Claude is_error tool results cannot be represented without changing their meaning');
  if (block.blocks.some((entry) => entry.type !== 'text')) c.unsupported('image/multimodal tool results cannot be represented as a text tool result');
  return joinedText(block.blocks);
}

function responsesResult(block, c) {
  if (block.blocks.every((entry) => entry.type === 'text')) return resultText(block, c);
  if (block.isError) c.unsupported('Claude is_error tool results cannot be represented without changing their meaning');
  return block.blocks.map((entry) => entry.type === 'image' ? wireImage(entry, 'openai-response', c) : { type: 'input_text', text: entry.text });
}

function toolWire(tool, protocol, c) {
  if (tool.strict && !['openai-chat', 'openai-response'].includes(protocol)) c.unsupported(`strict function schema for ${tool.name} cannot be guaranteed by ${protocol}`);
  const common = { name: tool.name, ...(tool.description !== undefined ? { description: tool.description } : {}) };
  if (protocol === 'claude') return { ...common, input_schema: tool.schema };
  // parametersJsonSchema avoids silently reinterpreting JSON Schema as Gemini's OpenAPI subset.
  if (protocol === 'gemini') return { ...common, parametersJsonSchema: tool.schema };
  const fn = { ...common, parameters: tool.schema, ...(tool.strict !== undefined ? { strict: tool.strict } : {}) };
  return protocol === 'openai-chat' ? { type: 'function', function: fn } : { type: 'function', ...fn, strict: tool.strict ?? false };
}

function applyTools(output, request, protocol, c) {
  if (request.tools.length) {
    const tools = request.tools.map((tool) => toolWire(tool, protocol, c));
    output.tools = protocol === 'gemini' ? [{ functionDeclarations: tools }] : tools;
  }
  const choice = request.choice;
  if (protocol === 'gemini') {
    if (request.parallel === false) c.unsupported('Gemini cannot guarantee parallel_tool_calls=false');
    if (choice) output.toolConfig = { functionCallingConfig: choice.name ? { mode: 'ANY', allowedFunctionNames: [choice.name] } : { mode: { auto: 'AUTO', none: 'NONE', required: 'ANY' }[choice.mode] } };
  } else if (protocol === 'claude') {
    if (choice || request.parallel === false) {
      output.tool_choice = choice?.name ? { type: 'tool', name: choice.name } : { type: choice?.mode === 'required' ? 'any' : choice?.mode || 'auto' };
      if (request.parallel !== undefined) output.tool_choice.disable_parallel_tool_use = !request.parallel;
    }
  } else {
    if (choice) output.tool_choice = choice.name ? protocol === 'openai-chat' ? { type: 'function', function: { name: choice.name } } : { type: 'function', name: choice.name } : choice.mode;
    if (request.parallel !== undefined) output.parallel_tool_calls = request.parallel;
  }
}

function applyGeneration(output, request, protocol, c) {
  const params = request.params;
  if (protocol === 'openai-response' && params.stop?.length) c.unsupported('Responses API has no stop-sequence parameter');
  if (protocol === 'claude' && params.temperature > 1) c.unsupported('Claude temperature must not exceed 1');
  if (protocol === 'openai-chat' && params.stop?.length > 4) c.unsupported('Chat Completions supports at most four stop sequences');
  const config = protocol === 'gemini' ? {} : output;
  if (params.maxTokens !== undefined) config[protocol === 'gemini' ? 'maxOutputTokens' : protocol === 'openai-response' ? 'max_output_tokens' : 'max_tokens'] = params.maxTokens;
  else if (protocol === 'claude') config.max_tokens = 4096;
  if (params.temperature !== undefined) config.temperature = params.temperature;
  if (params.topP !== undefined) config[protocol === 'gemini' ? 'topP' : 'top_p'] = params.topP;
  if (params.stop?.length) config[protocol === 'gemini' ? 'stopSequences' : protocol === 'claude' ? 'stop_sequences' : 'stop'] = params.stop;
  if (protocol === 'gemini' && Object.keys(config).length) output.generationConfig = config;
}

function mergeAssistantMessages(messages, { toolResults = false } = {}) {
  const merged = [];
  for (const message of messages) {
    const previous = merged.at(-1);
    const responseTurn = toolResults && previous?.role === 'user' && message.role === 'user'
      && previous.blocks.some((block) => block.type === 'result')
      && (message.blocks.some((block) => block.type === 'result') || previous.blocks.at(-1)?.type === 'result');
    if ((previous?.role === 'assistant' && message.role === 'assistant') || responseTurn) previous.blocks.push(...message.blocks);
    else merged.push({ role: message.role, blocks: [...message.blocks] });
  }
  return merged;
}

function writeRequest(request, protocol, c) {
  for (const tool of request.tools) targetToolName(tool.name, protocol, c);
  if (request.choice?.name) targetToolName(request.choice.name, protocol, c);
  for (const message of request.messages) for (const block of message.blocks) {
    if (block.type === 'call' || block.type === 'result') targetToolName(block.name, protocol, c);
  }
  const output = {};
  if (request.model !== undefined && protocol !== 'gemini') output.model = request.model;
  if (request.stream !== undefined && protocol !== 'gemini') output.stream = request.stream;
  applyGeneration(output, request, protocol, c);
  applyTools(output, request, protocol, c);
  if (protocol === 'claude') {
    if (request.instructions.length) output.system = request.instructions.map((entry) => entry.text).join('\n');
    output.messages = [];
    for (const message of mergeAssistantMessages(request.messages)) {
      const blocks = message.blocks.map((block) => {
        if (block.type === 'text') return { type: 'text', text: block.text };
        if (block.type === 'image') return wireImage(block, protocol, c);
        if (block.type === 'call') return { type: 'tool_use', id: block.id, name: block.name, input: block.args };
        return { type: 'tool_result', tool_use_id: block.id, content: block.blocks.map((entry) => entry.type === 'image' ? wireImage(entry, protocol, c) : { type: 'text', text: entry.text }), ...(block.isError ? { is_error: true } : {}) };
      });
      const previous = output.messages.at(-1);
      if (previous?.role === message.role) previous.content.push(...blocks);
      else output.messages.push({ role: message.role, content: blocks });
    }
  } else if (protocol === 'openai-chat') {
    output.messages = request.instructions.map((entry) => ({ role: entry.role, content: entry.text }));
    for (const message of mergeAssistantMessages(request.messages)) {
      let pending = [];
      const flush = () => {
        if (!pending.length) return;
        const calls = pending.filter((block) => block.type === 'call');
        const content = pending.filter((block) => block.type !== 'call');
        const entry = { role: message.role, content: content.length ? content.every((block) => block.type === 'text') ? joinedText(content) : content.map((block) => block.type === 'image' ? wireImage(block, protocol, c) : { type: 'text', text: block.text }) : null };
        if (calls.length) entry.tool_calls = calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } }));
        output.messages.push(entry);
        pending = [];
      };
      for (const block of message.blocks) {
        if (block.type === 'result') {
          flush();
          output.messages.push({ role: 'tool', tool_call_id: block.id, content: resultText(block, c) });
        } else pending.push(block);
      }
      flush();
      if (!message.blocks.length) output.messages.push({ role: message.role, content: '' });
    }
  } else if (protocol === 'openai-response') {
    output.store = false;
    output.input = request.instructions.map((entry) => ({ type: 'message', role: entry.role, content: [{ type: 'input_text', text: entry.text }] }));
    for (const message of request.messages) {
      let pending = [];
      const flush = () => {
        if (!pending.length) return;
        const assistant = message.role === 'assistant';
        output.input.push({ type: 'message', role: message.role, ...(assistant ? { status: 'completed' } : {}), content: pending.map((block) => block.type === 'image' ? wireImage(block, protocol, c) : { type: assistant ? 'output_text' : 'input_text', text: block.text, ...(assistant ? { annotations: [] } : {}) }) });
        pending = [];
      };
      for (const block of message.blocks) {
        if (block.type === 'call' || block.type === 'result') {
          flush();
          output.input.push(block.type === 'call' ? { type: 'function_call', call_id: block.id, name: block.name, arguments: JSON.stringify(block.args) } : { type: 'function_call_output', call_id: block.id, output: responsesResult(block, c) });
        } else pending.push(block);
      }
      flush();
      if (!message.blocks.length) output.input.push({ role: message.role, content: '' });
    }
  } else {
    if (request.instructions.length) output.systemInstruction = { parts: request.instructions.map((entry) => ({ text: entry.text })) };
    output.contents = mergeAssistantMessages(request.messages, { toolResults: true }).map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: message.blocks.map((block) => {
        if (block.type === 'text') return { text: block.text };
        if (block.type === 'image') return wireImage(block, protocol, c);
        if (block.type === 'call') return { functionCall: { id: block.id, name: block.name, args: block.args } };
        if (block.isError) c.unsupported('Claude is_error tool results cannot be losslessly translated');
        return { functionResponse: { id: block.id, name: block.name, response: block.json ?? { content: resultText(block, c) } } };
      }),
    }));
  }
  return output;
}

export function translateRequest(body, from, to) {
  checkProtocol(from);
  checkProtocol(to);
  if (from === to) return body;
  const { value, c } = readRequest(body, from);
  return writeRequest(value, to, c);
}

function usageOf(body, protocol, c) {
  const rawUsage = protocol === 'gemini' ? body.usageMetadata : body.usage;
  const raw = rawUsage === undefined ? {} : rawUsage;
  c.obj(raw, 'usage');
  const read = (key) => raw[key] === undefined ? 0 : c.num(raw[key], `usage.${key}`, { integer: true, min: 0 });
  const inputKey = protocol === 'openai-chat' ? 'prompt_tokens' : protocol === 'gemini' ? 'promptTokenCount' : 'input_tokens';
  const outputKey = protocol === 'openai-chat' ? 'completion_tokens' : protocol === 'gemini' ? 'candidatesTokenCount' : 'output_tokens';
  let input = read(inputKey);
  const output = read(outputKey);
  let cached = 0;
  let cacheCreation = 0;
  if (protocol === 'claude') {
    cached = read('cache_read_input_tokens');
    cacheCreation = read('cache_creation_input_tokens');
    input += cached + cacheCreation;
  } else if (protocol === 'gemini') {
    cached = read('cachedContentTokenCount');
    if (read('thoughtsTokenCount')) c.unsupported('reasoning/thought token usage cannot be translated');
  } else {
    const inputDetails = raw[protocol === 'openai-chat' ? 'prompt_tokens_details' : 'input_tokens_details'];
    const outputDetails = raw[protocol === 'openai-chat' ? 'completion_tokens_details' : 'output_tokens_details'];
    if (inputDetails != null) {
      c.obj(inputDetails, 'usage.input_tokens_details');
      if (inputDetails.cached_tokens !== undefined) cached = c.num(inputDetails.cached_tokens, 'usage.cached_tokens', { integer: true, min: 0 });
      if (inputDetails.audio_tokens !== undefined && c.num(inputDetails.audio_tokens, 'usage.audio_tokens', { integer: true, min: 0 })) c.unsupported('audio token usage cannot be translated');
    }
    if (outputDetails != null) {
      c.obj(outputDetails, 'usage.output_tokens_details');
      for (const field of ['reasoning_tokens', 'audio_tokens']) if (outputDetails[field] !== undefined && c.num(outputDetails[field], `usage.${field}`, { integer: true, min: 0 })) c.unsupported(`${field} usage cannot be translated`);
    }
  }
  if (cached > input) c.invalid('cached token count exceeds input tokens');
  const totalKey = protocol === 'gemini' ? 'totalTokenCount' : 'total_tokens';
  const total = raw[totalKey] === undefined ? input + output : read(totalKey);
  if (total < input + output) c.invalid('total token count is less than input plus output tokens');
  return { input, output, total, cached, cacheCreation };
}

const GEMINI_FILTER = ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT', 'MODEL_ARMOR'];

function readResponse(body, protocol, model) {
  const c = context(protocol, true);
  c.obj(body, 'response');
  if (body.error != null) {
    const detail = object(body.error) && typeof body.error.message === 'string' ? body.error.message : 'upstream returned an error envelope';
    c.invalid(`upstream error: ${detail}`);
  }
  const result = { id: undefined, model: '', created: Math.floor(Date.now() / 1000), blocks: [], stop: 'stop', usage: usageOf(body, protocol, c) };
  const h = history(c);
  const upstreamModel = protocol === 'gemini' ? body.modelVersion : body.model;
  if (upstreamModel !== undefined) result.model = c.str(upstreamModel, 'model');
  if (model) result.model = c.str(model, 'model override');
  const responseId = protocol === 'gemini' ? body.responseId : body.id;
  if (responseId !== undefined) result.id = c.str(responseId, 'response ID', true);
  const created = protocol === 'openai-chat' ? body.created : protocol === 'openai-response' ? body.created_at : undefined;
  if (created !== undefined) result.created = c.num(created, 'created timestamp', { integer: true, min: 0, max: 253402300799 });
  if (protocol === 'gemini' && body.createTime !== undefined) {
    c.str(body.createTime, 'createTime', true);
    const timestamp = Date.parse(body.createTime);
    if (!Number.isFinite(timestamp)) c.invalid('createTime must be an ISO timestamp');
    result.created = Math.floor(timestamp / 1000);
  }
  if (protocol === 'claude') {
    if (body.type !== undefined && body.type !== 'message') c.invalid('response.type must be message');
    if (body.role !== undefined && body.role !== 'assistant') c.invalid('response.role must be assistant');
    result.blocks = claudeBlocks(c.arr(body.content, 'content'), 'assistant', c, h, 'content');
    const stops = { end_turn: 'stop', stop_sequence: 'stop', max_tokens: 'length', tool_use: 'tool', refusal: 'refusal' };
    if (!own(stops, body.stop_reason)) c.unsupported(`unsupported/non-final stop_reason ${String(body.stop_reason)}`);
    result.stop = stops[body.stop_reason];
    if (body.stop_sequence != null) result.stopSequence = c.str(body.stop_sequence, 'stop_sequence');
  } else if (protocol === 'openai-chat') {
    const choices = c.arr(body.choices, 'choices', true);
    if (choices.length !== 1) c.unsupported('multiple response choices cannot be translated');
    const choice = c.obj(choices[0], 'choices[0]');
    if (choice.logprobs != null) c.unsupported('response logprobs cannot be translated');
    const message = c.obj(choice.message, 'choices[0].message');
    c.keys(message, ['role', 'content', 'tool_calls', 'refusal', 'annotations', 'audio', 'function_call', 'reasoning_content', 'reasoning'], 'choices[0].message');
    if (message.role !== 'assistant') c.invalid('choices[0].message.role must be assistant');
    for (const field of ['audio', 'reasoning_content', 'reasoning']) if (message[field] != null) c.unsupported(`response ${field} cannot be translated`);
    if (message.annotations != null && c.arr(message.annotations, 'message.annotations').length) c.unsupported('response annotations cannot be translated');
    result.blocks = openAIContent(message.content === undefined ? null : message.content, 'assistant', c, 'message.content');
    if (message.refusal != null) result.blocks.push({ type: 'refusal', text: c.str(message.refusal, 'message.refusal') });
    if (message.tool_calls != null) result.blocks.push(...chatCalls(message.tool_calls, c, h, 'message.tool_calls'));
    if (message.function_call != null) {
      if (message.tool_calls != null) c.invalid('response cannot mix tool_calls and legacy function_call');
      result.blocks.push(legacyCall(message.function_call, c, h, 'message.function_call'));
    }
    const stops = { stop: 'stop', length: 'length', tool_calls: 'tool', function_call: 'tool', content_filter: 'filter' };
    if (!own(stops, choice.finish_reason)) c.unsupported(`unsupported/non-final finish_reason ${String(choice.finish_reason)}`);
    result.stop = stops[choice.finish_reason];
  } else if (protocol === 'openai-response') {
    if (body.status === 'failed' || body.status === 'cancelled') c.invalid(`Responses status is ${body.status}, not a successful completion`);
    if (!['completed', 'incomplete'].includes(body.status)) c.invalid(`Responses status ${String(body.status)} is not a final response`);
    if (body.status === 'incomplete') {
      c.obj(body.incomplete_details, 'incomplete_details');
      const reason = body.incomplete_details.reason;
      if (!['max_output_tokens', 'content_filter'].includes(reason)) c.unsupported(`unsupported incomplete reason ${String(reason)}`);
      result.stop = reason === 'max_output_tokens' ? 'length' : 'filter';
    } else if (body.incomplete_details != null) c.invalid('completed response must not have incomplete_details');
    c.arr(body.output, 'output').forEach((item, index) => {
      const p = `output[${index}]`;
      c.obj(item, p);
      if (item.id !== undefined) c.str(item.id, `${p}.id`, true);
      if (item.status !== undefined && !['completed', ...(body.status === 'incomplete' ? ['incomplete'] : [])].includes(item.status)) c.invalid(`${p}.status is not final`);
      if (item.type === 'message') {
        c.keys(item, ['type', 'id', 'status', 'role', 'content'], p);
        if (item.role !== 'assistant') c.invalid(`${p}.role must be assistant`);
        result.blocks.push(...openAIContent(c.arr(item.content, `${p}.content`), 'assistant', c, `${p}.content`, true));
      } else if (item.type === 'function_call') {
        c.keys(item, ['type', 'id', 'status', 'call_id', 'name', 'arguments'], p);
        if (item.status === 'incomplete') c.unsupported(`${p}: incomplete function_call cannot be represented by another protocol`);
        result.blocks.push(h.call(item.call_id, item.name, c.args(item.arguments, `${p}.arguments`, true), { optionalId: true }));
      } else c.unsupported(`${p}: unsupported/stateful output item ${String(item.type)}`);
    });
  } else {
    if (body.promptFeedback !== undefined) {
      c.obj(body.promptFeedback, 'promptFeedback');
      if (body.promptFeedback.blockReason !== undefined) {
        const reason = c.str(body.promptFeedback.blockReason, 'promptFeedback.blockReason', true);
        if (!['BLOCK_REASON_UNSPECIFIED', 'SAFETY', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY', 'MODEL_ARMOR'].includes(reason)) c.unsupported(`unknown prompt block reason ${reason}`);
        if (reason !== 'BLOCK_REASON_UNSPECIFIED') result.stop = 'filter';
      }
    }
    const candidates = body.candidates === undefined && result.stop === 'filter' ? [] : c.arr(body.candidates, 'candidates');
    if (candidates.length > 1) c.unsupported('multiple Gemini candidates cannot be translated');
    if (!candidates.length && result.stop !== 'filter') c.invalid('Gemini response has no candidates or explicit safety block');
    if (candidates.length) {
      const candidate = c.obj(candidates[0], 'candidates[0]');
      if (candidate.groundingMetadata != null || candidate.citationMetadata != null) c.unsupported('Gemini grounding/citation metadata cannot be translated');
      if (candidate.logprobsResult != null) c.unsupported('Gemini logprobs cannot be translated');
      if (candidate.safetyRatings !== undefined) c.arr(candidate.safetyRatings, 'safetyRatings').forEach((rating) => {
        c.obj(rating, 'safety rating');
        if (rating.blocked !== undefined && c.bool(rating.blocked, 'safety rating.blocked')) result.stop = 'filter';
      });
      if (GEMINI_FILTER.includes(candidate.finishReason)) result.stop = 'filter';
      else if (candidate.finishReason === 'MAX_TOKENS') { if (result.stop !== 'filter') result.stop = 'length'; }
      else if (candidate.finishReason !== undefined && candidate.finishReason !== 'STOP') c.unsupported(`unsupported/non-final Gemini finishReason ${String(candidate.finishReason)}`);
      if (candidate.content !== undefined) {
        c.keys(candidate.content, ['role', 'parts'], 'candidate.content');
        if (candidate.content.role !== undefined && candidate.content.role !== 'model') c.invalid('candidate.content.role must be model');
        result.blocks = geminiParts(candidate.content.parts, 'assistant', c, h, 'candidate.content.parts');
      }
    }
  }
  const hasCalls = result.blocks.some((block) => block.type === 'call');
  if (result.blocks.some((block) => block.type === 'refusal') && result.stop === 'stop') result.stop = 'refusal';
  if (result.stop === 'refusal') result.blocks = result.blocks.map((block) => block.type === 'text' ? { ...block, type: 'refusal' } : block);
  if (result.stop === 'tool' && !hasCalls) c.invalid('tool-call finish reason has no tool calls');
  if (hasCalls && result.stop === 'stop') result.stop = 'tool';
  if (!result.blocks.some((block) => block.type === 'call' || block.text?.length) && !['filter', 'length'].includes(result.stop)) c.invalid('response has no supported assistant content');
  return { value: result, c };
}

function writeResponse(response, protocol, c) {
  const { usage } = response;
  const calls = response.blocks.filter((block) => block.type === 'call');
  for (const call of calls) targetToolName(call.name, protocol, c);
  const refusals = response.blocks.filter((block) => block.type === 'refusal');
  const texts = response.blocks.filter((block) => block.type === 'text');
  const responseId = response.id || id(protocol === 'claude' ? 'msg' : protocol === 'openai-response' ? 'resp' : protocol === 'openai-chat' ? 'chatcmpl' : 'response');
  if (protocol === 'claude') return {
    id: responseId, type: 'message', role: 'assistant', model: response.model,
    content: response.blocks.map((block) => block.type === 'call' ? { type: 'tool_use', id: block.id, name: block.name, input: block.args } : { type: 'text', text: block.text }),
    stop_reason: { stop: response.stopSequence ? 'stop_sequence' : 'end_turn', tool: 'tool_use', length: 'max_tokens', filter: 'refusal', refusal: 'refusal' }[response.stop],
    stop_sequence: response.stopSequence || null,
    usage: { input_tokens: usage.input - usage.cached - usage.cacheCreation, output_tokens: usage.output, ...(usage.cached ? { cache_read_input_tokens: usage.cached } : {}), ...(usage.cacheCreation ? { cache_creation_input_tokens: usage.cacheCreation } : {}) },
  };
  if (protocol === 'openai-chat') return {
    id: responseId, object: 'chat.completion', created: response.created, model: response.model,
    choices: [{ index: 0, message: { role: 'assistant', content: texts.length ? joinedText(texts) : null, ...(refusals.length ? { refusal: joinedText(refusals) } : {}), ...(calls.length ? { tool_calls: calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })) } : {}) }, finish_reason: { stop: 'stop', tool: 'tool_calls', length: 'length', filter: 'content_filter', refusal: 'stop' }[response.stop], logprobs: null }],
    usage: { prompt_tokens: usage.input, completion_tokens: usage.output, total_tokens: usage.total, ...(usage.cached ? { prompt_tokens_details: { cached_tokens: usage.cached } } : {}) },
  };
  if (protocol === 'openai-response') {
    const status = ['length', 'filter'].includes(response.stop) ? 'incomplete' : 'completed';
    const output = [];
    let pending = [];
    const flush = () => {
      if (!pending.length) return;
      output.push({ type: 'message', id: id('msg'), role: 'assistant', status: status === 'incomplete' ? 'incomplete' : 'completed', content: pending });
      pending = [];
    };
    for (const block of response.blocks) {
      if (block.type === 'call') {
        flush();
        output.push({ type: 'function_call', id: id('fc'), call_id: block.id, name: block.name, arguments: JSON.stringify(block.args), status: 'completed' });
      } else pending.push(block.type === 'refusal' ? { type: 'refusal', refusal: block.text } : { type: 'output_text', text: block.text, annotations: [] });
    }
    flush();
    return { id: responseId, object: 'response', created_at: response.created, model: response.model, status, error: null, incomplete_details: status === 'incomplete' ? { reason: response.stop === 'length' ? 'max_output_tokens' : 'content_filter' } : null, output, usage: { input_tokens: usage.input, output_tokens: usage.output, total_tokens: usage.total, input_tokens_details: { cached_tokens: usage.cached }, output_tokens_details: { reasoning_tokens: 0 } } };
  }
  return {
    responseId, modelVersion: response.model, createTime: new Date(response.created * 1000).toISOString(),
    candidates: [{ index: 0, content: { role: 'model', parts: response.blocks.map((block) => block.type === 'call' ? { functionCall: { id: block.id, name: block.name, args: block.args } } : { text: block.text }) }, finishReason: { stop: 'STOP', tool: 'STOP', length: 'MAX_TOKENS', filter: 'SAFETY', refusal: 'SAFETY' }[response.stop] }],
    usageMetadata: { promptTokenCount: usage.input, candidatesTokenCount: usage.output, totalTokenCount: usage.total, ...(usage.cached ? { cachedContentTokenCount: usage.cached } : {}) },
  };
}

export function translateResponse(body, from, to, model = '') {
  checkProtocol(from);
  checkProtocol(to);
  if (from === to) return body;
  const { value, c } = readResponse(body, from, model);
  return writeResponse(value, to, c);
}

export function protocolError(protocol, { code = 'UNSUPPORTED_PROTOCOL_FEATURE', message = 'Protocol translation failed', status = 400 } = {}) {
  checkProtocol(protocol);
  if (protocol === 'gemini') return { error: { code: status, message, status: status === 429 ? 'RESOURCE_EXHAUSTED' : status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'PERMISSION_DENIED' : status === 404 ? 'NOT_FOUND' : status >= 500 ? 'INTERNAL' : 'INVALID_ARGUMENT', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: code, domain: 'model-router' }] } };
  const type = status === 429 ? 'rate_limit_error' : status === 401 ? 'authentication_error' : status === 403 ? 'permission_error' : status === 404 ? 'not_found_error' : status >= 500 ? 'api_error' : 'invalid_request_error';
  return protocol === 'claude' ? { type: 'error', error: { type, message, code } } : { error: { message, type, param: null, code } };
}

// Only the final turn can change intent. Tool continuations must retain session stickiness.
export function extractProtocolUserText(body, protocol) {
  checkProtocol(protocol);
  const c = context(protocol);
  c.obj(body, 'request');
  const collect = (content, kind) => {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    if (content.some((block) => object(block) && (block.type === 'tool_result' || own(block, 'functionResponse')))) return '';
    return content.filter((block) => object(block) && (kind === 'gemini' ? own(block, 'text') && !block.thought : block.type === 'text' || block.type === 'input_text'))
      .map((block) => c.str(block.text, 'user text')).join('\n');
  };
  if (protocol === 'openai-response') {
    if (typeof body.input === 'string') return body.input;
    const item = c.arr(body.input, 'input').at(-1);
    return object(item) && item.role === 'user' && (item.type === undefined || item.type === 'message') ? collect(item.content, protocol) : '';
  } else if (protocol === 'gemini') {
    const item = c.arr(body.contents, 'contents').at(-1);
    return object(item) && (item.role === undefined || item.role === 'user') ? collect(item.parts, protocol) : '';
  }
  const message = c.arr(body.messages, 'messages').at(-1);
  return object(message) && message.role === 'user' ? collect(message.content, protocol) : '';
}
