import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { startPlan, readActivePlan } from '../lib/planning/contract.mjs';
import { showActivePlan, formatPlanShowText } from '../lib/planning/show.mjs';
import { evaluateSkillComplianceLive } from '../lib/skills/compliance-live.mjs';
import { runSkillComply } from '../lib/skills/compliance.mjs';
import { syncDreamLinesToActivePlan } from '../lib/lifecycle/dream/export-to.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test('P11 plan show renders text board and optional HTML', async () => {
  const root = await makeTemp('aios-plan-show-');
  try {
    startPlan({ rootDir: root, title: 'Review board', objective: 'implement feature', client: 'cli' });
    const shown = showActivePlan(root, { format: 'both' });
    assert.equal(shown.ok, true);
    assert.match(shown.text, /AIOS PLAN REVIEW/);
    assert.match(shown.text, /Tasks:/);
    assert.ok(shown.htmlPath?.absolutePath);
    const html = await readFile(shown.htmlPath.absolutePath, 'utf8');
    assert.match(html, /AIOS Plan/);
    assert.match(html, /Review board/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('P10 skill comply live scores a well-formed skill', async () => {
  const root = await makeTemp('aios-comply-live-');
  try {
    const skillDir = path.join(root, 'skills', 'demo-skill');
    await mkdir(skillDir, { recursive: true });
    const skillPath = path.join(skillDir, 'SKILL.md');
    await writeFile(skillPath, `---
name: demo-skill
description: Demonstrate compliance live probe for planning workflows
---

# Demo skill

## Steps

1. Read the repository guidelines carefully
2. Write a structured plan with acceptance criteria
3. Run verification tests before claiming completion
4. Record evidence in the planning system

Always follow verification before completion.
`, 'utf8');

    const report = await evaluateSkillComplianceLive({
      rootDir: root,
      targetPath: skillPath,
      client: 'codex',
    });
    assert.equal(report.kind, 'skill-compliance.live');
    assert.ok(report.live.sequenceLength >= 3);
    assert.ok(report.live.coverage > 0);
    // should pass at least supportive scenario
    assert.ok(report.live.scenarioResults.some((s) => s.pass));

    const cli = await runSkillComply(
      { path: skillPath, live: true, json: true },
      { rootDir: root, stdout: { write() {} } },
    );
    assert.ok(cli.report.kind === 'skill-compliance.live');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('P12 dream lines sync into active plan tasks on apply', async () => {
  const root = await makeTemp('aios-dream-plan-');
  try {
    startPlan({ rootDir: root, title: 'Memory loop', objective: 'implement memo writeback', client: 'cli' });
    const before = readActivePlan(root).tasks.length;
    const preview = await syncDreamLinesToActivePlan(root, [
      { space: 'default', text: '[decision] Always use project_shared memo for architecture facts' },
      { space: 'default', text: '[durable] Plan evidence is required before done' },
    ], { mode: 'preview' });
    assert.equal(preview.preview, true);

    const applied = await syncDreamLinesToActivePlan(root, [
      { space: 'default', text: '[decision] Always use project_shared memo for architecture facts' },
      { space: 'default', text: '[durable] Plan evidence is required before done' },
    ], { mode: 'apply' });
    assert.equal(applied.ok, true);
    assert.ok(applied.addedTasks >= 1);
    const after = readActivePlan(root);
    assert.ok(after.tasks.length > before);
    assert.ok(after.tasks.some((t) => /project_shared memo/i.test(t.title)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
