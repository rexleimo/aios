import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ConfigError,
  applyEdits,
  diffEditable,
  parseDocument,
  toEditable,
  validateDocument,
} from '../../../../apps/shell/ui/src/lib/config/model-routing.mjs';

const registryText = JSON.stringify({
  activeModel: 'claude-sonnet-5',
  models: { 'claude-opus-5': { protocols: ['claude'] } },
  providers: { relay: { baseUrl: 'https://coding.rexai.top', apiKeyEnv: 'env:REXAI_API_KEY', protocols: ['claude'], models: [] } },
  clientRoleMatrix: { default: { implementer: 'deepseek-v4-pro' }, clients: { claude: { implementer: 'claude-sonnet-5' } } },
});

test('parseDocument accepts a registry object and rejects non-JSON / non-object', () => {
  assert.equal(parseDocument(registryText).activeModel, 'claude-sonnet-5');
  assert.throws(() => parseDocument('{bad'), ConfigError);
  assert.throws(() => parseDocument('[]'), ConfigError);
});

test('toEditable projects providers list + matrix without exposing secrets beyond env refs', () => {
  const editable = toEditable(parseDocument(registryText));
  assert.equal(editable.providers[0].id, 'relay');
  assert.equal(editable.providers[0].apiKeyEnv, 'env:REXAI_API_KEY');
  assert.equal(editable.matrix.default.implementer, 'deepseek-v4-pro');
  assert.equal(editable.matrix.clients.claude.implementer, 'claude-sonnet-5');
});

test('validateDocument rejects plaintext keys, bad env refs, bad baseUrl, unknown protocols', () => {
  const base = parseDocument(registryText);
  assert.throws(() => validateDocument({ ...base, providers: { p: { baseUrl: 'https://x.com', apiKey: 'sk-secret' } } }), ConfigError);
  assert.throws(() => validateDocument({ ...base, providers: { p: { baseUrl: 'https://x.com', apiKeyEnv: 'NOT_ENV' } } }), ConfigError);
  assert.throws(() => validateDocument({ ...base, providers: { p: { baseUrl: 'ftp://x.com' } } }), ConfigError);
  assert.throws(() => validateDocument({ ...base, providers: { p: { baseUrl: 'https://x.com', protocols: ['bogus'] } } }), ConfigError);
  assert.doesNotThrow(() => validateDocument(base));
});

test('applyEdits rebuilds providers + matrix and preserves other registry sections', () => {
  const document = parseDocument(registryText);
  const editable = toEditable(document);
  editable.matrix.default.planner = 'claude-opus-5';
  editable.providers.push({ id: 'custom', baseUrl: 'https://api.example.com', apiKeyEnv: 'env:MY_KEY', protocols: ['openai-chat'], models: ['qwen3.8-flash'] });
  const next = applyEdits(document, editable);
  assert.equal(next.activeModel, 'claude-sonnet-5', 'unrelated section preserved');
  assert.ok(next.models['claude-opus-5'], 'models preserved');
  assert.equal(next.clientRoleMatrix.default.planner, 'claude-opus-5');
  assert.equal(next.providers.custom.baseUrl, 'https://api.example.com');
  assert.doesNotThrow(() => validateDocument(next));
});

test('diffEditable detects provider and matrix changes', () => {
  const before = toEditable(parseDocument(registryText));
  const after = toEditable(parseDocument(registryText));
  assert.deepEqual(diffEditable(before, after), []);
  after.matrix.default.reviewer = 'claude-opus-5';
  assert.deepEqual(diffEditable(before, after), ['clientRoleMatrix']);
  after.providers[0].baseUrl = 'https://other.example.com';
  assert.deepEqual(diffEditable(before, after), ['providers', 'clientRoleMatrix']);
});

test('applyEdits prunes empty role overrides and empty client maps', () => {
  const document = parseDocument(registryText);
  const editable = toEditable(document);
  editable.matrix.clients.claude = { implementer: '', reviewer: 'claude-opus-5' };
  editable.matrix.clients.codex = { implementer: '' };
  editable.matrix.default.planner = '';
  const next = applyEdits(document, editable);
  assert.deepEqual(next.clientRoleMatrix.clients.claude, { reviewer: 'claude-opus-5' }, 'empty role pruned, non-empty kept');
  assert.equal(next.clientRoleMatrix.clients.codex, undefined, 'fully-empty client map removed');
  assert.equal(next.clientRoleMatrix.default.planner, undefined, 'empty default role pruned');
});