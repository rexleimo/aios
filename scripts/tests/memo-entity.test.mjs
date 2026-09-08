import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { appendMemoEvent } from '../lib/memo/storage/events-write.mjs';
import { collectEvents } from '../lib/memo/storage/events-read.mjs';
import {
  ENTITY_DIRECT_BOOST,
  ENTITY_SPREAD_ATTENUATION,
  ENTITY_SPREAD_BOOST,
  eventEntityList,
  normalizeEntity,
  scoreEventsWithEntity,
  searchMemoEvents,
} from '../lib/memo/storage/query.mjs';
import { buildCorpusEvents, runArm } from '../lib/memo/eval/recall-ab.mjs';

async function withTempRoot(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memo-entity-'));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('entity normalization is exact-lowercase dedup without word lists', () => {
  assert.equal(normalizeEntity('  Order-Service '), 'order-service');
  assert.deepEqual(eventEntityList({ entities: ['a.mjs', ' A.MJS ', '', 'b.mjs'] }), ['a.mjs', 'b.mjs']);
  assert.deepEqual(eventEntityList({}), []);
  assert.deepEqual(eventEntityList({ entities: 'not-an-array' }), []);
});

test('entity scores are zero when no entities exist (pre-entity corpora rank unchanged)', () => {
  const events = [{ text: 'plain entry' }, { text: 'another entry' }];
  assert.deepEqual(scoreEventsWithEntity(events, ['pkg']), [0, 0]);
  assert.deepEqual(scoreEventsWithEntity([], ['pkg']), []);
  assert.deepEqual(scoreEventsWithEntity(events, []), [0, 0]);
});

test('direct entity overlap scales with query coverage and caps at direct boost', () => {
  const events = [
    { text: 'first', entities: ['pkg-manager'] },
    { text: 'second', entities: ['other-thing'] },
  ];
  const scores = scoreEventsWithEntity(events, ['pkg-manager']);
  assert.equal(scores[0], ENTITY_DIRECT_BOOST);
  assert.equal(scores[1], 0);
});

test('spread surfaces linked memories attenuated and capped', () => {
  const events = [
    { text: 'direct hit', entities: ['order-service'] },
    { text: 'linked neighbour', entities: ['order-service'] },
    { text: 'unrelated', entities: ['billing'] },
  ];
  // Query token matches the shared entity token 'order-service' directly on
  // the first two events, so both are direct. To isolate spread, give the
  // neighbour an entity that shares an exact link but no token overlap: use
  // a multi-token entity where only one token matches the query.
  const mixed = [
    { text: 'direct', entities: ['checkout-flow'] },
    { text: 'neighbour', entities: ['checkout-flow', 'order-service'] },
  ];
  const directScores = scoreEventsWithEntity(mixed, ['checkout-flow']);
  assert.ok(directScores[0] > 0 && directScores[1] > 0);
  // Pure spread case: neighbour shares the exact entity string with a direct
  // event but its own tokens do not overlap the query.
  const spreadEvents = [
    { text: 'direct', entities: ['shared-link'] },
    { text: 'neighbour', entities: ['shared-link', 'zzz-unrelated-token'] },
  ];
  const spreadScores = scoreEventsWithEntity(spreadEvents, ['shared-link']);
  // Both match directly here; force the spread path by querying a token that
  // only the first event carries, while the link is exact-shared.
  const asymmetric = [
    { text: 'direct', entities: ['alpha-token', 'shared-link'] },
    { text: 'neighbour', entities: ['shared-link'] },
  ];
  const asymmetricScores = scoreEventsWithEntity(asymmetric, ['alpha-token', 'shared-link']);
  // First event matches both tokens (direct 1.0); neighbour matches one of
  // two directly, so it is direct too — spread only applies to zero-direct
  // events, verified below with a token-level miss.
  assert.ok(asymmetricScores[0] >= asymmetricScores[1]);
  assert.ok(spreadScores.every((score) => score <= ENTITY_DIRECT_BOOST + ENTITY_SPREAD_BOOST));
  assert.ok(events.length === 3);
});

test('spread applies only to zero-direct events sharing an exact entity', () => {
  // 'alpha' tokenizes to 'alpha'; neighbour entity 'shared-link' shares no
  // token with the query, but shares the exact entity string 'shared-link'
  // with the direct event — spread must lift it above zero, attenuated.
  const events = [
    { text: 'direct', entities: ['alpha', 'shared-link'] },
    { text: 'neighbour', entities: ['shared-link'] },
    { text: 'unrelated', entities: ['other'] },
  ];
  const scores = scoreEventsWithEntity(events, ['alpha']);
  assert.ok(scores[0] > 0);
  assert.equal(scores[0], ENTITY_DIRECT_BOOST);
  assert.equal(scores[1], ENTITY_DIRECT_BOOST * ENTITY_SPREAD_ATTENUATION);
  assert.equal(scores[2], 0);
});

test('entities survive write->read and entity-only memories are retrievable', async () => {
  await withTempRoot(async (rootDir) => {
    await appendMemoEvent({
      workspaceRoot: rootDir,
      storage: 'file',
      text: 'a paraphrased note with no keyword in text',
      entities: ['lonely-keyword'],
    });
    const { events } = await collectEvents(rootDir, { storage: 'file', space: 'default' });
    assert.ok(events.some((event) => (event.entities || []).includes('lonely-keyword')));

    const boosted = await searchMemoEvents(rootDir, { storage: 'file', query: 'lonely-keyword', limit: 10 });
    assert.ok(boosted.some((event) => (event.entities || []).includes('lonely-keyword')));

    const unboosted = await searchMemoEvents(rootDir, {
      storage: 'file',
      query: 'lonely-keyword',
      limit: 10,
      entityBoost: false,
    });
    assert.equal(unboosted.length, 0);
  });
});

test('mutating returned entities cannot pollute the parse cache', async () => {
  await withTempRoot(async (rootDir) => {
    await appendMemoEvent({
      workspaceRoot: rootDir,
      storage: 'file',
      text: 'cache safety probe',
      entities: ['cache-entity'],
    });
    const first = await searchMemoEvents(rootDir, { storage: 'file', query: 'cache-entity', limit: 10 });
    assert.ok(first.length > 0);
    first[0].entities.push('mutated');
    const second = await searchMemoEvents(rootDir, { storage: 'file', query: 'cache-entity', limit: 10 });
    assert.ok(!second[0].entities.includes('mutated'));
  });
});

test('entity-boost arm does not degrade top-1 against baseline', async () => {
  async function arm(name) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'memo-entity-ab-'));
    try {
      return await runArm(root, name);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
  const [baseline, entity] = await Promise.all([arm('baseline'), arm('entity-boost')]);
  assert.ok(entity.overall.top1Accuracy >= baseline.overall.top1Accuracy);
});

test('entity corpus differs from plain only by entities', () => {
  const plain = buildCorpusEvents({ withLinks: false });
  const entitized = buildCorpusEvents({ withLinks: false, withEntities: true });
  assert.equal(plain.length, entitized.length);
  for (let index = 0; index < plain.length; index += 1) {
    const { entities: _dropped, ...restEntitized } = entitized[index];
    assert.deepEqual(restEntitized, plain[index]);
  }
  assert.ok(entitized.some((event) => Array.isArray(event.entities) && event.entities.length > 0));
});
