import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertCleanEvaluator,
  assertSubmodulePin,
  dependencyManifestProvenance,
  installedPackagesMatchCommittedLock,
  materializeLocalDependency,
  materializeStableSubmodule,
  parsePinnedSubmoduleCommit,
  resolveImmutableCommit,
} from '../benchmarks/context-lifecycle-v1-differential.mjs';
import {
  collectBenchmarkWorktreeStatus,
  commandObservation,
  isDifferentialRunnerOverlayStatus,
  isMainEntryPoint,
} from '../benchmarks/context-lifecycle-v1.mjs';

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

test('corrupt manifests do not collapse into a matching missing state', async () => {
  await withGitRoot(async (rootDir) => {
    await writeFile(path.join(rootDir, 'package.json'), '{invalid\n', 'utf8');
    git(rootDir, ['add', 'package.json']);
    git(rootDir, ['commit', '-m', 'add corrupt manifest fixture']);
    const head = git(rootDir, ['rev-parse', 'HEAD']);
    const provenance = dependencyManifestProvenance(rootDir, head, head);
    assert.equal(provenance.manifests['package.json'].evaluatorSurfaceStatus, 'invalid');
    assert.equal(provenance.manifests['package.json'].subjectSurfaceStatus, 'invalid');
    assert.equal(provenance.manifests['package.json'].matches, false);
  });
});

test('package script-only drift keeps dependency surface parity while recording blob drift', async () => {
  await withGitRoot(async (rootDir) => {
    await writeFile(path.join(rootDir, 'package.json'), '{"scripts":{"test":"old"},"dependencies":{"fixture":"1.0.0"}}\n', 'utf8');
    git(rootDir, ['add', 'package.json']);
    git(rootDir, ['commit', '-m', 'add package manifest']);
    const subjectCommit = git(rootDir, ['rev-parse', 'HEAD']);
    await writeFile(path.join(rootDir, 'package.json'), '{"scripts":{"test":"new"},"dependencies":{"fixture":"1.0.0"}}\n', 'utf8');
    git(rootDir, ['add', 'package.json']);
    git(rootDir, ['commit', '-m', 'change scripts only']);
    const evaluatorCommit = git(rootDir, ['rev-parse', 'HEAD']);
    const provenance = dependencyManifestProvenance(rootDir, evaluatorCommit, subjectCommit);
    assert.equal(provenance.allMatch, true);
    assert.equal(provenance.manifests['package.json'].fullBlobMatches, false);
    assert.equal(provenance.manifests['package.json'].dependencySurfaceMatches, true);
  });
});

test('installed dependency inventory accepts npm omitted optional packages but rejects version drift', () => {
  const committed = JSON.stringify({ packages: {
    '': { version: '1.0.0' },
    'node_modules/fixture': { version: '1.0.0' },
    'node_modules/required-two': { version: '3.0.0' },
    'node_modules/optional-platform': { version: '2.0.0', optional: true },
  } });
  const installed = JSON.stringify({ packages: {
    'node_modules/fixture': { version: '1.0.0' },
    'node_modules/required-two': { version: '3.0.0' },
  } });
  const stale = JSON.stringify({ packages: {
    'node_modules/fixture': { version: '0.9.0' },
  } });
  assert.equal(installedPackagesMatchCommittedLock(installed, committed), true);
  assert.equal(installedPackagesMatchCommittedLock(stale, committed), false);
  assert.equal(installedPackagesMatchCommittedLock('{"packages":{}}', committed), false);
  assert.equal(installedPackagesMatchCommittedLock(JSON.stringify({ packages: { 'node_modules/fixture': { version: '1.0.0' } } }), committed), false);
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
  const modulePath = path.resolve('scripts/benchmarks/context-lifecycle-v1.mjs');
  const invocationPath = process.platform === 'win32' ? modulePath.toUpperCase() : modulePath;
  assert.equal(isMainEntryPoint(invocationPath, modulePath), true);
});

test('worktree status preserves a differential runner overlay in an otherwise absent directory', async () => {
  await withGitRoot(async (rootDir) => {
    const overlayPath = path.join(rootDir, 'scripts', 'benchmarks', '.context-lifecycle-differential-123-baseline.mjs');
    await mkdir(path.dirname(overlayPath), { recursive: true });
    await writeFile(overlayPath, 'export {};\n', 'utf8');

    assert.deepEqual(collectBenchmarkWorktreeStatus(rootDir), {
      worktreeDirty: false,
      worktreeOverlayFiles: ['scripts/benchmarks/.context-lifecycle-differential-123-baseline.mjs'],
    });

    await writeFile(path.join(rootDir, 'scripts', 'benchmarks', 'unexpected.mjs'), 'export {};\n', 'utf8');
    assert.equal(collectBenchmarkWorktreeStatus(rootDir).worktreeDirty, true);
  });
});
