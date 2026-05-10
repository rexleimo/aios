import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { initWorkspace, buildAgentView } from '../lib/contextdb/workspace.mjs';
import { buildSkillIndex, writeSkillIndex } from '../lib/contextdb/skill-index.mjs';
import { normalizeHandoffPacket, writeHandoffPacket } from '../lib/contextdb/handoff.mjs';
import { runDoctorChecks } from '../lib/contextdb/doctor.mjs';

test('full lifecycle: two agents share workspace and handoff', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-integ-'));
  try {
    // Setup: create skills directory with test skill
    const skillsDir = path.join(root, 'memory', 'skills');
    await mkdir(skillsDir, { recursive: true });
    await writeFile(path.join(skillsDir, '发布笔记.json'), JSON.stringify({
      skill_name: '发布小红书笔记',
      description: '发布流程',
      trigger_keywords: ['发布', '笔记'],
    }));

    // Agent A: init workspace + build skill index
    await initWorkspace(root);
    const index = await buildSkillIndex(root);
    await writeSkillIndex(root, index);

    // Agent A: create session + handoff
    const sessionADir = path.join(root, 'memory', 'context-db', 'sessions', 'agent-a-session');
    await mkdir(sessionADir, { recursive: true });
    await writeFile(path.join(sessionADir, 'meta.json'), JSON.stringify({
      sessionId: 'agent-a-session',
      agent: 'claude-code',
      status: 'done',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const packet = normalizeHandoffPacket({
      fromSessionId: 'agent-a-session',
      agentType: 'claude-code',
      role: 'planner',
      intent: 'design memory optimization',
      progress: 'design complete',
      nextActions: ['implement workspace layer'],
      touchedFiles: ['docs/design.md'],
      confidence: 'high',
    });
    await writeHandoffPacket(root, 'agent-a-session', {
      agentType: 'claude-code',
      role: 'planner',
      intent: 'design memory optimization',
      progress: 'design complete',
      nextActions: ['implement workspace layer'],
      touchedFiles: ['docs/design.md'],
      confidence: 'high',
    });

    // Agent B: start, read workspace + handoff from Agent A
    const sessionBDir = path.join(root, 'memory', 'context-db', 'sessions', 'agent-b-session');
    await mkdir(sessionBDir, { recursive: true });
    await writeFile(path.join(sessionBDir, 'meta.json'), JSON.stringify({
      sessionId: 'agent-b-session',
      agent: 'claude-code',
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const view = await buildAgentView(root, 'agent-b-session');
    assert.equal(view.workspaceVersion, 1);
    assert.ok(view.relevantSkills.length >= 1);
    assert.ok(view.continuity !== null);
    assert.equal(view.continuity.intent, 'design memory optimization');
    assert.deepEqual(view.continuity.nextActions, ['implement workspace layer']);

    // Run doctor
    const report = await runDoctorChecks(root);
    assert.equal(report.status, 'healthy');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
