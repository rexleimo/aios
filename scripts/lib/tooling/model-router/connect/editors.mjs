// 中文注释：magpie 式「就地接入」的纯函数外科编辑器——直接改写客户端真实配置里网关需要的几个 key，
// 其余字节（注释/顺序/缩进/其它 provider）一律不动；每个编辑器同时产出「原值备份」供 disconnect 还原。
// 不写盘、不持真实密钥：claude/pi 用占位 token，codex 用内联 experimental_bearer_token（网关 localhost 信任，
// 真实上游 key 由网关注入）。fs/原子写/备份落盘都在 inplace.mjs，本层只做 text→{text,backup} 便于零副作用测试。
import path from 'node:path';
import { clientGatewayUrl } from './targets.mjs';
export { editCodex, restoreCodex } from './config/codex.mjs';
export { editOpencode, restoreOpencode, editZcode, restoreZcode, editQoder, restoreQoder, editGemini, restoreGemini } from './config/json-clients.mjs';
export { editHermes, restoreHermes, editGrok, restoreGrok } from './config/block-clients.mjs';
export { editWorkbuddy, restoreWorkbuddy } from './config/workbuddy-editor.mjs';

const PLACEHOLDER_TOKEN = 'aios-gateway';
const CLAUDE_MODELS = ['ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL'];

// 探测原 JSON 的缩进单位，回写时沿用，避免把用户的 4 空格/tab 格式压成 2 空格。
function detectIndent(text) {
  const match = String(text).match(/\n([ \t]+)\S/u);
  return match ? match[1] : '  ';
}

function parseJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};
  const result = JSON.parse(trimmed);
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new SyntaxError('client config must be a JSON object');
  return result;
}

function serializeJson(document, indent) {
  return `${JSON.stringify(document, null, indent)}\n`;
}

// ---- claude：~/.claude/settings.json 的 env.ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN ----
// Explicit reserved IDs distinguish fixed targets from the gateway-managed Auto route.
export function editClaude(text, gatewayUrl, modelId = 'aios-auto', catalog = []) {
  const document = parseJson(text);
  const indent = detectIndent(text);
  const hadEnv = Object.prototype.hasOwnProperty.call(document, 'env');
  if (hadEnv && (!document.env || typeof document.env !== 'object' || Array.isArray(document.env))) throw new SyntaxError('Claude env must be an object');
  const env = { ...(document.env || {}) };
  const backup = {
    hadEnv,
    baseUrl: Object.prototype.hasOwnProperty.call(env, 'ANTHROPIC_BASE_URL') ? env.ANTHROPIC_BASE_URL : null,
    authToken: Object.prototype.hasOwnProperty.call(env, 'ANTHROPIC_AUTH_TOKEN') ? env.ANTHROPIC_AUTH_TOKEN : null,
    customHeaders: Object.hasOwn(env, 'ANTHROPIC_CUSTOM_HEADERS') ? env.ANTHROPIC_CUSTOM_HEADERS : null,
    modelEnv: Object.fromEntries(CLAUDE_MODELS.map((key) => [key, Object.hasOwn(env, key) ? env[key] : null])),
    model: Object.hasOwn(document, 'model') ? document.model : null,
    availableModels: Object.hasOwn(document, 'availableModels') ? document.availableModels : null,
  };
  env.ANTHROPIC_BASE_URL = clientGatewayUrl(gatewayUrl, 'claude');
  env.ANTHROPIC_AUTH_TOKEN = PLACEHOLDER_TOKEN;
  env.ANTHROPIC_CUSTOM_HEADERS = [...String(env.ANTHROPIC_CUSTOM_HEADERS || '').split('\n').filter((line) => line && !/^\s*x-gateway-client\s*:/iu.test(line)), 'x-gateway-client: claude'].join('\n');
  for (const key of CLAUDE_MODELS) env[key] = modelId;
  document.model = modelId;
  document.availableModels = [...new Set([modelId, ...catalog.map((item) => item.id)])];
  document.env = env;
  return { text: serializeJson(document, indent), backup, changedKeys: ['env.ANTHROPIC_BASE_URL', 'env.ANTHROPIC_AUTH_TOKEN', 'env.ANTHROPIC_CUSTOM_HEADERS', ...CLAUDE_MODELS.map((key) => `env.${key}`), 'model', 'availableModels'] };
}

export function restoreClaude(text, backup) {
  const document = parseJson(text);
  const indent = detectIndent(text);
  const env = { ...(document.env || {}) };
  if (backup.baseUrl === null) delete env.ANTHROPIC_BASE_URL;
  else env.ANTHROPIC_BASE_URL = backup.baseUrl;
  if (backup.authToken === null) delete env.ANTHROPIC_AUTH_TOKEN;
  else env.ANTHROPIC_AUTH_TOKEN = backup.authToken;
  if (Object.hasOwn(backup, 'customHeaders')) {
    if (backup.customHeaders === null) delete env.ANTHROPIC_CUSTOM_HEADERS;
    else env.ANTHROPIC_CUSTOM_HEADERS = backup.customHeaders;
  }
  for (const [key, value] of Object.entries(backup.modelEnv || {})) {
    if (value === null) delete env[key];
    else env[key] = value;
  }
  for (const key of ['model', 'availableModels']) {
    if (!Object.hasOwn(backup, key)) continue;
    if (backup[key] === null) delete document[key];
    else document[key] = backup[key];
  }
  if (Object.keys(env).length === 0 && !backup.hadEnv) delete document.env;
  else document.env = env;
  return serializeJson(document, indent);
}

// ---- pi：~/.pi/agent/settings.json 的 defaultProvider/defaultModel + models.json 的 provider 条目 ----
export function piProvider(gatewayUrl, modelId = 'aios-auto', catalog = []) {
  return {
    api: 'anthropic-messages',
    baseUrl: clientGatewayUrl(gatewayUrl, 'pi'),
    headers: { 'x-gateway-client': 'pi' },
    apiKey: PLACEHOLDER_TOKEN,
    models: [...new Map([{ id: modelId, name: 'AIOS Gateway' }, ...catalog].map((item) => [item.id, item])).values()].map((item) => (
      {
        id: item.id,
        name: item.name,
        api: 'anthropic-messages',
        contextWindow: 200000,
        maxTokens: 8192,
        input: ['text'],
        reasoning: false,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }
    )),
  };
}

export function editPiSettings(text, modelId) {
  const document = parseJson(text);
  const indent = detectIndent(text);
  const backup = {
    defaultProvider: Object.prototype.hasOwnProperty.call(document, 'defaultProvider') ? document.defaultProvider : null,
    defaultModel: Object.prototype.hasOwnProperty.call(document, 'defaultModel') ? document.defaultModel : null,
  };
  document.defaultProvider = 'aios-gateway';
  // Pi stores provider and model separately; prefixing the provider here duplicates it.
  document.defaultModel = modelId;
  return { text: serializeJson(document, indent), backup, changedKeys: ['defaultProvider', 'defaultModel'] };
}

export function restorePiSettings(text, backup) {
  const document = parseJson(text);
  const indent = detectIndent(text);
  if (backup.defaultProvider === null) delete document.defaultProvider;
  else document.defaultProvider = backup.defaultProvider;
  if (backup.defaultModel === null) delete document.defaultModel;
  else document.defaultModel = backup.defaultModel;
  return serializeJson(document, indent);
}

export function editPiModels(text, gatewayUrl, modelId, catalog = []) {
  const document = parseJson(text);
  if (Object.hasOwn(document, 'providers') && (!document.providers || typeof document.providers !== 'object' || Array.isArray(document.providers))) throw new SyntaxError('Pi providers must be an object');
  const indent = detectIndent(text);
  const providers = { ...(document.providers || {}) };
  const backup = {
    hadProviders: Object.prototype.hasOwnProperty.call(document, 'providers'),
    provider: Object.prototype.hasOwnProperty.call(providers, 'aios-gateway') ? providers['aios-gateway'] : null,
  };
  providers['aios-gateway'] = piProvider(gatewayUrl, modelId, catalog);
  document.providers = providers;
  return { text: serializeJson(document, indent), backup, changedKeys: ['providers.aios-gateway'] };
}

export function restorePiModels(text, backup) {
  const document = parseJson(text);
  const indent = detectIndent(text);
  const providers = { ...(document.providers || {}) };
  if (backup.provider === null) delete providers['aios-gateway'];
  else providers['aios-gateway'] = backup.provider;
  if (Object.keys(providers).length === 0 && !backup.hadProviders) delete document.providers;
  else document.providers = providers;
  return serializeJson(document, indent);
}

// 每个客户端「接入要改哪些真实文件」——单一事实源，CLI/GUI/测试共用，避免各处各抄一份路径。
export function clientConfigPaths(home) {
  return {
    claude: [path.join(home, '.claude', 'settings.json')],
    codex: [path.join(home, '.codex', 'config.toml')],
    pi: [path.join(home, '.pi', 'agent', 'settings.json'), path.join(home, '.pi', 'agent', 'models.json')],
    opencode: [path.join(home, '.config', 'opencode', 'opencode.json')],
    zcode: [path.join(home, '.zcode', 'v2', 'config.json')],
    qoder: [path.join(home, '.qoder', 'settings.json')],
    gemini: [path.join(home, '.gemini', 'settings.json')],
    hermes: [path.join(home, '.hermes', 'config.yaml')],
    grok: [path.join(home, '.grok', 'config.toml')],
    workbuddy: [path.join(home, '.workbuddy', 'models.json')],
  };
}
