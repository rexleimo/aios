import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  applyMcpToolDescriptionMode,
  compactToolDescription,
  resolveMcpDescMode,
} from '../lib/planning/mcp-compact.mjs';
import {
  collectDurableMemoLines,
  writeAgentsDreamBlock,
  AGENTS_DREAM_BEGIN,
} from '../lib/lifecycle/dream/export-to.mjs';
import {
  buildDeathNotice,
  writeDeathNotice,
  readDeathNotices,
  hasDuplicateNotice,
} from '../lib/lifecycle/death-notice.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test('A4 compactToolDescription respects modes', () => {
  const long = 'A'.repeat(300);
  assert.equal(compactToolDescription(long, 'full').length, 300);
  assert.ok(compactToolDescription(long, 'compact').length <= 160);
  assert.ok(compactToolDescription(long, 'minimal').length <= 80);
  assert.equal(resolveMcpDescMode('compact'), 'compact');
  const tools = applyMcpToolDescriptionMode(
    [{ name: 't', description: long }],
    'minimal',
  );
  assert.ok(tools[0].description.length <= 80);
});

test('A3 death notice write/read/dedup', async () => {
  const root = await makeTemp('aios-death-');
  try {
    // death notices live under context-db sessions
    await mkdir(path.join(root, '.aios', 'context-db', 'sessions', 'sess-1'), { recursive: true });
    const notice = buildDeathNotice({
      agentId: 'job-planner',
      sessionId: 'sess-1',
      reason: 'crash',
      lastKnownState: { exitCode: 1 },
    });
    await writeDeathNotice(root, notice);
    const list = await readDeathNotices(root, 'sess-1');
    assert.equal(list.length, 1);
    assert.equal(list[0].agent_id, 'job-planner');
    assert.equal(hasDuplicateNotice(list, notice), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('A2 writeAgentsDreamBlock is idempotent managed section', async () => {
  const root = await makeTemp('aios-dream-to-');
  try {
    await writeFile(path.join(root, 'AGENTS.md'), '# Hello\n\nbody\n', 'utf8');
    await writeAgentsDreamBlock(root, '## durable\n\n1. keep secrets out of git\n');
    await writeAgentsDreamBlock(root, '## durable\n\n1. updated note\n');
    const text = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
    assert.equal(text.split(AGENTS_DREAM_BEGIN).length - 1, 1);
    assert.match(text, /updated note/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
