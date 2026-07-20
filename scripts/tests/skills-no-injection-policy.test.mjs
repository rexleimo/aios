import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  loadSkillsSyncManifest,
  resolveGeneratedTargetPath,
} from '../lib/skills/source-tree.mjs';

const rootDir = process.cwd();

async function readSkill(relativePath) {
  return await readFile(path.join(rootDir, relativePath), 'utf8');
}

const REX_ONLY_AGENT_SKILLS = Object.freeze([
  'aios-long-running-harness',
  'aios-project-system',
  'aios-workflow-router',
  'harness-init-runner',
  'pre-edit-safety-gate',
  'skill-opt-lite',
]);

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

test('long-running harness follows rex-native Commands instead of a default external workflow chain', async () => {
  const skill = await readSkill('skill-sources/aios-long-running-harness/SKILL.md');
  const standalone = await readSkill('skill-sources/harness-init-runner/SKILL.md');

  assert.match(skill, /execute only the Provider selected by the current rex Command/);
  assert.match(skill, /Do not enable compatibility substitutions/);
  assert.doesNotMatch(skill, /Plan step should be produced through `superpowers:writing-plans`/);
  assert.doesNotMatch(standalone, /superpowers pairing/iu);
});

test('agent discovery projection keeps workflow skills Rex-only', async () => {
  const manifest = loadSkillsSyncManifest(rootDir);

  for (const skillName of REX_ONLY_AGENT_SKILLS) {
    const entry = manifest.skills.find((candidate) => candidate.relativeSkillPath === skillName);
    assert.ok(entry, `expected canonical source for ${skillName}`);
    assert.ok(entry.repoTargets.includes('agents'), `${skillName} must be projected to the agent discovery root`);

    const generatedPath = resolveGeneratedTargetPath({
      rootDir,
      entry,
      surface: 'agents',
      manifest,
    });
    const content = await readFile(path.join(generatedPath, 'SKILL.md'), 'utf8');
    assert.doesNotMatch(
      content,
      /superpowers:|superpowers pairing|Pairing with Superpowers|writing-plans|brainstorming|test-driven-development|systematic-debugging/iu,
      `${skillName} still exposes a legacy workflow path in .agents/skills`,
    );
  }
});
