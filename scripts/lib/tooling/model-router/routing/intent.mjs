// 中文注释：按意图真 auto 的纯函数核心（magpie 对标）。意图是语义判断，由分类器模型报出（self-report），
// 本模块只做确定性的三件事：归一配置、构造分类提示、校验模型报回的 typed 标签并映射到模型。
// 北极星：绝不从用户文本用关键词/正则猜意图——parseIntentLabel 结构上只接受 (模型输出, 意图集)，
// 拿不到用户文本；未知/缺失标签 fail-closed 返回 null，由网关回落既有候选链，不猜、不静默发错模型。
import { normalizeId } from '../entry/shared.mjs';
import { getProviderForModel, readyProviderAccounts, resolveProviderEndpoint, resolveProviderApiKey, providerAuthHeaders } from './providers.mjs';

// 纯函数：归一 registry.intentRouting。缺分类器模型或无有效意图 → null（视为禁用）。
// 形状 { enabled, classifierModel, intents:[{id,description,modelId}] }；enabled 默认开（配置在即启用）。
export function getIntentRouting(registry) {
  const raw = registry?.intentRouting;
  if (!raw || typeof raw !== 'object' || raw.enabled === false) return null;
  const classifierModel = normalizeId(raw.classifierModel);
  const intents = (Array.isArray(raw.intents) ? raw.intents : [])
    .map((item) => ({
      id: normalizeId(item?.id),
      description: String(item?.description || '').trim(),
      modelId: normalizeId(item?.modelId),
    }))
    .filter((item) => item.id && item.modelId);
  if (!classifierModel || intents.length === 0) return null;
  return { enabled: true, classifierModel, intents };
}

// 纯函数：构造分类器提示——列出每个意图 id+描述，附上用户消息，要求只回 JSON {"intent":"<id>"}。
// 用户消息截断到 4000 字符封顶（分类只需语义，不需要全文，控制成本/延迟）。
export function buildIntentClassifierPrompt(intents, userText) {
  const list = intents.map((item) => `- ${item.id}: ${item.description}`).join('\n');
  return [
    'You are a routing classifier. Read the user message and pick exactly one intent id from the list below.',
    'Reply with ONLY a JSON object: {"intent":"<id>"}. No prose, no markdown, no explanation.',
    '',
    'Intents:',
    list,
    '',
    'User message:',
    String(userText || '').slice(0, 4000),
  ].join('\n');
}

// 纯函数：解析并校验分类器模型报回的意图标签。只接受 (模型输出, 意图集)——结构上不接触用户文本。
// 命中配置意图 → {intentId,modelId,description}；未知标签/ malformed /缺字段 → null（fail-closed，不猜）。
export function parseIntentLabel(modelOutput, intents) {
  const text = String(modelOutput || '').trim();
  if (!text) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*?\}/u);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { parsed = null; }
    }
  }
  const intentId = normalizeId(parsed?.intent);
  if (!intentId) return null;
  const hit = (intents || []).find((item) => item.id === intentId);
  if (!hit) return null;
  return { intentId: hit.id, modelId: hit.modelId, description: hit.description };
}

// 纯函数：从入站请求体取「最新用户轮」的文本。仅当尾消息是用户文本轮时返回文本；
// 尾消息是 tool_result/assistant（续轮）→ 返回 ''，作为「沿用本轮意图、不再分类」的信号。
export function extractLatestUserText(parsed, clientProtocol) {
  if (!parsed || typeof parsed !== 'object') return '';
  const textOf = (content) => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map((block) => (typeof block === 'string' ? block : (block?.text || ''))).filter(Boolean).join('\n');
    return '';
  };
  if (clientProtocol === 'openai-response') {
    const input = parsed.input;
    if (typeof input === 'string') return input;
    const last = Array.isArray(input) ? input[input.length - 1] : null;
    return last?.role === 'user' ? textOf(last.content) : '';
  }
  const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
  const last = messages[messages.length - 1];
  return last?.role === 'user' ? textOf(last.content) : '';
}

// 分类器请求体/响应文本按协议适配（只支持能直说的 openai-chat / claude；其余协议 fail-closed）。
function classifierRequestBody(protocol, model, prompt) {
  if (protocol === 'openai-chat') return { model, messages: [{ role: 'user', content: prompt }], max_tokens: 64, stream: false };
  if (protocol === 'claude') return { model, max_tokens: 64, messages: [{ role: 'user', content: prompt }] };
  return null;
}
function classifierResponseText(protocol, json) {
  if (protocol === 'openai-chat') return json?.choices?.[0]?.message?.content || '';
  if (protocol === 'claude') return (json?.content || []).map((block) => block?.text || '').join('');
  return '';
}

// 异步编排：让分类器模型把意图作为结构化判断报出（self-report），校验后映射到模型。
// 任何失败（禁用/无配置/协议不支持/上游错误/超时/未知标签）→ null，由网关 fail-closed 回落，绝不猜。
// 分类器调用本身可能扣费——验证用 mock fetchImpl 零扣费，真实扣费验收需显式批准。
export async function classifyTurnIntent({ registry, userText, env = process.env, fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  let timer;
  try {
    const config = getIntentRouting(registry);
    if (!config) return null;
    const { provider, protocol, upstreamModel } = getProviderForModel(config.classifierModel, registry);
    const accountId = readyProviderAccounts(provider, env)[0];
    if (!accountId) return null;
    const body = classifierRequestBody(protocol, upstreamModel, buildIntentClassifierPrompt(config.intents, userText));
    if (!body) return null;
    const endpoint = resolveProviderEndpoint(provider, protocol);
    const headers = { 'content-type': 'application/json', ...providerAuthHeaders(protocol, resolveProviderApiKey(provider, env, accountId)) };
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetchImpl(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    if (!res.ok) return null;
    return parseIntentLabel(classifierResponseText(protocol, await res.json()), config.intents);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
