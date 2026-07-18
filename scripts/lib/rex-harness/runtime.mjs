/* 中文注释：AIOS 把 rex-harness 当作智能规划的必需内核，统一检查、修复和诊断入口。 */
import { access, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { captureCommand, commandExists } from '../platform/process.mjs';

export const REX_HARNESS_REQUIRED_FILES = Object.freeze([
  'package.json',
  'src/index.mjs',
  'bin/rex-harness.mjs',
  'skill-sources/rex-workflow/SKILL.md',
]);

function resolveRoot(rootDir) {
  return path.resolve(rootDir || process.cwd());
}

function resolveRexRoot(rootDir) {
  return path.join(resolveRoot(rootDir), 'rex-harness');
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readVersion(rexRoot) {
  try {
    const packageJson = JSON.parse(await readFile(path.join(rexRoot, 'package.json'), 'utf8'));
    return typeof packageJson.version === 'string' ? packageJson.version : '';
  } catch {
    return '';
  }
}

/**
 * 仅当目录看起来是 AIOS 源码或 Release 根目录时才启用必需内核门禁，
 * 避免生命周期单元测试传入的任意临时项目被误判为 AIOS 安装。
 */
export function isAiosRuntimeRoot(rootDir) {
  const root = resolveRoot(rootDir);
  return [
    path.join(root, 'scripts', 'aios.mjs'),
    path.join(root, '.gitmodules'),
    path.join(root, 'rex-harness'),
  ].some((candidate) => {
    return existsSync(candidate);
  });
}

export async function inspectRexHarness({ rootDir } = {}) {
  const root = resolveRoot(rootDir);
  const rexRoot = resolveRexRoot(root);
  const missing = [];

  for (const relativePath of REX_HARNESS_REQUIRED_FILES) {
    if (!await fileExists(path.join(rexRoot, relativePath))) {
      missing.push(relativePath);
    }
  }

  return Object.freeze({
    ready: missing.length === 0,
    rootDir: root,
    rexRoot,
    missing: Object.freeze(missing),
    version: missing.includes('package.json') ? '' : await readVersion(rexRoot),
  });
}

function missingFixHint({ rootDir, hasGitmodules }) {
  if (hasGitmodules) {
    return `Run: git -C "${rootDir}" submodule update --init --recursive -- rex-harness`;
  }
  return 'Reinstall the AIOS release that bundles rex-harness, or clone the source with --recurse-submodules.';
}

export async function ensureRexHarness({
  rootDir,
  fix = false,
  io = console,
  commandAvailable = commandExists,
  commandRunner = captureCommand,
} = {}) {
  const root = resolveRoot(rootDir);
  let report = await inspectRexHarness({ rootDir: root });
  if (report.ready) {
    return Object.freeze({ ...report, attemptedFix: false, fixHint: '' });
  }

  const hasGitmodules = await fileExists(path.join(root, '.gitmodules'));
  const fixHint = missingFixHint({ rootDir: root, hasGitmodules });
  if (!fix || !hasGitmodules) {
    return Object.freeze({ ...report, attemptedFix: false, fixHint });
  }

  if (!commandAvailable('git')) {
    return Object.freeze({
      ...report,
      attemptedFix: false,
      fixHint: 'Git is required to initialize the rex-harness submodule. Install Git and rerun AIOS setup.',
    });
  }

  io.log('+ initialize required rex-harness submodule');
  const result = await commandRunner(
    'git',
    ['submodule', 'update', '--init', '--recursive', '--', 'rex-harness'],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.status === 0) {
    report = await inspectRexHarness({ rootDir: root });
  }

  return Object.freeze({
    ...report,
    attemptedFix: true,
    fixHint: report.ready
      ? ''
      : `${fixHint}${result.stderr ? ` (${String(result.stderr).trim()})` : ''}`,
  });
}

export async function doctorRexHarness({ rootDir, fix = false, io = console } = {}) {
  const report = await ensureRexHarness({ rootDir, fix, io });
  if (report.ready) {
    io.log(`[ok] rex-harness ready${report.version ? ` (v${report.version})` : ''}`);
    return Object.freeze({ ...report, errors: 0, effectiveWarnings: 0 });
  }

  io.log(`[error] rex-harness is required for AIOS intelligent planning; missing: ${report.missing.join(', ')}`);
  io.log(`[fix] ${report.fixHint}`);
  return Object.freeze({ ...report, errors: 1, effectiveWarnings: 1 });
}
