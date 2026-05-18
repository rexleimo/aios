import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, 'scripts', 'aios.mjs');

function runMemo(workspaceRoot, args, options = {}) {
  return spawnSync('node', [cliPath, 'memo', ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...options.env,
    },
  });
}

function parseJsonLines(raw) {
  return String(raw || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function withWorkspace(prefix, fn) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await fn(workspaceRoot);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

test('aios memo add writes canonical file storage and legacy mirror metadata', async () => {
  await withWorkspace('aios-memo-cli-add-', async (workspaceRoot) => {
    const result = runMemo(workspaceRoot, ['add', 'ship canonical memo storage #ops']);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Memo added/i);

    const filePath = path.join(workspaceRoot, '.aios', 'memo', 'file', 'events.jsonl');
    const fileRecords = parseJsonLines(await fs.readFile(filePath, 'utf8'));
    assert.equal(fileRecords.length, 1);
    assert.equal(fileRecords[0].space, 'default');
    assert.equal(fileRecords[0].text, 'ship canonical memo storage #ops');
    assert.deepEqual(fileRecords[0].refs, ['ops']);

    const legacyPath = path.join(
      workspaceRoot,
      '.aios',
      'context-db',
      'sessions',
      'workspace-memory--default',
      'l2-events.jsonl'
    );
    const legacyRecords = parseJsonLines(await fs.readFile(legacyPath, 'utf8'));
    assert.equal(legacyRecords.length, 1);
    assert.equal(legacyRecords[0].kind, 'memo');
    assert.equal(legacyRecords[0].turn?.turnType, 'side');
    assert.equal(legacyRecords[0].turn?.environment, 'memo');
    assert.equal(legacyRecords[0].turn?.hindsightStatus, 'na');
    assert.equal(legacyRecords[0].turn?.outcome, 'success');
  });
});

test('aios memo pin writes active storage and mirrors pinned.md to .aios ContextDB path', async () => {
  await withWorkspace('aios-memo-cli-pin-', async (workspaceRoot) => {
    const set = runMemo(workspaceRoot, ['pin', 'set', 'Pinned canonical note']);
    assert.equal(set.status, 0, set.stderr || set.stdout);

    const add = runMemo(workspaceRoot, ['pin', 'add', 'Second pinned note']);
    assert.equal(add.status, 0, add.stderr || add.stdout);

    const canonicalPinned = await fs.readFile(
      path.join(workspaceRoot, '.aios', 'memo', 'file', 'pinned', 'default.md'),
      'utf8'
    );
    assert.match(canonicalPinned, /Pinned canonical note/);
    assert.match(canonicalPinned, /Second pinned note/);

    const legacyPinned = await fs.readFile(
      path.join(
        workspaceRoot,
        '.aios',
        'context-db',
        'sessions',
        'workspace-memory--default',
        'pinned.md'
      ),
      'utf8'
    );
    assert.equal(legacyPinned, canonicalPinned);

    const show = runMemo(workspaceRoot, ['pin', 'show']);
    assert.equal(show.status, 0, show.stderr || show.stdout);
    assert.match(show.stdout, /Pinned canonical note/);
    assert.match(show.stdout, /Second pinned note/);
  });
});

test('aios memo storage use split converts file records and search reads active storage', async () => {
  await withWorkspace('aios-memo-cli-split-', async (workspaceRoot) => {
    const add = runMemo(workspaceRoot, ['add', 'portable memo for split storage #git']);
    assert.equal(add.status, 0, add.stderr || add.stdout);

    const useSplit = runMemo(workspaceRoot, ['storage', 'use', 'split']);
    assert.equal(useSplit.status, 0, useSplit.stderr || useSplit.stdout);
    assert.match(useSplit.stdout, /split/i);
    assert.match(useSplit.stdout, /Migrated records: 1/);
    assert.match(useSplit.stdout, /Rebuilt records: 1/);

    const splitEventsDir = path.join(workspaceRoot, '.aios', 'memo', 'split', 'events', 'default');
    const splitFiles = (await fs.readdir(splitEventsDir)).filter((name) => name.endsWith('.json'));
    assert.equal(splitFiles.length, 1);

    const search = runMemo(workspaceRoot, ['search', 'portable', '--limit', '5']);
    assert.equal(search.status, 0, search.stderr || search.stdout);
    assert.match(search.stdout, /portable memo for split storage/);
    assert.match(search.stdout, /#git/);
  });
});

test('aios memo storage doctor prints actionable stale-derived detail', async () => {
  await withWorkspace('aios-memo-cli-doctor-detail-', async (workspaceRoot) => {
    const add = runMemo(workspaceRoot, ['add', 'record before initial rebuild']);
    assert.equal(add.status, 0, add.stderr || add.stdout);

    const rebuild = runMemo(workspaceRoot, ['storage', 'rebuild']);
    assert.equal(rebuild.status, 0, rebuild.stderr || rebuild.stdout);

    const secondAdd = runMemo(workspaceRoot, ['add', 'record after rebuild makes derived stale']);
    assert.equal(secondAdd.status, 0, secondAdd.stderr || secondAdd.stdout);

    const doctor = runMemo(workspaceRoot, ['storage', 'doctor']);
    assert.notEqual(doctor.status, 0);
    assert.match(doctor.stdout, /derived-manifest: error - derived docs are stale/);
  });
});

test('aios memo storage rebuild preserves canonical source event bytes', async () => {
  await withWorkspace('aios-memo-cli-rebuild-', async (workspaceRoot) => {
    const add = runMemo(workspaceRoot, ['add', 'rebuild should not rewrite source bytes']);
    assert.equal(add.status, 0, add.stderr || add.stdout);

    const filePath = path.join(workspaceRoot, '.aios', 'memo', 'file', 'events.jsonl');
    const before = await fs.readFile(filePath, 'utf8');

    const rebuild = runMemo(workspaceRoot, ['storage', 'rebuild']);
    assert.equal(rebuild.status, 0, rebuild.stderr || rebuild.stdout);
    assert.match(rebuild.stdout, /rebuild/i);

    const after = await fs.readFile(filePath, 'utf8');
    assert.equal(after, before);
  });
});

test('aios memo storage doctor exits non-zero for malformed active file storage', async () => {
  await withWorkspace('aios-memo-cli-doctor-', async (workspaceRoot) => {
    const add = runMemo(workspaceRoot, ['add', 'healthy record before corruption']);
    assert.equal(add.status, 0, add.stderr || add.stdout);

    await fs.appendFile(
      path.join(workspaceRoot, '.aios', 'memo', 'file', 'events.jsonl'),
      '{bad-json\n',
      'utf8'
    );

    const doctor = runMemo(workspaceRoot, ['storage', 'doctor']);
    assert.notEqual(doctor.status, 0);
    assert.match(`${doctor.stdout}\n${doctor.stderr}`, /file-jsonl|malformed|error/i);
  });
});

test('aios memo recall emits readable digest from active storage records', async () => {
  await withWorkspace('aios-memo-cli-recall-', async (workspaceRoot) => {
    const add = runMemo(workspaceRoot, ['add', 'remember active storage recall evidence']);
    assert.equal(add.status, 0, add.stderr || add.stdout);

    const recall = runMemo(workspaceRoot, ['recall', 'storage', '--limit', '2', '--highlight-limit', '2']);
    assert.equal(recall.status, 0, recall.stderr || recall.stdout);
    assert.match(recall.stdout, /workspace-memory--default/);
    assert.match(recall.stdout, /score=/);
    assert.match(recall.stdout, /highlights:/);
    assert.match(recall.stdout, /active storage recall evidence/);
  });
});
