import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareBenchmarkResults } from './context-lifecycle-v1-compare.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNNER_NAME = 'context-lifecycle-v1.mjs';

function parseArgs(argv) {
  const options = { evaluatorRoot: ROOT, baselineRef: '', postRef: '', outputDir: '' };
  const flags = new Map([
    ['--evaluator-root', 'evaluatorRoot'],
    ['--baseline', 'baselineRef'],
    ['--post', 'postRef'],
    ['--output-dir', 'outputDir'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = String(argv[index] || '');
    const key = flags.get(flag);
    const value = String(argv[index + 1] || '');
    if (!key) throw new Error(`unknown argument: ${flag}`);
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${flag}`);
    options[key] = key === 'baselineRef' || key === 'postRef' ? value : path.resolve(value);
    index += 1;
  }
  for (const key of ['baselineRef', 'postRef', 'outputDir']) {
    if (!options[key]) throw new Error(`missing required argument for ${key}`);
  }
  return options;
}

function runGit(rootDir, args) {
  const result = spawnSync('git', ['-C', rootDir, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr || result.error?.message || '').trim()}`);
  }
  return String(result.stdout || '').trim();
}

export function resolveImmutableCommit(rootDir, ref) {
  return runGit(rootDir, ['rev-parse', '--verify', `${ref}^{commit}`]);
}

export function assertCleanEvaluator(rootDir) {
  const status = runGit(rootDir, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (status) throw new Error('differential evaluator worktree must be clean');
  return runGit(rootDir, ['rev-parse', '--verify', 'HEAD^{commit}']);
}

const DEPENDENCY_MANIFESTS = Object.freeze([
  'package.json',
  'package-lock.json',
  'mcp-server/package.json',
  'mcp-server/package-lock.json',
]);
const DEPENDENCY_SURFACE_KEYS = Object.freeze([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'engines',
]);

function sha256Text(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function resolveBlobText(rootDir, commit, relativePath) {
  const result = spawnSync('git', ['-C', rootDir, 'show', `${commit}:${relativePath}`], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  return result.status === 0 ? String(result.stdout || '') : null;
}

function resolveBlobHash(rootDir, commit, relativePath) {
  const result = spawnSync('git', ['-C', rootDir, 'rev-parse', `${commit}:${relativePath}`], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0 ? String(result.stdout || '').trim() : null;
}

function dependencySurfaceState(text) {
  if (text === null) return { status: 'missing', hash: null };
  try {
    const manifest = JSON.parse(text);
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return { status: 'invalid', hash: null };
    const surface = Object.fromEntries(DEPENDENCY_SURFACE_KEYS
      .filter((key) => Object.prototype.hasOwnProperty.call(manifest, key))
      .map((key) => [key, manifest[key]]));
    return { status: 'valid', hash: sha256Text(JSON.stringify(canonicalize(surface))) };
  } catch {
    return { status: 'invalid', hash: null };
  }
}

function lockInventoryState(text) {
  if (text === null) return { status: 'missing', hash: null };
  try {
    const lock = JSON.parse(text);
    if (!lock || typeof lock !== 'object' || Array.isArray(lock) || !lock.packages || typeof lock.packages !== 'object') {
      return { status: 'invalid', hash: null };
    }
    const packages = Object.fromEntries(Object.entries(lock.packages).map(([key, value]) => [key, {
      version: value?.version || null,
      dependencies: value?.dependencies || {},
      optionalDependencies: value?.optionalDependencies || {},
      peerDependencies: value?.peerDependencies || {},
    }]));
    return { status: 'valid', hash: sha256Text(JSON.stringify(canonicalize(packages))) };
  } catch {
    return { status: 'invalid', hash: null };
  }
}

function lockPackageEntries(text) {
  if (text === null) return null;
  try {
    const lock = JSON.parse(text);
    return new Map(Object.entries(lock.packages || {}));
  } catch {
    return null;
  }
}

function isPlatformOptionalPackage(entry) {
  return entry?.optional === true || Array.isArray(entry?.os) || Array.isArray(entry?.cpu);
}

export function installedPackagesMatchCommittedLock(installedText, committedText) {
  const installed = lockPackageEntries(installedText);
  const committed = lockPackageEntries(committedText);
  if (!installed || !committed || installed.size === 0 || committed.size <= 1) return false;
  for (const [key, entry] of committed) {
    if (!key || isPlatformOptionalPackage(entry)) continue;
    const installedEntry = installed.get(key);
    if (!installedEntry || installedEntry.version !== entry.version) return false;
  }
  for (const [key, entry] of installed) {
    if (!key) continue;
    const committedEntry = committed.get(key);
    if (!committedEntry || committedEntry.version !== entry.version) return false;
  }
  return true;
}

export function dependencyManifestProvenance(rootDir, evaluatorCommit, subjectCommit) {
  const manifests = Object.fromEntries(DEPENDENCY_MANIFESTS.map((relativePath) => {
    const evaluatorBlob = resolveBlobHash(rootDir, evaluatorCommit, relativePath);
    const subjectBlob = resolveBlobHash(rootDir, subjectCommit, relativePath);
    const evaluatorText = resolveBlobText(rootDir, evaluatorCommit, relativePath);
    const subjectText = resolveBlobText(rootDir, subjectCommit, relativePath);
    const isLockfile = relativePath.endsWith('package-lock.json');
    const evaluatorSurface = isLockfile ? { status: 'not-applicable', hash: null } : dependencySurfaceState(evaluatorText);
    const subjectSurface = isLockfile ? { status: 'not-applicable', hash: null } : dependencySurfaceState(subjectText);
    const evaluatorInventory = isLockfile ? lockInventoryState(evaluatorText) : { status: 'not-applicable', hash: null };
    const subjectInventory = isLockfile ? lockInventoryState(subjectText) : { status: 'not-applicable', hash: null };
    const fullBlobMatches = evaluatorBlob === subjectBlob;
    const lockStateMatches = (evaluatorInventory.status === 'missing' && subjectInventory.status === 'missing')
      || (evaluatorInventory.status === 'valid' && subjectInventory.status === 'valid' && evaluatorInventory.hash === subjectInventory.hash);
    const dependencySurfaceMatches = isLockfile
      ? lockStateMatches
      : (evaluatorSurface.status === 'missing' && subjectSurface.status === 'missing')
        || (evaluatorSurface.status === 'valid' && subjectSurface.status === 'valid' && evaluatorSurface.hash === subjectSurface.hash);
    return [relativePath, {
      evaluator: evaluatorBlob,
      subject: subjectBlob,
      fullBlobMatches,
      evaluatorSurfaceStatus: evaluatorSurface.status,
      subjectSurfaceStatus: subjectSurface.status,
      evaluatorSurfaceSha256: evaluatorSurface.hash,
      subjectSurfaceSha256: subjectSurface.hash,
      evaluatorInventoryStatus: evaluatorInventory.status,
      subjectInventoryStatus: subjectInventory.status,
      evaluatorInventorySha256: evaluatorInventory.hash,
      subjectInventorySha256: subjectInventory.hash,
      dependencySurfaceMatches,
      // package.json allows scripts/metadata drift; lockfiles require exact blobs and valid JSON.
      matches: isLockfile ? fullBlobMatches && dependencySurfaceMatches : dependencySurfaceMatches,
    }];
  }));
  return {
    evaluatorCommit,
    subjectCommit,
    manifests,
    allMatch: Object.values(manifests).every((manifest) => manifest.matches),
  };
}

function assertDependencyManifestParity(provenance) {
  if (provenance.allMatch) return;
  const mismatches = Object.entries(provenance.manifests)
    .filter(([, manifest]) => !manifest.matches)
    .map(([relativePath, manifest]) => {
      const reason = relativePath.endsWith('package-lock.json') ? 'lock blob' : 'dependency surface';
      return `${relativePath} (${reason}): evaluator=${manifest.evaluator || 'missing'}, subject=${manifest.subject || 'missing'}`;
    });
  throw new Error(`dependency manifest mismatch for ${provenance.subjectCommit}: ${mismatches.join('; ')}`);
}

async function withDetachedWorktree(evaluatorRoot, commit, label, dependencyProvenance, run) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `context-lifecycle-${label}-`));
  let added = false;
  let submoduleHandle = null;
  try {
    runGit(evaluatorRoot, ['worktree', 'add', '--detach', tempRoot, commit]);
    added = true;
    submoduleHandle = await materializeStableSubmodule(evaluatorRoot, tempRoot, commit, 'rex-harness');
    const linkedDependencies = [];
    for (const relativePath of ['node_modules', 'mcp-server/node_modules']) {
      const lockPath = relativePath.startsWith('mcp-server/') ? 'mcp-server/package-lock.json' : 'package-lock.json';
      const lockManifest = dependencyProvenance.manifests[lockPath];
      linkedDependencies.push(await materializeLocalDependency(
        evaluatorRoot,
        tempRoot,
        relativePath,
        { ...lockManifest, committedLockText: resolveBlobText(evaluatorRoot, commit, lockPath) },
      ));
    }
    const result = await run(tempRoot);
    return {
      ...result,
      materialization: { submodule: submoduleHandle.provenance, linkedDependencies },
    };
  } finally {
    if (submoduleHandle) {
      try {
        runGit(submoduleHandle.sourcePath, ['worktree', 'remove', '--force', submoduleHandle.targetPath]);
      } catch {
        // The top-level worktree cleanup below still removes the subject tree.
      }
      try {
        runGit(submoduleHandle.sourcePath, ['worktree', 'prune']);
      } catch {
        // Cleanup noise must not replace the benchmark failure.
      }
    }
    if (added) {
      try {
        runGit(evaluatorRoot, ['worktree', 'remove', '--force', tempRoot]);
      } catch {
        // A final filesystem cleanup below prevents stale temporary artifacts.
      }
    }
    await rm(tempRoot, { recursive: true, force: true });
    try {
      runGit(evaluatorRoot, ['worktree', 'prune']);
    } catch {
      // The primary result or error remains more useful than cleanup noise.
    }
  }
}

function normalizePathForCompare(value) {
  let resolved;
  try {
    resolved = realpathSync(value);
  } catch {
    resolved = path.resolve(value);
  }
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function parsePinnedSubmoduleCommit(treeEntry, relativePath) {
  const match = /^160000 commit ([0-9a-f]+)\t(.+)$/u.exec(String(treeEntry || '').trim());
  if (!match || match[2] !== relativePath) {
    throw new Error(`commit does not contain a pinned submodule at ${relativePath}`);
  }
  return match[1];
}

export function assertSubmodulePin(expectedCommit, sourceCommit, relativePath) {
  if (expectedCommit !== sourceCommit) {
    throw new Error(`submodule ${relativePath} is not at ${expectedCommit}; found ${sourceCommit}`);
  }
}

export async function materializeStableSubmodule(evaluatorRoot, subjectRoot, commit, relativePath) {
  const treeEntry = runGit(evaluatorRoot, ['ls-tree', commit, relativePath]);
  const expectedCommit = parsePinnedSubmoduleCommit(treeEntry, relativePath);
  const sourcePath = path.join(evaluatorRoot, relativePath);
  const targetPath = path.join(subjectRoot, relativePath);
  try {
    await access(path.join(sourcePath, '.git'));
  } catch {
    throw new Error(`submodule ${relativePath} is absent or uninitialized at ${sourcePath}`);
  }
  const sourceTopLevel = runGit(sourcePath, ['rev-parse', '--show-toplevel']);
  if (normalizePathForCompare(sourceTopLevel) !== normalizePathForCompare(sourcePath)) {
    throw new Error(`submodule ${relativePath} is not an independent checkout at ${sourcePath}`);
  }
  runGit(sourcePath, ['cat-file', '-e', `${expectedCommit}^{commit}`]);
  runGit(sourcePath, ['worktree', 'prune']);
  await rm(targetPath, { recursive: true, force: true });
  runGit(sourcePath, ['worktree', 'add', '--detach', targetPath, expectedCommit]);
  return {
    provenance: { path: relativePath, commit: expectedCommit, strategy: 'git-worktree' },
    sourcePath,
    targetPath,
  };
}

export async function materializeLocalDependency(evaluatorRoot, subjectRoot, relativePath, expectedLock = {}) {
  const sourcePath = path.join(evaluatorRoot, relativePath);
  const targetPath = path.join(subjectRoot, relativePath);
  await access(sourcePath);
  const installedLockPath = path.join(sourcePath, '.package-lock.json');
  let installedLockText;
  try {
    installedLockText = await readFile(installedLockPath, 'utf8');
  } catch {
    throw new Error(`installed dependency tree is missing ${path.join(relativePath, '.package-lock.json')}`);
  }
  const evaluatorInstalledLockSha256 = sha256Text(installedLockText);
  const evaluatorInstalledInventorySha256 = lockInventoryState(installedLockText).hash;
  if (!installedPackagesMatchCommittedLock(installedLockText, expectedLock.committedLockText || null)) {
    throw new Error(`installed dependency inventory does not match committed lock for ${relativePath}`);
  }
  await rm(targetPath, { recursive: true, force: true });
  await mkdir(path.dirname(targetPath), { recursive: true });
  await symlink(sourcePath, targetPath, process.platform === 'win32' ? 'junction' : 'dir');
  const subjectInstalledLockText = await readFile(path.join(targetPath, '.package-lock.json'), 'utf8');
  const subjectInstalledLockSha256 = sha256Text(subjectInstalledLockText);
  const subjectInstalledInventorySha256 = lockInventoryState(subjectInstalledLockText).hash;
  if (subjectInstalledLockSha256 !== evaluatorInstalledLockSha256 || subjectInstalledInventorySha256 !== evaluatorInstalledInventorySha256) {
    throw new Error(`linked dependency tree changed while materializing ${relativePath}`);
  }
  return {
    path: relativePath,
    linkType: process.platform === 'win32' ? 'junction' : 'directory-symlink',
    committedLockBlobSha256: expectedLock.subject || null,
    committedInventorySha256: expectedLock.subjectInventorySha256 || null,
    evaluatorInstalledLockSha256: evaluatorInstalledLockSha256,
    subjectInstalledLockSha256,
    evaluatorInstalledInventorySha256,
    subjectInstalledInventorySha256,
    installedPackagesMatchCommittedLock: true,
    integrityCoverage: 'version-and-structure-only',
  };
}

async function runSubject({ evaluatorRoot, subjectRoot, profile, outputDir, label }) {
  const sourceRunner = path.join(evaluatorRoot, 'scripts', 'benchmarks', RUNNER_NAME);
  const targetDir = path.join(subjectRoot, 'scripts', 'benchmarks');
  const targetRunner = path.join(targetDir, `.context-lifecycle-differential-${process.pid}-${label}.mjs`);
  const jsonPath = path.join(outputDir, `${label}.json`);
  const markdownPath = path.join(outputDir, `${label}.md`);
  await mkdir(targetDir, { recursive: true });
  await copyFile(sourceRunner, targetRunner);
  try {
    const processResult = spawnSync(process.execPath, [
      targetRunner,
      '--profile', profile,
      '--json-out', jsonPath,
      '--markdown-out', markdownPath,
    ], {
      cwd: subjectRoot,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 600_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    let summary;
    try {
      summary = JSON.parse(await readFile(jsonPath, 'utf8'));
    } catch (error) {
      throw new Error([
        `benchmark ${label} produced no readable JSON output: ${error?.message || error}`,
        `exitCode=${processResult.status}`,
        `stdout=${String(processResult.stdout || '').trim()}`,
        `stderr=${String(processResult.stderr || processResult.error?.message || '').trim()}`,
      ].join('\n'));
    }
    return {
      summary,
      exitCode: Number.isInteger(processResult.status) ? processResult.status : -1,
      stdout: String(processResult.stdout || ''),
      stderr: String(processResult.stderr || processResult.error?.message || ''),
    };
  } finally {
    await rm(targetRunner, { force: true });
  }
}

function renderMarkdown(result) {
  const linked = (subject) => subject.materialization.linkedDependencies
    .map((dependency) => `${dependency.path} [installed=${dependency.evaluatorInstalledLockSha256?.slice(0, 12) || 'missing'}]`)
    .join(', ') || '(none)';
  const lines = [
    '# Context Lifecycle V1 Immutable Differential Validation',
    '',
    `- Result: **${result.passed ? 'PASS' : 'FAIL'}**`,
    `- Evaluator commit: \`${result.evaluator.commit}\``,
    `- Baseline commit: \`${result.subjects.baseline.commit}\``,
    `- Post commit: \`${result.subjects.post.commit}\``,
    `- Runner SHA-256: \`${result.runnerSha256}\``,
    `- Comparable scenarios: ${result.comparableScenarioIds.join(', ') || '(none)'}`,
    `- N/A scenarios: ${result.notApplicableScenarioIds.join(', ') || '(none)'}`,
    `- Baseline overlay: ${result.subjects.baseline.materialization.submodule.path}@${result.subjects.baseline.materialization.submodule.commit}; linked ${linked(result.subjects.baseline)}`,
    `- Post overlay: ${result.subjects.post.materialization.submodule.path}@${result.subjects.post.materialization.submodule.commit}; linked ${linked(result.subjects.post)}`,
    `- Dependency manifest parity: baseline=${result.dependencyProvenance.baseline.allMatch ? 'match' : 'mismatch'}, post=${result.dependencyProvenance.post.allMatch ? 'match' : 'mismatch'}`,
    '- Installed dependency provenance checks package versions/structure; it does not assert registry `resolved`/`integrity` fields or supply-chain identity.',
    '## Evidence boundary',
    '',
    '- Both subjects were resolved to immutable commits from a clean evaluator checkout.',
    '- The subject commit identity is immutable, but the benchmark overlays a verified local submodule and linked evaluator dependencies; those overlays are recorded below.',
    '- This is same-runner controlled synthetic validation, not independent-oracle or real-project validation.',
    '- It cannot enable pilot or default enforcement.',
    '',
  ];
  if (result.errors.length > 0) {
    lines.push('## Errors', '');
    for (const error of result.errors) lines.push(`- ${error}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function writeFailureEvidence(outputDir, {
  evaluatorCommit,
  baselineCommit,
  postCommit,
  dependencyProvenance,
  runnerSha256,
  phase,
  error,
}) {
  const result = {
    schemaVersion: 1,
    kind: 'context-lifecycle-v1-immutable-differential',
    passed: false,
    phase,
    errors: [String(error?.message || error)],
    runnerSha256,
    comparableScenarioIds: [],
    notApplicableScenarioIds: [],
    evaluator: { commit: evaluatorCommit },
    subjects: {
      baseline: { commit: baselineCommit },
      post: { commit: postCommit },
    },
    dependencyProvenance,
    evidenceBoundary: {
      controlledSynthetic: true,
      immutableSubjectCommits: true,
      immutableSubjects: false,
      controlledOverlays: phase !== 'dependency-parity',
      cleanEvaluator: true,
      independentOracle: false,
      realProjectSamples: 0,
      releaseGatePassed: false,
      enforcementDecision: 'NO-GO',
    },
  };
  await writeFile(path.join(outputDir, 'comparison.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outputDir, 'comparison.md'), [
    '# Context Lifecycle V1 Immutable Differential Validation',
    '',
    '- Result: **FAIL**',
    `- Phase: \`${phase}\``,
    `- Evaluator commit: \`${evaluatorCommit}\``,
    `- Baseline commit: \`${baselineCommit}\``,
    `- Post commit: \`${postCommit}\``,
    `- Runner SHA-256: \`${runnerSha256 || '(unavailable)'}\``,
    '',
    '## Evidence boundary',
    '',
    '- No valid comparison result was produced; release decision remains NO-GO.',
    '',
    '## Errors',
    '',
    `- ${result.errors[0]}`,
    '',
  ].join('\n'), 'utf8');
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evaluatorCommit = assertCleanEvaluator(options.evaluatorRoot);
  const baselineCommit = resolveImmutableCommit(options.evaluatorRoot, options.baselineRef);
  const postCommit = resolveImmutableCommit(options.evaluatorRoot, options.postRef);
  if (baselineCommit === postCommit) throw new Error('baseline and post must resolve to different commits');
  await mkdir(options.outputDir, { recursive: true });
  let dependencyProvenance;
  const runnerSha256 = sha256Text(await readFile(path.join(options.evaluatorRoot, 'scripts', 'benchmarks', RUNNER_NAME), 'utf8'));
  const writeFailure = async (error, phase) => {
    const failure = await writeFailureEvidence(options.outputDir, {
      evaluatorCommit,
      baselineCommit,
      postCommit,
      dependencyProvenance,
      runnerSha256,
      phase,
      error,
    });
    process.stderr.write(`${error?.stack || error}\n`);
    process.stdout.write(`${JSON.stringify({ passed: false, jsonPath: path.join(options.outputDir, 'comparison.json'), markdownPath: path.join(options.outputDir, 'comparison.md') })}\n`);
    process.exitCode = failure.passed ? 0 : 1;
  };
  try {
    dependencyProvenance = {
      baseline: dependencyManifestProvenance(options.evaluatorRoot, evaluatorCommit, baselineCommit),
      post: dependencyManifestProvenance(options.evaluatorRoot, evaluatorCommit, postCommit),
    };
    assertDependencyManifestParity(dependencyProvenance.baseline);
    assertDependencyManifestParity(dependencyProvenance.post);
  } catch (error) {
    await writeFailure(error, 'dependency-parity');
    return;
  }

  let baselineRun;
  let postRun;
  try {
    baselineRun = await withDetachedWorktree(options.evaluatorRoot, baselineCommit, 'baseline', dependencyProvenance.baseline, async (subjectRoot) => await runSubject({
      evaluatorRoot: options.evaluatorRoot,
      subjectRoot,
      profile: 'baseline',
      outputDir: options.outputDir,
      label: 'baseline',
    }));
    postRun = await withDetachedWorktree(options.evaluatorRoot, postCommit, 'post', dependencyProvenance.post, async (subjectRoot) => await runSubject({
      evaluatorRoot: options.evaluatorRoot,
      subjectRoot,
      profile: 's2',
      outputDir: options.outputDir,
      label: 'post',
    }));
  } catch (error) {
    await writeFailure(error, 'subject-materialization-or-run');
    return;
  }
  const compared = compareBenchmarkResults({ baseline: baselineRun.summary, post: postRun.summary });
  const result = {
    ...compared,
    kind: 'context-lifecycle-v1-immutable-differential',
    evaluator: { commit: evaluatorCommit },
    subjects: {
      baseline: {
        commit: baselineCommit,
        worktreeDirty: baselineRun.summary.worktreeDirty,
        worktreeOverlayFiles: baselineRun.summary.worktreeOverlayFiles || [],
        materialization: baselineRun.materialization,
      },
      post: {
        commit: postCommit,
        worktreeDirty: postRun.summary.worktreeDirty,
        worktreeOverlayFiles: postRun.summary.worktreeOverlayFiles || [],
        materialization: postRun.materialization,
      },
    },
    dependencyProvenance,
    commandExitCodes: { baseline: baselineRun.exitCode, post: postRun.exitCode },
    evidenceBoundary: {
      controlledSynthetic: true,
      immutableSubjectCommits: true,
      immutableSubjects: false,
      controlledOverlays: true,
      cleanEvaluator: true,
      independentOracle: false,
      realProjectSamples: 0,
      releaseGatePassed: false,
      enforcementDecision: 'NO-GO',
    },
  };
  if (baselineRun.exitCode !== 0) result.errors.push('baseline runner exited non-zero');
  if (postRun.exitCode !== 0) result.errors.push('post runner exited non-zero');
  result.passed = result.errors.length === 0;

  const jsonPath = path.join(options.outputDir, 'comparison.json');
  const markdownPath = path.join(options.outputDir, 'comparison.md');
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, renderMarkdown(result), 'utf8');
  process.stdout.write(`${JSON.stringify({ passed: result.passed, jsonPath, markdownPath })}\n`);
  process.exitCode = result.passed ? 0 : 1;
}

const isMain = process.argv[1] && normalizePathForCompare(process.argv[1]) === normalizePathForCompare(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
