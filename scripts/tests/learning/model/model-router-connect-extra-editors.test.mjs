import test from 'node:test';
import assert from 'node:assert/strict';
import YAML from 'yaml';

import { editOpencode, restoreOpencode, editZcode, restoreZcode, editQoder, restoreQoder, editGemini, restoreGemini } from '../../../lib/tooling/model-router/connect/config/json-clients.mjs';
import { editHermes, restoreHermes, editGrok, restoreGrok } from '../../../lib/tooling/model-router/connect/config/block-clients.mjs';
import { editWorkbuddy, restoreWorkbuddy } from '../../../lib/tooling/model-router/connect/config/workbuddy-editor.mjs';

const params = { gatewayUrl: 'http://127.0.0.1:8686/', modelId: 'qwen3.8-flash', catalog: ['qwen3.8-flash', 'claude-sonnet-5'] };

function jsonRoundTrip(label, edit, restore, original, check) {
  test(`${label}: writes gateway target, preserves unrelated keys, restores values`, () => {
    const { text, backup, changedKeys } = edit(original, params);
    assert.ok(changedKeys.length > 0);
    check(JSON.parse(text));
    assert.deepEqual(JSON.parse(restore(text, backup)), JSON.parse(original), `${label} restore must round-trip values`);
  });
}

jsonRoundTrip('opencode', editOpencode, restoreOpencode,
  '{\n  "model": "old/model",\n  "mcp": { "kept": true }\n}\n',
  (doc) => {
    assert.equal(doc.model, 'qwen3.8-flash');
    assert.equal(doc.provider.aios.options.baseURL, 'http://127.0.0.1:8686/v1');
    assert.deepEqual(doc.mcp, { kept: true });
  });

jsonRoundTrip('zcode', editZcode, restoreZcode,
  '{\n  "provider": { "builtin:x": { "options": {} } },\n  "other": 1\n}\n',
  (doc) => {
    assert.equal(doc.provider.aios.options.baseURL, 'http://127.0.0.1:8686');
    assert.equal(doc.model, 'qwen3.8-flash');
    assert.ok(doc.provider['builtin:x']);
    assert.equal(doc.other, 1);
  });

jsonRoundTrip('qoder', editQoder, restoreQoder,
  '{\n  "enabledPlugins": { "p": true },\n  "model": { "name": "old" }\n}\n',
  (doc) => {
    assert.equal(doc.providers.aios.baseUrl, 'http://127.0.0.1:8686/v1');
    assert.equal(doc.model.name, 'qwen3.8-flash');
    assert.deepEqual(doc.enabledPlugins, { p: true });
  });

jsonRoundTrip('gemini', editGemini, restoreGemini,
  '{\n  "security": { "auth": { "selectedType": "oauth-personal" } },\n  "mcpServers": { "x": {} }\n}\n',
  (doc) => {
    assert.equal(doc.security.auth.selectedType, 'gemini-api-key');
    assert.equal(doc.env.GOOGLE_GEMINI_BASE_URL, 'http://127.0.0.1:8686');
    assert.equal(doc.env.GEMINI_API_KEY, 'aios-gateway');
    assert.equal(doc.model.name, 'qwen3.8-flash');
    assert.ok(doc.mcpServers.x);
  });

test('hermes: sets providers.aios + model, preserves unrelated keys, restores', () => {
  const original = 'model:\n  default: qwen3.7-max\n  provider: tokenbailian\nfallback_providers: []\n';
  const { text, backup } = editHermes(original, params);
  const doc = YAML.parse(text);
  assert.equal(doc.model.provider, 'aios');
  assert.equal(doc.model.default, 'qwen3.8-flash');
  assert.equal(doc.providers.aios.base_url, 'http://127.0.0.1:8686/v1');
  assert.deepEqual(doc.fallback_providers, []);
  assert.deepEqual(YAML.parse(restoreHermes(text, backup)), YAML.parse(original));
});

test('grok: adds managed model table, preserves original config, restores', () => {
  const original = '[cli]\ninstaller = "internal"\n\n[models]\ndefault = "grok-build"\n';
  const { text, backup } = editGrok(original, params);
  assert.match(text, /\[model\."aios\/qwen3\.8-flash"\]/u);
  assert.match(text, /base_url = "http:\/\/127\.0\.0\.1:8686\/v1"/u);
  assert.match(text, /default = "aios\/qwen3\.8-flash"/u);
  const restored = restoreGrok(text, backup);
  assert.match(restored, /installer = "internal"/u);
  assert.doesNotMatch(restored, /aios-gateway:begin/u);
  assert.match(restored, /default = "grok-build"/u);
});

jsonRoundTrip('workbuddy-array', editWorkbuddy, restoreWorkbuddy,
  '[\n  { "id": "own", "vendor": "own", "url": "x" }\n]\n',
  (list) => {
    assert.equal(list.length, 2);
    assert.equal(list[1].vendor, 'aios');
    assert.equal(list[1].url, 'http://127.0.0.1:8686/v1/chat/completions');
    assert.equal(list[0].vendor, 'own');
  });

jsonRoundTrip('workbuddy-object', editWorkbuddy, restoreWorkbuddy,
  '{\n  "models": [{ "id": "own", "vendor": "own" }],\n  "availableModels": ["own"]\n}\n',
  (doc) => {
    assert.ok(doc.models.find((item) => item.vendor === 'aios'));
    assert.deepEqual(doc.availableModels, ['own']);
  });

test('editors fail closed on invalid JSON rather than guessing', () => {
  assert.throws(() => editOpencode('{ bad json', params), SyntaxError);
  assert.throws(() => editGemini('not json', params), SyntaxError);
});
