import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeModelRouting, providerToClientId } from '../lib/model-router.mjs';

test('providerToClientId maps kiro to kiro-cli', () => {
  assert.equal(providerToClientId('kiro'), 'kiro-cli');
  assert.equal(providerToClientId('claude'), 'claude-code');
});

test('normalizeModelRouting derives kiro clientId from provider', () => {
  const routing = normalizeModelRouting({
    modelId: 'kiro-model',
    taskType: 'general',
    provider: 'kiro',
    reason: 'test',
  });

  assert.equal(routing.modelId, 'kiro-model');
  assert.equal(routing.provider, 'kiro');
  assert.equal(routing.clientId, 'kiro-cli');
});
