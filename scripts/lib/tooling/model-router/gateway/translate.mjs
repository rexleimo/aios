// 中文注释：P2 协议翻译——claude ↔ openai-chat 的线格式互转，是跨客户端自由分配模型的关键。
// 纯函数、不联网；夹具照抄真实 wire 信封（不是按内层对象臆造）。本期覆盖非流式请求/响应 +
// 工具调用；gemini 与流式 SSE 互转在此模块增量长。脱敏在转发层做，翻译层不持有密钥。

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b?.type === 'text').map((b) => b.text || '').join('');
}

// claude 请求 → openai-chat 请求。system 提为 system 消息；tool_use→tool_calls；tool_result→tool 消息。
export function claudeToOpenAIChatRequest(claude = {}) {
  const messages = [];
  if (claude.system) {
    messages.push({ role: 'system', content: textOf(claude.system) });
  }
  for (const message of claude.messages || []) {
    const content = message.content;
    if (message.role === 'assistant') {
      const blocks = Array.isArray(content) ? content : [{ type: 'text', text: String(content ?? '') }];
      const toolUses = blocks.filter((b) => b?.type === 'tool_use');
      const text = blocks.filter((b) => b?.type === 'text').map((b) => b.text || '').join('');
      const entry = { role: 'assistant', content: text || null };
      if (toolUses.length) {
        entry.tool_calls = toolUses.map((t) => ({
          id: t.id,
          type: 'function',
          function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) },
        }));
      }
      messages.push(entry);
      continue;
    }
    // user：可能含 tool_result（→ role:tool）与 text（→ role:user）
    const blocks = Array.isArray(content) ? content : [{ type: 'text', text: String(content ?? '') }];
    for (const block of blocks) {
      if (block?.type === 'tool_result') {
        messages.push({ role: 'tool', tool_call_id: block.tool_use_id, content: textOf(block.content) });
      } else if (block?.type === 'text') {
        messages.push({ role: 'user', content: block.text || '' });
      }
    }
  }
  const request = { model: claude.model, messages, stream: Boolean(claude.stream) };
  if (Number.isFinite(claude.max_tokens)) request.max_tokens = claude.max_tokens;
  if (Array.isArray(claude.tools) && claude.tools.length) {
    request.tools = claude.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description || '', parameters: t.input_schema || {} },
    }));
  }
  return request;
}

const STOP_REASON = { stop: 'end_turn', tool_calls: 'tool_use', length: 'max_tokens', content_filter: 'end_turn' };

// openai-chat 响应 → claude 响应。content→text 块；tool_calls→tool_use 块；usage/stop_reason 映射。
export function openAIChatToClaudeResponse(openai = {}, model = '') {
  const choice = (openai.choices || [])[0] || {};
  const message = choice.message || {};
  const content = [];
  if (message.content) content.push({ type: 'text', text: message.content });
  for (const call of message.tool_calls || []) {
    let input = {};
    try { input = JSON.parse(call.function?.arguments || '{}'); } catch { input = {}; }
    content.push({ type: 'tool_use', id: call.id, name: call.function?.name || '', input });
  }
  return {
    id: openai.id || '',
    type: 'message',
    role: 'assistant',
    model: model || openai.model || '',
    content,
    stop_reason: STOP_REASON[choice.finish_reason] || 'end_turn',
    usage: {
      input_tokens: openai.usage?.prompt_tokens ?? 0,
      output_tokens: openai.usage?.completion_tokens ?? 0,
    },
  };
}

// openai-chat 请求 → claude 请求（反向）。system 消息提为 system；tool 消息→tool_result；tool_calls→tool_use。
export function openAIChatToClaudeRequest(openai = {}) {
  const systemParts = [];
  const messages = [];
  for (const message of openai.messages || []) {
    if (message.role === 'system') {
      systemParts.push(typeof message.content === 'string' ? message.content : '');
      continue;
    }
    if (message.role === 'tool') {
      messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: message.tool_call_id, content: message.content || '' }] });
      continue;
    }
    if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length) {
      const blocks = [];
      if (message.content) blocks.push({ type: 'text', text: message.content });
      for (const call of message.tool_calls) {
        let input = {};
        try { input = JSON.parse(call.function?.arguments || '{}'); } catch { input = {}; }
        blocks.push({ type: 'tool_use', id: call.id, name: call.function?.name || '', input });
      }
      messages.push({ role: 'assistant', content: blocks });
      continue;
    }
    messages.push({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content || '' });
  }
  const request = { model: openai.model, messages, stream: Boolean(openai.stream) };
  if (systemParts.length) request.system = systemParts.join('\n');
  if (Number.isFinite(openai.max_tokens)) request.max_tokens = openai.max_tokens;
  else request.max_tokens = 4096;
  if (Array.isArray(openai.tools) && openai.tools.length) {
    request.tools = openai.tools.map((t) => ({
      name: t.function?.name || '',
      description: t.function?.description || '',
      input_schema: t.function?.parameters || {},
    }));
  }
  return request;
}

// claude 响应 → openai-chat 响应（反向）。text 块→content；tool_use 块→tool_calls。
export function claudeToOpenAIChatResponse(claude = {}) {
  const blocks = claude.content || [];
  const text = blocks.filter((b) => b?.type === 'text').map((b) => b.text || '').join('');
  const toolUses = blocks.filter((b) => b?.type === 'tool_use');
  const message = { role: 'assistant', content: text || null };
  if (toolUses.length) {
    message.tool_calls = toolUses.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) } }));
  }
  const finish = claude.stop_reason === 'tool_use' ? 'tool_calls' : claude.stop_reason === 'max_tokens' ? 'length' : 'stop';
  return {
    id: claude.id || '',
    object: 'chat.completion',
    model: claude.model || '',
    choices: [{ index: 0, message, finish_reason: finish }],
    usage: { prompt_tokens: claude.usage?.input_tokens ?? 0, completion_tokens: claude.usage?.output_tokens ?? 0 },
  };
}