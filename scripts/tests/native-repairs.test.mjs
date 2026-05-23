import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createNativeRepairSession,
  finalizeNativeRepairSession,
  getNativeRepair,
  listNativeRepairs,
  rollbackNativeRepair,
} from '../lib/native/repairs.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function writeNativeManifest(rootDir) {
  await writeJson(path.join(rootDir, 'config', 'native-sync-manifest.json'), {
    schemaVersion: 1,
    managedBy: 'aios',
    markers: {
      markdownBegin: '<!-- AIOS NATIVE BEGIN -->',
      markdownEnd: '<!-- AIOS NATIVE END -->',
    },
    clients: {
      codex: {
        tier: 'deep',
        metadataRoot: '.codex',
        outputs: ['AGENTS.md', '.codex/agents', '.codex/skills'],
      },
      claude: {
        tier: 'deep',
        metadataRoot: '.claude',
        outputs: ['CLAUDE.md', '.claude/settings.local.json', '.claude/agents', '.claude/skills'],
      },
      gemini: {
        tier: 'compatibility',
        metadataRoot: '.gemini',
        outputs: ['GEMINI.md', '.gemini/skills'],
      },
      opencode: {
        tier: 'compatibility',
        metadataRoot: '.opencode',
        outputs: ['AGENTS.md', '.opencode/skills'],
      },
    },
  });
}

test('native repairs list and show expose repair id and changed files', async () => {
  const rootDir = await makeTemp('aios-native-repairs-list-root-');
  await writeNativeManifest(rootDir);
  await writeFile(path.join(rootDir, 'AGENTS.md'), 'before\n', 'utf8');

  const session = await createNativeRepairSession({
    rootDir,
    clients: ['codex'],
    reason: 'test-repair-list-show',
  });
  await writeFile(path.join(rootDir, 'AGENTS.md'), 'after\n', 'utf8');
  await finalizeNativeRepairSession({
    rootDir,
    session,
    status: 'completed',
  });

  const listed = await listNativeRepairs({ rootDir, limit: 10 });
  assert.equal(listed.ok, true);
  assert.equal(listed.repairs.length, 1);
  assert.equal(listed.repairs[0].repairId, session.repairId);
  assert.ok(listed.repairs[0].summary.totalChanged > 0);

  const detail = await getNativeRepair({
    rootDir,
    repairId: session.repairId,
  });
  assert.equal(detail.ok, true);
  assert.equal(detail.repairId, session.repairId);
  assert.equal(detail.rollbackCount, 0);
  assert.ok(detail.changedEntries.some((entry) => entry.path === 'AGENTS.md'));
});

test('native repairs show rollback status after rollback', async () => {
  const rootDir = await makeTemp('aios-native-repairs-rollback-root-');
  await writeNativeManifest(rootDir);
  await writeFile(path.join(rootDir, 'AGENTS.md'), 'before\n', 'utf8');

  const session = await createNativeRepairSession({
    rootDir,
    clients: ['codex'],
    reason: 'test-repair-rollback',
  });
  await writeFile(path.join(rootDir, 'AGENTS.md'), 'after\n', 'utf8');
  await finalizeNativeRepairSession({
    rootDir,
    session,
    status: 'completed',
  });

  const rollback = await rollbackNativeRepair({
    rootDir,
    repairId: session.repairId,
  });
  assert.equal(rollback.ok, true);
  assert.equal(await readFile(path.join(rootDir, 'AGENTS.md'), 'utf8'), 'before\n');

  const detail = await getNativeRepair({
    rootDir,
    repairId: session.repairId,
  });
  assert.equal(detail.rollbackCount, 1);
  assert.match(detail.lastRolledBackAt, /T/);
});

test('native repairs list returns empty when no history exists', async () => {
  const rootDir = await makeTemp('aios-native-repairs-empty-root-');
  const listed = await listNativeRepairs({ rootDir, limit: 5 });
  assert.equal(listed.ok, true);
  assert.equal(Array.isArray(listed.repairs), true);
  assert.equal(listed.repairs.length, 0);
});
