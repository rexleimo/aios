import { createRoutingGatewayApp } from '../../../../../../lib/tooling/model-router/gateway/compatibility/proxy.mjs';

export function registry(protocols = ['claude', 'claude']) {
  return {
    targetRefVersion: 1, activeModel: 'group:pair',
    models: Object.fromEntries(protocols.map((protocol, index) => [`m${index + 1}`, { source: 'custom', provider: `p${index + 1}`, upstreamModel: `Real-${index + 1}`, protocols: [protocol] }])),
    providers: Object.fromEntries(protocols.map((protocol, index) => [`p${index + 1}`, { baseUrl: `http://127.0.0.1:${19001 + index}`, endpointStyle: 'standard', protocols: [protocol], authMode: 'none' }])),
    routingGroups: { pair: { models: protocols.map((_, index) => `m${index + 1}`), routing: 'ordered' } },
  };
}

export const intake = (extra = {}) => ({ model: 'aios/group/pair', max_tokens: 64, messages: [{ role: 'user', content: 'hello' }], ...extra });
export const success = (extra = {}) => Response.json({ id: 'msg-1', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', ...extra });
export const request = (app, body = intake(), headers = {}, path = '/v1/messages', signal) => app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
export const appFor = (fetchImpl, extra = {}) => createRoutingGatewayApp({ registry: registry(), env: {}, masking: false, fetchImpl, ...extra });
export const jsonBody = (init) => JSON.parse(typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body));
export const accounts = (provider) => ({ ...provider, authMode: 'required', accounts: [{ id: 'one', apiKeyEnv: 'env:ONE' }, { id: 'two', apiKeyEnv: 'env:TWO' }] });
export const fakeEnv = { ONE: 'fake-first', TWO: 'fake-second' };
export const sse = (wire) => new Response(wire, { headers: { 'content-type': 'text/event-stream' } });
