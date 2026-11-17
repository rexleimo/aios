import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeepSeekClient } from '../../../lib/tooling/search/deepseek-client.mjs';
import { deferred, fakeEnv, jsonResponse, searchResult, unexpectedHttp } from './deepseek-fixtures.mjs';

test('client reads the injected environment at invocation only and posts official Search fields', async () => {
  let reads = 0;
  let key = 'fake-first-key';
  const calls = [];
  const client = createDeepSeekClient({
    getEnv: () => { reads++; return { DEEPSEEK_API_KEY: key }; },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ results: [searchResult] });
    },
  });
  assert.equal(reads, 0);
  assert.deepEqual(await client.call('deepseek_search', { query: 'q' }), { results: [searchResult] });
  key = 'fake-rotated-key';
  await client.call('deepseek_search', { query: 'q', count: 1, need_content: true, ori_question: 'why?' });
  assert.equal(reads, 2);
  assert.equal(calls.length, 2);
  for (const { url, options } of calls) {
    assert.equal(url, 'https://api.deepseek.com/v1/tools/search');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.ok(options.signal instanceof AbortSignal);
  }
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fake-first-key');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer fake-rotated-key');
  assert.deepEqual(JSON.parse(calls[0].options.body), { query: 'q', count: 10, localization: '', need_content: false });
  assert.equal(JSON.parse(calls[1].options.body).ori_question, 'why?');
});

test('Fetch always calls DeepSeek, never the supplied target (including private addresses)', async () => {
  const seen = [];
  const client = createDeepSeekClient({ getEnv: fakeEnv, fetchImpl: async (url, options) => {
    seen.push({ url, body: JSON.parse(options.body) });
    return jsonResponse({ title: 'Page', content: '# Page' });
  } });
  for (const url of ['https://example.com/', 'http://127.0.0.1/private', 'http://[::1]/']) {
    assert.deepEqual(await client.call('deepseek_fetch', { url }), { title: 'Page', content: '# Page' });
    assert.deepEqual(seen.at(-1), { url: 'https://api.deepseek.com/v1/tools/fetch', body: { url } });
  }
});

test('invalid input and absent or malformed keys never reach HTTP', async () => {
  let reads = 0;
  const client = createDeepSeekClient({ getEnv: () => { reads++; return {}; }, fetchImpl: unexpectedHttp });
  await assert.rejects(client.call('deepseek_search', { query: '' }), { code: 'invalid_input' });
  assert.equal(reads, 0);
  for (const key of [undefined, '', ' ', 'key\r\nInjected: value', 'x'.repeat(4097)]) {
    const missing = createDeepSeekClient({ getEnv: () => ({ DEEPSEEK_API_KEY: key }), fetchImpl: unexpectedHttp });
    await assert.rejects(missing.call('deepseek_search', { query: 'q' }), { code: 'missing_key' });
  }
});

test('HTTP failures cancel bodies, do not retry, and never expose provider error text', async () => {
  for (const status of [301, 400, 401, 402, 403, 404, 408, 413, 429, 500, 504]) {
    let requests = 0;
    let cancelled = false;
    const client = createDeepSeekClient({ getEnv: fakeEnv, fetchImpl: async () => {
      requests++;
      return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status });
    } });
    await assert.rejects(client.call('deepseek_fetch', { url: 'https://example.com' }), (error) => {
      assert.match(error.code, /^[a-z_]+$/);
      assert.doesNotMatch(error.message, /fake-key|provider-secret/);
      return true;
    });
    assert.equal(requests, 1);
    assert.equal(cancelled, true);
  }
});

test('network exception details and upstream body errors are sanitized', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('Authorization: Bearer fake-key provider-secret'); },
    async () => new Response('provider-secret fake-key', { headers: { 'Content-Type': 'application/json' } }),
    async () => jsonResponse({ error: { message: 'provider-secret fake-key' } }),
    async () => new Response('provider-secret', { headers: { 'Content-Type': 'text/html' } }),
  ]) {
    const client = createDeepSeekClient({ getEnv: fakeEnv, fetchImpl });
    await assert.rejects(client.call('deepseek_search', { query: 'q' }), (error) => {
      assert.doesNotMatch(JSON.stringify({ ...error, message: error.message }), /provider-secret|fake-key|Authorization/);
      return true;
    });
  }
});

test('request body and advertised/streamed response sizes are bounded', async () => {
  const tooSmall = createDeepSeekClient({ getEnv: fakeEnv, fetchImpl: unexpectedHttp, maxRequestBytes: 8 });
  await assert.rejects(tooSmall.call('deepseek_search', { query: 'q' }), { code: 'request_too_large' });
  for (const headers of [{ 'Content-Length': '99999999' }, {}]) {
    let cancelled = false;
    const client = createDeepSeekClient({ getEnv: fakeEnv, maxResponseBytes: 64, fetchImpl: async () =>
      new Response(new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(65))); },
        cancel() { cancelled = true; },
      }), { headers: { 'Content-Type': 'application/json', ...headers } }),
    });
    await assert.rejects(client.call('deepseek_fetch', { url: 'https://example.com' }), { code: 'response_too_large' });
    assert.equal(cancelled, true);
  }
});

test('deadline covers both headers and body, even if injected HTTP ignores abort', { timeout: 2000 }, async () => {
  let aborted;
  const headersClient = createDeepSeekClient({ getEnv: fakeEnv, timeoutMs: 10, fetchImpl: async (_url, options) => {
    aborted = options.signal;
    return new Promise(() => {});
  } });
  await assert.rejects(headersClient.call('deepseek_search', { query: 'q' }), { code: 'timeout' });
  assert.equal(aborted.aborted, true);
  let cancelled = false;
  const bodyClient = createDeepSeekClient({ getEnv: fakeEnv, timeoutMs: 10, fetchImpl: async () =>
    new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/json' } }),
  });
  await assert.rejects(bodyClient.call('deepseek_search', { query: 'q' }), { code: 'timeout' });
  assert.equal(cancelled, true);
});

test('caller cancellation aborts HTTP without forwarding the untrusted reason', async () => {
  const controller = new AbortController();
  const started = deferred();
  let signal;
  const client = createDeepSeekClient({ getEnv: fakeEnv, timeoutMs: 1000, fetchImpl: async (_url, options) => {
    signal = options.signal;
    started.resolve();
    return new Promise(() => {});
  } });
  const pending = client.call('deepseek_search', { query: 'q' }, { signal: controller.signal });
  await started.promise;
  controller.abort('provider-secret');
  await assert.rejects(pending, { code: 'cancelled' });
  assert.equal(signal.aborted, true);
});

test('late headers after deadline are disposed, and response cardinality cannot exceed count', async () => {
  const headers = deferred();
  let cancelled = false;
  const client = createDeepSeekClient({ getEnv: fakeEnv, timeoutMs: 5, fetchImpl: () => headers.promise });
  await assert.rejects(client.call('deepseek_search', { query: 'q' }), { code: 'timeout' });
  headers.resolve(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
  const extraResults = createDeepSeekClient({ getEnv: fakeEnv, fetchImpl: async () => jsonResponse({ results: [searchResult, searchResult] }) });
  await assert.rejects(extraResults.call('deepseek_search', { query: 'q', count: 1 }), { code: 'invalid_response' });
});

test('resource settings cannot disable or widen hard payload limits', () => {
  for (const options of [
    { timeoutMs: 0 }, { timeoutMs: Infinity }, { timeoutMs: 120001 },
    { maxRequestBytes: 65537 }, { maxResponseBytes: 2 * 1024 * 1024 + 1 },
    { maxResponseBytes: -1 }, { maxResponseBytes: 1.5 },
  ]) {
    assert.throws(() => createDeepSeekClient({ getEnv: fakeEnv, fetchImpl: unexpectedHttp, ...options }));
  }
});

test('pre-cancelled calls never read credentials or issue HTTP, including cancellation during env lookup', async () => {
  const controller = new AbortController();
  controller.abort();
  const client = createDeepSeekClient({ getEnv: () => { throw new Error('must not read env'); }, fetchImpl: unexpectedHttp });
  await assert.rejects(client.call('deepseek_search', { query: 'q' }, { signal: controller.signal }), { code: 'cancelled' });
  const duringLookup = new AbortController();
  const racing = createDeepSeekClient({ getEnv: () => { duringLookup.abort(); return fakeEnv(); }, fetchImpl: unexpectedHttp });
  await assert.rejects(racing.call('deepseek_search', { query: 'q' }, { signal: duringLookup.signal }), { code: 'cancelled' });
});

test('body stream exceptions and malformed UTF-8 never leak body details', async () => {
  for (const stream of [
    new ReadableStream({ start(controller) { controller.error(new Error('private-response-body')); } }),
    new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([0xff])); controller.close(); } }),
  ]) {
    const client = createDeepSeekClient({ getEnv: fakeEnv, fetchImpl: async () =>
      new Response(stream, { headers: { 'Content-Type': 'application/json' } }),
    });
    await assert.rejects(client.call('deepseek_search', { query: 'q' }), (error) => {
      assert.doesNotMatch(error.message, /private-response-body|fake-key/);
      return true;
    });
  }
});
