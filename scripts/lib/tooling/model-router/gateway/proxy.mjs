// 中文注释：P2 路由网关——把请求级路由（router）+ 协议翻译（translate）+ 供应商密钥 + 每请求超时 + 脱敏
// 接成一个 Hono app。与 P0 透传（app.mjs）分开：透传不路由，路由网关按 (客户端,角色) 选模型/上游并按需翻译。
// 运行时无关（Web Standard）；密钥只进转发头，绝不进决策记录/日志。流式翻译增量长，本期同协议流式直通、
// 跨协议非流式翻译。
import { Hono } from 'hono';

import { resolveGatewayRoute, GatewayRouteError } from './router.mjs';
import { claudeToOpenAIChatRequest, openAIChatToClaudeResponse, claudeToGeminiRequest, geminiToClaudeResponse } from './translate.mjs';
import { openAIChatStreamToClaudeStream } from './stream-translate.mjs';
import { loadProviders, resolveProviderApiKey, providerAuthHeaders, readyProviderAccounts, listGatewayModels, getProviderForModel, ProviderConfigError } from '../routing/providers.mjs';
import { getIntentRouting, classifyTurnIntent, extractLatestUserText } from '../routing/intent.mjs';
import { normalizeId } from '../entry/shared.mjs';
import { maskObject, unmaskObject, unmaskText, createUnmaskTransform } from '../masking/masker.mjs';

const DEFAULT_TIMEOUT_MS = 120_000;

// 中文注释：按「客户端协议 → 目标协议」选翻译器。目前只覆盖 claude 客户端 ↔ openai-chat / gemini 上游；
// openai-response 客户端（codex）只支持同协议直通，跨协议无翻译器时转发层 fail-closed，不静默发错协议 body。
const REQUEST_TRANSLATORS = {
  claude: { 'openai-chat': claudeToOpenAIChatRequest, gemini: claudeToGeminiRequest },
};
const RESPONSE_TRANSLATORS = {
  claude: { 'openai-chat': openAIChatToClaudeResponse, gemini: geminiToClaudeResponse },
};

function latestTurnUserText(parsed, protocol) {
  const field = protocol === 'openai-response' ? 'input' : 'messages';
  const history = parsed[field];
  if (!Array.isArray(history)) return extractLatestUserText(parsed, protocol);
  for (let i = history.length - 1; i >= 0; i--) {
    const text = extractLatestUserText({ [field]: [history[i]] }, protocol);
    if (text) return text;
  }
  return '';
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
    classifyIntent = null,
    masking = true,
  } = options;

  const decisions = [];
  // 中文注释：会话级意图缓存——同一会话的工具续轮沿用本轮意图，不再重复分类（magpie 的 turn stickiness）。
  const sessionIntents = new Map();
  const classify = classifyIntent || ((userText) => classifyTurnIntent({ registry, userText, env, fetchImpl }));
  function recordDecision(entry) {
    const decision = Object.freeze({ at: new Date().toISOString(), ...entry });
    decisions.push(decision);
    onDecision(decision);
    return decision;
  }

  function qualifyRoute({ requestClient = clientId, requestRole = role, incomingProtocol = clientProtocol, intent = null, stream = false } = {}) {
    const selected = resolveGatewayRoute({ clientId: requestClient, role: requestRole, registry, env, clientProtocol: incomingProtocol, intent });
    const upstream = loadProviders(registry)[selected.providerId];
    const accounts = readyProviderAccounts(upstream, env);
    if (!accounts.length) throw new GatewayRouteError('Provider credentials are missing', 'PROVIDER_CREDENTIALS_MISSING');
    if ((selected.needsTranslation && !REQUEST_TRANSLATORS[selected.clientProtocol]?.[selected.targetProtocol]) || (selected.targetProtocol === 'gemini' && stream)) {
      throw new GatewayRouteError('The selected protocol translation is unavailable', 'PROTOCOL_TRANSLATION_UNAVAILABLE');
    }
    return { selected, upstream, accounts };
  }

  function qualifiedIntentConfig(context = {}) {
    const config = getIntentRouting(registry);
    if (!config || normalizeId(context.requestRole) || listGatewayModels(registry, { env, requireCredentials: false }).length < 2) return null;
    try {
      const classifier = getProviderForModel(config.classifierModel, registry);
      if (!['claude', 'openai-chat'].includes(classifier.protocol) || !readyProviderAccounts(classifier.provider, env).length) return null;
      for (const item of config.intents) {
        const route = qualifyRoute({ ...context, intent: { intentId: item.id, modelId: item.modelId } });
        if (route.selected.modelId !== item.modelId) return null;
      }
      return config;
    } catch (error) {
      if (!(error instanceof ProviderConfigError) && !(error instanceof GatewayRouteError)) throw error;
      return null;
    }
  }

  const app = new Hono();
  app.get('/health', (c) => {
    try {
      const configuredModels = listGatewayModels(registry, { env, requireCredentials: false }).length;
      const readyModels = listGatewayModels(registry, { env }).length;
      let ready = false;
      let code = configuredModels && !readyModels ? 'PROVIDER_CREDENTIALS_MISSING' : 'NO_ROUTE_CONFIGURED';
      const clients = new Set([clientId, ...Object.keys(registry?.clientDefaults || {}), ...Object.keys(registry?.clientRoleMatrix?.clients || {})]);
      const roles = new Set([role, ...Object.keys(registry?.clientRoleMatrix?.default || {}), ...Object.keys(registry?.roleDefaults || {})]);
      for (const map of Object.values(registry?.clientRoleMatrix?.clients || {})) {
        for (const key of Object.keys(map || {})) roles.add(key);
      }
      for (const rule of registry?.routingRules || []) roles.add(rule.taskType || '');
      // Readiness describes a supported, explicitly configured intake path, not just catalog size.
      outer: for (const requestClient of clients) {
        for (const requestRole of roles) {
          for (const incomingProtocol of ['claude', 'openai-response']) {
            try {
              qualifyRoute({ requestClient, requestRole, incomingProtocol });
              ready = true;
              break outer;
            } catch (error) {
              if (error.code && error.code !== 'NO_ROUTE_CONFIGURED') code = error.code;
            }
            if (qualifiedIntentConfig({ requestClient, requestRole, incomingProtocol })) {
              ready = true;
              break outer;
            }
          }
        }
      }
      return c.json({ ok: true, ready, configuredModels, readyModels, ...(ready ? {} : { code }) });
    } catch {
      return c.json({ ok: true, ready: false, code: 'PROVIDER_CONFIG_INVALID' });
    }
  });

  // 中文注释：入口协议由路径决定——/v1/messages 收 claude，/v1/responses 收 openai-response（codex）。
  // 同一套路由/改写/超时/脱敏逻辑按入口协议泛化；翻译器按 (客户端协议→目标协议) 查表，缺则 fail-closed。
  const handleIncoming = (incomingProtocol) => async (c) => {
    if (c.req.header('origin') || c.req.header('sec-fetch-site')) {
      return c.json({ error: { code: 'CROSS_ORIGIN_REJECTED' } }, 403);
    }
    const startedAt = Date.now();
    // 中文注释：编排器逐阶段传不同角色——优先用请求头 x-gateway-role/x-gateway-client，回落创建期默认。
    const requestRole = c.req.header('x-gateway-role') || role;
    const requestClient = c.req.header('x-gateway-client') || clientId;
    let usedAccount = null;
    // 中文注释：决策带上客户端/角色身份——实时路由图按 agent→网关→模型 画边，缺身份就画不出。
    const record = (entry) => recordDecision({ clientId: requestClient, role: normalizeId(requestRole), ...entry });
    const rawBody = await c.req.arrayBuffer();
    let parsed = null;
    try { parsed = JSON.parse(new TextDecoder().decode(rawBody)); } catch { parsed = null; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      record({ status: 400, error: 'INVALID_REQUEST_BODY', latencyMs: Date.now() - startedAt });
      return c.json({ error: { code: 'INVALID_REQUEST_BODY' } }, 400);
    }
    // Classification is an upstream request too; share one request-local mask mapping.
    const maskStore = new Map();
    if (masking) parsed = maskObject(parsed, maskStore).value;

    let route;
    let provider;
    let accountIds;
    const routeContext = { requestClient, requestRole, incomingProtocol, stream: Boolean(parsed.stream) };
    const qualify = (intent = null) => qualifyRoute({ ...routeContext, intent });
    try {
      let intent = null;
      const intentConfig = qualifiedIntentConfig(routeContext);

      let defaultError;
      try {
        ({ selected: route, upstream: provider, accounts: accountIds } = qualify());
      } catch (error) {
        if (!intentConfig || error.code !== 'NO_ROUTE_CONFIGURED') throw error;
        defaultError = error;
      }
      if (intentConfig) {
        const sessionId = c.req.header('x-gateway-session');
        const sessionKey = sessionId ? JSON.stringify([incomingProtocol, requestClient, requestRole, sessionId]) : null;
        // A client identity is not a conversation. Anonymous continuations must use
        // their own history rather than another request's cached intent.
        const userText = sessionKey ? extractLatestUserText(parsed, incomingProtocol) : latestTurnUserText(parsed, incomingProtocol);
        if (userText) {
          let classified = null;
          try { classified = await classify(userText); } catch { /* Keep the qualified default route on classifier failure. */ }
          const configuredIntent = intentConfig.intents.find((item) => item.id === classified?.intentId && item.modelId === classified?.modelId);
          if (configuredIntent) {
            intent = { intentId: configuredIntent.id, modelId: configuredIntent.modelId, description: configuredIntent.description, classifierModel: intentConfig.classifierModel };
            if (sessionKey) sessionIntents.set(sessionKey, intent);
          } else if (sessionKey) {
            sessionIntents.delete(sessionKey);
          }
        } else if (sessionKey) {
          intent = sessionIntents.get(sessionKey) || null;
        }
      }
      if (intent) ({ selected: route, upstream: provider, accounts: accountIds } = qualify(intent));
      if (!route) throw defaultError || new GatewayRouteError('No configured route selected');
    } catch (error) {
      if (!(error instanceof GatewayRouteError) && !(error instanceof ProviderConfigError)) throw error;
      const code = error.code || 'NO_ROUTE_CONFIGURED';
      const status = code === 'PROTOCOL_TRANSLATION_UNAVAILABLE' ? 501 : 503;
      record({ ...route?.decision, status, error: code, latencyMs: Date.now() - startedAt });
      return c.json({ error: { code } }, status);
    }
    const requestTranslator = REQUEST_TRANSLATORS[route.clientProtocol]?.[route.targetProtocol] || null;
    const responseTranslator = RESPONSE_TRANSLATORS[route.clientProtocol]?.[route.targetProtocol] || null;
    // 中文注释：需要翻译却无对应翻译器 → fail-closed（501），绝不把错误协议的 body 静默转发上游。
    if (route.needsTranslation && !requestTranslator) {
      record({ ...route.decision, account: usedAccount, status: 501, error: 'protocol-translation-unavailable', latencyMs: Date.now() - startedAt });
      return c.json({ error: { code: 'PROTOCOL_TRANSLATION_UNAVAILABLE', clientProtocol: route.clientProtocol, targetProtocol: route.targetProtocol } }, 501);
    }
    let outgoingBody = rawBody;
    if (route.needsTranslation && parsed && requestTranslator) {
      parsed = requestTranslator(parsed);
      // Translation may serialize object keys into string values (tool arguments).
      if (masking) parsed = maskObject(parsed, maskStore).value;
    }
    // 中文注释：路由选定的模型必须写回上游请求体——否则决策说 deepseek-v4、线上仍发客户端原始模型，路由形同虚设。
    if (parsed && route.modelId) {
      if (provider.endpointStyle === 'standard' && route.targetProtocol === 'gemini') delete parsed.model;
      else parsed.model = route.upstreamModel;
      outgoingBody = new TextEncoder().encode(JSON.stringify(parsed));
    }

    function isRetryableStatus(status) {
      return status === 408 || status === 429 || status === 402 || status === 401 || (status >= 500 && status < 600);
    }

    let upstream = null;
    usedAccount = accountIds[0] || 'default';
    let lastError = null;
    for (const accountId of accountIds) {
      const apiKey = provider.authMode === 'none' ? '' : resolveProviderApiKey(provider, env, accountId);
      const headers = { 'content-type': 'application/json', ...providerAuthHeaders(route.targetProtocol, apiKey) };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      usedAccount = accountId;
      try {
        const res = await fetchImpl(route.endpoint, { method: 'POST', headers, body: outgoingBody, signal: controller.signal });
        clearTimeout(timer);
        upstream = res;
        if (res.ok || !isRetryableStatus(res.status)) break;
        lastError = new Error(`upstream status ${res.status}`);
      } catch (error) {
        clearTimeout(timer);
        const timedOut = controller.signal.aborted;
        lastError = error;
        if (timedOut) {
          record({ ...route.decision, account: accountId, status: 504, error: 'request-timeout', latencyMs: Date.now() - startedAt });
          return c.json({ error: { code: 'GATEWAY_TIMEOUT' } }, 504);
        }
        // 网络错误：尝试下一个账号
      }
    }
    if (!upstream) {
      record({ ...route.decision, account: usedAccount, status: 0, error: lastError?.message || String(lastError || 'UPSTREAM_UNREACHABLE'), latencyMs: Date.now() - startedAt });
      return c.json({ error: { code: 'UPSTREAM_UNREACHABLE' } }, 502);
    }

    // 中文注释：跨协议非流式 → 翻译回客户端协议；同协议或流式 → 直通（流式翻译增量长）。
    const contentType = upstream.headers.get('content-type') || 'application/json';
    const isStream = contentType.includes('text/event-stream');
    // 中文注释：上游非 2xx 时绝不把错误翻译进「成功信封」（真实验收暴露：503 被吞成空 claude 消息）。
    // 跨协议把真实错误原因装进客户端协议的错误信封并保留上游状态码；同协议走下方直通保留原始错误 body。
    if (!upstream.ok && route.needsTranslation) {
      const errText = await upstream.text();
      let message = errText;
      try { const parsedError = JSON.parse(errText); message = parsedError?.error?.message || parsedError?.message || errText; } catch { /* 非 JSON 错误体原样透传 */ }
      record({ ...route.decision, account: usedAccount, status: upstream.status, error: 'upstream-error', latencyMs: Date.now() - startedAt });
      if (route.clientProtocol === 'claude') {
        return c.json({ type: 'error', error: { type: 'api_error', message: String(message).slice(0, 500) } }, upstream.status);
      }
      return new Response(errText, { status: upstream.status, headers: { 'content-type': contentType } });
    }
    if (route.needsTranslation && !isStream && responseTranslator) {
      const upstreamJson = await upstream.json();
      const translated = responseTranslator(upstreamJson, route.modelId);
      const unmasked = masking ? unmaskObject(translated, maskStore) : translated;
      record({ ...route.decision, account: usedAccount, status: upstream.status, latencyMs: Date.now() - startedAt, usage: upstreamJson?.usage || null });
      return c.json(unmasked, upstream.status);
    }

    let responseBody = upstream.body;
    const finish = () => record({ ...route.decision, account: usedAccount, status: upstream.status, latencyMs: Date.now() - startedAt });
    // 同协议非流式：读取 body 以提取 usage 并做遮蔽还原，再原样返回。
    if (!isStream && !route.needsTranslation && responseBody) {
      const text = await new Response(responseBody).text();
      let usage = null;
      try { usage = JSON.parse(text)?.usage || null; } catch { /* 非 JSON 透传 */ }
      const unmaskedText = masking ? unmaskText(text, maskStore) : text; // need import unmaskText
      record({ ...route.decision, account: usedAccount, status: upstream.status, latencyMs: Date.now() - startedAt, usage });
      return new Response(unmaskedText, { status: upstream.status, headers: { 'content-type': contentType } });
    }
    // 中文注释：跨协议流式（claude 客户端 ← openai-chat 上游）逐事件翻译 SSE；其余流式直通。
    if (isStream && route.needsTranslation && route.clientProtocol === 'claude' && route.targetProtocol === 'openai-chat' && responseBody) {
      responseBody = openAIChatStreamToClaudeStream(responseBody, route.modelId);
    }
    // 隐私遮蔽：流式响应中还原占位符（跨 chunk 切分由 transform 内部缓冲处理）。
    if (isStream && masking && responseBody) {
      responseBody = responseBody.pipeThrough(createUnmaskTransform(maskStore));
    }
    if (responseBody) {
      responseBody = responseBody.pipeThrough(new TransformStream({ flush: finish }));
    } else {
      finish();
    }
    return new Response(responseBody, { status: upstream.status, headers: { 'content-type': contentType } });
  };

  app.post(incomingPath, handleIncoming(clientProtocol));
  if (incomingPath !== '/v1/responses') app.post('/v1/responses', handleIncoming('openai-response'));

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND' } }, 404));
  return Object.freeze({ app, decisions });
}
