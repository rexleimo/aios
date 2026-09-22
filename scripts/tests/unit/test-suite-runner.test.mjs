import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { suiteSpec } from '../../lib/test-suite-runner.mjs';

const MANIFEST = JSON.parse(fs.readFileSync('scripts/test-suites.json', 'utf8'));

test('unit suite is manifest-driven and covers only unit tests', () => {
  const unit = suiteSpec('unit');
  assert.equal(unit.concurrency, 4);
  // Explicit files, not `roots` discovery: the manifest is what the wiring guard reads,
  // so root-discovered files could be invisible to it (audit F7).
  assert.ok(Array.isArray(unit.files) && unit.files.length > 0);
  assert.ok(
    unit.files.every((file) => file.startsWith('scripts/tests/unit/')),
    `unit suite must only run scripts/tests/unit files, got ${unit.files.join(', ')}`,
  );
  assert.deepEqual(unit.files, MANIFEST.unit.files, 'the manifest is the single source of truth');
});

test('regression suite uses an explicit legacy manifest', () => {
  const regression = suiteSpec('regression');
  // Concurrency is whatever the manifest declares; asserting a literal here is how this
  // test went stale (it pinned 1 long after the manifest moved to 4).
  assert.equal(regression.concurrency, MANIFEST.regression.concurrency);
  assert.equal(regression.files.length, MANIFEST.regression.files.length);
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
