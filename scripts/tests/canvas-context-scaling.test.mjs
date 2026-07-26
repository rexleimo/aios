import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeCompactAction,
  parseContextWindowTokens,
  resolveCanvasThresholds,
} from '../lib/offload/mermaid-canvas.mjs';

const NO_ENV = {};

test('parseContextWindowTokens reads the model registry display form', () => {
  assert.equal(parseContextWindowTokens('200K'), 200_000);
  assert.equal(parseContextWindowTokens('1M'), 1_000_000);
  assert.equal(parseContextWindowTokens('128k'), 128_000);
  assert.equal(parseContextWindowTokens('1.5M'), 1_500_000);
  assert.equal(parseContextWindowTokens(64_000), 64_000);
  assert.equal(parseContextWindowTokens('unknown'), 0);
  assert.equal(parseContextWindowTokens(''), 0);
});

test('an undeclared context window keeps the historical thresholds', () => {
  const thresholds = resolveCanvasThresholds({ env: NO_ENV });
  assert.deepEqual(
    { ...thresholds, scale: undefined },
    { scale: undefined, recallMaxChars: 12_000, mildNodes: 20, aggressiveNodes: 50, emergencyNodes: 100 },
  );
});

test('a larger context window raises the canvas budget proportionally', () => {
  const wide = resolveCanvasThresholds({ contextWindow: '1M', env: NO_ENV });
  assert.equal(wide.scale, 5);
  assert.equal(wide.recallMaxChars, 60_000);
  assert.deepEqual([wide.mildNodes, wide.aggressiveNodes, wide.emergencyNodes], [100, 250, 500]);
});

test('a smaller context window compacts sooner', () => {
  const narrow = resolveCanvasThresholds({ contextWindow: '64K', env: NO_ENV });
  assert.ok(narrow.mildNodes < 20);
  assert.ok(narrow.recallMaxChars < 12_000);
});

test('scaling is clamped so an absurd window cannot disable compaction', () => {
  const huge = resolveCanvasThresholds({ contextWindow: '100M', env: NO_ENV });
  assert.equal(huge.scale, 8);
  const tiny = resolveCanvasThresholds({ contextWindow: '1K', env: NO_ENV });
  assert.equal(tiny.scale, 0.25);
  assert.ok(tiny.mildNodes >= 1);
});

test('computeCompactAction stays backward compatible and honours the window', () => {
  assert.equal(computeCompactAction(19), 'none');
  assert.equal(computeCompactAction(20), 'mild');
  assert.equal(computeCompactAction(50), 'aggressive');
  assert.equal(computeCompactAction(100), 'emergency');

  assert.equal(computeCompactAction(20, { contextWindow: '1M' }), 'none', 'a 1M window tolerates a bigger canvas');
  assert.equal(computeCompactAction(100, { contextWindow: '1M' }), 'mild');
  assert.equal(computeCompactAction(500, { contextWindow: '1M' }), 'emergency');
});
