import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  applyMcpToolDescriptionMode,
  compactToolDescription,
  resolveMcpDescMode,
} from '../lib/planning/mcp-compact.mjs';
import { repairStalePlanningSkills } from '../lib/planning/repair-skills.mjs';
import { PLANNING_CORE_SKILLS } from '../lib/planning/contract.mjs';
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

test('B3 repair removes broken planning skill symlink and reprojects when source exists', async () => {
  const home = await makeTemp('aios-repair-home-');
  const root = await makeTemp('aios-repair-ws-');
  const source = path.join(home, '.codex', 'superpowers', 'skills');
  try {
    for (const name of PLANNING_CORE_SKILLS) {
      await mkdir(path.join(source, name), { recursive: true });
      await writeFile(path.join(source, name, 'SKILL.md'), `---\nname: ${name}\n---\n`, 'utf8');
    }
    const hermesSkills = path.join(root, '.hermes', 'skills');
    await mkdir(hermesSkills, { recursive: true });
    const broken = path.join(hermesSkills, 'writing-plans');
    await symlink(path.join(home, 'missing-target'), broken);

    const env = {
      HOME: home,
      CODEX_HOME: path.join(home, '.codex'),
      CLAUDE_HOME: path.join(home, '.claude'),
      HERMES_HOME: path.join(home, '.hermes'),
      GEMINI_HOME: path.join(home, '.gemini'),
      OPENCODE_HOME: path.join(home, '.config', 'opencode'),
      GROK_HOME: path.join(home, '.grok'),
      AGENTS_HOME: path.join(home, '.agents'),
    };

    const result = repairStalePlanningSkills({
      rootDir: root,
      client: 'hermes',
      env,
      force: true,
      io: { log() {} },
    });
    assert.ok(result.removed.some((p) => p.includes('writing-plans')));
    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(path.join(hermesSkills, 'writing-plans', 'SKILL.md')));
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});
