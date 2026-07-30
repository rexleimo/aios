import { spawnSync } from 'node:child_process';
import { access, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNNER_NAME = 'context-lifecycle-v1.mjs';

function parseArgs(argv) {
  const options = { baselineRoot: '', postRoot: ROOT, outputDir: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = String(argv[index] || '');
    const value = String(argv[index + 1] || '');
    if (!['--baseline-root', '--post-root', '--output-dir'].includes(flag)) {
      throw new Error(`unknown argument: ${flag}`);
    }
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${flag}`);
    if (flag === '--baseline-root') options.baselineRoot = path.resolve(value);
    if (flag === '--post-root') options.postRoot = path.resolve(value);
    if (flag === '--output-dir') options.outputDir = path.resolve(value);
    index += 1;
  }
  if (!options.baselineRoot) throw new Error('--baseline-root is required');
  if (!options.outputDir) throw new Error('--output-dir is required');
  return options;
}

async function assertReadable(filePath, label) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`${label} is unavailable: ${filePath}`);
  }
}

function scenarioById(summary) {
  const scenarios = Array.isArray(summary?.scenarios) ? summary.scenarios : [];
  return new Map(scenarios.map((scenario) => [String(scenario?.id || ''), scenario]));
}

export function compareBenchmarkResults({ baseline, post } = {}) {
  const errors = [];
  if (baseline?.kind !== 'context-lifecycle-v1-benchmark-result') errors.push('baseline result kind is invalid');
  if (post?.kind !== 'context-lifecycle-v1-benchmark-result') errors.push('post result kind is invalid');
  if (baseline?.profile !== 'baseline') errors.push('baseline result must use the baseline profile');
  if (post?.profile !== 's2') errors.push('post result must use the s2 profile');
  if (!baseline?.runnerSha256 || baseline.runnerSha256 !== post?.runnerSha256) {
    errors.push('baseline and post results were not produced by the same runner');
  }
  if (baseline?.passed !== true) errors.push('baseline profile did not reproduce its declared behavior');
  if (post?.passed !== true) errors.push('post profile did not satisfy the s2 contract');

  const baselineScenarios = scenarioById(baseline);
  const postScenarios = scenarioById(post);
  const baselineIds = [...baselineScenarios.keys()].filter(Boolean).sort();
  const postIds = [...postScenarios.keys()].filter(Boolean).sort();
  if (JSON.stringify(baselineIds) !== JSON.stringify(postIds)) {
    errors.push('baseline and post scenarios differ');
  }

  const comparable = [];
  const notApplicable = [];
  const improved = [];
  for (const id of baselineIds) {
    const before = baselineScenarios.get(id);
    const after = postScenarios.get(id);
    if (!after) continue;
    if (before.expectedTargetMet === null || after.expectedTargetMet === null) {
      notApplicable.push(id);
      continue;
    }
    comparable.push(id);
    if (before.targetMet !== true && after.targetMet === true) improved.push(id);
  }

  return {
    schemaVersion: 1,
    kind: 'context-lifecycle-v1-same-runner-comparison',
    passed: errors.length === 0,
    errors,
    runnerSha256: baseline?.runnerSha256 || '',
    baseline: {
      gitCommit: String(baseline?.gitCommit || ''),
      total: Number(baseline?.total || 0),
      targetMetCount: Number(baseline?.targetMetCount || 0),
    },
    post: {
      gitCommit: String(post?.gitCommit || ''),
      total: Number(post?.total || 0),
      targetMetCount: Number(post?.targetMetCount || 0),
    },
    comparableScenarioIds: comparable,
    notApplicableScenarioIds: notApplicable,
    improvedScenarioIds: improved,
    evidenceBoundary: {
      controlledSynthetic: true,
      developmentOnly: true,
      immutableSubjects: false,
      independentOracle: false,
      realProjectSamples: 0,
      releaseGatePassed: false,
    },
  };
}

function renderMarkdown(comparison) {
  const lines = [
    '# Context Lifecycle V1 Same-Runner Comparison',
    '',
    `- Comparison: **${comparison.passed ? 'PASS' : 'FAIL'}**`,
    `- Runner SHA-256: \`${comparison.runnerSha256}\``,
    `- Baseline commit: \`${comparison.baseline.gitCommit}\``,
    `- Post commit: \`${comparison.post.gitCommit}\``,
    `- Comparable scenarios: ${comparison.comparableScenarioIds.join(', ') || '(none)'}`,
    `- N/A scenarios: ${comparison.notApplicableScenarioIds.join(', ') || '(none)'}`,
    `- Improved scenarios: ${comparison.improvedScenarioIds.join(', ') || '(none)'}`,
    '',
    '## Evidence boundary',
    '',
    '- This local comparison is development-only and does not require immutable subjects.',
    '- Use context-lifecycle-v1-differential.mjs for a clean, immutable subject comparison.',
    '- It is controlled synthetic validation, not an independent oracle or real-project validation.',
    '- Enforcement remains NO-GO until independently labeled real-task samples are reviewed.',
    '',
  ];
  if (comparison.errors.length > 0) {
    lines.push('## Errors', '');
    for (const error of comparison.errors) lines.push(`- ${error}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function withCopiedRunner(rootDir, label, run) {
  const sourcePath = path.join(ROOT, 'scripts', 'benchmarks', RUNNER_NAME);
  await assertReadable(sourcePath, 'comparison runner');
  const targetDir = path.join(rootDir, 'scripts', 'benchmarks');
  const targetPath = path.join(targetDir, `.context-lifecycle-v1-compare-${process.pid}-${label}.mjs`);
  await mkdir(targetDir, { recursive: true });
  await copyFile(sourcePath, targetPath);
  try {
    return await run(targetPath);
  } finally {
    await rm(targetPath, { force: true });
  }
}

async function runProfile({ rootDir, runnerPath, profile, jsonPath, markdownPath }) {
  const result = spawnSync(process.execPath, [
    runnerPath,
    '--profile', profile,
    '--json-out', jsonPath,
    '--markdown-out', markdownPath,
  ], {
    cwd: rootDir,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 600_000,
  });
  let summary;
  try {
    summary = JSON.parse(await readFile(jsonPath, 'utf8'));
  } catch (error) {
    throw new Error(`benchmark ${profile} produced no readable JSON output: ${error?.message || error}`);
  }
  return {
    summary,
    exitCode: Number.isInteger(result.status) ? result.status : -1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || result.error?.message || ''),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await assertReadable(path.join(options.baselineRoot, 'package.json'), 'baseline root');
  await assertReadable(path.join(options.postRoot, 'package.json'), 'post root');
  await mkdir(options.outputDir, { recursive: true });

  const baselineJson = path.join(options.outputDir, 'baseline.json');
  const baselineMarkdown = path.join(options.outputDir, 'baseline.md');
  const postJson = path.join(options.outputDir, 'post.json');
  const postMarkdown = path.join(options.outputDir, 'post.md');

  const baselineRun = await withCopiedRunner(options.baselineRoot, 'baseline', (runnerPath) => runProfile({
    rootDir: options.baselineRoot,
    runnerPath,
    profile: 'baseline',
    jsonPath: baselineJson,
    markdownPath: baselineMarkdown,
  }));
  const postRun = await withCopiedRunner(options.postRoot, 'post', (runnerPath) => runProfile({
    rootDir: options.postRoot,
    runnerPath,
    profile: 's2',
    jsonPath: postJson,
    markdownPath: postMarkdown,
  }));
  const comparison = {
    ...compareBenchmarkResults({ baseline: baselineRun.summary, post: postRun.summary }),
    commandExitCodes: { baseline: baselineRun.exitCode, post: postRun.exitCode },
  };
  if (baselineRun.exitCode !== 0) comparison.errors.push('baseline runner exited non-zero');
  if (postRun.exitCode !== 0) comparison.errors.push('post runner exited non-zero');
  comparison.passed = comparison.errors.length === 0;

  const comparisonJson = path.join(options.outputDir, 'comparison.json');
  const comparisonMarkdown = path.join(options.outputDir, 'comparison.md');
  await writeFile(comparisonJson, `${JSON.stringify(comparison, null, 2)}\n`, 'utf8');
  await writeFile(comparisonMarkdown, renderMarkdown(comparison), 'utf8');
  process.stdout.write(`${JSON.stringify({
    passed: comparison.passed,
    runnerSha256: comparison.runnerSha256,
    comparisonJson,
    comparisonMarkdown,
  })}\n`);
  process.exitCode = comparison.passed ? 0 : 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
