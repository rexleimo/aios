import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getIntentRouting,
  buildIntentClassifierPrompt,
  parseIntentLabel,
} from '../../../../lib/tooling/model-router/routing/intent.mjs';

const config = {
  enabled: true,
  classifierModel: 'Qwen3.8-Flash',
  intents: [
    { id: 'Quick', description: 'a quick question or small talk', modelId: 'qwen3.8-flash' },
    { id: 'tests', description: 'writing or fixing tests', modelId: 'claude-opus-5' },
    { id: 'arch', description: 'complex architecture or planning', modelId: 'claude-opus-5' },
  ],
};

test('getIntentRouting returns null when the section is absent or disabled', () => {
  assert.equal(getIntentRouting({}), null);
  assert.equal(getIntentRouting({ intentRouting: { ...config, enabled: false } }), null);
});

test('getIntentRouting requires a classifier model and at least one valid intent', () => {
  assert.equal(getIntentRouting({ intentRouting: { ...config, classifierModel: '' } }), null);
  assert.equal(getIntentRouting({ intentRouting: { ...config, intents: [] } }), null);
  // 缺 modelId 的意图被过滤；过滤后为空则整体禁用
  assert.equal(getIntentRouting({ intentRouting: { ...config, intents: [{ id: 'x', description: 'd' }] } }), null);
});

test('getIntentRouting normalizes ids and keeps valid intents', () => {
  const resolved = getIntentRouting({ intentRouting: config });
  assert.equal(resolved.enabled, true);
  assert.equal(resolved.classifierModel, 'qwen3.8-flash');
  assert.deepEqual(resolved.intents.map((i) => i.id), ['quick', 'tests', 'arch']);
  assert.equal(resolved.intents[0].modelId, 'qwen3.8-flash');
});

test('buildIntentClassifierPrompt lists every intent id + description and the user text, asks for JSON only', () => {
  const prompt = buildIntentClassifierPrompt(getIntentRouting({ intentRouting: config }).intents, '帮我写个单元测试');
  assert.match(prompt, /quick: a quick question/);
  assert.match(prompt, /tests: writing or fixing tests/);
  assert.match(prompt, /arch: complex architecture/);
  assert.match(prompt, /帮我写个单元测试/);
  assert.match(prompt, /\{"intent":"<id>"\}/);
});

test('parseIntentLabel maps a valid model-reported label to its model', () => {
  const intents = getIntentRouting({ intentRouting: config }).intents;
  assert.deepEqual(parseIntentLabel('{"intent":"tests"}', intents), {
    intentId: 'tests', modelId: 'claude-opus-5', description: 'writing or fixing tests',
  });
});

test('parseIntentLabel extracts JSON from fenced or prose-wrapped output', () => {
  const intents = getIntentRouting({ intentRouting: config }).intents;
  assert.equal(parseIntentLabel('```json\n{"intent":"quick"}\n```', intents).modelId, 'qwen3.8-flash');
  assert.equal(parseIntentLabel('Sure! {"intent":"arch"} hope that helps', intents).intentId, 'arch');
});

test('parseIntentLabel fails closed on unknown label, malformed output, or missing field — never guesses', () => {
  const intents = getIntentRouting({ intentRouting: config }).intents;
  assert.equal(parseIntentLabel('{"intent":"not-configured"}', intents), null);
  assert.equal(parseIntentLabel('totally not json', intents), null);
  assert.equal(parseIntentLabel('{"other":"quick"}', intents), null);
  assert.equal(parseIntentLabel('', intents), null);
});

test('north-star: the model report decides, not keywords in user text (parseIntentLabel never sees user text)', () => {
  const intents = getIntentRouting({ intentRouting: config }).intents;
  // 用户文本含 "tests" 关键词，但模型报 quick → 必须跟模型走（cheap），证明代码不从文本猜。
  assert.equal(parseIntentLabel('{"intent":"quick"}', intents).modelId, 'qwen3.8-flash');
  // 函数签名只接受 (modelOutput, intents)，结构上无法访问用户文本。
  assert.equal(parseIntentLabel.length, 2);
});