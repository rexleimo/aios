import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveMemoRoot } from '../lib/aios/state-root.mjs';
import { runDream, readDreamArchivedEventIds } from '../lib/lifecycle/dream/index.mjs';
import { appendMemoEvent, listMemoEvents, searchMemoEvents, setActiveMemoStorage } from '../lib/memo/storage.mjs';

const ARCHIVED_TEXT = 'archive index secret memo text';
const RECEIPT_SECRET = 'archive index receipt secret';

async function withRoot(fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'memo-archive-index-'));
  try {
    await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

function receipt(proposalId, action, at) {
  return {
    kind: 'memo.dream-governance-receipt',
    proposalId,
    action,
    decision: 'ALLOW',
    at,
    reason: RECEIPT_SECRET,
    principal: { principalId: 'fixture-principal' },
  };
}

async function appendGovernanceReceipt(governancePath, proposalId, action, at) {
  await appendFile(governancePath, `${JSON.stringify(receipt(proposalId, action, at))}\n`, 'utf8');
}

async function createArchivedFixture(rootDir, storage = 'file', env = process.env) {
  await setActiveMemoStorage(rootDir, storage);
  await appendMemoEvent({ workspaceRoot: rootDir, storage, text: ARCHIVED_TEXT });
  await appendMemoEvent({ workspaceRoot: rootDir, storage, text: ARCHIVED_TEXT });
  const applied = await runDream({ rootDir, mode: 'apply', spaces: ['default'], env });
  const proposal = JSON.parse(await readFile(applied.proposalPath, 'utf8'));
  const targetId = proposal.actions[0].eventId;
  const governancePath = path.join(resolveMemoRoot(rootDir, { env }), 'dream', 'governance', 'events.jsonl');
  await mkdir(path.dirname(governancePath), { recursive: true });
  await appendGovernanceReceipt(governancePath, proposal.proposalId, 'approve', '2026-07-29T00:00:00.000Z');
  await appendGovernanceReceipt(governancePath, proposal.proposalId, 'archive', '2026-07-29T00:00:01.000Z');
  return {
    targetId,
    proposalId: proposal.proposalId,
    proposalPath: applied.proposalPath,
    governancePath,
    indexPath: path.join(resolveMemoRoot(rootDir, { env }), 'dream', 'derived', 'archive-index.json'),
  };
}

async function assertArchiveVisibility(rootDir, storage, targetId) {
  const defaultRows = await listMemoEvents(rootDir, { storage, limit: 20 });
  const archivedRows = await listMemoEvents(rootDir, { storage, limit: 20, includeArchived: true });
  assert.equal(defaultRows.some((event) => event.eventId === targetId), false);
  assert.equal(archivedRows.some((event) => event.eventId === targetId), true);

  const defaultSearch = await searchMemoEvents(rootDir, { storage, query: ARCHIVED_TEXT, limit: 20 });
  const archivedSearch = await searchMemoEvents(rootDir, {
    storage,
    query: ARCHIVED_TEXT,
    limit: 20,
    includeArchived: true,
  });
  assert.equal(defaultSearch.some((event) => event.eventId === targetId), false);
  assert.equal(archivedSearch.some((event) => event.eventId === targetId), true);
}

async function readIndex(indexPath) {
  return JSON.parse(await readFile(indexPath, 'utf8'));
}

test('archive-filtering recall materializes a durable index without changing canonical visibility', async () => {
  await withRoot(async (rootDir) => {
    const { targetId, indexPath } = await createArchivedFixture(rootDir);
    const archivedIds = await readDreamArchivedEventIds({ rootDir });
    assert.equal(archivedIds.has(targetId), true);
    await assertArchiveVisibility(rootDir, 'file', targetId);

    const index = await readIndex(indexPath);
    assert.equal(index.archivedEventIds.includes(targetId), true);
    assert.equal(JSON.stringify(index).includes(ARCHIVED_TEXT), false);
    assert.equal(JSON.stringify(index).includes(RECEIPT_SECRET), false);
  });
});

test('archive index preserves file and split recall behavior', async () => {
  for (const storage of ['file', 'split']) {
    await withRoot(async (rootDir) => {
      const { targetId } = await createArchivedFixture(rootDir, storage);
      const archivedIds = await readDreamArchivedEventIds({ rootDir });
      assert.equal(archivedIds.has(targetId), true);
      await assertArchiveVisibility(rootDir, storage, targetId);
    });
  }
});

test('corrupt archive index rebuilds before recall filters memo events', async () => {
  await withRoot(async (rootDir) => {
    const { targetId, indexPath } = await createArchivedFixture(rootDir);
    await readDreamArchivedEventIds({ rootDir });
    await writeFile(indexPath, '{not-json\n', 'utf8');

    const rebuiltIds = await readDreamArchivedEventIds({ rootDir });
    assert.equal(rebuiltIds.has(targetId), true);
    await assertArchiveVisibility(rootDir, 'file', targetId);
    const rebuilt = await readIndex(indexPath);
    assert.equal(rebuilt.archivedEventIds.includes(targetId), true);
  });
});

test('archive source-token mismatch rebuilds before applying stale hidden IDs', async () => {
  await withRoot(async (rootDir) => {
    const { targetId, proposalId, governancePath, indexPath } = await createArchivedFixture(rootDir);
    await readDreamArchivedEventIds({ rootDir });
    const before = await readIndex(indexPath);

    await appendGovernanceReceipt(governancePath, proposalId, 'restore', '2026-07-29T00:00:02.000Z');
    const rebuiltIds = await readDreamArchivedEventIds({ rootDir });
    assert.equal(rebuiltIds.has(targetId), false);
    const visible = await listMemoEvents(rootDir, { storage: 'file', limit: 20 });
    assert.equal(visible.some((event) => event.eventId === targetId), true);

    const after = await readIndex(indexPath);
    assert.notDeepEqual(after.sourceToken, before.sourceToken);
    assert.equal(after.archivedEventIds.includes(targetId), false);
  });
});

test('concurrent first archive reads materialize one valid derived index', async () => {
  await withRoot(async (rootDir) => {
    const { targetId, indexPath } = await createArchivedFixture(rootDir);
    const results = await Promise.all(Array.from({ length: 12 }, () => readDreamArchivedEventIds({ rootDir })));
    assert.equal(results.every((ids) => ids.has(targetId)), true);
    const index = await readIndex(indexPath);
    assert.equal(index.archivedEventIds.includes(targetId), true);
  });
});

test('archive index follows a custom project state root', async () => {
  await withRoot(async (rootDir) => {
    const previous = process.env.AIOS_PROJECT_STATE_DIR;
    process.env.AIOS_PROJECT_STATE_DIR = 'custom-state';
    try {
      const { targetId, indexPath } = await createArchivedFixture(rootDir);
      const archivedIds = await readDreamArchivedEventIds({ rootDir });
      assert.equal(archivedIds.has(targetId), true);
      await assertArchiveVisibility(rootDir, 'file', targetId);
      await readFile(indexPath, 'utf8');
      await assert.rejects(
        readFile(path.join(rootDir, '.aios', 'memo', 'dream', 'derived', 'archive-index.json'), 'utf8'),
        { code: 'ENOENT' },
      );
    } finally {
      if (previous === undefined) delete process.env.AIOS_PROJECT_STATE_DIR;
      else process.env.AIOS_PROJECT_STATE_DIR = previous;
    }
  });
});

test('archive index rebuilds when a proposal is rewritten in place', async () => {
  await withRoot(async (rootDir) => {
    const { targetId, proposalPath, indexPath } = await createArchivedFixture(rootDir);
    const initialIds = await readDreamArchivedEventIds({ rootDir });
    assert.equal(initialIds.has(targetId), true);
    const before = await readIndex(indexPath);

    const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
    proposal.actions = [];
    await writeFile(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`, 'utf8');

    const rebuiltIds = await readDreamArchivedEventIds({ rootDir });
    assert.equal(rebuiltIds.has(targetId), false);
    const after = await readIndex(indexPath);
    assert.notDeepEqual(after.sourceToken, before.sourceToken);
  });
});
