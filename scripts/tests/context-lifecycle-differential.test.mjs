import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertCleanEvaluator,
  assertSubmodulePin,
  dependencyManifestProvenance,
  materializeLocalDependency,
  materializeStableSubmodule,
  parsePinnedSubmoduleCommit,
  resolveImmutableCommit,
} from '../benchmarks/context-lifecycle-v1-differential.mjs';
import { commandObservation, isDifferentialRunnerOverlayStatus } from '../benchmarks/context-lifecycle-v1.mjs';

function git(rootDir, args) {
  const result = spawnSync('git', ['-C', rootDir, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return String(result.stdout || '').trim();
}

async function withGitRoot(fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'context-lifecycle-differential-'));
  try {
    git(rootDir, ['init']);
    git(rootDir, ['config', 'user.email', 'context-lifecycle@example.invalid']);
    git(rootDir, ['config', 'user.name', 'Context Lifecycle Test']);
    await writeFile(path.join(rootDir, 'fixture.txt'), 'baseline\n', 'utf8');
    git(rootDir, ['add', '.']);
    git(rootDir, ['commit', '-m', 'baseline']);
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test('immutable differential helpers resolve commits only from a clean evaluator root', async () => {
  await withGitRoot(async (rootDir) => {
    const head = git(rootDir, ['rev-parse', 'HEAD']);
    assert.equal(assertCleanEvaluator(rootDir), head);
    assert.equal(resolveImmutableCommit(rootDir, 'HEAD'), head);

    await writeFile(path.join(rootDir, 'untracked.txt'), 'dirty\n', 'utf8');
    assert.throws(() => assertCleanEvaluator(rootDir), /must be clean/u);
    assert.throws(() => resolveImmutableCommit(rootDir, 'does-not-exist'), /git rev-parse/u);
  });
});

test('submodule integrity helpers reject missing pins and mismatched working content', async () => {
  assert.throws(() => parsePinnedSubmoduleCommit('', 'rex-harness'), /does not contain a pinned submodule/u);
  assert.equal(parsePinnedSubmoduleCommit('160000 commit abc123\trex-harness', 'rex-harness'), 'abc123');
  assert.throws(() => assertSubmodulePin('abc123', 'def456', 'rex-harness'), /not at abc123/u);

  await withGitRoot(async (rootDir) => {
    const head = git(rootDir, ['rev-parse', 'HEAD']);
    const subjectRoot = await mkdtemp(path.join(os.tmpdir(), 'context-lifecycle-subject-'));
    try {
      await assert.rejects(
        () => materializeStableSubmodule(rootDir, subjectRoot, head, 'rex-harness'),
        /does not contain a pinned submodule/u,
      );
      await assert.rejects(
        () => materializeLocalDependency(rootDir, subjectRoot, 'node_modules'),
        /ENOENT/u,
      );
    } finally {
      await rm(subjectRoot, { recursive: true, force: true });
    }
  });
});

test('dependency provenance exposes manifest drift instead of silently reusing dependencies', async () => {
  await withGitRoot(async (rootDir) => {
    const subjectCommit = git(rootDir, ['rev-parse', 'HEAD']);
    await writeFile(path.join(rootDir, 'package.json'), '{"name":"fixture"}\n', 'utf8');
    git(rootDir, ['add', 'package.json']);
    git(rootDir, ['commit', '-m', 'add dependency manifest']);
    const evaluatorCommit = git(rootDir, ['rev-parse', 'HEAD']);
    const provenance = dependencyManifestProvenance(rootDir, evaluatorCommit, subjectCommit);
    assert.equal(provenance.allMatch, false);
    assert.equal(provenance.manifests['package.json'].matches, false);
    assert.equal(provenance.manifests['package.json'].subject, null);
  });
});

test('failed command observations retain separate redacted stream tails', () => {
  const script = [
    'for (let i = 0; i < 30; i += 1) console.log(`stdout-${i}`);',
    'for (let i = 0; i < 30; i += 1) console.error(`stderr-${i}`);',
    'process.exit(1);',
  ].join(' ');
  const observation = commandObservation(process.execPath, ['-e', script], os.tmpdir());
  assert.equal(observation.exitCode, 1);
  assert.equal(observation.error, '');
  assert.match(observation.failureExcerpt.stdout, /stdout-29/u);
  assert.match(observation.failureExcerpt.stderr, /stderr-29/u);
  assert.doesNotMatch(observation.failureExcerpt.stdout, /stderr-/u);
  assert.equal(observation.cwd, '<tmp>');
  assert.equal(isDifferentialRunnerOverlayStatus('?? scripts/benchmarks/.context-lifecycle-differential-123-baseline.mjs'), true);
  assert.equal(isDifferentialRunnerOverlayStatus(' M scripts/benchmarks/context-lifecycle-v1.mjs'), false);
});
