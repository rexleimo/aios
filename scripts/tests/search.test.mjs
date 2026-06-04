import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseArgs } from '../lib/cli/parse-args.mjs';
import {
  appendMemoEvent,
  writePinnedMemo,
} from '../lib/memo/storage.mjs';
import { searchAiosProject } from '../lib/search/unified-search.mjs';

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

async function writeFixture(root, relPath, content) {
  const target = path.join(root, relPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function sourceKeys(results) {
  return new Set(results.map((result) => `${result.source}:${result.kind}`));
}

test('parseArgs accepts unified search command and preserves filters', () => {
  const parsed = parseArgs([
    'search',
    'portable memory',
    '--limit',
    '7',
    '--source',
    'memory,plans',
    '--scope',
    'agent_private',
    '--agent',
    'codex-cli',
    '--workspace',
    '/tmp/project',
    '--json',
  ]);

  assert.equal(parsed.command, 'search');
  assert.equal(parsed.options.query, 'portable memory');
  assert.equal(parsed.options.limit, '7');
  assert.equal(parsed.options.sources, 'memory,plans');
  assert.equal(parsed.options.scope, 'agent_private');
  assert.equal(parsed.options.agent, 'codex-cli');
  assert.equal(parsed.options.workspaceRoot, '/tmp/project');
  assert.equal(parsed.options.format, 'json');
});

test('searchAiosProject searches memory, pinned memory, docs, plans, and code while filtering private memos by agent', async () => {
  await withTempRoot('aios-search-', async (root) => {
    await appendMemoEvent({
      workspaceRoot: root,
      storage: 'file',
      space: 'default',
      text: 'portable search shared memory',
      refs: ['portable'],
    });
    await appendMemoEvent({
      workspaceRoot: root,
      storage: 'file',
      space: 'default',
      text: 'portable search codex private memory',
      refs: ['codex'],
      scope: 'agent_private',
      agent: 'codex-cli',
    });
    await appendMemoEvent({
      workspaceRoot: root,
      storage: 'file',
      space: 'default',
      text: 'portable search claude private memory',
      refs: ['claude'],
      scope: 'agent_private',
      agent: 'claude-code',
    });
    await writePinnedMemo(root, {
      storage: 'file',
      space: 'default',
      content: 'portable search pinned memory',
    });
    await writeFixture(root, 'docs/guide.md', '# Guide\n\nportable search docs reference\n');
    await writeFixture(root, 'docs/plans/search-plan.md', '# Plan\n\nportable search plan reference\n');
    await writeFixture(root, 'scripts/lib/example-search.mjs', 'export const value = "portable search code reference";\n');

    const codex = await searchAiosProject(root, {
      query: 'portable search',
      agent: 'codex-cli',
      limit: 20,
    });
    const codexKeys = sourceKeys(codex.results);

    assert.equal(codex.results.some((result) => /shared memory/.test(result.text)), true);
    assert.equal(codex.results.some((result) => /codex private/.test(result.text)), true);
    assert.equal(codex.results.some((result) => /claude private/.test(result.text)), false);
    assert.equal(codexKeys.has('memory:memo'), true);
    assert.equal(codexKeys.has('memory:pinned'), true);
    assert.equal(codexKeys.has('docs:file'), true);
    assert.equal(codexKeys.has('plans:file'), true);
    assert.equal(codexKeys.has('code:file'), true);

    const claude = await searchAiosProject(root, {
      query: 'portable search',
      agent: 'claude-code',
      sources: ['memory'],
      limit: 20,
    });
    assert.equal(claude.results.some((result) => /claude private/.test(result.text)), true);
    assert.equal(claude.results.some((result) => /codex private/.test(result.text)), false);
  });
});

test('searchAiosProject handles top-level documentation files in docs source', async () => {
  await withTempRoot('aios-search-doc-file-', async (root) => {
    await writeFixture(root, 'README.md', '# Readme\n\nsingle file docs lookup needle\n');

    const payload = await searchAiosProject(root, {
      query: 'single file docs',
      sources: ['docs'],
      limit: 10,
    });

    assert.equal(payload.results.some((result) => result.path === 'README.md'), true);
  });
});

test('aios search returns structured JSON from the real CLI', async () => {
  await withTempRoot('aios-search-cli-', async (root) => {
    await appendMemoEvent({
      workspaceRoot: root,
      storage: 'file',
      space: 'default',
      text: 'needle cli shared memory',
      refs: ['needle'],
    });
    await writeFixture(root, 'docs/plans/needle.md', '# Needle\n\nneedle cli plan reference\n');

    const result = spawnSync(process.execPath, [
      cliPath,
      'search',
      'needle cli',
      '--workspace',
      root,
      '--json',
      '--limit',
      '10',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.query, 'needle cli');
    assert.equal(payload.results.some((item) => item.source === 'memory' && item.kind === 'memo'), true);
    assert.equal(payload.results.some((item) => item.source === 'plans' && item.path.endsWith('docs/plans/needle.md')), true);
  });
});
