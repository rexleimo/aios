import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { classifyEvent, isExpired, TAXONOMY_CLASSES } from '../lib/lifecycle/dream/taxonomy.mjs';
import { textSimilarity, textTokens, findDuplicateClusters, pickKeepWinner, dedupDecisions } from '../lib/lifecycle/dream/dedup.mjs';
import { runDream } from '../lib/lifecycle/dream/index.mjs';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function makeEvent(overrides = {}) {
  return {
    eventId: overrides.eventId || `test:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
    ts: overrides.ts || new Date().toISOString(),
    space: overrides.space || 'default',
    spaceKey: overrides.spaceKey || 'default',
    scope: overrides.scope || 'project_shared',
    agent: overrides.agent || '',
    text: overrides.text || 'test memo event content',
    refs: overrides.refs || [],
    kind: 'memo',
    seq: overrides.seq || 1,
    storage: overrides.storage || 'file',
    ...overrides,
  };
}

async function withTempRoot(prefix, fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function writeEventsJsonl(root, events) {
  const dir = path.join(root, '.aios', 'memo', 'file');
  await fs.mkdir(dir, { recursive: true });
  const lines = events.map((e) => JSON.stringify(e)).join('\n');
  await fs.writeFile(path.join(dir, 'events.jsonl'), `${lines}\n`, 'utf8');
}

async function writePinned(root, space, content) {
  const dir = path.join(root, '.aios', 'memo', 'file', 'pinned');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${space}.md`), `${content}\n`, 'utf8');
}

// ----------------------------------------------------------------------------
// Taxonomy classification tests
// ----------------------------------------------------------------------------

test('classifyEvent: SENSITIVE for agent_private scope', () => {
  const event = makeEvent({ scope: 'agent_private', agent: 'claude' });
  const result = classifyEvent(event);
  assert.equal(result.class, TAXONOMY_CLASSES.SENSITIVE);
  assert.equal(result.ttlDays, -1);
});

test('classifyEvent: OPERATIONAL for text starting with [ops]', () => {
  const event = makeEvent({ text: '[ops] deploy to production' });
  const result = classifyEvent(event);
  assert.equal(result.class, TAXONOMY_CLASSES.OPERATIONAL);
  assert.equal(result.ttlDays, 3);
});

test('classifyEvent: OPERATIONAL for refs including ops', () => {
  const event = makeEvent({ refs: ['ops', 'deploy'] });
  const result = classifyEvent(event);
  assert.equal(result.class, TAXONOMY_CLASSES.OPERATIONAL);
  assert.equal(result.ttlDays, 3);
});

test('classifyEvent: STABLE_PREFERENCE for project_shared + pinned ref', () => {
  const event = makeEvent({ refs: ['pinned'] });
  const result = classifyEvent(event);
  assert.equal(result.class, TAXONOMY_CLASSES.STABLE_PREFERENCE);
  assert.equal(result.ttlDays, -1);
});

test('classifyEvent: RECENT_SNAPSHOT for events within 24h', () => {
  const now = Date.now();
  const recentTs = new Date(now - 60 * 60 * 1000).toISOString(); // 1 hour ago
  const event = makeEvent({ ts: recentTs, scope: 'agent_ephemeral' });
  const result = classifyEvent(event, now);
  assert.equal(result.class, TAXONOMY_CLASSES.RECENT_SNAPSHOT);
  assert.equal(result.ttlDays, 7);
});

test('classifyEvent: DURABLE_CONTEXT for project_shared not pinned not recent', () => {
  const now = Date.now();
  const oldTs = new Date(now - 48 * 60 * 60 * 1000).toISOString(); // 2 days ago
  const event = makeEvent({ ts: oldTs, refs: [] });
  const result = classifyEvent(event, now);
  assert.equal(result.class, TAXONOMY_CLASSES.DURABLE_CONTEXT);
  assert.equal(result.ttlDays, 90);
});

// ----------------------------------------------------------------------------
// TTL expiry tests
// ----------------------------------------------------------------------------

test('isExpired: returns false for STABLE_PREFERENCE (ttl=-1)', () => {
  const event = makeEvent({ ts: new Date(0).toISOString() }); // epoch
  const classified = { class: TAXONOMY_CLASSES.STABLE_PREFERENCE, ttlDays: -1, event };
  assert.equal(isExpired(classified), false);
});

test('isExpired: returns false for OPERATIONAL within TTL', () => {
  const now = Date.now();
  const event = makeEvent({ ts: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString() }); // 1 day ago
  const classified = { class: TAXONOMY_CLASSES.OPERATIONAL, ttlDays: 3, event };
  assert.equal(isExpired(classified, now), false);
});

test('isExpired: returns true for OPERATIONAL past TTL', () => {
  const now = Date.now();
  const event = makeEvent({ ts: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString() }); // 5 days ago
  const classified = { class: TAXONOMY_CLASSES.OPERATIONAL, ttlDays: 3, event };
  assert.equal(isExpired(classified, now), true);
});

test('isExpired: returns true for DURABLE_CONTEXT past 90 days', () => {
  const now = Date.now();
  const event = makeEvent({ ts: new Date(now - 100 * 24 * 60 * 60 * 1000).toISOString() }); // 100 days ago
  const classified = { class: TAXONOMY_CLASSES.DURABLE_CONTEXT, ttlDays: 90, event };
  assert.equal(isExpired(classified, now), true);
});

// ----------------------------------------------------------------------------
// Jaccard similarity tests
// ----------------------------------------------------------------------------

test('textSimilarity: identical texts return 1.0', () => {
  const sim = textSimilarity('hello world', 'hello world');
  assert.equal(sim, 1.0);
});

test('textSimilarity: completely different texts return 0', () => {
  const sim = textSimilarity('hello world', 'foo bar baz');
  assert.equal(sim, 0);
});

test('textSimilarity: partially overlapping texts', () => {
  const sim = textSimilarity('hello world foo', 'hello world bar');
  // Shared: hello, world (2). Union: hello, world, foo, bar (4). 2/4 = 0.5
  assert.equal(sim, 0.5);
});

test('textSimilarity: case insensitive', () => {
  const sim = textSimilarity('Hello World', 'hello world');
  assert.equal(sim, 1.0);
});

test('textSimilarity: both empty returns 1', () => {
  const sim = textSimilarity('', '');
  assert.equal(sim, 1.0);
});

test('textSimilarity: one empty returns 0', () => {
  const sim = textSimilarity('hello', '');
  assert.equal(sim, 0.0);
});

// ----------------------------------------------------------------------------
// Unspaced-script tokenization
// ----------------------------------------------------------------------------

test('textTokens leaves spaced-script text exactly as whitespace splitting did', () => {
  assert.deepEqual([...textTokens('us-east-1 region v2.0')], ['us-east-1', 'region', 'v2.0']);
  assert.deepEqual([...textTokens('  Hello   World  ')], ['hello', 'world']);
});

test('textTokens decomposes unspaced scripts into character bigrams', () => {
  assert.deepEqual([...textTokens('包管理器')], ['包管', '管理', '理器']);
  // Latin runs inside a mixed token stay whole, punctuation separates runs.
  assert.deepEqual([...textTokens('华东二区，v2')], ['华东', '东二', '二区', 'v2']);
  assert.deepEqual([...textTokens('区')], ['区']);
});

test('textSimilarity scores Chinese rewordings instead of collapsing them to zero', () => {
  const before = '项目使用 pnpm 作为包管理器，锁文件提交到仓库';
  const after = '项目使用 npm 作为包管理器，锁文件提交到仓库';
  // Whitespace-only splitting scored this pair 0 because each sentence was a
  // single token, which made Chinese memos invisible to dedup and supersede.
  assert.ok(textSimilarity(before, after) > 0.8);
});

test('textSimilarity still separates a genuine Chinese decision reversal', () => {
  const before = '浏览器自动化复用长期 cookie 会话';
  const after = '每次都要人工完成登录墙，禁止复用凭据缓存';
  assert.ok(textSimilarity(before, after) < 0.2, 'a reversal must not be merged as a duplicate');
});

// ----------------------------------------------------------------------------
// Dedup clustering tests
// ----------------------------------------------------------------------------

test('findDuplicateClusters: no duplicates returns no clusters', () => {
  const events = [
    makeEvent({ eventId: 'e1', text: 'completely different text one' }),
    makeEvent({ eventId: 'e2', text: 'completely different text two' }),
  ];
  const clusters = findDuplicateClusters(events, 0.7);
  assert.equal(clusters.length, 0);
});

test('findDuplicateClusters: near-identical texts form a cluster', () => {
  const events = [
    makeEvent({ eventId: 'e1', text: 'the project uses react for the frontend framework components' }),
    makeEvent({ eventId: 'e2', text: 'the project uses react for the frontend framework' }),
    makeEvent({ eventId: 'e3', text: 'something about node backend server' }),
  ];
  const clusters = findDuplicateClusters(events, 0.7);
  // e1 and e2 share 7 of 8 words = 0.875
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].length, 2);
  const ids = clusters[0].map((e) => e.eventId).sort();
  assert.deepEqual(ids, ['e1', 'e2']);
});

test('findDuplicateClusters: does not cross space boundaries', () => {
  const events = [
    makeEvent({ eventId: 'e1', text: 'duplicate content for testing', space: 'default', spaceKey: 'default' }),
    makeEvent({ eventId: 'e2', text: 'duplicate content for testing', space: 'other', spaceKey: 'other' }),
  ];
  const clusters = findDuplicateClusters(events, 0.7);
  assert.equal(clusters.length, 0);
});

test('findDuplicateClusters: single event never forms a cluster', () => {
  const events = [makeEvent({ eventId: 'e1', text: 'just one event' })];
  const clusters = findDuplicateClusters(events, 0.7);
  assert.equal(clusters.length, 0);
});

test('findDuplicateClusters: chain clustering (A~B, B~C)', () => {
  const events = [
    makeEvent({ eventId: 'e1', text: 'alpha beta gamma delta epsilon' }),
    makeEvent({ eventId: 'e2', text: 'alpha beta gamma delta zeta' }),
    makeEvent({ eventId: 'e3', text: 'alpha beta gamma eta theta' }),
  ];
  // e1 & e2: intersect=4, union=6, sim=0.67 < 0.7 at threshold 0.6
  const clusters = findDuplicateClusters(events, 0.6);
  // e1-e2: 4/6 = 0.667 >= 0.6
  // e1-e3: 3/7 = 0.428 < 0.6 — NOT connected directly
  // e2-e3: 3/7 = 0.428 < 0.6 — NOT connected directly
  // But e1 connects to e2, and e2 does not connect to e3, so they are separate
  // Actually with single-linkage: e1-e2 are connected = cluster {e1,e2}
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].length, 2);
});

// ----------------------------------------------------------------------------
// Winner selection
// ----------------------------------------------------------------------------

test('pickKeepWinner: empty input', () => {
  const result = pickKeepWinner([]);
  assert.equal(result.keep, '');
  assert.deepEqual(result.drop, []);
});

test('pickKeepWinner: single item', () => {
  const cluster = [makeEvent({ eventId: 'e1' })];
  const result = pickKeepWinner(cluster);
  assert.equal(result.keep, 'e1');
  assert.deepEqual(result.drop, []);
});

test('pickKeepWinner: picks most recent ts', () => {
  const cluster = [
    makeEvent({ eventId: 'e1', ts: '2026-01-01T00:00:00.000Z', text: 'older' }),
    makeEvent({ eventId: 'e2', ts: '2026-06-01T00:00:00.000Z', text: 'newer' }),
  ];
  const result = pickKeepWinner(cluster);
  assert.equal(result.keep, 'e2');
  assert.equal(result.drop[0], 'e1');
});

test('pickKeepWinner: tiebreaker is longer text', () => {
  const cluster = [
    makeEvent({ eventId: 'e1', ts: '2026-06-01T00:00:00.000Z', text: 'short' }),
    makeEvent({ eventId: 'e2', ts: '2026-06-01T00:00:00.000Z', text: 'longer text is better' }),
  ];
  const result = pickKeepWinner(cluster);
  // Same ts, e2 has longer text
  assert.equal(result.keep, 'e2');
  assert.equal(result.drop[0], 'e1');
});

test('dedupDecisions: returns keep/drop array', () => {
  const events = [
    makeEvent({ eventId: 'e1', text: 'the quick brown fox jumps over lazy dog' }),
    makeEvent({ eventId: 'e2', text: 'the quick brown fox jumps over lazy' }),
    makeEvent({ eventId: 'e3', text: 'something completely unrelated here' }),
  ];
  const decisions = dedupDecisions(events, 0.7);
  // e1: 8 words, e2: 7 words. Intersection=7, union=8, sim=0.875 >= 0.7
  assert.equal(decisions.length, 1);
  const decision = decisions[0];
  assert.equal(decision.keep, 'e1'); // longer text wins
  assert.deepEqual(decision.drop, ['e2']);
});

// ----------------------------------------------------------------------------
// Integration: preview vs apply
// ----------------------------------------------------------------------------

test('runDream: preview returns plan without modifying storage', async () => {
  await withTempRoot('dream-preview-', async (root) => {
    const now = Date.now();
    const events = [
      makeEvent({
        eventId: 'preview-1',
        ts: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
        text: 'stable preference memo',
        refs: ['pinned'],
      }),
      makeEvent({
        eventId: 'preview-2',
        ts: new Date(now - 100 * 24 * 60 * 60 * 1000).toISOString(),
        text: 'old durable context that will expire',
      }),
      makeEvent({
        eventId: 'preview-3',
        scope: 'agent_private',
        agent: 'claude',
        ts: new Date(now - 200 * 24 * 60 * 60 * 1000).toISOString(),
        text: 'sensitive agent private memo',
      }),
    ];
    await writeEventsJsonl(root, events);

    const plan = await runDream({ rootDir: root, mode: 'preview', spaces: ['default'] });
    assert.equal(plan.mode, undefined); // not applied
    assert.ok(Array.isArray(plan.expire));
    assert.ok(Array.isArray(plan.dedup));
    assert.ok(typeof plan.totalAffected === 'number');
    assert.ok(plan.summary.totalEvents >= 3);

    // preview-2 should be expired (100d old, durable with 90d TTL)
    assert.ok(plan.expire.includes('preview-2'), 'old durable event should be expired');

    // preview-1 (pinned) should NOT be expired
    assert.ok(!plan.expire.includes('preview-1'), 'pinned stable preference should not expire');

    // File should not have been modified in preview mode
    const content = await fs.readFile(path.join(root, '.aios', 'memo', 'file', 'events.jsonl'), 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 3, 'preview should not modify storage');
  });
});

test('runDream: apply removes expired events and rewrites storage', async () => {
  await withTempRoot('dream-apply-', async (root) => {
    const now = Date.now();
    const events = [
      makeEvent({
        eventId: 'apply-keep-1',
        ts: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
        text: 'recent memo to keep',
      }),
      makeEvent({
        eventId: 'apply-expire-1',
        ts: new Date(now - 100 * 24 * 60 * 60 * 1000).toISOString(),
        text: 'old expired durable memo',
      }),
    ];
    await writeEventsJsonl(root, events);

    // Sanity check: 2 events before
    const before = await fs.readFile(path.join(root, '.aios', 'memo', 'file', 'events.jsonl'), 'utf8');
    assert.equal(before.trim().split('\n').filter(Boolean).length, 2);

    const result = await runDream({ rootDir: root, mode: 'apply', spaces: ['default'] });
    assert.equal(result.applied, true);
    assert.ok(result.removedCount >= 1);

    // After: only 1 event should survive
    const after = await fs.readFile(path.join(root, '.aios', 'memo', 'file', 'events.jsonl'), 'utf8');
    const lines = after.trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 1, 'one event should remain after apply');
    const survivor = JSON.parse(lines[0]);
    assert.equal(survivor.eventId, 'apply-keep-1');
  });
});

test('runDream: dedup removes duplicate losers on apply', async () => {
  await withTempRoot('dream-dedup-apply-', async (root) => {
    const events = [
      makeEvent({
        eventId: 'dedup-keep',
        ts: '2026-06-01T12:00:00.000Z',
        text: 'the project uses react for the frontend framework with typescript',
      }),
      makeEvent({
        eventId: 'dedup-drop',
        ts: '2026-06-01T10:00:00.000Z',
        text: 'the project uses react for the frontend framework',
      }),
    ];
    await writeEventsJsonl(root, events);

    const result = await runDream({ rootDir: root, mode: 'apply', spaces: ['default'] });
    assert.equal(result.applied, true);

    // The duplicate should be dropped (same space, high similarity)
    const after = await fs.readFile(path.join(root, '.aios', 'memo', 'file', 'events.jsonl'), 'utf8');
    const lines = after.trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 1, 'duplicate should be removed');
    const survivor = JSON.parse(lines[0]);
    assert.equal(survivor.eventId, 'dedup-keep');
  });
});

test('runDream: agent_private events are never touched', async () => {
  await withTempRoot('dream-sensitive-', async (root) => {
    const now = Date.now();
    const events = [
      makeEvent({
        eventId: 'sensitive-old',
        scope: 'agent_private',
        agent: 'claude',
        ts: new Date(now - 200 * 24 * 60 * 60 * 1000).toISOString(),
        text: 'private memo that should survive dream',
      }),
      makeEvent({
        eventId: 'public-old',
        ts: new Date(now - 200 * 24 * 60 * 60 * 1000).toISOString(),
        text: 'old public memo that should expire',
      }),
    ];
    await writeEventsJsonl(root, events);

    const result = await runDream({ rootDir: root, mode: 'apply', spaces: ['default'] });
    assert.equal(result.applied, true);

    // sensitive event should still be there
    const after = await fs.readFile(path.join(root, '.aios', 'memo', 'file', 'events.jsonl'), 'utf8');
    const lines = after.trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 1, 'only sensitive event should survive');
    const survivor = JSON.parse(lines[0]);
    assert.equal(survivor.eventId, 'sensitive-old');
  });
});

// ----------------------------------------------------------------------------
// Edge cases
// ----------------------------------------------------------------------------

test('textSimilarity: dedup threshold edge cases', () => {
  // Test default threshold behavior
  const events = [
    makeEvent({ eventId: 'e1', text: 'alpha beta gamma delta' }),
    makeEvent({ eventId: 'e2', text: 'alpha beta gamma delta epsilon' }),
  ];
  // e1: 4 words, e2: 5 words. Intersection=4, union=5, sim=0.8
  const clusters = findDuplicateClusters(events, 0.8);
  assert.equal(clusters.length, 1, 'exactly at threshold should match');

  const clusters2 = findDuplicateClusters(events, 0.81);
  assert.equal(clusters2.length, 0, 'just above threshold should not match');
});

test('runDream: no events returns empty plan', async () => {
  await withTempRoot('dream-empty-', async (root) => {
    // No memo storage at all
    const plan = await runDream({ rootDir: root, mode: 'preview', spaces: ['default'] });
    assert.ok(Array.isArray(plan.expire));
    assert.ok(Array.isArray(plan.dedup));
    assert.equal(plan.totalAffected, 0);
    assert.equal(plan.summary.totalEvents, 0);
  });
});
