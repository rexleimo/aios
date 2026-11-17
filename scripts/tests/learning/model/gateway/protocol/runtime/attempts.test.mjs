import test from 'node:test';
import assert from 'node:assert/strict';
import { registry, intake, success, request, appFor, jsonBody, accounts, fakeEnv, sse } from './fixtures.mjs';

for (const status of [401, 402, 429]) {
  test(`ordered groups fail over after definitive ${status} rejection with final-route metadata`, async () => {
    const calls = [];
    let cancelled = false;
    const { app, decisions } = appFor(async (url, init) => {
      calls.push({ url, body: jsonBody(init) });
      if (calls.length === 1) return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status });
      assert.equal(cancelled, true);
      return success();
    });
    assert.equal((await request(app)).status, 200);
    assert.deepEqual(calls.map((call) => call.body.model), ['Real-1', 'Real-2']);
    assert.equal(decisions[0].modelId, 'm2');
    assert.equal(decisions[0].providerId, 'p2');
    assert.equal(decisions[0].targetRef, 'group:pair');
    assert.equal(decisions[0].failoverCount, 1);
    assert.deepEqual(decisions[0].attempts.map((attempt) => attempt.status), [status, 200]);
  });
}

for (const status of [400, 403, 408, 500, 502, 503]) {
  test(`ordered groups never replay ambiguous or nonretryable ${status} on another model`, async () => {
    let calls = 0;
    const { app } = appFor(async () => { calls++; return Response.json({ error: { message: 'stop' } }, { status }); });
    assert.equal((await request(app)).status, status);
    assert.equal(calls, 1);
  });
}

test('transport failure never crosses models and records the dispatched error route', async () => {
  let calls = 0;
  const { app, decisions } = appFor(async () => { calls++; throw new Error('connection lost'); });
  const response = await request(app);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'UPSTREAM_UNREACHABLE');
  assert.equal(calls, 1);
  assert.equal(decisions[0].modelId, 'm1');
  assert.equal(decisions[0].attempts[0].error, 'UPSTREAM_UNREACHABLE');
});

for (const first of [401, 402, 408, 429, 500, 'network']) {
  test(`existing account rotation still handles ${first} before any group switch`, async () => {
    const document = registry();
    document.providers.p1 = accounts(document.providers.p1);
    const calls = [];
    const { app } = appFor(async (url, init) => {
      calls.push([url, init.headers['x-api-key']]);
      if (calls.length === 1) {
        if (first === 'network') throw new Error('socket closed');
        return new Response('', { status: first });
      }
      return success();
    }, { registry: document, env: fakeEnv });
    assert.equal((await request(app)).status, 200);
    assert.deepEqual(calls.map((call) => call[1]), ['fake-first', 'fake-second']);
    assert.ok(calls.every(([url]) => new URL(url).port === '19001'));
  });
}

for (const first of [408, 503, 'network']) {
  test(`an ambiguous ${first} account attempt blocks cross-model replay after later rejection`, async () => {
    const document = registry();
    document.providers.p1 = accounts(document.providers.p1);
    let calls = 0;
    const { app } = appFor(async () => {
      if (++calls === 1) {
        if (first === 'network') throw new Error('socket closed');
        return new Response('', { status: first });
      }
      return new Response('', { status: 429 });
    }, { registry: document, env: fakeEnv });
    assert.equal((await request(app)).status, 429);
    assert.equal(calls, 2);
  });
}

test('403 does not introduce a new account retry policy', async () => {
  const document = registry();
  document.providers.p1 = accounts(document.providers.p1);
  let calls = 0;
  const { app } = appFor(async () => { calls++; return new Response('', { status: 403 }); }, { registry: document, env: fakeEnv });
  assert.equal((await request(app)).status, 403);
  assert.equal(calls, 1);
});

test('all definitively rejected accounts permit the next ordered member', async () => {
  const document = registry();
  document.providers.p1 = accounts(document.providers.p1);
  const models = [];
  const { app } = appFor(async (_url, init) => {
    models.push(jsonBody(init).model);
    return models.length < 3 ? new Response('', { status: 401 }) : success();
  }, { registry: document, env: fakeEnv });
  assert.equal((await request(app)).status, 200);
  assert.deepEqual(models, ['Real-1', 'Real-1', 'Real-2']);
});

test('pre-dispatch credential qualification skips an unavailable first member', async () => {
  const document = registry();
  document.providers.p1.authMode = 'required';
  document.providers.p1.apiKeyEnv = 'env:ABSENT';
  const models = [];
  const { app, decisions } = appFor(async (_url, init) => { models.push(jsonBody(init).model); return success(); }, { registry: document });
  assert.equal((await request(app)).status, 200);
  assert.deepEqual(models, ['Real-2']);
  assert.equal(decisions[0].modelId, 'm2');
});

test('each translated member starts from the original intake and uses fresh authentication', async () => {
  const document = registry(['openai-chat', 'claude']);
  document.providers.p1 = accounts(document.providers.p1);
  document.providers.p2.authMode = 'required';
  document.providers.p2.apiKeyEnv = 'env:SECOND';
  const original = intake({ system: 'keep me', messages: [{ role: 'user', content: 'hello' }] });
  const before = structuredClone(original);
  const calls = [];
  const { app } = appFor(async (_url, init) => {
    calls.push({ body: jsonBody(init), headers: init.headers });
    return calls.length < 3 ? new Response('', { status: 429 }) : success();
  }, { registry: document, env: { ...fakeEnv, SECOND: 'fake-other' } });
  assert.equal((await request(app, original)).status, 200);
  assert.deepEqual(original, before);
  assert.equal(calls[0].body.messages[0].role, 'system');
  assert.deepEqual(calls[0].body, calls[1].body);
  assert.equal(calls[2].body.system, 'keep me');
  assert.deepEqual(calls[2].body.messages, original.messages);
  assert.equal(calls[0].headers.authorization, 'Bearer fake-first');
  assert.equal(calls[1].headers.authorization, 'Bearer fake-second');
  assert.equal(calls[2].headers['x-api-key'], 'fake-other');
  assert.equal(calls[2].headers.authorization, undefined);
});

test('the error decision describes the final attempted group member', async () => {
  let calls = 0;
  const { app, decisions } = appFor(async () => { if (++calls === 1) return new Response('', { status: 429 }); throw new Error('socket closed'); });
  assert.equal((await request(app)).status, 502);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].modelId, 'm2');
  assert.deepEqual(decisions[0].attempts.map((attempt) => attempt.modelId), ['m1', 'm2']);
});

test('a shared deadline aborts generation without trying another member', async () => {
  let calls = 0;
  let signal;
  const { app } = appFor(async (_url, init) => { calls++; signal = init.signal; return new Promise(() => {}); }, { requestTimeoutMs: 20 });
  assert.equal((await request(app)).status, 504);
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
});

test('client cancellation never dispatches another group member', async () => {
  const controller = new AbortController();
  let calls = 0;
  const { app } = appFor(async () => { calls++; controller.abort(); return new Response('', { status: 429 }); });
  assert.equal((await request(app, intake(), {}, '/v1/messages', controller.signal)).status, 499);
  assert.equal(calls, 1);
});

test('a stream failure after delivered output cannot retry an account or member', async () => {
  let calls = 0;
  let upstream;
  const document = registry();
  document.providers.p1 = accounts(document.providers.p1);
  const { app } = appFor(async () => {
    calls++;
    return sse(new ReadableStream({ start(controller) { upstream = controller; controller.enqueue(new TextEncoder().encode('data: {"type":"ping"}\n\n')); } }));
  }, { registry: document, env: fakeEnv });
  const response = await request(app, intake({ stream: true }));
  const reader = response.body.getReader();
  assert.equal((await reader.read()).done, false);
  upstream.error(new Error('socket closed after output'));
  await assert.rejects(reader.read());
  assert.equal(calls, 1);
});

test('a partial successful nonstream body cannot be replayed on another account', async () => {
  let calls = 0;
  const document = registry();
  document.providers.p1 = accounts(document.providers.p1);
  const { app } = appFor(async () => {
    calls++;
    let chunks = 0;
    return new Response(new ReadableStream({ pull(controller) {
      if (++chunks === 1) controller.enqueue(new TextEncoder().encode('{"content":['));
      else controller.error(new Error('partial response'));
    } }), { headers: { 'content-type': 'application/json' } });
  }, { registry: document, env: fakeEnv });
  assert.equal((await request(app)).status, 502);
  assert.equal(calls, 1);
});
