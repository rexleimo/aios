// 中文注释：P2 跨协议流式翻译——把上游 openai-chat 的 SSE（chat.completion.chunk）逐事件翻成
// claude 的 SSE（message_start/content_block_delta/message_stop…），让 claude 客户端经网关
// 流式消费 openai 模型。纯 Web Standard（ReadableStream/TransformStream/TextDecoder），运行时无关。
// 本期覆盖文本增量；流式工具调用增量长。

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// 把 openai-chat SSE 字节流转成 claude SSE 字节流。model 用于 message_start 的模型字段。
export function openAIChatStreamToClaudeStream(upstreamBody, model = '') {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let started = false;
  let closed = false;

  const emitStart = (controller, id) => {
    started = true;
    controller.enqueue(encoder.encode(sse('message_start', {
      type: 'message_start',
      message: { id: id || '', type: 'message', role: 'assistant', model, content: [], usage: { input_tokens: 0, output_tokens: 0 } },
    })));
    controller.enqueue(encoder.encode(sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })));
  };
  const emitClose = (controller, stopReason) => {
    if (closed) return;
    closed = true;
    controller.enqueue(encoder.encode(sse('content_block_stop', { type: 'content_block_stop', index: 0 })));
    controller.enqueue(encoder.encode(sse('message_delta', { type: 'message_delta', delta: { stop_reason: stopReason || 'end_turn' }, usage: { output_tokens: 0 } })));
    controller.enqueue(encoder.encode(sse('message_stop', { type: 'message_stop' })));
  };

  const transform = new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          if (!started) emitStart(controller, '');
          emitClose(controller, 'end_turn');
          continue;
        }
        let parsed;
        try { parsed = JSON.parse(data); } catch { continue; }
        if (!started) emitStart(controller, parsed.id);
        const choice = parsed.choices?.[0] || {};
        const text = choice.delta?.content;
        if (text) {
          controller.enqueue(encoder.encode(sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })));
        }
        if (choice.finish_reason) emitClose(controller, choice.finish_reason === 'length' ? 'max_tokens' : 'end_turn');
      }
    },
    flush(controller) {
      if (started && !closed) emitClose(controller, 'end_turn');
    },
  });

  return upstreamBody.pipeThrough(transform);
}