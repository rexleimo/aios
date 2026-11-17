import { GatewayRouteError } from '../router.mjs';
import { resolveProviderApiKey, resolveProviderRequestHeaders } from '../../providers/registry.mjs';
import { translateRequest } from './protocol-codec.mjs';
import { maskObject } from '../../masking/masker.mjs';

export function createRequestLifetime(clientSignal, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new GatewayRouteError('Gateway request deadline exceeded', 'GATEWAY_TIMEOUT', 504)), timeoutMs);
  const abortFromClient = () => controller.abort(new GatewayRouteError('Client cancelled the request', 'CLIENT_CANCELLED', 499));
  clientSignal.addEventListener('abort', abortFromClient, { once: true });
  if (clientSignal.aborted) abortFromClient();
  return {
    signal: controller.signal, timer,
    dispose() { clearTimeout(timer); clientSignal.removeEventListener('abort', abortFromClient); },
    async run(operation) {
      controller.signal.throwIfAborted();
      return new Promise((resolve, reject) => {
        const abort = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', abort, { once: true });
        Promise.resolve().then(() => { controller.signal.throwIfAborted(); return operation(); })
          .then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', abort));
      });
    },
  };
}

export async function readIncomingBody(body, lifetime) {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const cancel = () => { void reader.cancel(lifetime.signal.reason).catch(() => {}); };
  lifetime.signal.addEventListener('abort', cancel, { once: true });
  try {
    const chunks = [];
    let size = 0;
    while (true) {
      const { value, done } = await lifetime.run(() => reader.read());
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } catch (error) {
    cancel();
    throw error;
  } finally {
    lifetime.signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

function managedStream(reader, first, controller, lifetime, cleanupAttempt, onError) {
  let ended = false;
  let cancelReader = () => {};
  const finish = () => {
    if (ended) return false;
    ended = true;
    lifetime.signal.removeEventListener('abort', cancelReader);
    cleanupAttempt();
    lifetime.dispose();
    return true;
  };
  return new ReadableStream({
    start(downstream) {
      cancelReader = () => {
        if (!finish()) return;
        const error = lifetime.signal.reason || new Error('Upstream request aborted');
        onError(error);
        downstream.error(error);
        controller.abort(error);
        void reader.cancel(error).catch(() => {});
      };
      lifetime.signal.addEventListener('abort', cancelReader, { once: true });
      if (lifetime.signal.aborted) cancelReader();
    },
    async pull(downstream) {
      try {
        lifetime.timer.ref?.();
        const chunk = first || await reader.read();
        first = null;
        lifetime.timer.unref?.();
        if (ended) return;
        if (chunk.done) { finish(); downstream.close(); }
        else downstream.enqueue(chunk.value);
      } catch (error) {
        if (!finish()) return;
        onError(error);
        downstream.error(error);
        controller.abort();
        void reader.cancel(error).catch(() => {});
      }
    },
    async cancel(reason) {
      if (!finish()) return;
      onError(new GatewayRouteError('Downstream response cancelled', 'CLIENT_CANCELLED', 499));
      controller.abort(reason);
      void reader.cancel(reason).catch(() => {});
    },
  }, { highWaterMark: 0 });
}

const retryMember = (status) => [401, 402, 429].includes(status);
const retryAccount = (status) => retryMember(status) || status === 408 || (status >= 500 && status < 600);

function outgoingBody(parsed, route, provider, { stream, masking, maskStore }) {
  // Every attempt starts from the intake, never another member's translated body.
  const intake = structuredClone(parsed);
  let body = route.needsTranslation ? translateRequest(intake, route.clientProtocol, route.targetProtocol) : intake;
  if (route.needsTranslation && masking) body = maskObject(body, maskStore).value;
  if (route.targetProtocol === 'gemini' && (Object.hasOwn(provider, 'protocolBaseUrls') || provider.endpointStyle === 'standard')) {
    delete body.model;
    delete body.stream;
  } else {
    body.model = route.upstreamModel;
    body.stream = stream;
  }
  return new TextEncoder().encode(JSON.stringify(body));
}

// No retry escapes this function: returned streams are committed to one attempt.
// Account retries retain their established policy. Cross-model replay additionally
// requires definitive rejection on EVERY attempt made for the previous member.
export async function fetchGatewayCandidates(options) {
  const { candidates, parsed, env, lifetime, fetchImpl, attempts, onBodyError, pin = null } = options;
  for (const [memberIndex, candidate] of candidates.entries()) {
    const { selected: route, upstream: provider } = candidate;
    const accountIds = pin?.account ? candidate.accounts.filter((id) => id === pin.account) : candidate.accounts;
    let memberReplaySafe = true;
    for (const [accountIndex, account] of accountIds.entries()) {
      lifetime.signal.throwIfAborted();
      lifetime.timer.ref?.();
      options.onAttempt?.({ route, account });
      const maskStore = new Map(options.maskStore);
      const body = outgoingBody(parsed, route, provider, { ...options, maskStore });
      const apiKey = resolveProviderApiKey(provider, env, account);
      const headers = { 'content-type': 'application/json', ...resolveProviderRequestHeaders(provider, route.targetProtocol, apiKey, env) };
      const controller = new AbortController();
      const abort = () => controller.abort(lifetime.signal.reason);
      lifetime.signal.addEventListener('abort', abort, { once: true });
      const cleanupAttempt = () => lifetime.signal.removeEventListener('abort', abort);
      let response;
      let reader;
      const discard = () => {
        cleanupAttempt();
        controller.abort();
        void (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {});
      };
      const attempt = { modelId: route.modelId, providerId: route.providerId, account };
      try {
        response = await lifetime.run(() => fetchImpl(route.endpoint, { method: 'POST', headers, body, signal: controller.signal, redirect: 'manual' }));
        if (response.status >= 300 && response.status < 400) {
          attempts.push({ ...attempt, status: 502, error: 'UPSTREAM_REDIRECT_REJECTED' });
          discard();
          throw new GatewayRouteError('Upstream redirects are not allowed', 'UPSTREAM_REDIRECT_REJECTED', 502);
        }
        const anotherAccount = !pin && accountIndex < accountIds.length - 1;
        if (!response.ok && !retryMember(response.status)) memberReplaySafe = false;
        const anotherMember = !pin && memberReplaySafe && memberIndex < candidates.length - 1;
        if (!response.ok && ((retryAccount(response.status) && anotherAccount) || (retryMember(response.status) && anotherMember))) {
          attempts.push({ ...attempt, status: response.status });
          discard();
          if (anotherAccount) continue;
          break;
        }
        let resultBody = null;
        const isStream = (response.headers.get('content-type') || '').toLowerCase().includes('text/event-stream');
        if (response.ok && isStream !== options.stream) throw new GatewayRouteError('Upstream response does not match the requested stream mode', 'INVALID_UPSTREAM_RESPONSE', 502);
        if (response.body && response.ok && isStream && options.stream) {
          reader = response.body.getReader();
          // Catch connection/read failures before any downstream headers or bytes.
          const first = await lifetime.run(() => reader.read());
          lifetime.timer.unref?.();
          resultBody = managedStream(reader, first, controller, lifetime, cleanupAttempt,
            (error) => onBodyError(error, { route, account }));
        } else {
          // A failed body read is ambiguous, never permission to try another model.
          resultBody = response.body ? await readIncomingBody(response.body, lifetime) : null;
          cleanupAttempt();
          lifetime.dispose();
        }
        attempts.push({ ...attempt, status: response.status });
        return { route, provider, account, maskStore, upstream: new Response(resultBody, { status: response.status, statusText: response.statusText, headers: response.headers }) };
      } catch (error) {
        discard();
        if (lifetime.signal.aborted) throw lifetime.signal.reason;
        if (error instanceof GatewayRouteError) throw error;
        attempts.push({ ...attempt, status: 502, error: 'UPSTREAM_UNREACHABLE' });
        memberReplaySafe = false;
        if (!response && !pin && accountIndex < accountIds.length - 1) continue;
        throw new GatewayRouteError('The selected upstream is unreachable', 'UPSTREAM_UNREACHABLE', 502);
      }
    }
  }
  throw new GatewayRouteError('No eligible account remains for the selected target', 'AFFINITY_ROUTE_UNAVAILABLE', 503);
}
