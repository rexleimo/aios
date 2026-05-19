import { access, readFile } from 'node:fs/promises';
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
    AIOS_FIRST_SETUP: '0',
  };

  if (process.platform === 'win32') {
    const script = `$env:AIOS_REPO='${repo}'; $env:AIOS_INSTALL_DIR='${rootDir.replaceAll("'", "''")}'; $env:AIOS_FIRST_SETUP='0'; irm https://github.com/${repo}/releases/latest/download/aios-install.ps1 | iex`;
    io.log('+ runtime self-update: GitHub Releases installer (PowerShell)');
    await runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { cwd: process.env.HOME || rootDir, env, io });
    return { method: 'release-installer', updated: true, skipped: false };
  }

  const script = `curl -fsSL https://github.com/${repo}/releases/latest/download/aios-install.sh | bash`;
  io.log('+ runtime self-update: GitHub Releases installer');
  await runCommand('bash', ['-lc', script], { cwd: process.env.HOME || rootDir, env, io });
  return { method: 'release-installer', updated: true, skipped: false };
}

export async function updateHarnessRuntime({ rootDir, repo = process.env.AIOS_REPO || DEFAULT_REPO, io = console } = {}) {
  const before = await readVersion(rootDir);
  if (before) {
    io.log(`Runtime version: ${before}`);
  }

  const result = await hasGitWorktree(rootDir)
    ? await updateFromGit(rootDir, io)
    : await updateFromReleaseInstaller(rootDir, { repo, io });

  const after = await readVersion(rootDir);
  if (after && after !== before) {
    io.log(`Runtime version after update: ${after}`);
  }
  return { ...result, beforeVersion: before, afterVersion: after };
}
