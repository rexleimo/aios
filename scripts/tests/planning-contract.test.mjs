import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildPlanMarkdown,
  checkPlanningSkillDiscovery,
  formatActivePlanInjection,
  inspectSkillRoot,
  PLANNING_CORE_SKILLS,
  readActivePlan,
  setPlanStatus,
  startPlan,
} from '../lib/planning/contract.mjs';
import { projectPlanningSkills } from '../lib/planning/project-skills.mjs';
import {
  buildAlwaysOnPlanningDirective,
  ensurePlanForMessage,
  runAutoGate,
  runClaudeUserPromptSubmitHook,
} from '../lib/planning/auto-gate.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test('buildPlanMarkdown includes contract markers', () => {
  const md = buildPlanMarkdown({ title: 'Auth refactor', objective: 'fix login', client: 'claude' });
  assert.match(md, /AIOS Planning Contract/);
  assert.match(md, /writing-plans/);
  assert.match(md, /Host plan mode bridge/i);
  assert.match(md, /Auth refactor/);
});

test('startPlan writes docs/plans artifact and active pointer', async () => {
  const root = await makeTemp('aios-plan-start-');
  try {
    const state = startPlan({
      rootDir: root,
      title: 'Ship planning bridge',
      objective: 'Make clients use AIOS plans',
      client: 'hermes',
      source: 'test',
      now: new Date('2026-07-09T12:00:00.000Z'),
    });
    assert.equal(state.status, 'active');
    assert.ok(state.relativePath.startsWith('docs/plans/'));
    assert.ok(fs.existsSync(path.join(root, state.relativePath)));
    const body = await readFile(path.join(root, state.relativePath), 'utf8');
    assert.match(body, /Ship planning bridge/);
    const active = readActivePlan(root);
    assert.equal(active.title, 'Ship planning bridge');
    assert.equal(active.client, 'hermes');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('setPlanStatus updates active pointer', async () => {
  const root = await makeTemp('aios-plan-status-');
  try {
    startPlan({ rootDir: root, title: 'Gate test', client: 'codex' });
    const next = setPlanStatus(root, 'approved', { note: 'ready' });
    assert.equal(next.status, 'approved');
    assert.equal(readActivePlan(root).status, 'approved');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('formatActivePlanInjection returns null when no plan', async () => {
  const root = await makeTemp('aios-plan-inject-');
  try {
    assert.equal(formatActivePlanInjection(root), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('inspectSkillRoot reports missing skills', async () => {
  const root = await makeTemp('aios-plan-skills-');
  try {
    const empty = inspectSkillRoot(path.join(root, 'missing'));
    assert.equal(empty.ok, false);
    assert.equal(empty.missing.length, PLANNING_CORE_SKILLS.length);

    const skillRoot = path.join(root, 'skills');
    for (const name of PLANNING_CORE_SKILLS) {
      await mkdir(path.join(skillRoot, name), { recursive: true });
      await writeFile(path.join(skillRoot, name, 'SKILL.md'), `# ${name}\n`, 'utf8');
    }
    const full = inspectSkillRoot(skillRoot);
    assert.equal(full.ok, true);
    assert.equal(full.missing.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ensurePlanForMessage creates plan for any user input', async () => {
  const root = await makeTemp('aios-plan-always-');
  try {
    const first = ensurePlanForMessage({
      rootDir: root,
      message: 'fix the flaky login test',
      client: 'claude',
      source: 'test',
    });
    assert.equal(first.created, true);
    assert.equal(first.state.status, 'active');
    assert.ok(fs.existsSync(path.join(root, first.state.relativePath)));

    const reuse = ensurePlanForMessage({
      rootDir: root,
      message: 'fix the flaky login test',
      client: 'claude',
    });
    assert.equal(reuse.created, false);
    assert.equal(reuse.action, 'reuse');

    const next = ensurePlanForMessage({
      rootDir: root,
      message: 'completely different objective about docs site',
      client: 'hermes',
    });
    assert.equal(next.created, true);
    assert.match(next.state.relativePath, /docs\/plans\//);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildAlwaysOnPlanningDirective is mandatory for every message', async () => {
  const root = await makeTemp('aios-plan-directive-');
  try {
    const d = buildAlwaysOnPlanningDirective({
      rootDir: root,
      message: 'hi',
      client: 'codex',
    });
    assert.match(d.text, /ALWAYS-ON INTELLIGENT PLANNING/i);
    assert.match(d.text, /every user input/i);
    assert.ok(d.plan.relativePath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Claude UserPromptSubmit hook returns additionalContext JSON', async () => {
  const root = await makeTemp('aios-plan-hook-');
  try {
    const { exitCode, output } = await runClaudeUserPromptSubmitHook({
      rootDir: root,
      stdinText: JSON.stringify({ prompt: 'refactor auth', cwd: root }),
      client: 'claude',
    });
    assert.equal(exitCode, 0);
    assert.match(output.additionalContext, /ALWAYS-ON/i);
    assert.match(output.hookSpecificOutput.additionalContext, /refactor auth/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('runAutoGate returns injection + plan', async () => {
  const root = await makeTemp('aios-plan-autogate-');
  try {
    const result = runAutoGate({ rootDir: root, message: 'ship always-on planning', client: 'grok' });
    assert.equal(result.ok, true);
    assert.equal(result.policy.mode, 'always');
    assert.match(result.injection, /writing-plans/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('projectPlanningSkills links into hermes project skill root', async () => {
  const home = await makeTemp('aios-plan-home-');
  const root = await makeTemp('aios-plan-ws-');
  const source = path.join(home, '.codex', 'superpowers', 'skills');
  try {
    for (const name of PLANNING_CORE_SKILLS) {
      await mkdir(path.join(source, name), { recursive: true });
      await writeFile(path.join(source, name, 'SKILL.md'), `---\nname: ${name}\n---\n`, 'utf8');
    }
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
    const result = projectPlanningSkills({
      rootDir: root,
      client: 'hermes',
      force: true,
      env,
      homeDir: home,
      io: { log() {} },
    });
    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(path.join(root, '.hermes', 'skills', 'writing-plans', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(home, '.hermes', 'skills', 'writing-plans', 'SKILL.md')));

    const discovery = checkPlanningSkillDiscovery({
      rootDir: root,
      clients: ['hermes'],
      env,
      homes: {
        hermes: path.join(home, '.hermes'),
      },
    });
    assert.equal(discovery.ok, true);
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});
