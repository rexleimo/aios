import test from 'node:test';
import assert from 'node:assert/strict';

import {
  maskText, unmaskText, maskObject, unmaskObject, detectSecrets, placeholderFor,
} from '../../../../lib/tooling/model-router/masking/masker.mjs';

test('detectSecrets finds api key', () => {
  const r = detectSecrets('token=sk-abcdefghijklmnopqrstuvwxyz123456');
  assert.ok(r.some((x) => x.kind === 'API_KEY'));
});

test('maskText replaces and store maps', () => {
  const store = new Map();
  const { text, replacements } = maskText('key sk-abcdefghijklmnopqrstuvwxyz123456 here', store);
  assert.ok(!text.includes('sk-abcdefghijklmnopqrstuvwxyz123456'));
  assert.equal(store.size, 1);
  assert.equal(unmaskText(text, store), 'key sk-abcdefghijklmnopqrstuvwxyz123456 here');
});

test('same value same placeholder', () => {
  const a = maskText('x sk-abcdefghijklmnopqrstuvwxyz123456').text;
  const b = maskText('y sk-abcdefghijklmnopqrstuvwxyz123456').text;
  assert.equal(a.match(/\{\{API_KEY_[a-f0-9]{8}\}\}/)[0], b.match(/\{\{API_KEY_[a-f0-9]{8}\}\}/)[0]);
});

test('luhn card masked', () => {
  const { text } = maskText('card 4111111111111111');
  assert.ok(text.includes('CARD_'));
});

test('unmask without store keeps placeholder', () => {
  const { text } = maskText('secret sk-abcdefghijklmnopqrstuvwxyz123456');
  assert.equal(unmaskText(text), text);
});

test('maskObject/unmaskObject roundtrip', () => {
  const store = new Map();
  const obj = { msg: 'email a@b.com', nested: ['sk-abcdefghijklmnopqrstuvwxyz123456'] };
  const { value } = maskObject(obj, store);
  assert.notEqual(JSON.stringify(value), JSON.stringify(obj));
  const restored = unmaskObject(value, store);
  assert.deepEqual(restored, obj);
});

test('placeholderFor stable', () => {
  assert.equal(placeholderFor('API_KEY', 'v'), placeholderFor('API_KEY', 'v'));
});