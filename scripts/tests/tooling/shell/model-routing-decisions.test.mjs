import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  decisionLogPath,
  defaultStateDir,
  parseLimit,
  readDecisions,
  sanitizeEntry,
  summarizeDecisions,
} from '../../../../apps/shell/ui/src/lib/config/routing-decisions.mjs';

const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aios-routing-decisions-'));

test('defaultStateDir mirrors the gateway CLI default and honors the env override', () => {
  assert.equal(defaultStateDir({}), path.join(os.homedir(), '.aios', 'gateway'));
  assert.equal(defaultStateDir({ AIOS_GATEWAY_STATE_DIR: '/tmp/custom-gw' }), '/tmp/custom-gw');
  assert.equal(decisionLogPath('/tmp/gw'), path.join('/tmp/gw', 'decisions.jsonl'));
});

test('readDecisions: absent file is an empty state, not an error', () => {
  const dir = tempRoot();
  assert.deepEqual(readDecisions(path.join(dir, 'decisions.jsonl')), { exists: false, entries: [] });
});

test('readDecisions roundtrips JSONL and skips malformed lines', () => {
  const dir = tempRoot();
  const file = path.join(dir, 'decisions.jsonl');
  fs.writeFileSync(file, '{"modelId":"a","clientId":"claude"}\nnot-json\n{"modelId":"b","clientId":"codex"}\n');
  const { exists, entries } = readDecisions(file);
  assert.equal(exists, true);
  assert.deepEqual(entries.map((e) => e.modelId), ['a', 'b']);
});

test('readDecisions gives distinct stable row identities before newest-first slicing', (t) => {
  const dir = tempRoot();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'decisions.jsonl');
  const line = JSON.stringify({ at: '2026-11-15T08:00:00Z', modelId: 'a', status: 200 });
  fs.writeFileSync(file, `${line}\n${line}\n`);
  const before = readDecisions(file).entries;
  assert.notEqual(before[0].recordKey, before[1].recordKey, 'identical lines must have distinct keys');
  fs.appendFileSync(file, `${JSON.stringify({ at: '2026-11-15T08:00:01Z', modelId: 'b' })}\n`);
  const after = readDecisions(file).entries.slice(-3).reverse();
  assert.equal(after[1].recordKey, before[1].recordKey);
  assert.equal(after[2].recordKey, before[0].recordKey);
});

test('sanitizeEntry strips sensitive keys defensively on the read side', () => {
  const entry = sanitizeEntry({ modelId: 'a', apiKey: 'sk-x', authorization: 'Bearer x', headers: { 'x-api-key': 'k' }, body: 'secret', requestBody: {}, secret: 's', token: 't', status: 200 });
  assert.deepEqual(entry, { modelId: 'a', status: 200 });
});

test('summarizeDecisions counts requests/errors/autoRouted and groups by model/client', () => {
  const entries = [
    { modelId: 'opus', clientId: 'claude', status: 200, intent: 'review' },
    { modelId: 'flash', clientId: 'claude', status: 200 },
    { modelId: 'opus', clientId: 'codex', status: 503, error: 'upstream-error' },
    { modelId: 'flash', clientId: 'claude', status: 0, error: 'request-timeout', intent: 'quick' },
  ];
  const summary = summarizeDecisions(entries);
  assert.equal(summary.requests, 4);
  assert.equal(summary.errors, 2, 'status>=400 or error field counts as error');
  assert.equal(summary.autoRouted, 2);
  assert.deepEqual(summary.byModel, { opus: 2, flash: 2 });
  assert.deepEqual(summary.byClient, { claude: 3, codex: 1 });
});

test('summarizeDecisions builds client→model edges for the routing graph', () => {
  const entries = [
    { modelId: 'opus', clientId: 'claude', status: 200, intent: 'review' },
    { modelId: 'opus', clientId: 'claude', status: 503, error: 'upstream-error' },
    { modelId: 'flash', clientId: 'claude', status: 200 },
    { modelId: 'opus', clientId: '', status: 200 },
  ];
  const { edges } = summarizeDecisions(entries);
  const claudeOpus = edges.find((e) => e.clientId === 'claude' && e.modelId === 'opus');
  assert.deepEqual(claudeOpus, { clientId: 'claude', modelId: 'opus', count: 2, errors: 1, autoRouted: 1 });
  assert.equal(edges.find((e) => e.clientId === 'claude' && e.modelId === 'flash').count, 1);
  assert.equal(edges.find((e) => e.clientId === '' && e.modelId === 'opus').clientId, '', 'missing client stays empty, never fabricated');
});

test('summarizeDecisions on empty input returns zeroed counters', () => {
  const summary = summarizeDecisions([]);
  assert.deepEqual(summary, { requests: 0, errors: 0, autoRouted: 0, byModel: {}, byClient: {}, edges: [] });
});

test('parseLimit clamps to 1..100 and defaults to 20', () => {
  assert.equal(parseLimit(null), 20);
  assert.equal(parseLimit('abc'), 20);
  assert.equal(parseLimit('0'), 20);
  assert.equal(parseLimit('-5'), 20);
  assert.equal(parseLimit('50'), 50);
  assert.equal(parseLimit('999'), 100);
});
