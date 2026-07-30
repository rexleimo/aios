import { spawnSync } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

async function withDetachedWorktree(evaluatorRoot, commit, label, run) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `context-lifecycle-${label}-`));
  let added = false;
  try {
    runGit(evaluatorRoot, ['worktree', 'add', '--detach', tempRoot, commit]);
    await materializeStableSubmodule(evaluatorRoot, tempRoot, commit, 'rex-harness');
    added = true;
    return await run(tempRoot);
  } finally {
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

async function materializeStableSubmodule(evaluatorRoot, subjectRoot, commit, relativePath) {
  const sourcePath = path.join(evaluatorRoot, relativePath);
  const targetPath = path.join(subjectRoot, relativePath);
  let sourceCommit;
  try {
    sourceCommit = runGit(sourcePath, ['rev-parse', 'HEAD']);
  } catch {
    return;
  }
  const treeEntry = runGit(evaluatorRoot, ['ls-tree', commit, relativePath]);
  const expectedCommit = String(treeEntry.split(/\s+/u)[2] || '').trim();
  if (expectedCommit && sourceCommit !== expectedCommit) {
    throw new Error(`submodule ${relativePath} is not at ${expectedCommit}; found ${sourceCommit}`);
  }
  await rm(targetPath, { recursive: true, force: true });
  await cp(sourcePath, targetPath, {
    recursive: true,
    filter: (source) => path.basename(source) !== '.git',
  });
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
    '',
    '## Evidence boundary',
    '',
    '- Both subjects were resolved to immutable commits from a clean evaluator checkout.',
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evaluatorCommit = assertCleanEvaluator(options.evaluatorRoot);
  const baselineCommit = resolveImmutableCommit(options.evaluatorRoot, options.baselineRef);
  const postCommit = resolveImmutableCommit(options.evaluatorRoot, options.postRef);
  if (baselineCommit === postCommit) throw new Error('baseline and post must resolve to different commits');
  await mkdir(options.outputDir, { recursive: true });

  const baselineRun = await withDetachedWorktree(options.evaluatorRoot, baselineCommit, 'baseline', async (subjectRoot) => await runSubject({
    evaluatorRoot: options.evaluatorRoot,
    subjectRoot,
    profile: 'baseline',
    outputDir: options.outputDir,
    label: 'baseline',
  }));
  const postRun = await withDetachedWorktree(options.evaluatorRoot, postCommit, 'post', async (subjectRoot) => await runSubject({
    evaluatorRoot: options.evaluatorRoot,
    subjectRoot,
    profile: 's2',
    outputDir: options.outputDir,
    label: 'post',
  }));
  const compared = compareBenchmarkResults({ baseline: baselineRun.summary, post: postRun.summary });
  const result = {
    ...compared,
    kind: 'context-lifecycle-v1-immutable-differential',
    evaluator: { commit: evaluatorCommit },
    subjects: {
      baseline: { commit: baselineCommit },
      post: { commit: postCommit },
    },
    commandExitCodes: { baseline: baselineRun.exitCode, post: postRun.exitCode },
    evidenceBoundary: {
      controlledSynthetic: true,
      immutableSubjects: true,
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

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
