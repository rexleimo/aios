// 模型协议词表：描述“一个模型通过哪种 API 方言被访问”，与 provider（用哪个客户端启动）正交。
/* 中文注释：relay 协议是运行时事实，不是文档字段——协议路径来自 coding.rexai.top 的
   /api/v1/protocol-models 目录，客户端能力来自其自身配置证据（见 clients/core/definitions.mjs）。 */
export const MODEL_PROTOCOLS = Object.freeze(['openai-chat', 'openai-response', 'claude', 'gemini']);

export const RELAY_BASE_URL = 'https://coding.rexai.top';

// 纯函数：把任意写法（openai_completions / chat_completions / anthropic-messages…）归一到协议名。
export function normalizeModelProtocol(value = '') {
  const token = String(value || '').trim().toLowerCase().replace(/[._]/g, '-');
  if (!token) return '';
  if (token.includes('anthropic') || token === 'claude' || token === 'messages') return 'claude';
  if (token.includes('responses') || token === 'openai-response' || token === 'responses-api') return 'openai-response';
  if (token.includes('gemini') || token === 'google') return 'gemini';
  if (token.includes('completion') || token === 'openai-chat' || token === 'openai' || token === 'compatible') return 'openai-chat';
  return MODEL_PROTOCOLS.includes(token) ? token : '';
}

// 纯函数：读取一个模型条目支持的协议集合（历史条目没有 protocols 时返回空数组=不声明）。
export function modelProtocolSet(modelConfig = {}) {
  const raw = Array.isArray(modelConfig?.protocols)
    ? modelConfig.protocols
    : (modelConfig?.protocol ? [modelConfig.protocol] : []);
  return Array.from(new Set(raw.map((item) => normalizeModelProtocol(item)).filter(Boolean)));
}

// 纯函数：按协议拼出该模型的 relay 端点（未知协议返回空字符串，调用方自己兜底）。
export function protocolEndpoint(protocol = '', base = RELAY_BASE_URL) {
  const normalized = normalizeModelProtocol(protocol);
  const root = String(base || RELAY_BASE_URL).replace(/\/+$/u, '');
  if (normalized === 'openai-chat') return `${root}/openai/v1/chat/completions`;
  if (normalized === 'openai-response') return `${root}/openai/v1/responses`;
  if (normalized === 'claude') return `${root}/claude/v1/messages`;
  if (normalized === 'gemini') return `${root}/gemini/v1beta/models`;
  return '';
}
