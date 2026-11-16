// 中文注释：magpie 式「就地接入」的纯函数外科编辑器——直接改写客户端真实配置里网关需要的几个 key，
// 其余字节（注释/顺序/缩进/其它 provider）一律不动；每个编辑器同时产出「原值备份」供 disconnect 还原。
// 不写盘、不持真实密钥：claude/pi 用占位 token，codex 用内联 experimental_bearer_token（网关 localhost 信任，
// 真实上游 key 由网关注入）。fs/原子写/备份落盘都在 inplace.mjs，本层只做 text→{text,backup} 便于零副作用测试。
import path from 'node:path';

const PLACEHOLDER_TOKEN = 'aios-gateway';
const CODEX_BEGIN = '# aios-gateway:begin (managed by `aios model-router connect`; remove via disconnect)';
const CODEX_END = '# aios-gateway:end';

function trimSlash(url) {
  return String(url || '').replace(/\/+$/u, '');
}

// 探测原 JSON 的缩进单位，回写时沿用，避免把用户的 4 空格/tab 格式压成 2 空格。
function detectIndent(text) {
  const match = String(text).match(/\n([ \t]+)\S/u);
  return match ? match[1] : '  ';
}

function parseJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed);
}

function serializeJson(document, indent) {
  return `${JSON.stringify(document, null, indent)}\n`;
}

// ---- claude：~/.claude/settings.json 的 env.ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN ----
// 网关按 (client,role) 矩阵服务端路由，故不写 model；claude 现有 model 保持不变。
export function editClaude(text, gatewayUrl) {
  const document = parseJson(text);
  const indent = detectIndent(text);
  const hadEnv = Object.prototype.hasOwnProperty.call(document, 'env');
  const env = { ...(document.env || {}) };
  const backup = {
    hadEnv,
    baseUrl: Object.prototype.hasOwnProperty.call(env, 'ANTHROPIC_BASE_URL') ? env.ANTHROPIC_BASE_URL : null,
    authToken: Object.prototype.hasOwnProperty.call(env, 'ANTHROPIC_AUTH_TOKEN') ? env.ANTHROPIC_AUTH_TOKEN : null,
  };
  env.ANTHROPIC_BASE_URL = trimSlash(gatewayUrl);
  env.ANTHROPIC_AUTH_TOKEN = PLACEHOLDER_TOKEN;
  document.env = env;
  return { text: serializeJson(document, indent), backup, changedKeys: ['env.ANTHROPIC_BASE_URL', 'env.ANTHROPIC_AUTH_TOKEN'] };
}

export function restoreClaude(text, backup) {
  const document = parseJson(text);
  const indent = detectIndent(text);
  const env = { ...(document.env || {}) };
  if (backup.baseUrl === null) delete env.ANTHROPIC_BASE_URL;
  else env.ANTHROPIC_BASE_URL = backup.baseUrl;
  if (backup.authToken === null) delete env.ANTHROPIC_AUTH_TOKEN;
  else env.ANTHROPIC_AUTH_TOKEN = backup.authToken;
  if (Object.keys(env).length === 0 && !backup.hadEnv) delete document.env;
  else document.env = env;
  return serializeJson(document, indent);
}

// ---- codex：~/.codex/config.toml 行级外科——只改顶层 model_provider 行 + 追加/替换带标记的 provider 块 ----
function splitTopLevel(lines) {
  const firstTable = lines.findIndex((line) => /^\s*\[/u.test(line));
  return firstTable === -1 ? lines.length : firstTable;
}

function codexBlock(gatewayUrl) {
  return [
    CODEX_BEGIN,
    '[model_providers.aios-gateway]',
    'name = "aios-gateway"',
    `base_url = "${trimSlash(gatewayUrl)}/v1"`,
    'wire_api = "responses"',
    `experimental_bearer_token = "${PLACEHOLDER_TOKEN}"`,
    'requires_openai_auth = false',
    '',
    '[model_providers.aios-gateway.http_headers]',
    'x-gateway-client = "codex"',
    CODEX_END,
    '',
  ].join('\n');
}

function stripCodexBlock(lines) {
  const begin = lines.findIndex((line) => line.trim() === CODEX_BEGIN);
  if (begin === -1) return { lines, priorBlock: null };
  let end = lines.findIndex((line, index) => index > begin && line.trim() === CODEX_END);
  if (end === -1) end = lines.length - 1;
  const priorBlock = lines.slice(begin, end + 1).join('\n');
  const kept = lines.filter((_, index) => index < begin || index > end);
  return { lines: kept, priorBlock };
}

export function editCodex(text, gatewayUrl) {
  const original = String(text || '');
  const { lines: withoutBlock, priorBlock } = stripCodexBlock(original.split('\n'));
  const topEnd = splitTopLevel(withoutBlock);
  let modelProvider = null;
  let providerIndex = -1;
  for (let index = 0; index < topEnd; index += 1) {
    const match = withoutBlock[index].match(/^\s*model_provider\s*=\s*(.+?)\s*$/u);
    if (match && !withoutBlock[index].trim().startsWith('#')) {
      modelProvider = match[1];
      providerIndex = index;
      break;
    }
  }
  const backup = { modelProvider, priorBlock };
  const newLine = 'model_provider = "aios-gateway"';
  if (providerIndex !== -1) withoutBlock[providerIndex] = newLine;
  else withoutBlock.splice(topEnd, 0, newLine);
  const body = withoutBlock.join('\n').replace(/\n+$/u, '');
  const text2 = `${body}\n\n${codexBlock(gatewayUrl)}`;
  return { text: text2, backup, changedKeys: ['model_provider', '[model_providers.aios-gateway]'] };
}

export function restoreCodex(text, backup) {
  const { lines } = stripCodexBlock(String(text || '').split('\n'));
  const topEnd = splitTopLevel(lines);
  let providerIndex = -1;
  for (let index = 0; index < topEnd; index += 1) {
    if (/^\s*model_provider\s*=/u.test(lines[index]) && !lines[index].trim().startsWith('#')) {
      providerIndex = index;
      break;
    }
  }
  if (backup.modelProvider === null) {
    if (providerIndex !== -1) lines.splice(providerIndex, 1);
  } else if (providerIndex !== -1) {
    lines[providerIndex] = `model_provider = ${backup.modelProvider}`;
  } else {
    lines.splice(splitTopLevel(lines), 0, `model_provider = ${backup.modelProvider}`);
  }
  let body = lines.join('\n').replace(/\n+$/u, '');
  if (backup.priorBlock) body = `${body}\n\n${backup.priorBlock}\n`;
  return `${body}\n`;
}

// ---- pi：~/.pi/agent/settings.json 的 defaultProvider/defaultModel + models.json 的 provider 条目 ----
export function piProvider(gatewayUrl, modelId) {
  return {
    api: 'anthropic-messages',
    baseUrl: trimSlash(gatewayUrl),
    apiKey: PLACEHOLDER_TOKEN,
    models: [
      {
        id: modelId,
        name: 'AIOS Gateway',
        api: 'anthropic-messages',
        contextWindow: 200000,
        maxTokens: 8192,
        input: ['text'],
        reasoning: false,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
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
  document.defaultModel = `aios-gateway/${modelId}`;
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

export function editPiModels(text, gatewayUrl, modelId) {
  const document = parseJson(text);
  const indent = detectIndent(text);
  const providers = { ...(document.providers || {}) };
  const backup = {
    hadProviders: Object.prototype.hasOwnProperty.call(document, 'providers'),
    provider: Object.prototype.hasOwnProperty.call(providers, 'aios-gateway') ? providers['aios-gateway'] : null,
  };
  providers['aios-gateway'] = piProvider(gatewayUrl, modelId);
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
  };
}