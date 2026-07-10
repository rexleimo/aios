import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { syncDreamLinesToActivePlan } from '../lib/lifecycle/dream/export-to.mjs';
import { readActivePlan, startPlan } from '../lib/planning/contract.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test('P12 dream sync only turns plan-relevant durable lines into tasks', async () => {
  const root = await makeTemp('aios-dream-plan-relevance-');
  try {
    startPlan({
      rootDir: root,
      title: 'Dream export sync',
      objective: 'Sync relevant dream notes into active plan tasks',
      client: 'cli',
    });

    const applied = await syncDreamLinesToActivePlan(root, [
      { space: 'default', text: '[decision] Always keep architecture facts project_shared' },
      { space: 'default', text: '[durable] Dream export sync should attach evidence to the active plan tasks' },
      { space: 'default', text: '[durable] Browser auth sessions must stay human-in-the-loop' },
    ], { mode: 'apply' });

    assert.equal(applied.ok, true);
    assert.equal(applied.addedTasks, 1);

    const plan = readActivePlan(root);
    assert.ok(plan.tasks.some((task) => /attach evidence to the active plan tasks/i.test(task.title)));
    assert.ok(!plan.tasks.some((task) => /architecture facts/i.test(task.title)));
    assert.ok(!plan.tasks.some((task) => /human-in-the-loop/i.test(task.title)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
