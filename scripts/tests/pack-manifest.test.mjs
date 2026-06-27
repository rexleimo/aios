import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  buildManifest,
  writeManifest,
  buildIndexRecord,
  writeIndex,
  computeSha256,
  classifyEventLevel,
} from '../lib/contextdb/pack-manifest.mjs';

// ─── Helper fixtures ────────────────────────────────────────────────────────

function makeSampleMarkdown(sessionId = 'test-session-001') {
  return [
    '# ContextDB Report',
    '',
    `- Generated: ${new Date().toISOString()}`,
    `- Session: ${sessionId}`,
    `- Agent: codex-cli`,
    `- Project: demo-project`,
    `- Goal: implement feature X`,
    '',
    '## Session Summary',
    'Worked on feature X with moderate progress.',
    '',
    '## Event Log',
    '1. [2026-06-27T10:00:00.000Z] (test-session-001#1) user/prompt: Start implementing feature X',
    '2. [2026-06-27T10:05:00.000Z] (test-session-001#2) assistant/response: Created the initial module',
    '3. [2026-06-27T10:10:00.000Z] (test-session-001#3) tool/tool_call: Ran the test suite',
    '',
  ].join('\n');
}

function makeSampleEvents() {
  return [
    { seq: 1, ts: '2026-06-27T10:00:00.000Z', role: 'user', kind: 'prompt', text: 'Start implementing feature X', refs: [] },
    { seq: 2, ts: '2026-06-27T10:05:00.000Z', role: 'assistant', kind: 'response', text: 'Created the initial module for feature X, added core logic.', refs: [] },
    { seq: 3, ts: '2026-06-27T10:10:00.000Z', role: 'tool', kind: 'tool_call', text: 'Ran the test suite with 12 passing tests.', refs: ['src/feature-x.mjs'] },
    { seq: 4, ts: '2026-06-27T10:15:00.000Z', role: 'system', kind: 'error', text: 'Timeout exceeded while running integration tests. This is a longer error message that should be truncated to fit within the 120 character limit for the text_summary field in the JSONL index.', refs: [] },
    { seq: 5, ts: '2026-06-27T10:20:00.000Z', role: 'user', kind: 'note', text: 'Random background note', refs: [] },
  ];
}

function makeSampleSources() {
  return [
    { type: 'memo', path: '.aios/context-db/sessions/test-session-001/l0-summary.md', hash: 'abc123' },
    { type: 'event', path: '.aios/context-db/sessions/test-session-001/l2-events.jsonl', hash: 'def456' },
    { type: 'checkpoint', path: '.aios/context-db/sessions/test-session-001/l1-checkpoints.jsonl', hash: 'ghi789' },
  ];
}

// ─── computeSha256 ──────────────────────────────────────────────────────────

test('computeSha256 returns a hex digest of expected length', () => {
  const content = 'hello world';
  const hash = computeSha256(content);
  assert.equal(hash.length, 64); // SHA-256 hex = 64 chars
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test('computeSha256 is consistent across calls with same input', () => {
  const content = 'test content for consistency';
  const hash1 = computeSha256(content);
  const hash2 = computeSha256(content);
  assert.equal(hash1, hash2);
});

test('computeSha256 produces different hashes for different content', () => {
  const hashA = computeSha256('content A');
  const hashB = computeSha256('content B');
  assert.notEqual(hashA, hashB);
});

test('computeSha256 matches node crypto directly', () => {
  const content = 'cross-check content';
  const expected = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  assert.equal(computeSha256(content), expected);
});

test('computeSha256 handles empty string', () => {
  const hash = computeSha256('');
  assert.equal(hash.length, 64);
  // SHA-256 of empty string is a known value
  const expected = crypto.createHash('sha256').update('', 'utf8').digest('hex');
  assert.equal(hash, expected);
});

// ─── buildManifest ──────────────────────────────────────────────────────────

test('buildManifest produces a valid manifest schema', () => {
  const sessionId = 'test-session-001';
  const content = makeSampleMarkdown(sessionId);
  const sources = makeSampleSources();
  const manifest = buildManifest({ sessionId, sources, content });

  assert.equal(manifest.format_version, 1);
  assert.equal(manifest.session_id, sessionId);
  assert.equal(typeof manifest.content_sha256, 'string');
  assert.equal(manifest.content_sha256.length, 64);
  assert.equal(Array.isArray(manifest.sources), true);
  assert.equal(manifest.sources.length, 3);
  assert.equal(typeof manifest.created_at, 'string');
  // created_at should be a valid ISO timestamp
  assert.doesNotThrow(() => new Date(manifest.created_at));
});

test('buildManifest content_sha256 matches computeSha256 of the content', () => {
  const content = makeSampleMarkdown();
  const manifest = buildManifest({ sessionId: 's1', sources: [], content });
  assert.equal(manifest.content_sha256, computeSha256(content));
});

test('buildManifest sources are normalized with type, path, hash', () => {
  const sources = [
    { type: 'memo', path: 'a.md', hash: 'h1' },
    { type: 'checkpoint', path: 'b.jsonl', hash: 'h2' },
  ];
  const manifest = buildManifest({ sessionId: 's2', sources, content: 'x' });
  assert.deepEqual(manifest.sources, [
    { type: 'memo', path: 'a.md', hash: 'h1' },
    { type: 'checkpoint', path: 'b.jsonl', hash: 'h2' },
  ]);
});

test('buildManifest throws on missing sessionId', () => {
  assert.throws(() => buildManifest({ sessionId: '', sources: [], content: 'x' }), /sessionId/);
  assert.throws(() => buildManifest({ sources: [], content: 'x' }), /sessionId/);
});

test('buildManifest throws on missing content', () => {
  assert.throws(() => buildManifest({ sessionId: 's1', sources: [] }), /content/);
  assert.throws(() => buildManifest({ sessionId: 's1', sources: [], content: null }), /content/);
});

test('buildManifest defaults sources to empty array when not provided', () => {
  const manifest = buildManifest({ sessionId: 's1', content: 'test' });
  assert.deepEqual(manifest.sources, []);
});

// ─── writeManifest ──────────────────────────────────────────────────────────

test('writeManifest writes a valid JSON file to disk', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'pack-manifest-test-'));
  const sessionId = 'test-session-001';
  const content = makeSampleMarkdown(sessionId);
  const sources = makeSampleSources();
  const manifest = buildManifest({ sessionId, sources, content });

  const filePath = await writeManifest(outputDir, sessionId, manifest);
  assert.equal(filePath, path.resolve(outputDir, `${sessionId}-context.manifest.json`));

  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.format_version, 1);
  assert.equal(parsed.session_id, sessionId);
  assert.equal(parsed.content_sha256, manifest.content_sha256);
  assert.deepEqual(parsed.sources, manifest.sources);
  assert.equal(parsed.created_at, manifest.created_at);

  await rm(outputDir, { recursive: true, force: true });
});

test('writeManifest creates parent directories if missing', async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), 'pack-manifest-nested-'));
  const nestedDir = path.join(baseDir, 'deep', 'nested', 'exports');
  const sessionId = 'nested-session';
  const manifest = buildManifest({ sessionId, content: 'nested', sources: [] });

  const filePath = await writeManifest(nestedDir, sessionId, manifest);
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.session_id, sessionId);

  await rm(baseDir, { recursive: true, force: true });
});

// ─── classifyEventLevel ─────────────────────────────────────────────────────

test('classifyEventLevel returns L0 for core kinds', () => {
  const l0Kinds = ['prompt', 'response', 'checkpoint', 'plan', 'instruction', 'objective'];
  for (const kind of l0Kinds) {
    assert.equal(classifyEventLevel({ kind }), 'L0');
  }
});

test('classifyEventLevel returns L1 for operational kinds', () => {
  const l1Kinds = ['error', 'tool', 'tool_call', 'tool_result', 'ref', 'file', 'diff', 'search', 'summary'];
  for (const kind of l1Kinds) {
    assert.equal(classifyEventLevel({ kind }), 'L1');
  }
});

test('classifyEventLevel returns L2 for unknown/other kinds', () => {
  assert.equal(classifyEventLevel({ kind: 'note' }), 'L2');
  assert.equal(classifyEventLevel({ kind: 'background' }), 'L2');
  assert.equal(classifyEventLevel({ kind: 'custom' }), 'L2');
  assert.equal(classifyEventLevel({}), 'L2');
  assert.equal(classifyEventLevel(null), 'L2');
});

test('classifyEventLevel is case-insensitive', () => {
  assert.equal(classifyEventLevel({ kind: 'PROMPT' }), 'L0');
  assert.equal(classifyEventLevel({ kind: 'Error' }), 'L1');
});

// ─── buildIndexRecord ───────────────────────────────────────────────────────

test('buildIndexRecord produces correct structure with seq', () => {
  const event = { seq: 3, ts: '2026-06-27T10:10:00.000Z', role: 'tool', kind: 'tool_call', text: 'Ran the test suite', refs: ['src/x.mjs'] };
  const record = buildIndexRecord({ sessionId: 's1', event, outputPath: 'exports/s1-context.md' });

  assert.equal(record.eventId, 's1#3');
  assert.equal(record.path, 'exports/s1-context.md');
  assert.equal(record.level, 'L1');
  assert.equal(record.text_summary, 'Ran the test suite');
});

test('buildIndexRecord uses ? for missing seq', () => {
  const event = { ts: '2026-06-27T10:00:00.000Z', role: 'user', kind: 'prompt', text: 'hello', refs: [] };
  const record = buildIndexRecord({ sessionId: 's2', event });
  assert.equal(record.eventId, 's2#?');
});

test('buildIndexRecord truncates text_summary to 120 chars', () => {
  const longText = 'A'.repeat(200);
  const event = { seq: 1, kind: 'prompt', text: longText };
  const record = buildIndexRecord({ sessionId: 's3', event });

  assert.equal(record.text_summary.length, 120);
  assert.equal(record.text_summary, 'A'.repeat(117) + '...');
});

test('buildIndexRecord does not truncate short text', () => {
  const event = { seq: 1, kind: 'response', text: 'Short message' };
  const record = buildIndexRecord({ sessionId: 's4', event });
  assert.equal(record.text_summary, 'Short message');
});

test('buildIndexRecord handles missing text gracefully', () => {
  const event = { seq: 1, kind: 'prompt', text: undefined };
  const record = buildIndexRecord({ sessionId: 's5', event });
  assert.equal(record.text_summary, '');
});

test('buildIndexRecord throws on missing sessionId', () => {
  assert.throws(() => buildIndexRecord({ event: { kind: 'prompt', text: 'x' } }), /sessionId/);
});

test('buildIndexRecord throws on missing event', () => {
  assert.throws(() => buildIndexRecord({ sessionId: 's1' }), /event/);
});

// ─── writeIndex ─────────────────────────────────────────────────────────────

test('writeIndex writes valid JSONL file', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'pack-index-test-'));
  const sessionId = 'idx-session-001';
  const events = makeSampleEvents();
  const outputPath = `exports/${sessionId}-context.md`;

  const { indexPath, records } = await writeIndex(outputDir, sessionId, events, { outputPath });

  assert.equal(indexPath, path.resolve(outputDir, `${sessionId}-context.index.jsonl`));
  assert.equal(records.length, 5);

  const raw = await readFile(indexPath, 'utf8');
  const lines = raw.trim().split('\n');
  assert.equal(lines.length, 5);

  // Each line is valid JSON
  for (const line of lines) {
    const parsed = JSON.parse(line);
    assert.equal(typeof parsed.eventId, 'string');
    assert.equal(typeof parsed.path, 'string');
    assert.ok(['L0', 'L1', 'L2'].includes(parsed.level));
    assert.equal(typeof parsed.text_summary, 'string');
  }

  // Spot-check first record
  const first = JSON.parse(lines[0]);
  assert.equal(first.eventId, `${sessionId}#1`);
  assert.equal(first.level, 'L0'); // prompt → L0
  assert.equal(first.text_summary, 'Start implementing feature X');

  await rm(outputDir, { recursive: true, force: true });
});

test('writeIndex level classification is correct for each event kind', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'pack-index-level-'));
  const sessionId = 'level-test';
  const events = makeSampleEvents();

  const { records } = await writeIndex(outputDir, sessionId, events);

  // Event 1: kind=prompt → L0
  assert.equal(records[0].level, 'L0');
  // Event 2: kind=response → L0
  assert.equal(records[1].level, 'L0');
  // Event 3: kind=tool_call → L1
  assert.equal(records[2].level, 'L1');
  // Event 4: kind=error → L1
  assert.equal(records[3].level, 'L1');
  // Event 5: kind=note → L2
  assert.equal(records[4].level, 'L2');

  await rm(outputDir, { recursive: true, force: true });
});

test('writeIndex truncates long text_summary in JSONL output', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'pack-index-trunc-'));
  const sessionId = 'trunc-test';
  const longText = 'B'.repeat(250);
  const events = [{ seq: 1, kind: 'prompt', text: longText, refs: [] }];

  const { indexPath } = await writeIndex(outputDir, sessionId, events);
  const raw = await readFile(indexPath, 'utf8');
  const parsed = JSON.parse(raw.trim());

  assert.equal(parsed.text_summary.length, 120);
  assert.equal(parsed.text_summary, 'B'.repeat(117) + '...');

  await rm(outputDir, { recursive: true, force: true });
});

test('writeIndex handles empty events array', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'pack-index-empty-'));
  const sessionId = 'empty-test';

  const { indexPath, records } = await writeIndex(outputDir, sessionId, []);
  assert.equal(records.length, 0);

  const raw = await readFile(indexPath, 'utf8');
  assert.equal(raw.trim(), '');

  await rm(outputDir, { recursive: true, force: true });
});

test('writeIndex throws on non-array events', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pack-index-bad-'));
  await assert.rejects(
    () => writeIndex(dir, 's1', 'not-array'),
    /array/
  );
  await rm(dir, { recursive: true, force: true });
});

test('writeIndex creates parent directories if missing', async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), 'pack-index-nested-'));
  const nestedDir = path.join(baseDir, 'deep', 'nested', 'exports');
  const sessionId = 'nested-idx';
  const events = [{ seq: 1, kind: 'prompt', text: 'nested test', refs: [] }];

  const { indexPath } = await writeIndex(nestedDir, sessionId, events);
  const raw = await readFile(indexPath, 'utf8');
  const parsed = JSON.parse(raw.trim());
  assert.equal(parsed.eventId, `${sessionId}#1`);

  await rm(baseDir, { recursive: true, force: true });
});

// ─── End-to-end: manifest + index together ──────────────────────────────────

test('manifest and index can be written alongside a Markdown export', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'pack-e2e-'));
  const sessionId = 'e2e-session-001';
  const content = makeSampleMarkdown(sessionId);
  const sources = makeSampleSources();
  const events = makeSampleEvents();

  // 1. Write the markdown file (as context:pack would)
  const mdPath = path.join(outputDir, `${sessionId}-context.md`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(mdPath, content, 'utf8');

  // 2. Build + write manifest
  const manifest = buildManifest({ sessionId, sources, content });
  const manifestPath = await writeManifest(outputDir, sessionId, manifest);

  // 3. Build + write index
  const { indexPath } = await writeIndex(outputDir, sessionId, events, { outputPath: `${sessionId}-context.md` });

  // Verify manifest
  const manifestRaw = await readFile(manifestPath, 'utf8');
  const manifestParsed = JSON.parse(manifestRaw);
  assert.equal(manifestParsed.format_version, 1);
  assert.equal(manifestParsed.session_id, sessionId);
  assert.equal(manifestParsed.content_sha256, computeSha256(content));

  // Verify index
  const indexRaw = await readFile(indexPath, 'utf8');
  const indexLines = indexRaw.trim().split('\n');
  assert.equal(indexLines.length, events.length);
  for (const line of indexLines) {
    const rec = JSON.parse(line);
    assert.ok(rec.eventId);
    assert.ok(['L0', 'L1', 'L2'].includes(rec.level));
  }

  // Verify sha256 matches the actual file content
  const mdContent = await readFile(mdPath, 'utf8');
  assert.equal(manifestParsed.content_sha256, computeSha256(mdContent));

  await rm(outputDir, { recursive: true, force: true });
});
