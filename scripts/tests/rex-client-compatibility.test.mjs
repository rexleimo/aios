import assert from 'node:assert/strict';
import test from 'node:test';

import { supportedClients } from '../../rex-harness/src/index.mjs';
import { createAiosRexProviderBindings, evaluateAiosSoftwareRequest } from '../lib/workflows/rex-harness-adapter.mjs';

const EXPECTED_CLIENT_ROOTS = Object.freeze({
  codex: '.codex/skills',
  claude: '.claude/skills',
  gemini: '.gemini/skills',
  opencode: '.opencode/skills',
  hermes: '.hermes/skills',
  grok: '.grok/skills',
  workbuddy: '.workbuddy/skills',
});

test('seven client projection targets are stable and complete', () => {
  assert.deepEqual(supportedClients(), Object.keys(EXPECTED_CLIENT_ROOTS));
  for (const [client, root] of Object.entries(EXPECTED_CLIENT_ROOTS)) {
    assert.match(root, new RegExp(`^\\.${client === 'opencode' ? 'opencode' : client}\\/skills$`, 'u'));
  }
});

test('seven client invocation paths share the Rex-native parent adapter decision', () => {
  const bindings = createAiosRexProviderBindings();
  assert.ok(bindings.length > 0);
  for (const client of Object.keys(EXPECTED_CLIENT_ROOTS)) {
    const result = evaluateAiosSoftwareRequest({
      client,
      message: 'create delivery tickets for the persisted activation artifact',
      explicitIntent: 'tickets',
    });
    assert.equal(result.decision.capabilityId, 'software.planning.sequence', client);
    assert.notEqual(result.decision.blocked, true, client);
    assert.ok(result.decision.provider, client);
  }
});
