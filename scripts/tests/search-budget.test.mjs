import assert from 'node:assert/strict';
import test from 'node:test';

import {
  truncateToCharBudget,
  applyRecallBudget,
} from '../lib/search/budget.mjs';

/* ── truncateToCharBudget ─────────────────────────────────── */

test('truncateToCharBudget: no truncation when text fits within budget', () => {
  assert.equal(truncateToCharBudget('hello', 100), 'hello');
  assert.equal(truncateToCharBudget('hello', 5), 'hello');
});

test('truncateToCharBudget: truncates when text exceeds budget', () => {
  assert.equal(truncateToCharBudget('hello world', 5), 'hello…');
});

test('truncateToCharBudget: returns empty string for empty input', () => {
  assert.equal(truncateToCharBudget('', 10), '');
});

test('truncateToCharBudget: Infinity budget returns full text', () => {
  assert.equal(truncateToCharBudget('anything at all', Infinity), 'anything at all');
});

test('truncateToCharBudget: non-positive budget returns full text', () => {
  assert.equal(truncateToCharBudget('hello', 0), 'hello');
  assert.equal(truncateToCharBudget('hello', -1), 'hello');
});

test('truncateToCharBudget: handles non-string input gracefully', () => {
  assert.equal(truncateToCharBudget(undefined, 100), '');
  assert.equal(truncateToCharBudget(null, 100), '');
  assert.equal(truncateToCharBudget(42, 100), '42');
});

/* ── applyRecallBudget ────────────────────────────────────── */

function makeEvent(text, score = 0, ts = '') {
  return { text, matchScore: score, ts };
}

test('applyRecallBudget: empty events returns empty array', () => {
  assert.deepEqual(applyRecallBudget([], {}), []);
});

test('applyRecallBudget: null events returns empty array', () => {
  assert.deepEqual(applyRecallBudget(null, {}), []);
});

test('applyRecallBudget: no budget caps returns all events', () => {
  const events = [
    makeEvent('alpha', 1),
    makeEvent('beta', 2),
  ];
  const result = applyRecallBudget(events, {});
  assert.equal(result.length, 2);
  assert.equal(result[0].text, 'beta'); // sorted by score desc
  assert.equal(result[1].text, 'alpha');
});

test('applyRecallBudget: sorts by score descending', () => {
  const events = [
    makeEvent('low', 1),
    makeEvent('high', 10),
    makeEvent('mid', 5),
  ];
  const result = applyRecallBudget(events, {});
  assert.equal(result[0].text, 'high');
  assert.equal(result[1].text, 'mid');
  assert.equal(result[2].text, 'low');
});

test('applyRecallBudget: maxCharsPerMemory truncates each event text', () => {
  const events = [
    makeEvent('this is a long text that should be truncated', 1),
    makeEvent('short', 2),
  ];
  const result = applyRecallBudget(events, { maxCharsPerMemory: 5 });
  assert.equal(result.length, 2);
  assert.equal(result[0].text, 'short');
  assert.equal(result[1].text, 'this …');
});

test('applyRecallBudget: maxTotalChars limits total events', () => {
  const events = [
    makeEvent('aa', 3),
    makeEvent('bb', 2),
    makeEvent('cc', 1),
  ];
  // Each is 2 chars, so maxTotalChars=3 should only take the first 2 events
  const result = applyRecallBudget(events, { maxTotalChars: 4 });
  assert.equal(result.length, 2);
  assert.equal(result[0].text, 'aa');
  assert.equal(result[1].text, 'bb');
});

test('applyRecallBudget: maxTotalChars=3 with 2-char events fits only 1 event', () => {
  const events = [
    makeEvent('aa', 3),
    makeEvent('bb', 2),
    makeEvent('cc', 1),
  ];
  // First event 'aa' is 2 chars <= 3, next event would make total 4 > 3, so stop after 1
  const result = applyRecallBudget(events, { maxTotalChars: 3 });
  assert.equal(result.length, 1);
  assert.equal(result[0].text, 'aa');
});

test('applyRecallBudget: combined per-memory and total budget', () => {
  const events = [
    makeEvent('aaa', 3),     // trunc to 3 -> 'aaa' (3 chars)
    makeEvent('bbb', 2),     // trunc to 3 -> 'bbb' (3 chars) => total 6
    makeEvent('cc', 1),      // trunc to 3 -> 'cc' (2 chars) => would be 8, fits
  ];
  const result = applyRecallBudget(events, { maxCharsPerMemory: 3, maxTotalChars: 7 });
  // aaa (3) + bbb (3) = 6 <= 7; cc (2) would make 8 > 7, so excluded
  assert.equal(result.length, 2);
  assert.equal(result[0].text, 'aaa');
  assert.equal(result[1].text, 'bbb');
});

test('applyRecallBudget: preserves original event fields', () => {
  const events = [
    makeEvent('hello', 5, '2024-01-01'),
  ];
  const result = applyRecallBudget(events, { maxCharsPerMemory: 3 });
  assert.equal(result.length, 1);
  assert.equal(result[0].matchScore, 5);
  assert.equal(result[0].ts, '2024-01-01');
  assert.equal(result[0].text, 'hel…');
});

test('applyRecallBudget: does not mutate the original events array', () => {
  const events = [
    makeEvent('hello world', 1),
  ];
  const originalText = events[0].text;
  const result = applyRecallBudget(events, { maxCharsPerMemory: 5 });
  assert.equal(events[0].text, originalText); // original unchanged
  assert.equal(result[0].text, 'hello…'); // result is truncated copy
});
