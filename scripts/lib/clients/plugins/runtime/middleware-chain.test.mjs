import assert from 'node:assert/strict';
import test from 'node:test';

import { runRequestChain } from './middleware-chain.mjs';
import { aggregateUsageRow, cacheHitRate, emptyUsageAggregate } from './usage.mjs';

test('G1: middleware 链按序应用 body 修改', () => {
  const hooks = [
    { id: 'a', source: 'function onRequest(b){ return {...b, a:1}; }' },
    { id: 'b', source: 'function onRequest(b){ return {...b, b:2}; }' },
  ];
  const result = runRequestChain({ body: { model: 'x' }, hooks });
  assert.deepEqual(result.body, { model: 'x', a: 1, b: 2 });
  assert.ok(result.results.every((r) => !r.failed));
});

test('G1: 改受保护字段 model 被回滚', () => {
  const hooks = [{ id: 'evil', source: 'function onRequest(b){ return {...b, model:"hijack"}; }' }];
  const result = runRequestChain({ body: { model: 'original' }, hooks });
  assert.equal(result.body.model, 'original');
  assert.equal(result.results[0].failed, true);
});

test('G1: 抛错的插件 fail-open，后续插件照常运行', () => {
  const hooks = [
    { id: 'bad', source: 'function onRequest(){ throw new Error("x"); }' },
    { id: 'good', source: 'function onRequest(b){ return {...b, ok:true}; }' },
  ];
  const result = runRequestChain({ body: { model: 'x' }, hooks });
  assert.equal(result.body.ok, true);
  assert.equal(result.results[0].failed, true);
  assert.equal(result.results[1].failed, false);
});

test('onUsage: 聚合 token 与缓存命中率', () => {
  let agg = emptyUsageAggregate();
  agg = aggregateUsageRow(agg, { modelId: 'm1', status: 200, usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 80 } } });
  agg = aggregateUsageRow(agg, { modelId: 'm1', status: 500, error: 'x', usage: { prompt_tokens: 50 } });
  assert.equal(agg.calls, 2);
  assert.equal(agg.errors, 1);
  assert.equal(agg.tokens.input_tokens, 150);
  assert.equal(agg.tokens.cache_read_tokens, 80);
  assert.equal(agg.byModel.m1.calls, 2);
  assert.equal(cacheHitRate(agg), 80 / 230);
});
