// Endpoint facts checked against Magpie 9c4e877, internal/provider/presets.go.
// Only API-key transports supported by this gateway are offered, not OAuth/Vertex/Bedrock.
const api = (chat, claude, responses, gemini) => Object.fromEntries([
  ['openai-chat', chat], ['claude', claude], ['openai-response', responses], ['gemini', gemini],
].filter(([, value]) => value));
const region = (id, name, urls) => ({ id, name, urls });
const glm = host => [
  region('api', '按量付费', api(`${host}/api/paas/v4`, `${host}/api/anthropic`)),
  region('coding', 'Coding Plan', api(`${host}/api/coding/paas/v4`, `${host}/api/anthropic`, `${host}/api/v1`)),
];

export const PROVIDER_PRESETS = [
  { id: 'custom', name: '自定义渠道', urls: api(''), hint: '填写渠道提供的 API Base URL；不同 API 可以使用不同地址。' },
  { id: 'openai', name: 'OpenAI', urls: api('https://api.openai.com/v1', '', 'https://api.openai.com/v1') },
  { id: 'anthropic', name: 'Anthropic', urls: api('', 'https://api.anthropic.com') },
  { id: 'google', name: 'Google Gemini', urls: api('https://generativelanguage.googleapis.com/v1beta/openai', '', '', 'https://generativelanguage.googleapis.com/v1beta') },
  { id: 'deepseek', name: 'DeepSeek', urls: api('https://api.deepseek.com/v1', 'https://api.deepseek.com/anthropic', 'https://api.deepseek.com/v1') },
  { id: 'zhipu', name: '智谱 GLM', regions: glm('https://open.bigmodel.cn'), hint: '按密钥所属套餐选择；Coding Plan 与按量付费的地址不同。' },
  { id: 'zai', name: 'Z.ai', regions: glm('https://api.z.ai'), hint: '按密钥所属套餐选择，不会根据密钥猜测套餐。' },
  { id: 'moonshot', name: 'Kimi', regions: [
    region('global', '国际站', api('https://api.moonshot.ai/v1', 'https://api.moonshot.ai/anthropic')),
    region('cn', '中国站', api('https://api.moonshot.cn/v1', 'https://api.moonshot.cn/anthropic')),
  ] },
  { id: 'kimi-code', name: 'Kimi Code', regions: [
    region('global', '国际站会员', api('https://api.kimi.ai/coding/v1', 'https://api.kimi.ai/coding')),
    region('cn', '中国站会员', api('https://api.kimi.com/coding/v1', 'https://api.kimi.com/coding')),
  ] },
  { id: 'minimax', name: 'MiniMax', regions: [
    region('global', '国际站', api('https://api.minimax.io/v1', 'https://api.minimax.io/anthropic')),
    region('cn', '中国站', api('https://api.minimaxi.com/v1', 'https://api.minimaxi.com/anthropic')),
  ] },
  { id: 'openrouter', name: 'OpenRouter', authHeader: 'bearer', urls: api('https://openrouter.ai/api/v1', 'https://openrouter.ai/api') },
  { id: 'siliconflow', name: 'SiliconFlow', regions: [
    region('cn', '中国站', api('https://api.siliconflow.cn/v1')),
    region('global', '国际站', api('https://api.siliconflow.com/v1')),
  ] },
  { id: 'ollama', name: 'Ollama（本地）', noKey: true, urls: api('http://localhost:11434/v1', 'http://localhost:11434') },
  { id: 'lmstudio', name: 'LM Studio（本地）', noKey: true, urls: api('http://localhost:1234/v1') },
];
