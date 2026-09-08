import assert from 'node:assert/strict';
import test from 'node:test';

import { partitionSupersedes } from '../lib/memo/storage/temporal.mjs';

function sourceEvent(overrides = {}) {
  return {
    eventId: 'src',
    space: 'default',
    spaceKey: 'default',
    scope: 'project_shared',
    agent: 'agent-a',
    claimStatus: 'verified',
    supersedes: [],
    ...overrides,
  };
}

function knownEvent(overrides = {}) {
  return {
    eventId: 'known',
    space: 'default',
    spaceKey: 'default',
    scope: 'project_shared',
    agent: 'agent-a',
    claimStatus: 'verified',
    ...overrides,
  };
}

test('dangling supersede targets are denied at write time instead of stored', () => {
  const result = partitionSupersedes(
    sourceEvent({ supersedes: ['ghost-id'] }),
    [knownEvent()],
  );
  assert.deepEqual(result.allowed, []);
  assert.deepEqual(result.denied, [{ eventId: 'ghost-id', reason: 'unknown_target' }]);
});

test('cross-space supersede targets are denied at write time', () => {
  const otherSpace = knownEvent({ eventId: 'other', space: 'other', spaceKey: 'other' });
  const result = partitionSupersedes(
    sourceEvent({ supersedes: ['other'] }),
    [otherSpace],
  );
  assert.deepEqual(result.allowed, []);
  assert.deepEqual(result.denied, [{ eventId: 'other', reason: 'scope_or_principal_mismatch' }]);
});

test('same-space shared supersede links still pass (collaborative rule preserved)', () => {
  const result = partitionSupersedes(
    sourceEvent({ agent: 'agent-b', supersedes: ['known'] }),
    [knownEvent()],
  );
  assert.deepEqual(result.allowed, ['known']);
  assert.deepEqual(result.denied, []);
});

test('cross-agent private supersede stays denied at write time', () => {
  const target = knownEvent({ eventId: 'priv', scope: 'agent_private', agent: 'agent-a' });
  const result = partitionSupersedes(
    sourceEvent({ scope: 'agent_private', agent: 'agent-b', supersedes: ['priv'] }),
    [target],
  );
  assert.deepEqual(result.allowed, []);
  assert.deepEqual(result.denied, [{ eventId: 'priv', reason: 'scope_or_principal_mismatch' }]);
});
