import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { resolveNewestStableRelease } from './release-lookup.mjs';

const DEFAULT_REPO = 'rexleimo/aios';

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runCommand(command, args, { cwd, env = process.env, io = console } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      stdout += text;
      if (io.log) io.log(text.trimEnd());
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      stderr += text;
      if (io.error) io.error(text.trimEnd());
      else if (io.log) io.log(text.trimEnd());
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit ${code}`));
    });
  });
}

function quotePowerShellSingleString(value) {
  return String(value).replaceAll("'", "''");
}

async function readVersion(rootDir) {
  try {
    return (await readFile(path.join(rootDir, 'VERSION'), 'utf8')).trim();
  } catch {
    return '';
  }
}

async function hasGitWorktree(rootDir) {
  return pathExists(path.join(rootDir, '.git'));
}

async function isGitDirty(rootDir, run = runCommand) {
  const result = await run('git', ['status', '--porcelain'], {
    cwd: rootDir,
    io: { log: () => {}, error: () => {} },
  });
  return result.stdout.trim().length > 0;
}

async function updateFromGit(rootDir, io, run = runCommand) {
  if (await isGitDirty(rootDir, run)) {
    io.log('[warn] runtime self-update skipped: git worktree has local changes');
    io.log('       Commit/stash them, or update the release install outside this checkout.');
    return { method: 'git', updated: false, skipped: true };
  }

  io.log('+ runtime self-update: git pull --ff-only');
  await run('git', ['pull', '--ff-only'], { cwd: rootDir, io });
  // 中文注释：pull 只前移 gitlink；不同步子模块工作树的话 rex-harness 会停在旧代码，
  // 新主仓脚本配旧内核。rex-harness 是必需内核，这里失败必须响亮报出。
  io.log('+ runtime self-update: git submodule update --init --recursive');
  await run('git', ['submodule', 'update', '--init', '--recursive'], { cwd: rootDir, io });
  return { method: 'git', updated: true, skipped: false, submodulesSynced: true };
}

function compareVersionStrings(current, candidate) {
  const parse = (value) => /^(\d+)\.(\d+)\.(\d+)/u.exec(String(value || '').trim());
  const c = parse(current);
  const l = parse(candidate);
  if (!c || !l) return 'invalid';
  for (let i = 1; i <= 3; i += 1) {
    const a = Number(c[i]);
    const b = Number(l[i]);
    if (b > a) return 'newer';
    if (b < a) return 'older';
  }
  return 'equal';
}

async function updateFromReleaseInstaller(rootDir, {
  repo,
  io,
  run = runCommand,
  currentVersion = '',
  resolveNewestRelease = null,
} = {}) {
  // 中文注释：防降级守卫 —— GitHub releases/latest 按创建时间排序，补发旧版本会
  // 抢占 latest。这里优先用调用方注入的 semver-max 查询拿到精确 tag；查询失败
  // 时退回 releases/latest 但保持旧行为。拿到 tag 后按 tag 精确拉取资产。
  let newest = null;
  if (typeof resolveNewestRelease === 'function') {
    try {
      newest = await resolveNewestRelease({ repo });
    } catch (error) {
      io.log(`[warn] release lookup failed: ${error instanceof Error ? error.message : error}; falling back to releases/latest`);
    }
  }
  if (newest?.version && currentVersion) {
    const relation = compareVersionStrings(currentVersion, newest.version);
    if (relation === 'equal' || relation === 'older') {
      io.log(
        `[info] runtime self-update skipped: installed ${currentVersion} is not older than `
        + `newest stable release ${newest.version}; refusing to downgrade via releases/latest.`,
      );
      return {
        method: 'release-installer',
        updated: false,
        skipped: true,
        reason: 'not-newer-than-installed',
        remoteVersion: newest.version,
      };
    }
  }

  const releaseSegment = newest?.tag ? `releases/download/${newest.tag}` : 'releases/latest';
  const env = {
    ...process.env,
    AIOS_REPO: repo,
    AIOS_INSTALL_DIR: rootDir,
  };
  const assetName = process.platform === 'win32' ? 'aios.zip' : 'aios.tar.gz';
  if (newest?.tag) {
    env.AIOS_RELEASE_TAG = newest.tag;
    // AIOS_ASSET_URL 自旧版安装器起就被支持，即使本地安装器不识别新
    // AIOS_RELEASE_TAG 也能锁定精确版本的资产。
    env.AIOS_ASSET_URL = `https://github.com/${repo}/releases/download/${newest.tag}/${assetName}`;
  }

  if (process.platform === 'win32') {
    const psRepo = quotePowerShellSingleString(repo);
    const psRootDir = quotePowerShellSingleString(rootDir);
    // Prefer the local installer when present: it carries the same defensive
    // remove-then-verify logic as the released script and avoids depending on
    // a remote fetch for the exact code being executed. Remote is the fallback
    // for minimal checkouts that shipped without scripts/aios-install.ps1.
    const localInstaller = path.join(rootDir, 'scripts', 'aios-install.ps1');
    const installerCmd = await pathExists(localInstaller)
      ? `& '${quotePowerShellSingleString(localInstaller)}'`
      : `irm "https://github.com/${repo}/${releaseSegment}/download/aios-install.ps1" | iex`;
    const script = [
      '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12',
      `$env:AIOS_REPO='${psRepo}'`,
      `$env:AIOS_INSTALL_DIR='${psRootDir}'`,
      installerCmd,
    ].join('; ');
    io.log('+ runtime self-update: GitHub Releases installer (PowerShell)');
    await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { cwd: process.env.USERPROFILE || process.env.HOME || rootDir, env, io });
    return { method: 'release-installer', updated: true, skipped: false };
  }

  const script = `curl -fsSL https://github.com/${repo}/${releaseSegment}/download/aios-install.sh | bash`;
  io.log('+ runtime self-update: GitHub Releases installer');
  await run('bash', ['-lc', script], { cwd: process.env.HOME || process.env.USERPROFILE || rootDir, env, io });
  return { method: 'release-installer', updated: true, skipped: false };
}

/**
 * Windows cannot delete a directory that is the current working directory of a
 * running process. The installer replaces the install tree in place, so if this
 * process's cwd is inside the install tree the remove step fails silently and
 * the new version ends up nested at <install>/aios/, breaking re-exec.
 * Move the working directory outside the install tree before running the
 * release installer.
 *
 * @returns {boolean} true when the working directory was moved.
 */
export function ensureWorkingDirectoryOutsideInstallTree(rootDir, io = console) {
  const resolved = path.resolve(rootDir);
  const cwd = process.cwd();
  if (cwd !== resolved && !cwd.startsWith(resolved + path.sep)) {
    return false;
  }
  const outside = process.env.USERPROFILE || process.env.HOME || os.tmpdir();
  process.chdir(outside);
  io.log(`[info] moved working directory out of install tree: ${outside}`);
  return true;
}

export async function updateHarnessRuntime({
  rootDir,
  repo = process.env.AIOS_REPO || DEFAULT_REPO,
  io = console,
  runCommandImpl = runCommand,
  resolveNewestRelease,
} = {}) {
  const before = await readVersion(rootDir);
  if (before) {
    io.log(`Runtime version: ${before}`);
  }

  const releaseResolver = resolveNewestRelease ?? resolveNewestStableRelease;

  const result = await hasGitWorktree(rootDir)
    ? await updateFromGit(rootDir, io, runCommandImpl)
    : (ensureWorkingDirectoryOutsideInstallTree(rootDir, io),
       await updateFromReleaseInstaller(rootDir, {
         repo,
         io,
         run: runCommandImpl,
         currentVersion: before,
         resolveNewestRelease: releaseResolver,
       }));

  const after = await readVersion(rootDir);
  if (after && after !== before) {
    io.log(`Runtime version after update: ${after}`);
  }
  return { ...result, beforeVersion: before, afterVersion: after };
}
