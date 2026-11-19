// 接入面板的纯逻辑：网关地址归一 + 每种 API 的 Base URL / 示例环境变量。
// 与 UI 解耦，便于单测钉住「诊断文案不改事实」；这里不读配置、不发请求。
export const PLACEHOLDER_KEY = 'aios-gateway';

export const ACCESS_APIS = Object.freeze([
  { id: 'openai', label: 'OpenAI', path: '/v1', baseEnv: 'OPENAI_BASE_URL', keyEnv: 'OPENAI_API_KEY', desc: 'Chat Completions，任何可设置 OpenAI base URL 的工具都能用。' },
  { id: 'responses', label: 'Responses', path: '/v1', baseEnv: 'OPENAI_BASE_URL', keyEnv: 'OPENAI_API_KEY', desc: 'Responses API，Codex 等工具使用的 wire。' },
  { id: 'anthropic', label: 'Anthropic', path: '', baseEnv: 'ANTHROPIC_BASE_URL', keyEnv: 'ANTHROPIC_AUTH_TOKEN', desc: 'Messages API，工具会自行追加 /v1/messages。' },
  { id: 'gemini', label: 'Gemini', path: '', baseEnv: 'GEMINI_BASE_URL', keyEnv: 'GEMINI_API_KEY', desc: 'GenerateContent，工具会自行追加 /v1beta/models/...。' },
]);

// 网关状态给的是带端口的根地址；剥尾部斜杠后再拼 API 路径，避免 //v1。
export function accessBaseUrl(gatewayUrl, port) {
  const root = String(gatewayUrl || (Number(port) > 0 ? `http://127.0.0.1:${port}` : 'http://127.0.0.1:<port>'));
  return root.replace(/\/+$/u, '');
}

export function accessApiBaseUrl(base, api) {
  return `${String(base).replace(/\/+$/u, '')}${api.path}`;
}

export function accessEnvSnippet(api, baseUrl) {
  return `export ${api.baseEnv}=${baseUrl}\nexport ${api.keyEnv}=${PLACEHOLDER_KEY}`;
}
