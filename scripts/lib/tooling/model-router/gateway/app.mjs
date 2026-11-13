// 中文注释：网关的运行时无关核心——一个 Hono app（Web Standard Request/Response + fetch + ReadableStream）。
// 迁移别的 JS 运行时（Bun/Deno/Workers）只需换适配器，本文件不动；故此处不用 node:http/Buffer 等 Node 专有 API。
// P0 只做 claude 透传 + 每请求决策记录（实时路由图数据源种子）；路由/翻译/配额是 P2，在这里增量长。
import { Hono } from 'hono';

import { RELAY_BASE_URL } from '../routing/protocols.mjs';

// 中文注释：只透传与上游鉴权/协议相关的头，hop-by-hop 头与 host 不转发（fetch 自管）。
const PASSTHROUGH_REQUEST_HEADERS = Object.freeze([
  'authorization',
  'x-api-key',
  'anthropic-version',
  'anthropic-beta',
  'content-type',
  'accept',
]);

function extractModel(body) {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body));
    return typeof parsed?.model === 'string' ? parsed.model : '';
  } catch {
    return '';
  }
}

export function createGatewayApp(options = {}) {
  const {
    upstreamBase = RELAY_BASE_URL,
    upstreamPath = '/claude/v1/messages',
    incomingPath = '/v1/messages',
    intakeToken = '',
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
    // 中文注释：信任边界只认浏览器才发的信号 Origin/Sec-Fetch-Site；不拦所有 Sec-Fetch-*——
    // Node fetch（含 claude CLI）自带 Sec-Fetch-Mode: cors，拦它会误杀合法服务端调用。
    if (c.req.header('origin') || c.req.header('sec-fetch-site')) {
      return c.json({ error: { code: 'CROSS_ORIGIN_REJECTED' } }, 403);
    }
    if (intakeToken && c.req.header('x-gateway-token') !== intakeToken) {
      return c.json({ error: { code: 'INTAKE_TOKEN_REQUIRED' } }, 401);
    }

    const startedAt = Date.now();
    const body = await c.req.arrayBuffer();
    const model = extractModel(body);
    const headers = {};
    for (const name of PASSTHROUGH_REQUEST_HEADERS) {
      const value = c.req.header(name);
      if (value) headers[name] = value;
    }
    const search = new URL(c.req.url).search;
    const target = `${String(upstreamBase).replace(/\/+$/u, '')}${upstreamPath}${search}`;

    let upstream;
    try {
      upstream = await fetchImpl(target, { method: 'POST', headers, body });
    } catch (error) {
      recordDecision({ model, target, status: 0, error: error?.message || String(error), latencyMs: Date.now() - startedAt });
      return c.json({ error: { code: 'UPSTREAM_UNREACHABLE' } }, 502);
    }

    const finish = () => recordDecision({ model, target, status: upstream.status, latencyMs: Date.now() - startedAt });
    let responseBody = upstream.body;
    if (responseBody) {
      // 中文注释：流结束时落决策，latencyMs 是整轮 wall-time（探针据此判「不卡死」）。
      responseBody = responseBody.pipeThrough(new TransformStream({ flush: finish }));
    } else {
      finish();
    }
    return new Response(responseBody, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
    });
  });

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND' } }, 404));

  return Object.freeze({ app, decisions });
}