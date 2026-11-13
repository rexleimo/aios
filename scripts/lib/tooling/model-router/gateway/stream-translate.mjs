// 中文注释：P2 跨协议流式翻译——把上游 openai-chat 的 SSE（chat.completion.chunk）逐事件翻成
// claude 的 SSE（message_start/content_block_*/message_delta/message_stop），让 claude 客户端经网关
// 流式消费 openai 模型。覆盖文本增量与工具调用（tool_calls→tool_use/input_json_delta）。
// 纯 Web Standard（ReadableStream/TransformStream/TextDecoder），运行时无关。

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function openAIChatStreamToClaudeStream(upstreamBody, model = '') {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let started = false;
  let closed = false;
  let nextBlockIndex = 0;
  let textBlockIndex = -1;
  // openai tool index → { blockIndex, opened }
  const toolBlocks = new Map();
  const openBlockIndices = [];

  const emit = (controller, event, data) => controller.enqueue(encoder.encode(sse(event, data)));

  const emitStart = (controller, id) => {
    started = true;
    emit(controller, 'message_start', {
      type: 'message_start',
      message: { id: id || '', type: 'message', role: 'assistant', model, content: [], usage: { input_tokens: 0, output_tokens: 0 } },
    });
  };

  const ensureTextBlock = (controller) => {
    if (textBlockIndex >= 0) return textBlockIndex;
    textBlockIndex = nextBlockIndex++;
    openBlockIndices.push(textBlockIndex);
    emit(controller, 'content_block_start', { type: 'content_block_start', index: textBlockIndex, content_block: { type: 'text', text: '' } });
    return textBlockIndex;
  };

  const emitClose = (controller, stopReason) => {
    if (closed) return;
    closed = true;
    for (const index of openBlockIndices) {
      emit(controller, 'content_block_stop', { type: 'content_block_stop', index });
    }
    emit(controller, 'message_delta', { type: 'message_delta', delta: { stop_reason: stopReason || 'end_turn' }, usage: { output_tokens: 0 } });
    emit(controller, 'message_stop', { type: 'message_stop' });
  };

  const handleToolCalls = (controller, toolCalls) => {
    for (const call of toolCalls || []) {
      const idx = call.index ?? 0;
      let block = toolBlocks.get(idx);
      if (!block) {
        block = { blockIndex: nextBlockIndex++, opened: false };
        toolBlocks.set(idx, block);
        openBlockIndices.push(block.blockIndex);
      }
      if (!block.opened && (call.id || call.function?.name)) {
        block.opened = true;
        emit(controller, 'content_block_start', {
          type: 'content_block_start', index: block.blockIndex,
          content_block: { type: 'tool_use', id: call.id || '', name: call.function?.name || '', input: {} },
        });
      }
      const fragment = call.function?.arguments;
      if (fragment) {
        emit(controller, 'content_block_delta', { type: 'content_block_delta', index: block.blockIndex, delta: { type: 'input_json_delta', partial_json: fragment } });
      }
    }
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
        const delta = choice.delta || {};
        if (delta.content) {
          const index = ensureTextBlock(controller);
          emit(controller, 'content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: delta.content } });
        }
        if (delta.tool_calls) handleToolCalls(controller, delta.tool_calls);
        if (choice.finish_reason) {
          emitClose(controller, choice.finish_reason === 'tool_calls' ? 'tool_use' : choice.finish_reason === 'length' ? 'max_tokens' : 'end_turn');
        }
      }
    },
    flush(controller) {
      if (started && !closed) emitClose(controller, 'end_turn');
    },
  });

  return upstreamBody.pipeThrough(transform);
}