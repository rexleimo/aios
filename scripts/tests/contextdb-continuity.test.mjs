import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  extractTouchedFilesFromText,
  readContinuitySummary,
  writeContinuitySummary,
} from '../lib/contextdb/continuity.mjs';

test('writeContinuitySummary writes markdown and json artifacts', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-continuity-'));
  const sessionId = 'continuity-session';

  try {
    const result = await writeContinuitySummary({
      workspaceRoot,
      sessionId,
      intent: 'continue implementation',
      summary: 'Implemented the parser and still need focused tests.',
      touchedFiles: ['scripts/ctx-agent-core.mjs', 'scripts/lib/contextdb/continuity.mjs'],
      nextActions: ['run focused tests', 'update docs'],
      updatedAt: '2026-04-25T00:00:00.000Z',
    });

    assert.equal(result.sessionId, sessionId);
    assert.equal(result.markdownPath.endsWith('continuity-summary.md'), true);
    assert.equal(result.jsonPath.endsWith('continuity.json'), true);

    const markdown = await readFile(result.markdownPath, 'utf8');
    assert.match(markdown, /# Continuity Summary/);
    assert.match(markdown, /Implemented the parser/);
    assert.match(markdown, /scripts\/ctx-agent-core\.mjs/);

    const json = JSON.parse(await readFile(result.jsonPath, 'utf8'));
    assert.equal(json.schemaVersion, 1);
    assert.equal(json.intent, 'continue implementation');
    assert.deepEqual(json.nextActions, ['run focused tests', 'update docs']);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('readContinuitySummary exposes compact continuity artifact data', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-continuity-read-'));
  const sessionId = 'continuity-session';

  try {
    await writeContinuitySummary({
      workspaceRoot,
      sessionId,
      intent: 'continue implementation',
      summary: 'Carry forward PR-3 state.',
      touchedFiles: ['scripts/lib/contextdb/continuity.mjs'],
      nextActions: ['wire explicit resume artifact'],
      updatedAt: '2026-04-25T00:00:00.000Z',
    });

    const continuity = await readContinuitySummary({ workspaceRoot, sessionId });
    assert.equal(continuity?.sessionId, sessionId);
    assert.equal(continuity?.summary, 'Carry forward PR-3 state.');
    assert.deepEqual(continuity?.nextActions, ['wire explicit resume artifact']);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('extractTouchedFilesFromText canonicalizes common path forms', () => {
  const workspaceRoot = '/workspace/project';
  const touched = extractTouchedFilesFromText(
    { workspaceRoot },
    'Updated /workspace/project/scripts/ctx-agent-core.mjs and README.md.',
    'diff --git a/scripts/lib/contextdb/continuity.mjs b/scripts/lib/contextdb/continuity.mjs',
    'Also checked package.json and mcp-server/src/contextdb/core.ts.'
  );

  assert.deepEqual(touched, [
    'scripts/ctx-agent-core.mjs',
    'README.md',
    'scripts/lib/contextdb/continuity.mjs',
    'package.json',
    'mcp-server/src/contextdb/core.ts',
  ]);
});
