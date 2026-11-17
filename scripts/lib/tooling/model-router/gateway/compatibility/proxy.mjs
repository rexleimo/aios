// Routing gateway: four protocol intakes share authentication, translation,
// deadlines and request-local masking. P0 app.mjs remains an opaque passthrough.
import { Hono } from 'hono';

import { resolveGatewayRoutes, parseRequestedTarget, GatewayRouteError } from '../router.mjs';
import { PROTOCOLS, ProtocolCompatibilityError, supportsProtocolTranslation, translateRequest, translateResponse, protocolError, extractProtocolUserText } from './protocol-codec.mjs';
import { translateProtocolStream } from './protocol-stream.mjs';
import { unmaskProtocolResponse, createProtocolUnmaskTransform } from './protocol-mask.mjs';
import { loadProviders, resolveProviderApiKey, resolveProviderRequestHeaders, readyProviderAccounts, listGatewayModels, getProviderForModel, ProviderConfigError } from '../../providers/registry.mjs';
import { getIntentRouting, classifyTurnIntent, applyConfidenceTier } from '../../routing/intent.mjs';
import { normalizeId } from '../../entry/shared.mjs';
import { maskObject, unmaskText } from '../../masking/masker.mjs';
import { GroupConfigError } from '../../routing/groups.mjs';
import { parseTargetRef, TargetReferenceError } from '../../routing/targets.mjs';
import { createRequestLifetime, readIncomingBody, fetchGatewayCandidates } from './upstream.mjs';
import { boundedCache, configurationFingerprint, createRoutingAffinity, observeAffinityStream } from './affinity.mjs';
import { gatewayClient, gatewayPath, registerGatewayCatalog } from './catalog.mjs';

const DEFAULT_TIMEOUT_MS = 120_000;

function latestTurnUserText(parsed, protocol) {
  const field = protocol === 'openai-response' ? 'input' : protocol === 'gemini' ? 'contents' : 'messages';
  const history = parsed[field];
  if (!Array.isArray(history)) return extractProtocolUserText(parsed, protocol);
  for (let i = history.length - 1; i >= 0; i--) {
    const text = extractProtocolUserText({ [field]: [history[i]] }, protocol);
    if (text) return text;
  }
  return '';
}

function validateInputDepth(value) {
  const pending = [[value, 0]];
  while (pending.length) {
    const [entry, depth] = pending.pop();
    if (depth > 100) throw new ProtocolCompatibilityError('Request exceeds the supported JSON nesting depth (100)', 'INVALID_PROTOCOL_REQUEST');
    if (entry && typeof entry === 'object') {
      for (const child of Object.values(entry)) pending.push([child, depth + 1]);
    }
  }
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
  const sessionIntents = boundedCache();
  const requestAffinity = createRoutingAffinity();
  const classify = classifyIntent || ((userText, context) => classifyTurnIntent({ registry, userText, env, fetchImpl, signal: context.signal }));
  function recordDecision(entry) {
    const decision = Object.freeze({ at: new Date().toISOString(), ...entry });
    decisions.push(decision);
    onDecision(decision);
    return decision;
  }

  function qualifyRoute({ requestClient = clientId, requestRole = role, incomingProtocol = clientProtocol, intent = null, stream = false, requestBody = null, requestedModel, headerTargets = [], pathModel } = {}) {
    const routes = resolveGatewayRoutes({ clientId: requestClient, role: requestRole, registry, env, clientProtocol: incomingProtocol, intent, requestedModel: requestedModel ?? requestBody?.model, headerTargets, pathModel, context: { stream } });
    const providers = loadProviders(registry);
    const candidates = [];
    let failure;
    for (const selected of routes) {
      try {
        const upstream = providers[selected.providerId];
        const accounts = readyProviderAccounts(upstream, env);
        if (!accounts.length) throw new GatewayRouteError('Provider credentials are missing', 'PROVIDER_CREDENTIALS_MISSING');
        const qualifiedAccounts = accounts.filter((id) => {
          try { resolveProviderRequestHeaders(upstream, selected.targetProtocol, resolveProviderApiKey(upstream, env, id), env); return true; }
          catch { return false; }
        });
        if (!qualifiedAccounts.length) throw new GatewayRouteError('No valid provider account remains', 'PROVIDER_CREDENTIALS_MISSING');
        if (!supportsProtocolTranslation(selected.clientProtocol, selected.targetProtocol, { stream })) throw new GatewayRouteError('The selected protocol translation is unavailable', 'PROTOCOL_TRANSLATION_UNAVAILABLE', 501);
        if (requestBody && selected.needsTranslation) translateRequest(structuredClone(requestBody), selected.clientProtocol, selected.targetProtocol);
        candidates.push({ selected, upstream, accounts: qualifiedAccounts });
      } catch (error) { failure ||= error; }
    }
    if (!candidates.length) throw failure || new GatewayRouteError('No qualified group members');
    return { ...candidates[0], candidates };
  }

  function qualifiedIntentConfig(context = {}) {
    const config = getIntentRouting(registry);
    const requested = parseRequestedTarget(context.requestedModel ?? context.requestBody?.model, registry, context);
    if (!config || normalizeId(context.requestRole) || (requested && requested.kind !== 'auto')
      || context.opaque || listGatewayModels(registry, { env, requireCredentials: false }).length < 2) return null;
    try {
      const classifier = getProviderForModel(config.classifierModel, registry);
      if (!['claude', 'openai-chat'].includes(classifier.protocol) || !readyProviderAccounts(classifier.provider, env).length) return null;
      for (const item of config.intents) {
        const route = qualifyRoute({ ...context, intent: { intentId: item.id, modelId: item.modelId } });
        if (route.selected.targetRef !== parseTargetRef(item.modelId, registry)?.ref) return null;
      }
      return config;
    } catch (error) {
      if (!(error instanceof ProviderConfigError) && !(error instanceof GatewayRouteError) && !(error instanceof GroupConfigError) && !(error instanceof ProtocolCompatibilityError)) throw error;
      return null;
    }
  }

  const app = new Hono({ getPath: gatewayPath });
  registerGatewayCatalog(app, { registry, env, clientId });
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
          for (const incomingProtocol of PROTOCOLS) {
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

  // The path, not the client identity or requested model name, selects the wire protocol.
  const handleIncoming = (incomingProtocol) => async (c) => {
    let lifetime = null;
    const errorResponse = (code, status, message = code) => {
      lifetime?.dispose();
      return c.json(protocolError(incomingProtocol, { code, status, message }), status);
    };
    if (c.req.header('origin') || c.req.header('sec-fetch-site')) {
      return errorResponse('CROSS_ORIGIN_REJECTED', 403);
    }
    const startedAt = Date.now();
    lifetime = createRequestLifetime(c.req.raw.signal, requestTimeoutMs);
    // 中文注释：编排器逐阶段传不同角色——优先用请求头 x-gateway-role/x-gateway-client，回落创建期默认。
    const requestRole = c.req.header('x-gateway-role') || role;
    let requestClient = clientId;
    let usedAccount = null;
    let route;
    const attempts = [];
    // 中文注释：决策带上客户端/角色身份——实时路由图按 agent→网关→模型 画边，缺身份就画不出。
    let recorded = false;
    const record = (entry) => {
      if (recorded) return;
      recorded = true;
      return recordDecision({ clientId: requestClient, role: normalizeId(requestRole), ...entry });
    };
    try {
      requestClient = gatewayClient(c, clientId);
      let rawBody;
      try { rawBody = await readIncomingBody(c.req.raw.body, lifetime); }
      catch (error) {
        const code = lifetime.signal.reason?.code || 'INVALID_REQUEST_BODY';
        const status = code === 'CLIENT_CANCELLED' ? 499 : code === 'GATEWAY_TIMEOUT' ? 504 : 400;
        record({ status, error: code, latencyMs: Date.now() - startedAt });
        return errorResponse(code, status);
      }
      let parsed = null;
      try { parsed = JSON.parse(new TextDecoder().decode(rawBody)); } catch { parsed = null; }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        record({ status: 400, error: 'INVALID_REQUEST_BODY', latencyMs: Date.now() - startedAt });
        return errorResponse('INVALID_REQUEST_BODY', 400);
      }
      validateInputDepth(parsed);
      if (Object.hasOwn(parsed, 'stream') && typeof parsed.stream !== 'boolean') {
        record({ status: 400, error: 'INVALID_PROTOCOL_REQUEST', latencyMs: Date.now() - startedAt });
        return errorResponse('INVALID_PROTOCOL_REQUEST', 400, 'stream must be a boolean');
      }
      if ((['claude', 'openai-chat'].includes(incomingProtocol) && (!Array.isArray(parsed.messages) || !parsed.messages.length))
        || (incomingProtocol === 'openai-response' && !(typeof parsed.input === 'string' || Array.isArray(parsed.input)
          || typeof parsed.previous_response_id === 'string' || parsed.conversation))) {
        record({ status: 400, error: 'INVALID_PROTOCOL_REQUEST', latencyMs: Date.now() - startedAt });
        return errorResponse('INVALID_PROTOCOL_REQUEST', 400, 'A conversation input is required for this protocol');
      }
      let stream = parsed.stream === true;
      let pathModel;
      const requestedModel = parsed.model;
      const headerTargets = [c.req.header('x-gateway-target'), c.req.header('x-aios-target')];
      if (incomingProtocol === 'gemini') {
        const match = gatewayPath(c.req.raw).match(/^\/v1(?:beta)?\/models\/(.+):(generateContent|streamGenerateContent)$/u);
        if (!match) return errorResponse('NOT_FOUND', 404);
        pathModel = match[1];
        stream = match[2] === 'streamGenerateContent';
        if ((Object.hasOwn(parsed, 'stream') && parsed.stream !== stream)
          || !Array.isArray(parsed.contents) || !parsed.contents.length) {
          record({ status: 400, error: 'INVALID_PROTOCOL_REQUEST', latencyMs: Date.now() - startedAt });
          return errorResponse('INVALID_PROTOCOL_REQUEST', 400, 'Gemini requires contents and a stream flag consistent with the URL operation');
        }
        // Gemini transports stream mode in the operation, not in its JSON body.
        delete parsed.stream;
      }
      // Reject invalid or conflicting selectors before masking, intent, or any IO.
      parseRequestedTarget(requestedModel, registry, { headerTargets, pathModel });
      // Classification is an upstream request too; share one request-local mask mapping.
      let maskStore = new Map();
      if (masking) parsed = maskObject(parsed, maskStore).value;

      const sessionId = c.req.header('x-gateway-session') || c.req.header('x-aios-session');
      const affinity = requestAffinity({ protocol: incomingProtocol, client: requestClient, role: normalizeId(requestRole), sessionId, body: parsed, fingerprint: configurationFingerprint(registry, env) });
      let candidates;
      const routeContext = { requestClient, requestRole, incomingProtocol, stream, requestBody: parsed, requestedModel, headerTargets, pathModel, opaque: affinity.opaque };
      const qualify = (intent = null) => qualifyRoute({ ...routeContext, intent });
      try {
        let intent = null;
        const intentConfig = qualifiedIntentConfig(routeContext);

        let defaultError;
        try {
          ({ selected: route, candidates } = qualify());
        } catch (error) {
          if (!intentConfig || error.code !== 'NO_ROUTE_CONFIGURED') throw error;
          defaultError = error;
        }
        if (intentConfig) {
          const sessionKey = affinity.sessionKey;
          // A client identity is not a conversation. Anonymous continuations must use
          // their own history rather than another request's cached intent.
          const userText = sessionKey ? extractProtocolUserText(parsed, incomingProtocol) : latestTurnUserText(parsed, incomingProtocol);
          if (userText) {
            let classified = null;
            try { classified = await lifetime.run(() => classify(userText, { signal: lifetime.signal })); }
            catch { lifetime.signal.throwIfAborted(); /* Keep the qualified default route on classifier failure. */ }
            // JEV confidence gate at the consumption edge too: the injected classifier
            // path bypasses classifyTurnIntent, so enforce the threshold here as well.
            classified = applyConfidenceTier(classified, intentConfig.confidenceThreshold);
            const configuredIntent = intentConfig.intents.find((item) => item.id === classified?.intentId && item.modelId === classified?.modelId);
            if (configuredIntent) {
              intent = { intentId: configuredIntent.id, modelId: configuredIntent.modelId, description: configuredIntent.description, classifierModel: intentConfig.classifierModel, ...(typeof classified?.confidence === 'number' ? { confidence: classified.confidence } : {}) };
              if (sessionKey) sessionIntents.set(sessionKey, intent);
            } else if (sessionKey) {
              sessionIntents.delete(sessionKey);
            }
          } else if (sessionKey) {
            intent = sessionIntents.get(sessionKey) || null;
          }
        }
        if (intent) ({ selected: route, candidates } = qualify(intent));
        if (!route) throw defaultError || new GatewayRouteError('No configured route selected');
      } catch (error) {
        if (!(error instanceof GatewayRouteError) && !(error instanceof ProviderConfigError) && !(error instanceof GroupConfigError) && !(error instanceof ProtocolCompatibilityError) && !(error instanceof TargetReferenceError)) throw error;
        const code = error.code || 'NO_ROUTE_CONFIGURED';
        const status = error.status || 503;
        record({ ...route?.decision, status, error: code, latencyMs: Date.now() - startedAt });
        return errorResponse(code, status, error instanceof ProtocolCompatibilityError ? error.message : code);
      }
      const affinitySelection = affinity.select(candidates);
      const result = await fetchGatewayCandidates({ ...affinitySelection, parsed, stream, env, masking, maskStore, lifetime, fetchImpl, attempts,
        onAttempt: (current) => { route = current.route; usedAccount = current.account; },
        onBodyError: (error, current) => {
          const code = lifetime.signal.reason?.code || error.code || 'UPSTREAM_BODY_ERROR';
          record({ ...current.route.decision, attempts, account: current.account, status: code === 'GATEWAY_TIMEOUT' ? 504 : code === 'CLIENT_CANCELLED' ? 499 : 502, error: code, latencyMs: Date.now() - startedAt });
        },
      });
      route = result.route;
      maskStore = result.maskStore;
      const upstream = result.upstream;
      usedAccount = result.account;
      route = { ...route, decision: { ...route.decision, attempts, affinityPinned: Boolean(affinitySelection.pin), failoverCount: Math.max(0, new Set(attempts.map((item) => item.modelId)).size - 1) } };
      const remember = (json) => { if (upstream.ok) affinity.remember(route, usedAccount, json); };

      const contentType = upstream.headers.get('content-type') || 'application/json';
      const isStream = contentType.toLowerCase().includes('text/event-stream');
      const responseFailure = (error) => {
        const code = lifetime.signal.reason?.code || (error instanceof ProtocolCompatibilityError ? error.code : 'INVALID_UPSTREAM_RESPONSE');
        const status = code === 'GATEWAY_TIMEOUT' ? 504 : code === 'CLIENT_CANCELLED' ? 499 : 502;
        record({ ...route.decision, account: usedAccount, status, error: code, latencyMs: Date.now() - startedAt });
        return errorResponse(code, status, error instanceof ProtocolCompatibilityError ? error.message : code);
      };
      try {
        // Never convert an upstream HTTP error into a success-shaped completion.
        if (!upstream.ok && route.needsTranslation) {
          const errText = await upstream.text();
          let message = errText;
          try { const parsedError = JSON.parse(errText); message = parsedError?.error?.message || parsedError?.message || errText; } catch { /* Non-JSON upstream error. */ }
          if (masking) message = unmaskText(message, maskStore);
          record({ ...route.decision, account: usedAccount, status: upstream.status, error: 'upstream-error', latencyMs: Date.now() - startedAt });
          return errorResponse('UPSTREAM_ERROR', upstream.status, String(message).slice(0, 500));
        }
        if (upstream.ok && stream !== isStream) {
          const failure = responseFailure(new ProtocolCompatibilityError('Upstream response does not match the requested stream mode', 'INVALID_UPSTREAM_RESPONSE'));
          void upstream.body?.cancel().catch(() => {});
          return failure;
        }
        if (upstream.ok && isStream && !upstream.body) return responseFailure(new Error('Missing upstream stream body'));
        if (route.needsTranslation && !isStream) {
          const upstreamJson = await upstream.json();
          const translated = translateResponse(upstreamJson, route.targetProtocol, route.clientProtocol, route.modelId);
          const unmasked = masking ? unmaskProtocolResponse(translated, route.clientProtocol, maskStore) : translated;
          remember(unmasked);
          record({ ...route.decision, account: usedAccount, status: upstream.status, latencyMs: Date.now() - startedAt, usage: upstreamJson?.usage || upstreamJson?.usageMetadata || null });
          return c.json(unmasked, upstream.status);
        }

        let responseBody = upstream.body;
        const finish = () => record({ ...route.decision, account: usedAccount, status: upstream.status, latencyMs: Date.now() - startedAt });
        if (!isStream && responseBody) {
          const text = await new Response(responseBody).text();
          let usage = null;
          let unmaskedText = text;
          let json;
          let isJson = false;
          try { json = JSON.parse(text); isJson = true; } catch { /* Non-JSON native bodies remain opaque. */ }
          if (isJson) {
            usage = json?.usage || json?.usageMetadata || null;
            remember(json);
            if (masking && maskStore.size) unmaskedText = JSON.stringify(unmaskProtocolResponse(json, route.clientProtocol, maskStore));
          }
          record({ ...route.decision, account: usedAccount, status: upstream.status, latencyMs: Date.now() - startedAt, usage });
          return new Response(unmaskedText, { status: upstream.status, headers: { 'content-type': contentType } });
        }
        if (isStream && route.needsTranslation && responseBody) {
          responseBody = translateProtocolStream(responseBody, route.targetProtocol, route.clientProtocol, route.modelId, {
            onError: (error) => record({ ...route.decision, account: usedAccount, status: 502, error: error.code || 'INVALID_UPSTREAM_STREAM', latencyMs: Date.now() - startedAt }),
          });
        }
        if (isStream && masking && responseBody) {
          responseBody = responseBody.pipeThrough(createProtocolUnmaskTransform(route.clientProtocol, maskStore, {
            onError: (error) => record({ ...route.decision, account: usedAccount, status: 502, error: error.code || 'INVALID_UPSTREAM_STREAM', latencyMs: Date.now() - startedAt }),
          }));
        }
        if (isStream && responseBody && upstream.ok) responseBody = observeAffinityStream(responseBody, route.clientProtocol, remember);
        if (responseBody) responseBody = responseBody.pipeThrough(new TransformStream({ flush: finish }));
        else finish();
        return new Response(responseBody, { status: upstream.status, headers: {
          'content-type': contentType,
          ...(isStream ? { 'cache-control': 'no-cache', 'x-accel-buffering': 'no' } : {}),
        } });
      } catch (error) {
        return responseFailure(error);
      }
    } catch (error) {
      const code = lifetime.signal.reason?.code || error.code || 'GATEWAY_INTERNAL_ERROR';
      const status = code === 'GATEWAY_TIMEOUT' ? 504 : code === 'CLIENT_CANCELLED' ? 499 : error.status || (error instanceof GroupConfigError || error instanceof ProviderConfigError ? 503 : 500);
      record({ ...route?.decision, attempts, account: usedAccount, status, error: code, latencyMs: Date.now() - startedAt });
      return errorResponse(code, status, error instanceof ProtocolCompatibilityError ? error.message : code);
    }
  };

  const intakes = new Map([
    ['/v1/messages', 'claude'], ['/v1/responses', 'openai-response'], ['/v1/chat/completions', 'openai-chat'],
    ['/v1/models/*', 'gemini'], ['/v1beta/models/*', 'gemini'],
  ]);
  // Retain the programmatic custom-intake seam without hiding the standard paths.
  if (!intakes.has(incomingPath)) intakes.set(incomingPath, clientProtocol);
  for (const [intake, protocol] of intakes) app.post(intake, handleIncoming(protocol));

  app.notFound((c) => {
    try { gatewayClient(c, clientId); }
    catch (error) { return c.json({ error: { code: error.code } }, error.status); }
    return c.json({ error: { code: 'NOT_FOUND' } }, 404);
  });
  return Object.freeze({ app, decisions });
}
