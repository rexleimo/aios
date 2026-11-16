import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { createGatewayServer } from '../../../../lib/tooling/model-router/gateway/serve.mjs';

// 中文注释：P0 透传网关用本地 mock 上游验证（零扣费）：转发路径/鉴权透传、SSE 流式、
// 决策记录、信任边界。真实 relay 往返是另一步的 live 探针，需显式批准，不在本测试里触发。

function startMockUpstream(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function postMessages(base, { body, headers = {} } = {}) {
  return fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body ?? { model: 'claude-sonnet-5', messages: [] }),
  });
}

test('forwards /v1/messages to upstream /claude/v1/messages with auth passthrough and records a decision', async () => {
  const seen = {};
  const upstream = await startMockUpstream((req, res) => {
    seen.path = req.url;
    seen.auth = req.headers['x-api-key'];
    seen.version = req.headers['anthropic-version'];
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      seen.body = JSON.parse(raw);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, model: seen.body.model }));
    });
  });
  const gateway = createGatewayServer({ mode: 'passthrough', upstreamBase: upstream.base });
  const addr = await gateway.listen();
  try {
    const res = await postMessages(`http://127.0.0.1:${addr.port}`, {
      body: { model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'hi' }] },
      headers: { 'x-api-key': 'relay-key', 'anthropic-version': '2023-06-01' },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.model, 'claude-sonnet-5');
    assert.equal(seen.path, '/claude/v1/messages');
    assert.equal(seen.auth, 'relay-key', 'auth header must pass through to upstream');
    assert.equal(seen.version, '2023-06-01');
    assert.equal(gateway.decisions.length, 1);
    assert.equal(gateway.decisions[0].model, 'claude-sonnet-5');
    assert.equal(gateway.decisions[0].status, 200);
    assert.ok(Number.isFinite(gateway.decisions[0].latencyMs));
  } finally {
    await gateway.close();
    await closeServer(upstream.server);
  }
});

test('streams SSE chunks through in order without buffering', async () => {
  const upstream = await startMockUpstream((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    let i = 0;
    const timer = setInterval(() => {
      res.write(`data: chunk-${i}\n\n`);
      i += 1;
      if (i >= 3) {
        clearInterval(timer);
        res.end('data: [DONE]\n\n');
      }
    }, 10);
  });
  const gateway = createGatewayServer({ mode: 'passthrough', upstreamBase: upstream.base });
  const addr = await gateway.listen();
  try {
    const res = await postMessages(`http://127.0.0.1:${addr.port}`);
    assert.equal(res.headers.get('content-type'), 'text/event-stream');
    const text = await res.text();
    assert.ok(text.includes('chunk-0'));
    assert.ok(text.includes('chunk-1'));
    assert.ok(text.includes('chunk-2'));
    assert.ok(text.includes('[DONE]'));
    assert.ok(text.indexOf('chunk-0') < text.indexOf('chunk-2'), 'order preserved');
  } finally {
    await gateway.close();
    await closeServer(upstream.server);
  }
});

test('rejects browser cross-origin requests on the sensitive route', async () => {
  let called = false;
  const upstream = await startMockUpstream((req, res) => { called = true; res.end('{}'); });
  const gateway = createGatewayServer({ mode: 'passthrough', upstreamBase: upstream.base });
  const addr = await gateway.listen();
  try {
    const res = await postMessages(`http://127.0.0.1:${addr.port}`, { headers: { origin: 'https://evil.example' } });
    assert.equal(res.status, 403);
    assert.equal(called, false, 'cross-origin request must not reach upstream');
    assert.equal(gateway.decisions.length, 0);
  } finally {
    await gateway.close();
    await closeServer(upstream.server);
  }
});

test('trust boundary keys on Sec-Fetch-Site, not Sec-Fetch-Mode (Node fetch sends the latter)', async () => {
  let called = 0;
  const upstream = await startMockUpstream((req, res) => { called += 1; res.writeHead(200); res.end('{}'); });
  const gateway = createGatewayServer({ mode: 'passthrough', upstreamBase: upstream.base });
  const addr = await gateway.listen();
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    const browser = await postMessages(base, { headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(browser.status, 403, 'browser Sec-Fetch-Site is rejected even without Origin');
    const serverCall = await postMessages(base, { headers: { 'sec-fetch-mode': 'cors' } });
    assert.equal(serverCall.status, 200, 'Node-fetch Sec-Fetch-Mode alone must pass');
    assert.equal(called, 1);
  } finally {
    await gateway.close();
    await closeServer(upstream.server);
  }
});

test('health endpoint responds without touching upstream', async () => {
  const gateway = createGatewayServer({ mode: 'passthrough', upstreamBase: 'http://127.0.0.1:1' });
  const addr = await gateway.listen();
  try {
    const res = await fetch(`http://127.0.0.1:${addr.port}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, ready: true });
  } finally {
    await gateway.close();
  }
});

test('returns 502 and records a decision when upstream is unreachable', async () => {
  const gateway = createGatewayServer({ mode: 'passthrough', upstreamBase: 'http://127.0.0.1:1' });
  const addr = await gateway.listen();
  try {
    const res = await postMessages(`http://127.0.0.1:${addr.port}`);
    assert.equal(res.status, 502);
    assert.equal(gateway.decisions.length, 1);
    assert.equal(gateway.decisions[0].status, 0);
    assert.ok(gateway.decisions[0].error);
  } finally {
    await gateway.close();
  }
});

test('intake token gate rejects missing token and accepts the right one', async () => {
  const upstream = await startMockUpstream((req, res) => { res.writeHead(200); res.end('{}'); });
  const gateway = createGatewayServer({ mode: 'passthrough', upstreamBase: upstream.base, intakeToken: 'secret' });
  const addr = await gateway.listen();
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    const denied = await postMessages(base);
    assert.equal(denied.status, 401);
    const allowed = await postMessages(base, { headers: { 'x-gateway-token': 'secret' } });
    assert.equal(allowed.status, 200);
  } finally {
    await gateway.close();
    await closeServer(upstream.server);
  }
});
