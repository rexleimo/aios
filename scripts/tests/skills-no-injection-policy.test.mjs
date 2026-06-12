import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const rootDir = process.cwd();

async function readSkill(relativePath) {
  return await readFile(path.join(rootDir, relativePath), 'utf8');
}

test('contextdb-autopilot documents pull-based continuity without prompt injection', async () => {
  const skill = await readSkill('skill-sources/contextdb-autopilot/SKILL.md');

  assert.match(skill, /ContextDB is no longer a prompt-injection layer/);
  assert.match(skill, /Deprecated prompt-loading flags are intentionally unsupported/);
  assert.match(skill, /--startup-mode/);
  assert.match(skill, /--context-mode/);
  assert.match(skill, /CTXDB_AUTO_PROMPT/);
  assert.match(skill, /Never paste a full ContextDB Report/);
  assert.match(skill, /the user must explicitly name the task\/handoff to continue/);
  assert.doesNotMatch(skill, /^# Context Packet$/m);
});

test('long-running harness documents ContextDB as storage rather than prompt replay', async () => {
  const skill = await readSkill('skill-sources/aios-long-running-harness/SKILL.md');

  assert.match(skill, /## Context Boundary/);
  assert.match(skill, /ContextDB as storage and evidence, not as prompt replay/);
  assert.match(skill, /wait for explicit resume intent/);
  assert.match(skill, /Do not feed `context:pack` output into a model prompt/);
  assert.match(skill, /Stable operating rules live in `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and skills/);
  assert.doesNotMatch(skill, /^# Context Packet$/m);
});
