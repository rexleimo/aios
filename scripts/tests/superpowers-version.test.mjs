import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MIN_SUPERPOWERS_VERSION,
  compareSemver,
  isVersionAtLeast,
  parseSemver,
} from '../lib/components/superpowers/version.mjs';

test('parseSemver accepts v-prefix and git-describe suffixes', () => {
  assert.deepEqual(parseSemver('v6.1.1'), { major: 6, minor: 1, patch: 1 });
  assert.deepEqual(parseSemver('6.0.3'), { major: 6, minor: 0, patch: 3 });
  assert.deepEqual(parseSemver('v6.1.0-2-gabcdef'), { major: 6, minor: 1, patch: 0 });
  assert.equal(parseSemver('nope'), null);
});

test('compareSemver orders versions', () => {
  assert.equal(compareSemver('6.0.3', '6.1.0'), -1);
  assert.equal(compareSemver('6.1.0', '6.1.0'), 0);
  assert.equal(compareSemver('6.1.1', '6.1.0'), 1);
  assert.equal(compareSemver('bad', '6.1.0'), null);
});

test('isVersionAtLeast enforces AIOS minimum', () => {
  assert.equal(MIN_SUPERPOWERS_VERSION, '6.1.0');
  assert.equal(isVersionAtLeast('6.0.3'), false);
  assert.equal(isVersionAtLeast('v6.1.0'), true);
  assert.equal(isVersionAtLeast('6.2.0'), true);
});
