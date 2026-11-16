import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoutingGatewayApp } from '../../../../lib/tooling/model-router/gateway/proxy.mjs';

const registry = {
  activeModel: 'm',
  models: { m: { protocols: ['openai-chat'] } },
  providers: { p: { baseUrl: 'https://api.example.com', apiKeyEnv: 'env:K', protocols: ['openai-chat'], models: ['m'] } },
  roleDefaults: { implementer: { taskType: 'implementation' } },
  routingRules: [{ taskType: 'implementation', primary: 'm', fallback: [] }, { taskType: 'general', primary: 'm', fallback: [] }],
  clientRoleMatrix: { default: { implementer: 'm' }, clients: {} },
};

test('masking: secret in request is masked upstream and restored in response', async () => {
  let upstreamContent;
  const upstreamFetch = async (url, init) => {
    const body = JSON.parse(new TextDecoder().decode(init.body));
    upstreamContent = body.messages[0].content;
    // echo back the (masked) placeholder
    const placeholder = (upstreamContent.match(/\{\{API_KEY_[a-f0-9]{8}\}\}/) || [])[0];
    return new Response(JSON.stringify({ choices: [{ message: { content: 'echo ' + placeholder } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const { app } = createRoutingGatewayApp({ registry, clientId: 'claude', role: 'implementer', env: { K: 'k' }, clientProtocol: 'claude', fetchImpl: upstreamFetch, masking: true });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude', max_tokens: 10, messages: [{ role: 'user', content: 'my key sk-abcdefghijklmnopqrstuvwxyz123456' }] }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(!String(upstreamContent).includes('sk-abcdefghijklmnopqrstuvwxyz123456'), 'upstream saw masked');
  assert.ok(String(JSON.stringify(body)).includes('sk-abcdefghijklmnopqrstuvwxyz123456'), 'response restored');
});

test('masking also covers sensitive object keys serialized by the request translator', async () => {
  const email = 'person@example.invalid';
  const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456';
  let captured;
  const { app } = createRoutingGatewayApp({ registry, clientId: 'claude', role: 'implementer', env: { K: 'k' }, masking: true,
    fetchImpl: async (_url, init) => {
      captured = new TextDecoder().decode(init.body);
      const body = JSON.parse(captured);
      return Response.json({ choices: [{ message: { content: body.messages[0].tool_calls[0].function.arguments } }] });
    },
  });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude', messages: [{ role: 'assistant', content: [
      { type: 'tool_use', id: 't1', name: 'inspect', input: { [email]: 'owner', credential: secret } },
    ] }] }),
  });
  assert.equal(res.status, 200);
  assert.equal(captured.includes(email), false, 'serialization must not expose a sensitive object key');
  assert.equal(captured.includes(secret), false);
  const response = JSON.stringify(await res.json());
  assert.ok(response.includes(email) && response.includes(secret), 'both masking passes share the response restoration mapping');
});
