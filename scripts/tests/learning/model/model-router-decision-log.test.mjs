import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createDecisionLog, summarizeDecisions, defaultDecisionLogPath } from '../../../lib/tooling/model-router/session/decision-log.mjs';

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-declog-'));
  return path.join(dir, 'decisions.jsonl');
}

test('append then readRecent roundtrips decisions, newest first', () => {
  const file = tempFile();
  const log = createDecisionLog(file);
  log.append({ modelId: 'a', status: 200 });
  log.append({ modelId: 'b', status: 200 });
  const recent = log.readRecent();
  assert.equal(recent.length, 2);
  assert.equal(recent[0].modelId, 'b', 'newest first');
  assert.equal(recent[1].modelId, 'a');
});

test('readRecent on an absent file returns an empty list, not an error', () => {
  const log = createDecisionLog(tempFile());
  assert.deepEqual(log.readRecent(), []);
});

test('rolling cap keeps only the last maxEntries decisions', () => {
  const file = tempFile();
  const log = createDecisionLog(file, { maxEntries: 3 });
  for (let i = 0; i < 6; i += 1) log.append({ modelId: `m${i}`, status: 200 });
  const recent = log.readRecent(100);
  assert.equal(recent.length, 3);
  assert.deepEqual(recent.map((r) => r.modelId), ['m5', 'm4', 'm3']);
});

test('append strips sensitive keys defensively — no secrets land on disk', () => {
  const file = tempFile();
  const log = createDecisionLog(file);
  log.append({ modelId: 'a', status: 200, apiKey: 'cr_secret', authorization: 'Bearer x', headers: { 'x-api-key': 'k' }, body: { messages: [] } });
  const onDisk = fs.readFileSync(file, 'utf8');
  assert.ok(!onDisk.includes('cr_secret'));
  assert.ok(!onDisk.includes('Bearer x'));
  assert.ok(!onDisk.includes('x-api-key'));
  const recent = log.readRecent();
  assert.equal(recent[0].modelId, 'a');
  assert.equal(recent[0].apiKey, undefined);
  assert.equal(recent[0].headers, undefined);
});

test('readRecent honors limit and skips malformed lines', () => {
  const file = tempFile();
  fs.writeFileSync(file, '{"modelId":"a"}\nnot-json\n{"modelId":"b"}\n');
  const log = createDecisionLog(file);
  const recent = log.readRecent(1);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].modelId, 'b');
  assert.equal(log.readRecent().length, 2, 'malformed line skipped');
});

test('summarizeDecisions counts requests, errors and intent-routed; groups by model and client', () => {
  const summary = summarizeDecisions([
    { modelId: 'a', clientId: 'claude', status: 200 },
    { modelId: 'a', clientId: 'claude', status: 503, error: 'upstream-error' },
    { modelId: 'b', clientId: 'codex', status: 200, intent: 'tests' },
    { modelId: 'b', clientId: 'codex', status: 402 },
  ]);
  assert.equal(summary.requests, 4);
  assert.equal(summary.errors, 2, '503 and 402 are errors');
  assert.equal(summary.autoRouted, 1, 'one decision carried an intent');
  assert.deepEqual(summary.byModel, { a: 2, b: 2 });
  assert.deepEqual(summary.byClient, { claude: 2, codex: 2 });
});

test('summarizeDecisions on empty input is all zero', () => {
  assert.deepEqual(summarizeDecisions([]), { requests: 0, errors: 0, autoRouted: 0, byModel: {}, byClient: {} });
});

test('defaultDecisionLogPath puts the log inside the gateway state dir', () => {
  assert.equal(defaultDecisionLogPath('/tmp/state'), path.join('/tmp/state', 'decisions.jsonl'));
});