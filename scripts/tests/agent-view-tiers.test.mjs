import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildAgentView,
  initWorkspace,
  workspaceDir,
  writeKnowledgeSnapshot,
} from '../lib/contextdb/workspace.mjs';
import { writeSkillIndex } from '../lib/contextdb/skill-index.mjs';
import { resolveContextDbRoot } from '../lib/aios/state-root.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CTX_AGENT_CLI = path.resolve(HERE, '..', 'ctx-agent.mjs');

async function makeViewFixture() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'agent-view-'));
  await initWorkspace(rootDir);
  await writeFile(path.join(workspaceDir(rootDir), 'project-context.md'), '# Context\nThis project uses pnpm.\n', 'utf8');
  await writeSkillIndex(rootDir, {
    skills: [
      { name: 'memo', file: '.agents/skills/memo/SKILL.md', taskTypes: ['memory'], keywords: [], version: '1.0.0', description: 'memory skill' },
      { name: 'canvas', file: '.agents/skills/canvas/SKILL.md', taskTypes: ['viz'], keywords: [], version: '1.0.0', description: 'canvas skill' },
    ],
  });
  const memoSkillDir = path.join(rootDir, '.agents', 'skills', 'memo');
  await mkdir(memoSkillDir, { recursive: true });
  await writeFile(path.join(memoSkillDir, 'SKILL.md'), '---\nname: memo\n---\nMEMO SKILL FULL TEXT\n', 'utf8');
  await writeKnowledgeSnapshot(rootDir, { generatedAt: '2026-09-09T00:00:00.000Z', items: [{ name: 'k1' }] });

  const sessionsDir = path.join(resolveContextDbRoot(rootDir, { preferLegacyExisting: true }), 'sessions', 'other-session');
  await mkdir(sessionsDir, { recursive: true });
  await writeFile(path.join(sessionsDir, 'meta.json'), JSON.stringify({
    sessionId: 'other-session', createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-09T00:00:00.000Z',
  }), 'utf8');
  await writeFile(path.join(sessionsDir, 'handoff.json'), JSON.stringify({
    schemaVersion: 2,
    fromAgent: { sessionId: 'other-session', agentType: 'claude', role: 'implementer' },
    intent: 'finish the memo work',
    progress: ['landed hygiene command'],
    nextActions: [],
    blockers: [],
    touchedFiles: ['scripts/lib/memo/hygiene.mjs'],
  }), 'utf8');
  return rootDir;
}

function budgetTotal(view) {
  return Object.values(view.budget?.sections || {}).reduce((total, chars) => total + chars, 0);
}

test('T0 loads only meta and project context', async () => {
  const rootDir = await makeViewFixture();
  try {
    const view = await buildAgentView(rootDir, 'sess-a', '', { tier: 'T0' });
    assert.equal(view.tier, 'T0');
    assert.match(view.projectContext, /pnpm/);
    assert.deepEqual(view.relevantSkills, []);
    assert.equal(view.continuityPointer, null);
    assert.equal(view.activeSkill, null);
    assert.equal(view.knowledge, null);
    assert.ok(view.budget.sections.projectContext > 0);
    assert.equal(view.budget.sections.skillSummaries, undefined);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('T1 adds filtered skill summaries and a continuity pointer, not full packets', async () => {
  const rootDir = await makeViewFixture();
  try {
    const all = await buildAgentView(rootDir, 'sess-a', '', { tier: 'T1' });
    assert.equal(all.relevantSkills.length, 2);
    assert.equal(all.continuityPointer.sessionId, 'other-session');
    assert.equal(all.continuity, null);
    assert.equal(all.activeSkill, null);

    const filtered = await buildAgentView(rootDir, 'sess-a', 'memory', { tier: 'T1' });
    assert.equal(filtered.relevantSkills.length, 1);
    assert.equal(filtered.relevantSkills[0].name, 'memo');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('T2 adds only the active skill full text', async () => {
  const rootDir = await makeViewFixture();
  try {
    const view = await buildAgentView(rootDir, 'sess-a', 'memory', { tier: 'T2' });
    assert.ok(view.activeSkill);
    assert.match(view.activeSkill.content, /MEMO SKILL FULL TEXT/);
    assert.equal(view.continuity, null);
    assert.equal(view.knowledge, null);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('T3 loads continuity packet, lineage, and knowledge; default tier stays T3 for legacy callers', async () => {
  const rootDir = await makeViewFixture();
  try {
    const view = await buildAgentView(rootDir, 'sess-a', '', { tier: 'T3' });
    assert.ok(view.continuity, 'full continuity packet loads at T3');
    assert.ok(view.continuityLineage);
    assert.ok(view.knowledge);

    const legacy = await buildAgentView(rootDir, 'sess-a', 'memory');
    assert.equal(legacy.tier, 'T3', 'no tier argument keeps the legacy full-load behavior');
    assert.ok(legacy.continuity);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('budget accounting is observable and grows monotonically across tiers', async () => {
  const rootDir = await makeViewFixture();
  try {
    const totals = [];
    for (const tier of ['T0', 'T1', 'T2', 'T3']) {
      const view = await buildAgentView(rootDir, 'sess-a', 'memory', { tier });
      assert.equal(view.budget.tier, tier);
      totals.push(budgetTotal(view));
    }
    for (let index = 1; index < totals.length; index += 1) {
      assert.ok(totals[index] >= totals[index - 1], `tier budget must not shrink: ${totals.join(' <= ')}`);
    }
    assert.ok(totals[3] > totals[0], 'T3 must load strictly more than T0');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('workspace-view CLI renders tiers without writing anything', async () => {
  const rootDir = await makeViewFixture();
  try {
    const result = spawnSync(process.execPath, [CTX_AGENT_CLI, 'workspace-view', '--session', 'sess-a', '--tier', 'T1'], {
      cwd: rootDir,
      encoding: 'utf8',
      env: { ...process.env, AIOS_AGENT_ID: '' },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(String(result.stdout || ''), /tier T1/);
    assert.match(String(result.stdout || ''), /other-session/);
    assert.match(String(result.stdout || ''), /Budget:/);

    const json = spawnSync(process.execPath, [CTX_AGENT_CLI, 'workspace-view', '--session', 'sess-a', '--tier', 'T0', '--json'], {
      cwd: rootDir,
      encoding: 'utf8',
      env: { ...process.env, AIOS_AGENT_ID: '' },
    });
    assert.equal(json.status, 0, json.stderr || json.stdout);
    const parsed = JSON.parse(String(json.stdout || ''));
    assert.equal(parsed.tier, 'T0');

    const bad = spawnSync(process.execPath, [CTX_AGENT_CLI, 'workspace-view'], {
      cwd: rootDir,
      encoding: 'utf8',
      env: { ...process.env, AIOS_AGENT_ID: '' },
    });
    assert.notEqual(bad.status, 0);
    assert.match(`${bad.stderr}${bad.stdout}`, /Usage: workspace-view/u);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
