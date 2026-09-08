import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { recordAutomaticMemory } from '../lib/memo/autopilot.mjs';
import { appendMemoEvent } from '../lib/memo/storage.mjs';
import {
  normalizeExtractionConfidence,
  normalizeExtractionDate,
  normalizeExtractionEntry,
  normalizeExtractionEntities,
  normalizeExtractionEvidenceRef,
  normalizeExtractionFact,
} from '../lib/memo/storage/extraction.mjs';

const cliPath = path.resolve(process.cwd(), 'scripts', 'aios.mjs');

async function withTempRoot(prefix, fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

function runMemo(rootDir, args, env = {}) {
  return spawnSync(process.execPath, [cliPath, 'memo', ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, AIOS_AGENT_ID: '', ...env },
  });
}

function throwsCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code, `expected throws with code ${code}`);
}

test('relative dates are rejected so writers anchor to a calendar date', () => {
  assert.equal(normalizeExtractionDate('2026-09-06'), '2026-09-06');
  assert.equal(normalizeExtractionDate('2026-09-06T12:00:00.000Z'), '2026-09-06');
  assert.equal(normalizeExtractionDate(''), '');
  for (const relative of ['昨天', 'yesterday', '上周', 'next Friday', '刚才']) {
    assert.throws(() => normalizeExtractionDate(relative), /absolute ISO date/u, `relative date must be rejected: ${relative}`);
  }
  throwsCode(() => normalizeExtractionDate('2026-13-45'), 'extraction:bad-date');
  throwsCode(() => normalizeExtractionDate('', { required: true }), 'extraction:missing-date');
});

test('confidence and evidence_ref accept only well-formed values', () => {
  assert.equal(normalizeExtractionConfidence('high'), 'high');
  assert.equal(normalizeExtractionConfidence('Medium'), 'medium');
  assert.equal(normalizeExtractionConfidence(''), 'medium');
  throwsCode(() => normalizeExtractionConfidence('certain'), 'extraction:bad-confidence');
  assert.equal(normalizeExtractionEvidenceRef('scripts/lib/specs/orchestrator-agents.json:272'), 'scripts/lib/specs/orchestrator-agents.json:272');
  assert.equal(normalizeExtractionEvidenceRef(''), '');
  throwsCode(() => normalizeExtractionEvidenceRef(['a', 'b']), 'extraction:single-evidence-only');
  throwsCode(() => normalizeExtractionEvidenceRef('', { required: true }), 'extraction:missing-evidence');
  throwsCode(() => normalizeExtractionFact('   '), 'extraction:missing-fact');
});

test('entities normalize to a bounded unique list', () => {
  assert.deepEqual(normalizeExtractionEntities(['a.mjs', ' a.mjs ', '', 'b.mjs']), ['a.mjs', 'b.mjs']);
  assert.deepEqual(normalizeExtractionEntities('solo.mjs'), ['solo.mjs']);
  assert.deepEqual(normalizeExtractionEntities([]), []);
  assert.equal(normalizeExtractionEntities(Array.from({ length: 30 }, (_, index) => `e${index}.mjs`)).length, 24);
});

test('a full five-element entry normalizes cleanly', () => {
  const entry = normalizeExtractionEntry({
    fact: 'CRLF checkout artifacts fixed by eol=lf',
    entities: ['drift-guard', '.gitattributes'],
    date: '2026-09-06',
    evidenceRef: 'scripts/lib/specs/orchestrator-agents.json:272',
    confidence: 'high',
  });
  assert.equal(entry.text, 'CRLF checkout artifacts fixed by eol=lf');
  assert.deepEqual(entry.entities, ['drift-guard', '.gitattributes']);
  assert.equal(entry.date, '2026-09-06');
  assert.equal(entry.evidenceRef, 'scripts/lib/specs/orchestrator-agents.json:272');
  assert.equal(entry.confidence, 'high');
});

test('a model-declared verified automatic memory lands as candidate with five elements', async () => {
  await withTempRoot('memo-extraction-auto-', async (rootDir) => {
    const result = await recordAutomaticMemory({
      workspaceRoot: rootDir,
      sessionId: 'session-x',
      agent: 'agent-x',
      turnId: 'turn-1',
      prompt: 'Fix the checkout validation regression in order-service',
      response: 'Fixed by tightening input checks. Tests pass. <!--memory: verified=yes, conclusion=Input checks tightened -->',
      outcome: 'success',
      refs: ['scripts/lib/checkout.mjs'],
      verified: true,
      declaredConclusion: 'Input checks tightened',
      sourceRef: 'contextdb:session-x#turn-1',
    });
    assert.equal(result.status, 'saved');
    assert.equal(result.claimStatus, 'candidate');
    assert.equal(result.scope, 'project_shared');
    const stored = JSON.parse(await readFile(path.join(rootDir, '.aios', 'memo', 'file', 'events.jsonl'), 'utf8'));
    assert.equal(stored.claimStatus, 'candidate');
    assert.ok(Array.isArray(stored.entities) && stored.entities.includes('scripts/lib/checkout.mjs'));
    assert.equal(stored.evidenceRef, 'contextdb:session-x#turn-1');
    assert.equal(stored.confidence, 'medium');
  });
});

test('appended entries store five-element fields only when provided', async () => {
  await withTempRoot('memo-extraction-append-', async (rootDir) => {
    const plain = await appendMemoEvent({ workspaceRoot: rootDir, storage: 'file', text: 'plain entry without extraction fields' });
    assert.equal(plain.claimStatus, 'verified');
    assert.ok(!Object.hasOwn(plain, 'entities') && !Object.hasOwn(plain, 'confidence') && !Object.hasOwn(plain, 'evidenceRef'));

    const rich = await appendMemoEvent({
      workspaceRoot: rootDir,
      storage: 'file',
      text: 'rich entry with extraction fields',
      entities: ['a.mjs', 'a.mjs'],
      confidence: 'high',
      evidenceRef: 'a.mjs:12',
    });
    assert.deepEqual(rich.entities, ['a.mjs']);
    assert.equal(rich.confidence, 'high');
    assert.equal(rich.evidenceRef, 'a.mjs:12');

    await assert.rejects(
      () => appendMemoEvent({ workspaceRoot: rootDir, storage: 'file', text: 'bad confidence entry', confidence: 'certain' }),
      /must be one of: high, medium/u,
    );
  });
});

test('memo add carries five-element flags and rejects relative dates', async () => {
  await withTempRoot('memo-extraction-cli-', async (rootDir) => {
    const add = runMemo(rootDir, [
      'add', 'cli five element entry',
      '--entities', 'a.mjs,b.mjs',
      '--date', '2026-09-06',
      '--evidence-ref', 'a.mjs:12',
      '--confidence', 'high',
    ]);
    assert.equal(add.status, 0, add.stderr || add.stdout);
    const stored = JSON.parse(await readFile(path.join(rootDir, '.aios', 'memo', 'file', 'events.jsonl'), 'utf8'));
    assert.deepEqual(stored.entities, ['a.mjs', 'b.mjs']);
    assert.equal(stored.evidenceRef, 'a.mjs:12');
    assert.equal(stored.confidence, 'high');
    assert.ok(String(stored.validAt).startsWith('2026-09-06'));

    const relative = runMemo(rootDir, ['add', 'relative date entry', '--date', '昨天']);
    assert.notEqual(relative.status, 0, relative.stdout);
    assert.match(relative.stderr || relative.stdout, /absolute ISO date/u);

    const badConfidence = runMemo(rootDir, ['add', 'bad confidence entry', '--confidence', 'certain']);
    assert.notEqual(badConfidence.status, 0, badConfidence.stdout);
  });
});
