import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACCESS_APIS,
  PLACEHOLDER_KEY,
  accessApiBaseUrl,
  accessBaseUrl,
  accessEnvSnippet,
} from '../../../../../apps/shell/ui/src/components/console/model-routing/agent-access-model.mjs';

test('access APIs are the wire formats the gateway actually exposes', () => {
  assert.deepEqual(ACCESS_APIS.map((api) => api.id), ['openai', 'responses', 'anthropic', 'gemini']);
  assert.deepEqual(ACCESS_APIS.map((api) => api.path), ['/v1', '/v1', '', '']);
  assert.equal(new Set(ACCESS_APIS.map((api) => api.baseEnv)).size, 3, 'OpenAI/Responses share one env family');
  for (const api of ACCESS_APIS) {
    assert.ok(api.baseEnv && api.keyEnv && api.desc, `${api.id} has complete copyable guidance`);
  }
});

test('base URL normalizes trailing slashes and falls back to loopback port', () => {
  assert.equal(accessBaseUrl('http://127.0.0.1:3126/', 3126), 'http://127.0.0.1:3126');
  assert.equal(accessBaseUrl('http://127.0.0.1:3126///', 3126), 'http://127.0.0.1:3126');
  assert.equal(accessBaseUrl('', 4000), 'http://127.0.0.1:4000');
  assert.equal(accessBaseUrl(undefined, undefined), 'http://127.0.0.1:<port>');
});

test('API base URL appends only the documented path', () => {
  const base = 'http://127.0.0.1:3126';
  const openai = ACCESS_APIS.find((api) => api.id === 'openai');
  const anthropic = ACCESS_APIS.find((api) => api.id === 'anthropic');
  assert.equal(accessApiBaseUrl(base, openai), 'http://127.0.0.1:3126/v1');
  assert.equal(accessApiBaseUrl(`${base}/`, openai), 'http://127.0.0.1:3126/v1');
  assert.equal(accessApiBaseUrl(base, anthropic), base, 'Anthropic SDK appends /v1/messages itself');
});

test('env snippet uses loopback placeholder key, never a real credential', () => {
  const openai = ACCESS_APIS.find((api) => api.id === 'openai');
  const snippet = accessEnvSnippet(openai, 'http://127.0.0.1:3126/v1');
  assert.equal(snippet, `export OPENAI_BASE_URL=http://127.0.0.1:3126/v1\nexport OPENAI_API_KEY=${PLACEHOLDER_KEY}`);
  assert.equal(PLACEHOLDER_KEY, 'aios-gateway');
});
