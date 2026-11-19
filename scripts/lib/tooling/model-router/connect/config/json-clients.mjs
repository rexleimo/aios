// 中文注释：JSON 类客户端的就地接入编辑器。配置形状取自 magpie（MIT）各客户端实现与本机真实配置。
// 只写我们管理的 provider/模型选择路径，backup 记录原值供还原；不改注释/顺序之外的字节。
import { editJson, restoreJson, detectIndent, parseObject, serialize } from './json-path.mjs';

const KEY = 'aios-gateway';
const trim = (url) => String(url || '').replace(/\/+$/u, '');
const v1 = (url) => `${trim(url)}/v1`;
// catalog 条目是 {target,id,name}；兼容旧的字符串形式。
const modelId = (item) => (typeof item === 'string' ? item : item?.id);
const catalogMap = (catalog) => Object.fromEntries((catalog || []).map((item) => {
  const id = modelId(item);
  return [id, { name: typeof item === 'string' ? id : item?.name || id }];
}).filter(([id]) => id));

// ---- opencode：~/.config/opencode/opencode.json ----
// OpenCode 2 读 providers，也读 OpenCode 1 的 provider；写 provider.*（两者都读）并改 model 选择。
const OPENCODE_WRITES = [
  ['provider.aios.npm', () => '@ai-sdk/openai-compatible'],
  ['provider.aios.name', () => 'AIOS Gateway'],
  ['provider.aios.options.baseURL', (p) => v1(p.gatewayUrl)],
  ['provider.aios.options.apiKey', () => KEY],
  ['provider.aios.models', (p) => catalogMap(p.catalog)],
  ['model', (p) => p.modelId],
];
export const editOpencode = (text, params) => editJson(text, OPENCODE_WRITES, params);
export const restoreOpencode = (text, backup) => restoreJson(text, OPENCODE_WRITES, backup);

// ---- zcode：~/.zcode/v2/config.json ----
const ZCODE_WRITES = [
  ['provider.aios.name', () => 'AIOS Gateway'],
  ['provider.aios.kind', () => 'openai'],
  ['provider.aios.options.baseURL', (p) => trim(p.gatewayUrl)],
  ['provider.aios.options.apiKey', () => KEY],
  ['provider.aios.models', (p) => catalogMap(p.catalog)],
  ['model', (p) => p.modelId],
];
export const editZcode = (text, params) => editJson(text, ZCODE_WRITES, params);
export const restoreZcode = (text, backup) => restoreJson(text, ZCODE_WRITES, backup);

// ---- qoder：~/.qoder/settings.json ----
const QODER_WRITES = [
  ['providers.aios.displayName', () => 'AIOS Gateway'],
  ['providers.aios.protocol', () => 'openai'],
  ['providers.aios.baseUrl', (p) => v1(p.gatewayUrl)],
  ['providers.aios.apiKey', () => KEY],
  ['providers.aios.model', (p) => p.modelId],
  ['model.name', (p) => p.modelId],
];
export const editQoder = (text, params) => editJson(text, QODER_WRITES, params);
export const restoreQoder = (text, backup) => restoreJson(text, QODER_WRITES, backup);

// ---- gemini：~/.gemini/settings.json ----
// Gemini CLI settings.json 支持 env 块；把 base URL / key 写在 env，并切到 api-key 认证 + 指定模型。
// （magpie 写的是同目录 .env；写 settings.json 的 env 是 Gemini CLI 的等价等价读取路径，保持单文件外科写入。）
const GEMINI_WRITES = [
  ['security.auth.selectedType', () => 'gemini-api-key'],
  ['model.name', (p) => p.modelId],
  ['env.GOOGLE_GEMINI_BASE_URL', (p) => trim(p.gatewayUrl)],
  ['env.GEMINI_API_KEY', () => KEY],
];
export const editGemini = (text, params) => editJson(text, GEMINI_WRITES, params);
export const restoreGemini = (text, backup) => restoreJson(text, GEMINI_WRITES, backup);

export { detectIndent, parseObject, serialize };
