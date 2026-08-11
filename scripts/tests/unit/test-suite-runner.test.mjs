import assert from 'node:assert/strict';
import test from 'node:test';

import { suiteSpec } from '../../lib/test-suite-runner.mjs';

test('unit suite uses four-way concurrency and only unit tests', () => {
  assert.deepEqual(suiteSpec('unit'), {
    concurrency: 4,
    roots: ['scripts/tests/unit'],
  });
});

test('regression suite uses an explicit legacy manifest', () => {
  const regression = suiteSpec('regression');
  assert.equal(regression.concurrency, 1);
  assert.ok(regression.files.includes('scripts/tests/model-router.test.mjs'));
  assert.ok(!regression.files.includes('scripts/tests/unit/default-mode.test.mjs'));
});

test('unknown suite is rejected', () => {
  assert.throws(() => suiteSpec('unknown'), /Unknown test suite/);
});

test('controlled suites are explicit and serial', () => {
  for (const name of ['browser', 'client', 'context', 'harness', 'orchestrator', 'rex', 'team']) {
    const suite = suiteSpec(name);
    assert.equal(suite.concurrency, 1);
    assert.ok(suite.files.length > 0);
    assert.ok(suite.files.every((file) => file.startsWith('scripts/tests/')));
  }
});
