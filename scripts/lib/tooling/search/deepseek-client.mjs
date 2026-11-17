import { LIMITS, validateArguments, validateResponse } from './contracts.mjs';
import { httpError, SearchError } from './errors.mjs';

const ENDPOINTS = Object.freeze({
  deepseek_search: 'https://api.deepseek.com/v1/tools/search',
  deepseek_fetch: 'https://api.deepseek.com/v1/tools/fetch',
});

function cancelBody(body) {
  try { void body?.cancel().catch(() => {}); } catch { /* Disposal must not mask the safe error. */ }
}

async function readJson(response, maxBytes, signal) {
  const length = response.headers.get('content-length');
  if (length !== null && /^\d+$/.test(length) && Number(length) > maxBytes) {
    cancelBody(response.body);
    throw new SearchError('response_too_large');
  }
  const type = response.headers.get('content-type') || '';
  if (!/^application\/(?:json|[\w.+-]+\+json)(?:\s*;|$)/i.test(type) || !response.body?.getReader) {
    cancelBody(response.body);
    throw new SearchError('invalid_response');
  }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks = [];
  let bytes = 0;
  try {
    if (signal.aborted) throw new SearchError('cancelled');
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw new SearchError('cancelled');
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        cancel();
        throw new SearchError('response_too_large');
      }
      chunks.push(Buffer.from(value));
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes)));
    } catch {
      throw new SearchError('invalid_response');
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

function boundedSetting(value, maximum) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new SearchError('internal');
  return value;
}

export function createDeepSeekClient({
  getEnv = () => process.env,
  fetchImpl = (...args) => globalThis.fetch(...args),
  timeoutMs = LIMITS.timeoutMs,
  maxRequestBytes = LIMITS.requestBytes,
  maxResponseBytes = LIMITS.responseBytes,
} = {}) {
  boundedSetting(timeoutMs, 120_000);
  boundedSetting(maxRequestBytes, LIMITS.requestBytes);
  boundedSetting(maxResponseBytes, LIMITS.responseBytes);

  return {
    async call(name, args, { signal } = {}) {
      const payload = validateArguments(name, args);
      const body = JSON.stringify(payload);
      if (Buffer.byteLength(body) > maxRequestBytes) throw new SearchError('request_too_large');
      if (signal?.aborted) throw new SearchError('cancelled');
      // Credentials are read only for a validated invocation, never at import/startup.
      let key;
      try { key = getEnv()?.DEEPSEEK_API_KEY; } catch { throw new SearchError('internal'); }
      if (typeof key !== 'string' || key.length > 4096 || !/^[\x21-\x7e]+$/.test(key)) {
        throw new SearchError('missing_key');
      }
      const controller = new AbortController();
      let timedOut = false;
      const abort = () => controller.abort();
      const stopped = new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new SearchError(timedOut ? 'timeout' : 'cancelled'));
        }, { once: true });
      });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) controller.abort();
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      try {
        const request = async () => {
          if (controller.signal.aborted) throw new SearchError('cancelled');
          const response = await fetchImpl(ENDPOINTS[name], {
            method: 'POST', redirect: 'error', signal: controller.signal,
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
            body,
          });
          if (controller.signal.aborted) {
            cancelBody(response.body);
            throw new SearchError(timedOut ? 'timeout' : 'cancelled');
          }
          if (response.status !== 200) {
            cancelBody(response.body);
            throw httpError(response.status);
          }
          const result = validateResponse(name, await readJson(response, maxResponseBytes, controller.signal));
          if (name === 'deepseek_search' && result.results.length > payload.count) throw new SearchError('invalid_response');
          return result;
        };
        return await Promise.race([request(), stopped]);
      } catch (error) {
        controller.abort();
        if (timedOut) throw new SearchError('timeout');
        if (signal?.aborted) throw new SearchError('cancelled');
        throw error instanceof SearchError ? new SearchError(error.code) : new SearchError('network');
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
    },
  };
}
