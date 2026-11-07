import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { resolveNewestStableRelease } from '../release/release-lookup.mjs';
import { resolveCwdOutsideRootDir } from '../../../foundation/platform/aios-runtime-root.mjs';
import { downloadReleaseAsset } from '../release/release-download.mjs';

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
      windowsHide: true,
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
  // 中文注释：platform / downloadImpl / tempDirBase 是测试接缝，不是运行期旋钮。
  // 注入 platform 后 win32 分支可以在任何操作系统上被单测覆盖，不必等 Windows CI。
  platform = process.platform,
  downloadImpl = downloadReleaseAsset,
  tempDirBase = os.tmpdir(),
} = {}) {
  // 中文注释：防降级守卫 —— GitHub releases/latest 按创建时间排序，补发旧版本会
  // 抢占 latest。这里优先用调用方注入的 semver-max 查询拿到精确 tag；查询失败
  // 时退回 releases/latest 但保持旧行为。拿到 tag 后按 tag 精确拉取资产。
  let newest = null;
  // 中文注释：能注入解析器时（真实运行路径就是这样），解析失败**不允许**退回 releases/latest：
  // 那个指针按创建时间排序，补发旧版本会抢占它，于是"查询失败"会变成"装了一个没验过版本、
  // 还可能更低的包"。解析不出来就停在这儿，把原因交出去；下载本来就依赖这次解析。
  if (typeof resolveNewestRelease === 'function') {
    try {
      newest = await resolveNewestRelease({ repo });
    } catch (error) {
      io.log(`[warn] release lookup failed: ${error instanceof Error ? error.message : error}`);
      return {
        method: 'release-installer',
        updated: false,
        skipped: true,
        reason: 'release-source-unreachable',
        detail: (error && typeof error === 'object' ? error.attempts : null) ?? null,
      };
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

  // 中文注释：安装器资产 URL 的唯一拼接口径。旧写法把
  // `releases/download/<tag>` 当 segment、再在模板里补 `/download/`，tag 分支
  // 生成 `releases/download/vX.Y.Z/download/aios-install.sh` → 404；而该分支
  // 恰恰是 release 查询成功（正常路径）时才会走到。资产基址在这里一次拼对，
  // 两个平台分支只追加文件名。
  // 中文注释：只有"调用方压根没注入解析器"时才会用到 latest 指针（安装脚本等外部入口的旧行为）。
  const installerAssetBase = newest?.tag


    ? `https://github.com/${repo}/releases/download/${newest.tag}`
    : `https://github.com/${repo}/releases/latest/download`;
  const env = {
    ...process.env,
    AIOS_REPO: repo,
    AIOS_INSTALL_DIR: rootDir,
  };
  const assetName = platform === 'win32' ? 'aios.zip' : 'aios.tar.gz';
  if (newest?.tag) {
    env.AIOS_RELEASE_TAG = newest.tag;
    // AIOS_ASSET_URL 自旧版安装器起就被支持，即使本地安装器不识别新
    // AIOS_RELEASE_TAG 也能锁定精确版本的资产。
    env.AIOS_ASSET_URL = `https://github.com/${repo}/releases/download/${newest.tag}/${assetName}`;
  }

  if (platform === 'win32') {
    const psRepo = quotePowerShellSingleString(repo);
    const psRootDir = quotePowerShellSingleString(rootDir);
    // Prefer the local installer when present: it carries the same defensive
    // remove-then-verify logic as the released script and avoids depending on
    // a remote fetch for the exact code being executed. Remote is the fallback
    // for minimal checkouts that shipped without scripts/aios-install.ps1.
    const localInstaller = path.join(rootDir, 'scripts', 'aios-install.ps1');
    const remoteAssetUrl = env.AIOS_ASSET_URL
      || `https://github.com/${repo}/releases/latest/download/${assetName}`;
    // 中文注释：Windows 的 Schannel 通道（Invoke-WebRequest / git-bash curl）对 GitHub
    // CDN 会被中途重置，实测同 URL 走 Node 自带 TLS 栈稳定成功。所以先用 Node 把资产抓到
    // 暂存目录（带 zip 尾部校验，截断即重试），再让安装器读本地文件；只有 Node 抓取失败才
    // 退回安装器自身下载（那条路现在也带重试 + 截断校验）。
    let stageDir = '';
    let assetSource = 'installer-fetch';
    let stagedBytes = 0;
    try {
      try {
        stageDir = await mkdtemp(path.join(tempDirBase, 'aios-selfupdate-'));
        const stagedAsset = path.join(stageDir, assetName);
        io.log(`+ runtime self-update: staging release asset via Node fetch: ${remoteAssetUrl}`);
        const staged = await downloadImpl({ url: remoteAssetUrl, destPath: stagedAsset, io });
        env.AIOS_ASSET_URL = staged.destPath;
        assetSource = 'node-fetch';
        stagedBytes = staged.bytes;
      } catch (error) {
        // 中文注释：暂存目录已经建出来了，回退时必须本身清掉——只把变量置空会把
        // 一个空目录留在 %TEMP%（跑一次全量就漏一批，测试侧的 t.after 回收不了非己建的目录）。
        if (stageDir) await rm(stageDir, { recursive: true, force: true }).catch(() => {});
        stageDir = '';
        env.AIOS_ASSET_URL = remoteAssetUrl;
        io.log(
          `[warn] Node asset staging failed: ${error instanceof Error ? error.message : error}; `
          + 'falling back to the installer download (now retried and zip-verified)',
        );
      }

      let installerCmd;
      if (await pathExists(localInstaller)) {
        installerCmd = `& '${quotePowerShellSingleString(localInstaller)}'`;
      } else if (stageDir) {
        const stagedInstaller = path.join(stageDir, 'aios-install.ps1');
        await downloadImpl({ url: `${installerAssetBase}/aios-install.ps1`, destPath: stagedInstaller, io });
        installerCmd = `& '${quotePowerShellSingleString(stagedInstaller)}'`;
      } else {
        installerCmd = `irm "${installerAssetBase}/aios-install.ps1" | iex`;
      }

      const script = [
        '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12',
        '$ErrorActionPreference = "Stop"',
        `$env:AIOS_REPO='${psRepo}'`,
        `$env:AIOS_INSTALL_DIR='${psRootDir}'`,
        installerCmd,
      ].join('; ');
      io.log('+ runtime self-update: GitHub Releases installer (PowerShell)');
      await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { cwd: process.env.USERPROFILE || process.env.HOME || rootDir, env, io });
      return { method: 'release-installer', updated: true, skipped: false, assetSource, stagedBytes, remoteAssetUrl };
    } finally {
      if (stageDir) {
        // 暂存目录只服务本次安装：安装器已把文件拷进它自己的临时目录，留着只会堆垃圾。
        await rm(stageDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  // 中文注释：`set -o pipefail` 是失败必须响亮报出的那半修 —— 没有它，
  // `curl <404> | bash` 的退出码取最后一个命令（bash 读空 stdin 退 0），
  // 安装器拉取失败会被当成成功替换并继续 --skip-self-update 重执行，
  // 整个升级变成报 Done 的 no-op。
  const script = `set -o pipefail; curl -fsSL ${installerAssetBase}/aios-install.sh | bash`;
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
  // 中文注释：判定收到 resolveCwdOutsideRootDir 一个 owner（与两个启动器同一口径）。
  const { relocated } = resolveCwdOutsideRootDir({ cwd, rootDir: resolved });
  if (!relocated) {
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
  platform,
  downloadImpl,
  tempDirBase,
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
         platform,
         downloadImpl,
         tempDirBase,
       }));

  const after = await readVersion(rootDir);
  if (after && after !== before) {
    io.log(`Runtime version after update: ${after}`);
  }
  return { ...result, beforeVersion: before, afterVersion: after };
}
