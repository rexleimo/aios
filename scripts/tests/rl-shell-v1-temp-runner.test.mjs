import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validateTaskManifest, validateObservationEvent } from '../lib/rl-shell-v1/schema.mjs';

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, 'utf8');
}

async function makeRootDir() {
  return await mkdtemp(path.join(os.tmpdir(), 'aios-rl-shell-v1-runner-'));
}

async function makeTaskManifest(rootDir) {
  const repoSourcePath = path.join(rootDir, 'fixtures', 'task-repo');
  await writeJson(path.join(repoSourcePath, 'package.json'), {
    name: 'fixture-task',
    private: true,
    type: 'module',
  });
  await writeText(path.join(repoSourcePath, 'src', 'math.mjs'), 'export function add(a, b) {\n  return a - b;\n}\n');
  await writeText(
    path.join(repoSourcePath, 'tests', 'math.test.mjs'),
    [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { add } from '../src/math.mjs';",
      '',
      "test('addition returns the sum', () => {",
      '  assert.equal(add(2, 3), 5);',
      '});',
      '',
    ].join('\n')
  );

  return validateTaskManifest({
    schema_version: 1,
    task_id: 'fixture-task-v1',
    repo_snapshot_id: 'fixture-task@v1',
    repo_source_path: repoSourcePath,
    split: 'train',
    task_prompt: 'Fix the failing addition behavior.',
    verification_command: 'node --test',
    baseline_failing_tests: ['addition returns the sum'],
    constraints: ['Do not edit tests'],
  });
}

async function createFixtureWorkspace(mod) {
  const rootDir = await makeRootDir();
  const taskManifest = await makeTaskManifest(rootDir);
  const workspace = await mod.createEpisodeWorkspace({ taskManifest, rootDir });
  return {
    rootDir,
    taskManifest,
    workspace,
  };
}

function defaultPolicy(mod, overrides = {}) {
  return {
    ...mod.createDefaultExecutionPolicy(),
    ...overrides,
  };
}

test('temp runner rejects path escapes and command redirects outside the temp workspace', async () => {
  const mod = await import('../lib/rl-shell-v1/temp-runner.mjs');
  const { workspace } = await createFixtureWorkspace(mod);

  await assert.rejects(
    () => mod.executeAction({
      workspace,
      action: { action: 'read', path: '../../etc/passwd' },
      policy: defaultPolicy(mod),
    }),
    /temp workspace root/i
  );

  const result = await mod.executeAction({
    workspace,
    action: { action: 'run', command: 'node -e "console.log(1)" > /tmp/out.txt' },
    policy: defaultPolicy(mod),
  });

  assert.equal(result.status, 'rejected');
  assert.equal(workspace.observations.length, 1);
  assert.doesNotThrow(() => validateObservationEvent(result));
});

test('temp runner replays baseline failing tests before student actions and cleans up isolated workspaces', async () => {
  const mod = await import('../lib/rl-shell-v1/temp-runner.mjs');
  const { workspace } = await createFixtureWorkspace(mod);

  const baseline = await mod.runBaselineFailureCheck({
    workspace,
    verificationCommand: 'node --test',
    policy: defaultPolicy(mod),
  });

  assert.equal(baseline.reproduced, true);
  assert.match(baseline.failingTests.join('\n'), /not ok|ERR_ASSERTION/i);

  const patchEvent = await mod.executeAction({
    workspace,
    action: {
      action: 'patch',
      diff: [
        '*** Begin Patch',
        '*** Update File: src/math.mjs',
        '@@',
        '-export function add(a, b) {',
        '-  return a - b;',
        '-}',
        '+export function add(a, b) {',
        '+  return a + b;',
        '+}',
        '*** End Patch',
      ].join('\n'),
    },
    policy: defaultPolicy(mod),
  });
  assert.equal(patchEvent.status, 'ok');
  assert.equal(patchEvent.payload.applied, true);

  const verification = await mod.runVerification({
    workspace,
    verificationCommand: 'node --test',
    policy: defaultPolicy(mod),
  });
  assert.equal(verification.verification_status, 'ok');
  assert.deepEqual(verification.tests_after, []);
  assert.deepEqual(verification.new_failures, []);
  assert.equal(verification.observation.status, 'ok');
  assert.equal(verification.observation.payload.exit_code, 0);
  assert.doesNotThrow(() => validateObservationEvent(verification.observation));

  const workspacePath = workspace.workspacePath;
  await mod.destroyEpisodeWorkspace(workspace);
  await assert.rejects(() => access(workspacePath));
});

test('temp runner collects default Node test failures from the standard reporter output', async () => {
  const mod = await import('../lib/rl-shell-v1/temp-runner.mjs');
  const failures = mod.collectFailingTests([
    '✖ addition returns the sum (1.0466ms)',
    'AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:',
    '',
  ].join('\n'));

  assert.equal(failures.length >= 1, true);
  assert.match(failures.join('\n'), /addition returns the sum|ERR_ASSERTION/u);
});

test('temp runner flags repeated identical failed actions as repeated_no_progress', async () => {
  const mod = await import('../lib/rl-shell-v1/temp-runner.mjs');
  const { workspace } = await createFixtureWorkspace(mod);
  const policy = defaultPolicy(mod, { no_progress_window: 3 });
  const invalidPatch = {
    action: 'patch',
    diff: [
      '*** Begin Patch',
      '*** Update File: src/math.mjs',
      '@@',
      '-return missing_line;',
      '+return a + b;',
      '*** End Patch',
    ].join('\n'),
  };

  for (let index = 0; index < 3; index += 1) {
    const event = await mod.executeAction({
      workspace,
      action: invalidPatch,
      policy,
    });
    assert.equal(event.status, 'error');
  }

  assert.equal(
    mod.getStopConditionCandidate({ workspace, policy }),
    'repeated_no_progress'
  );
});
