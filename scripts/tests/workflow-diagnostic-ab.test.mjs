import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const POLICY_FILE = 'AGENTS.md';
const BASELINE_POLICY = '# Baseline workflow policy\n\nUse the recorded workflow.\n';
const OPTIMIZED_POLICY = '# Optimized workflow policy\n\nUse the recorded workflow with targeted context.\n';

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

async function createCommittedPolicySources(repositoryPath) {
  await mkdir(repositoryPath);
  runGit(repositoryPath, ['init', '--quiet']);
  runGit(repositoryPath, ['config', 'user.email', 'workflow-diagnostic@example.invalid']);
  runGit(repositoryPath, ['config', 'user.name', 'Workflow Diagnostic Test']);

  await writeFile(path.join(repositoryPath, POLICY_FILE), BASELINE_POLICY, 'utf8');
  runGit(repositoryPath, ['add', '--', POLICY_FILE]);
  runGit(repositoryPath, ['commit', '--quiet', '-m', 'fixture: baseline policy']);
  const baselineRef = `${runGit(repositoryPath, ['rev-parse', 'HEAD'])}:${POLICY_FILE}`;

  await writeFile(path.join(repositoryPath, POLICY_FILE), OPTIMIZED_POLICY, 'utf8');
  runGit(repositoryPath, ['add', '--', POLICY_FILE]);
  runGit(repositoryPath, ['commit', '--quiet', '-m', 'fixture: optimized policy']);
  const optimizedRef = `${runGit(repositoryPath, ['rev-parse', 'HEAD'])}:${POLICY_FILE}`;

  return { baselineRef, optimizedRef };
}

function runDiagnostic(configPath, repositoryPath) {
  return spawnSync(process.execPath, [path.join(process.cwd(), 'scripts', 'workflow-diagnostic-ab.mjs'), '--dry-run', '--config', configPath], {
    cwd: repositoryPath,
    encoding: 'utf8',
  });
}

test('workflow diagnostic dry run locks distinct committed policy sources before any client can run', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workflow-diagnostic-ab-'));
  const repositoryPath = path.join(directory, 'policy-repository');
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
  try {
    // A self-contained history keeps this committed-source test independent of CI checkout depth.
    const { baselineRef, optimizedRef } = await createCommittedPolicySources(repositoryPath);
    const configText = `${JSON.stringify({
      schemaVersion: 1,
      taskManifest: {
        path: tasksPath,
        sha256: sha256(taskText),
        maxTasks: 1,
      },
      policySources: {
        baseline: { gitRef: baselineRef },
        optimized: { gitRef: optimizedRef },
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
    await writeFile(tasksPath, taskText, 'utf8');
    await writeFile(configPath, configText, 'utf8');
    const result = runDiagnostic(configPath, repositoryPath);

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
    assert.equal(summary.policies.baseline.sourceRef, `git:${baselineRef}`);
    assert.equal(summary.policies.optimized.sourceRef, `git:${optimizedRef}`);
    assert.match(summary.policies.baseline.sha256, /^[a-f0-9]{64}$/u);
    assert.match(summary.policies.optimized.sha256, /^[a-f0-9]{64}$/u);
    assert.notEqual(summary.policies.baseline.sha256, summary.policies.optimized.sha256);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
