import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_REPO = 'rexleimo/harness-cli';

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

async function isGitDirty(rootDir) {
  const result = await runCommand('git', ['status', '--porcelain'], {
    cwd: rootDir,
    io: { log: () => {}, error: () => {} },
  });
  return result.stdout.trim().length > 0;
}

async function updateFromGit(rootDir, io) {
  if (await isGitDirty(rootDir)) {
    io.log('[warn] runtime self-update skipped: git worktree has local changes');
    io.log('       Commit/stash them, or update the release install outside this checkout.');
    return { method: 'git', updated: false, skipped: true };
  }

  io.log('+ runtime self-update: git pull --ff-only');
  await runCommand('git', ['pull', '--ff-only'], { cwd: rootDir, io });
  return { method: 'git', updated: true, skipped: false };
}

async function updateFromReleaseInstaller(rootDir, { repo, io }) {
  const env = {
    ...process.env,
    AIOS_REPO: repo,
    AIOS_INSTALL_DIR: rootDir,
  };

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
      : `irm ("https://github.com/{0}/releases/latest/download/aios-install.ps1" -f $env:AIOS_REPO) | iex`;
    const script = [
      '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12',
      `$env:AIOS_REPO='${psRepo}'`,
      `$env:AIOS_INSTALL_DIR='${psRootDir}'`,
      installerCmd,
    ].join('; ');
    io.log('+ runtime self-update: GitHub Releases installer (PowerShell)');
    await runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { cwd: process.env.USERPROFILE || process.env.HOME || rootDir, env, io });
    return { method: 'release-installer', updated: true, skipped: false };
  }

  const script = `curl -fsSL https://github.com/${repo}/releases/latest/download/aios-install.sh | bash`;
  io.log('+ runtime self-update: GitHub Releases installer');
  await runCommand('bash', ['-lc', script], { cwd: process.env.HOME || process.env.USERPROFILE || rootDir, env, io });
  return { method: 'release-installer', updated: true, skipped: false };
}

/**
 * Windows cannot delete a directory that is the current working directory of a
 * running process. The installer replaces the install tree in place, so if this
 * process's cwd is inside the install tree the remove step fails silently and
 * the new version ends up nested at <install>/harness-cli/, breaking re-exec.
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

export async function updateHarnessRuntime({ rootDir, repo = process.env.AIOS_REPO || DEFAULT_REPO, io = console } = {}) {
  const before = await readVersion(rootDir);
  if (before) {
    io.log(`Runtime version: ${before}`);
  }

  const result = await hasGitWorktree(rootDir)
    ? await updateFromGit(rootDir, io)
    : (ensureWorkingDirectoryOutsideInstallTree(rootDir, io),
       await updateFromReleaseInstaller(rootDir, { repo, io }));

  const after = await readVersion(rootDir);
  if (after && after !== before) {
    io.log(`Runtime version after update: ${after}`);
  }
  return { ...result, beforeVersion: before, afterVersion: after };
}
