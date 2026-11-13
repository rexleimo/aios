// 中文注释：P2 路由网关——把请求级路由（router）+ 协议翻译（translate）+ 供应商密钥 + 每请求超时 + 脱敏
// 接成一个 Hono app。与 P0 透传（app.mjs）分开：透传不路由，路由网关按 (客户端,角色) 选模型/上游并按需翻译。
// 运行时无关（Web Standard）；密钥只进转发头，绝不进决策记录/日志。流式翻译增量长，本期同协议流式直通、
// 跨协议非流式翻译。
import { Hono } from 'hono';

import { resolveGatewayRoute } from './router.mjs';
import { claudeToOpenAIChatRequest, openAIChatToClaudeResponse, claudeToGeminiRequest, geminiToClaudeResponse } from './translate.mjs';
import { loadProviders, resolveProviderApiKey } from '../routing/providers.mjs';

const DEFAULT_TIMEOUT_MS = 120_000;

// 中文注释：按目标协议选请求/响应翻译器（claude 客户端 ↔ openai-chat / gemini 上游）。
const REQUEST_TRANSLATORS = { 'openai-chat': claudeToOpenAIChatRequest, gemini: claudeToGeminiRequest };
const RESPONSE_TRANSLATORS = { 'openai-chat': openAIChatToClaudeResponse, gemini: geminiToClaudeResponse };

// 中文注释：按上游协议挂鉴权头。密钥值只在此处使用，调用方不得记录。
function authHeaders(targetProtocol, apiKey) {
  if (!apiKey) return {};
  if (targetProtocol === 'claude') return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  if (targetProtocol === 'gemini') return { 'x-goog-api-key': apiKey };
  return { authorization: `Bearer ${apiKey}` };
}

export function createRoutingGatewayApp(options = {}) {
  const {
    registry,
    clientId = '',
    role = '',
    env = process.env,
    clientProtocol = 'claude',
    incomingPath = '/v1/messages',
    requestTimeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
    onDecision = () => {},
  } = options;

  const decisions = [];
  function recordDecision(entry) {
    const decision = Object.freeze({ at: new Date().toISOString(), ...entry });
    decisions.push(decision);
    onDecision(decision);
    return decision;
  }

  const app = new Hono();
  app.get('/health', (c) => c.json({ ok: true }));

  app.post(incomingPath, async (c) => {
    if (c.req.header('origin') || c.req.header('sec-fetch-site')) {
      return c.json({ error: { code: 'CROSS_ORIGIN_REJECTED' } }, 403);
    }
    const startedAt = Date.now();
    // 中文注释：编排器逐阶段传不同角色——优先用请求头 x-gateway-role/x-gateway-client，回落创建期默认。
    const requestRole = c.req.header('x-gateway-role') || role;
    const requestClient = c.req.header('x-gateway-client') || clientId;
    const route = resolveGatewayRoute({ clientId: requestClient, role: requestRole, registry, env, clientProtocol });
    const rawBody = await c.req.arrayBuffer();

    let outgoingBody = rawBody;
    let parsed = null;
    try { parsed = JSON.parse(new TextDecoder().decode(rawBody)); } catch { parsed = null; }
    const requestTranslator = route.clientProtocol === 'claude' ? REQUEST_TRANSLATORS[route.targetProtocol] : null;
    if (route.needsTranslation && parsed && requestTranslator) {
      outgoingBody = new TextEncoder().encode(JSON.stringify(requestTranslator(parsed)));
    }

    const provider = loadProviders(registry)[route.providerId];
    const apiKey = resolveProviderApiKey(provider, env);
    const headers = { 'content-type': 'application/json', ...authHeaders(route.targetProtocol, apiKey) };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    let upstream;
    try {
      upstream = await fetchImpl(route.endpoint, { method: 'POST', headers, body: outgoingBody, signal: controller.signal });
    } catch (error) {
      clearTimeout(timer);
      const timedOut = controller.signal.aborted;
      recordDecision({ ...route.decision, status: timedOut ? 504 : 0, error: timedOut ? 'request-timeout' : (error?.message || String(error)), latencyMs: Date.now() - startedAt });
      return c.json({ error: { code: timedOut ? 'GATEWAY_TIMEOUT' : 'UPSTREAM_UNREACHABLE' } }, timedOut ? 504 : 502);
    }
    clearTimeout(timer);

    // 中文注释：跨协议非流式 → 翻译回客户端协议；同协议或流式 → 直通（流式翻译增量长）。
    const contentType = upstream.headers.get('content-type') || 'application/json';
    const isStream = contentType.includes('text/event-stream');
    const responseTranslator = route.clientProtocol === 'claude' ? RESPONSE_TRANSLATORS[route.targetProtocol] : null;
    if (route.needsTranslation && !isStream && responseTranslator) {
      const upstreamJson = await upstream.json();
      const translated = responseTranslator(upstreamJson, route.modelId);
      recordDecision({ ...route.decision, status: upstream.status, latencyMs: Date.now() - startedAt });
      return c.json(translated, upstream.status);
    }

    let responseBody = upstream.body;
    const finish = () => recordDecision({ ...route.decision, status: upstream.status, latencyMs: Date.now() - startedAt });
    if (responseBody) {
      responseBody = responseBody.pipeThrough(new TransformStream({ flush: finish }));
    } else {
      finish();
    }
    return new Response(responseBody, { status: upstream.status, headers: { 'content-type': contentType } });
  });

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND' } }, 404));
  return Object.freeze({ app, decisions });
}