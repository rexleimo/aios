import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const BASELINE_POLICY_REF = 'c3b9197853bfb93ec264b03a838162cca9a035c4:AGENTS.md';
const OPTIMIZED_POLICY_REF = '4a77ad3d0eb0c5e2043bd9aaea91e3107d6210e9:AGENTS.md';

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function runDiagnostic(configPath) {
  return spawnSync(process.execPath, ['scripts/workflow-diagnostic-ab.mjs', '--dry-run', '--config', configPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

test('workflow diagnostic dry run locks distinct committed policy sources before any client can run', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workflow-diagnostic-ab-'));
  const tasksPath = path.join(directory, 'tasks.json');
  const configPath = path.join(directory, 'config.json');
  const taskText = `${JSON.stringify({
    schemaVersion: 1,
    tasks: [{
      taskId: 'diagnostic-001',
      category: 'reasoning',
      prompt: 'What is 2 + 2?',
      expected: '4',
      normalization: 'exact',
    }],
  })}\n`;
  const configText = `${JSON.stringify({
    schemaVersion: 1,
    taskManifest: {
      path: tasksPath,
      sha256: sha256(taskText),
      maxTasks: 1,
    },
    policySources: {
      baseline: { gitRef: BASELINE_POLICY_REF },
      optimized: { gitRef: OPTIMIZED_POLICY_REF },
    },
    run: {
      client: 'codex',
      model: 'gpt-5.6-terra',
      timeoutSeconds: 60,
      retryPolicy: 'none',
      concurrency: 1,
      toolPolicy: 'no-browser-no-network-tools',
      maxSpendUsd: 1,
    },
  })}\n`;

  try {
    await writeFile(tasksPath, taskText, 'utf8');
    await writeFile(configPath, configText, 'utf8');
    const result = runDiagnostic(configPath);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.mode, 'dry-run');
    assert.equal(summary.taskCount, 1);
    assert.deepEqual(summary.run, {
      client: 'codex',
      model: 'gpt-5.6-terra',
      timeoutSeconds: 60,
      retryPolicy: 'none',
      concurrency: 1,
      toolPolicy: 'no-browser-no-network-tools',
      maxSpendUsd: 1,
    });
    assert.equal(summary.policies.baseline.sourceRef, `git:${BASELINE_POLICY_REF}`);
    assert.equal(summary.policies.optimized.sourceRef, `git:${OPTIMIZED_POLICY_REF}`);
    assert.match(summary.policies.baseline.sha256, /^[a-f0-9]{64}$/u);
    assert.match(summary.policies.optimized.sha256, /^[a-f0-9]{64}$/u);
    assert.notEqual(summary.policies.baseline.sha256, summary.policies.optimized.sha256);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
