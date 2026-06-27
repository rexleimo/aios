import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendMemoEvent,
  listMemoEvents,
  searchMemoEvents,
} from '../lib/memo/storage.mjs';

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, 'scripts', 'aios.mjs');

async function withTempRoot(prefix, fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function runMemo(workspaceRoot, args, { env: extraEnv = null } = {}) {
  return spawnSync(process.execPath, [cliPath, 'memo', ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
}

function parseJsonLines(raw) {
  return String(raw || '').trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

test('memo storage defaults records to project_shared and keeps them visible across agents', async () => {
  await withTempRoot('memo-scope-storage-', async (root) => {
    const shared = await appendMemoEvent({ workspaceRoot: root, storage: 'file', space: 'default', text: 'global project decision', refs: [] });
    const privateRecord = await appendMemoEvent({ workspaceRoot: root, storage: 'file', space: 'default', text: 'codex scratch detail', refs: [], scope: 'agent_private', agent: 'codex-cli' });

    assert.equal(shared.scope, 'project_shared');
    assert.equal(shared.agent, '');
    assert.equal(privateRecord.scope, 'agent_private');
    assert.equal(privateRecord.agent, 'codex-cli');

    const claudeRows = await searchMemoEvents(root, { storage: 'file', space: 'default', query: '', agent: 'claude-code', limit: 10 });
    assert.deepEqual(claudeRows.map((row) => row.text), ['global project decision']);

    const codexRows = await listMemoEvents(root, { storage: 'file', space: 'default', agent: 'codex-cli', limit: 10 });
    assert.deepEqual(codexRows.map((row) => row.text), ['codex scratch detail', 'global project decision']);
  });
});

test('aios memo add accepts --scope and --agent without hiding shared defaults', async () => {
  await withTempRoot('memo-scope-cli-', async (workspaceRoot) => {
    const shared = runMemo(workspaceRoot, ['add', 'shared rollout memory']);
    assert.equal(shared.status, 0, shared.stderr || shared.stdout);

    const privateAdd = runMemo(workspaceRoot, ['add', 'private codex scratch', '--scope', 'agent_private', '--agent', 'codex-cli']);
    assert.equal(privateAdd.status, 0, privateAdd.stderr || privateAdd.stdout);

    const records = parseJsonLines(await fs.readFile(path.join(workspaceRoot, '.aios', 'memo', 'file', 'events.jsonl'), 'utf8'));
    assert.equal(records[0].scope, 'project_shared');
    assert.equal(records[1].scope, 'agent_private');
    assert.equal(records[1].agent, 'codex-cli');

    const claudeList = runMemo(workspaceRoot, ['list', '--agent', 'claude-code']);
    assert.equal(claudeList.status, 0, claudeList.stderr || claudeList.stdout);
    assert.match(claudeList.stdout, /shared rollout memory/);
    assert.doesNotMatch(claudeList.stdout, /private codex scratch/);
  });
});

test('AIOS_AGENT_ID env var defaults memo add to that agent namespace', async () => {
  await withTempRoot('memo-env-add-', async (workspaceRoot) => {
    /* Without --agent but with AIOS_AGENT_ID set, the record should be tagged with that agent. */
    const privateViaEnv = runMemo(
      workspaceRoot,
      ['add', 'env-injected scratch', '--scope', 'agent_private'],
      { env: { AIOS_AGENT_ID: 'codex-cli' } },
    );
    assert.equal(privateViaEnv.status, 0, privateViaEnv.stderr || privateViaEnv.stdout);

    const records = parseJsonLines(await fs.readFile(path.join(workspaceRoot, '.aios', 'memo', 'file', 'events.jsonl'), 'utf8'));
    assert.equal(records[0].scope, 'agent_private');
    assert.equal(records[0].agent, 'codex-cli');
  });
});

test('AIOS_AGENT_ID env var scopes memo list to the injected agent', async () => {
  await withTempRoot('memo-env-list-', async (workspaceRoot) => {
    const shared = runMemo(workspaceRoot, ['add', 'shared project memory']);
    assert.equal(shared.status, 0, shared.stderr || shared.stdout);

    const codexPrivate = runMemo(
      workspaceRoot,
      ['add', 'codex-only detail', '--scope', 'agent_private', '--agent', 'codex-cli'],
    );
    assert.equal(codexPrivate.status, 0, codexPrivate.stderr || codexPrivate.stdout);

    /* With AIOS_AGENT_ID set, list should behave like --agent codex-cli: shared visible, claude private hidden. */
    const codexList = runMemo(workspaceRoot, ['list'], { env: { AIOS_AGENT_ID: 'codex-cli' } });
    assert.equal(codexList.status, 0, codexList.stderr || codexList.stdout);
    assert.match(codexList.stdout, /shared project memory/);
    assert.match(codexList.stdout, /codex-only detail/);

    /* A different injected agent must not see codex's private record. */
    const claudeList = runMemo(workspaceRoot, ['list'], { env: { AIOS_AGENT_ID: 'claude-code' } });
    assert.equal(claudeList.status, 0, claudeList.stderr || claudeList.stdout);
    assert.match(claudeList.stdout, /shared project memory/);
    assert.doesNotMatch(claudeList.stdout, /codex-only detail/);
  });
});

test('explicit --agent flag overrides AIOS_AGENT_ID env var', async () => {
  await withTempRoot('memo-env-override-', async (workspaceRoot) => {
    /* AIOS_AGENT_ID points at codex, but an explicit --agent claude-code must win. */
    const added = runMemo(
      workspaceRoot,
      ['add', 'claude-tagged scratch', '--scope', 'agent_private', '--agent', 'claude-code'],
      { env: { AIOS_AGENT_ID: 'codex-cli' } },
    );
    assert.equal(added.status, 0, added.stderr || added.stdout);

    const records = parseJsonLines(await fs.readFile(path.join(workspaceRoot, '.aios', 'memo', 'file', 'events.jsonl'), 'utf8'));
    assert.equal(records[0].agent, 'claude-code');

    /* With env=codex but explicit --agent=claude-code, the private claude record is visible. */
    const claudeList = runMemo(
      workspaceRoot,
      ['list', '--agent', 'claude-code'],
      { env: { AIOS_AGENT_ID: 'codex-cli' } },
    );
    assert.equal(claudeList.status, 0, claudeList.stderr || claudeList.stdout);
    assert.match(claudeList.stdout, /claude-tagged scratch/);
  });
});
