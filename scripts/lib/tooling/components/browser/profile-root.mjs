/* 中文注释：浏览器 profile 根的唯一定义处。
 *
 * 为什么要单独有这一层：profile 目录原本住在 AIOS 安装根里面（`<install>/.browser-profiles`），
 * 于是"升级换入"和"浏览器会话"争同一个目录。安装产物里不该住用户态数据，这一层因此存在。
 *
 * 但换入为什么被拒，这里的旧说法是**错的**，v6.10.1 的实测把它纠正了：挡住 `Directory::Move`
 * 改名让位的不是 Chrome，也不是任何"目录句柄"，而是**某个进程的 CWD 落在该目录子树内**。
 * 对照实验（在真安装树内建子目录做可逆 rename）：16 个用树内 profile 的 Chrome 进程 +
 * `fs.watch` 目录通知句柄 + 打开的 SQLite 文件句柄同时在，rename 仍 `MOVE-OK`；只加一个 CWD
 * 在树内的进程就变 `EPERM`，杀掉它又回到 `MOVE-OK`。当年真机上的真 blocker 是启动器把长驻子进程
 * 的 CWD 钉成安装根（现在收到 `resolveCwdOutsideRootDir` 一个 owner）。
 * 也就是说：profile 搬家是对的，但它不是 `aios update` 的修复——把它当修复，才导致 6.9.0 之后依旧报错。
 *
 * 所以根搬到安装树外（`~/.rexcil/browser-profiles`，与安装根同卷，迁移是一次 rename）。
 * `config/browser-profiles.json` 里的 `.browser-profiles/<name>` 相对串**不改**——那是 profile
 * 的名字不是它的位置，位置由本模块决定。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PROFILE_ROOT_ENV = 'AIOS_BROWSER_PROFILE_ROOT';
export const LEGACY_PROFILE_DIR_NAME = '.browser-profiles';
export const DEFAULT_PROFILE_DIR_NAME = 'browser-profiles';

function toPosix(value) {
  return String(value || '').replace(/\\/g, '/');
}

/** 运行时状态根：沿用既有 REXCIL_HOME 约定（默认 `~/.rexcil`，安装根 `~/.rexcil/aios` 就在它下面）。 */
export function rexcilHome({ env = process.env, homeDir = os.homedir() } = {}) {
  const raw = String(env.REXCIL_HOME || '').trim();
  if (raw && path.isAbsolute(raw)) return raw;
  return path.join(homeDir, '.rexcil');
}

/**
 * profile 根。优先级：AIOS_BROWSER_PROFILE_ROOT（必须是绝对路径）> REXCIL_HOME/browser-profiles。
 * 相对值一律不采纳：一个指向"位置"的契约变量给成相对路径，等于把歧义塞进每个消费者。
 */
export function resolveProfileRoot({ env = process.env, homeDir = os.homedir() } = {}) {
  const raw = String(env[PROFILE_ROOT_ENV] || '').trim();
  if (raw && path.isAbsolute(raw)) return path.normalize(raw);
  return path.join(rexcilHome({ env, homeDir }), DEFAULT_PROFILE_DIR_NAME);
}

/** 旧位置（安装根内）。过渡期只读它、只搬它，不再往里写。 */
export function legacyProfileRoot({ rootDir, dirName = LEGACY_PROFILE_DIR_NAME } = {}) {
  if (!rootDir) return '';
  return path.join(rootDir, dirName);
}

export function isInsideDir(candidate, dir) {
  if (!candidate || !dir) return false;
  const target = path.resolve(candidate);
  const base = path.resolve(dir);
  return target === base || target.startsWith(base + path.sep);
}

/**
 * 把配置里的 profile 路径解析成绝对路径。
 * - 绝对：原样（用户显式指定的外部目录必须尊重）。
 * - `.browser-profiles/<name>`（或反斜杠同形）：折进新的 profile 根——这就是旧配置的兼容读法。
 * - 其它相对：按 workspace 根解析，语义不变（不能把别人的相对路径也吞进来）。
 */
export function resolveProfilePath(targetPath, { profileRoot, workspaceRoot }) {
  const raw = String(targetPath || '').trim();
  if (!raw) return '';
  if (path.isAbsolute(raw)) return raw;
  const posix = toPosix(raw);
  if (posix === LEGACY_PROFILE_DIR_NAME || posix.startsWith(`${LEGACY_PROFILE_DIR_NAME}/`)) {
    const rest = posix.slice(LEGACY_PROFILE_DIR_NAME.length).replace(/^\//, '');
    return rest ? path.join(profileRoot, ...rest.split('/')) : profileRoot;
  }
  return workspaceRoot ? path.resolve(workspaceRoot, raw) : raw;
}

/**
 * Chrome 自己的占用凭据。两个平台不同一个名字，而且都得查：
 *   POSIX：`SingletonLock`（符号链接）
 *   Windows：`Lockfile`（零字节文件，实测真机 headless-check 就是这个）
 * 只查一个会假阴性：本机 `grill` 没有 SingletonLock，Windows 上根本不留它。
 */
export const PROFILE_LOCK_MARKERS = Object.freeze(['SingletonLock', 'Lockfile']);

export function chromeProfileLockPresent(dir, { fsImpl = fs } = {}) {
  if (!dir) return false;
  return PROFILE_LOCK_MARKERS.some((marker) => {
    try {
      fsImpl.lstatSync(path.join(dir, marker));
      return true;
    } catch {
      return false;
    }
  });
}

function childDirs(dir, { fsImpl = fs }) {
  try {
    return fsImpl
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

function pathKey(value) {
  const resolved = path.resolve(String(value || ''));
  // 中文注释：Windows 文件系统大小写不敏感且符号链接会改形状，比较前归一化。
  return process.platform === 'win32' ? resolved.toLowerCase().replace(/\\/g, '/') : resolved;
}

function isPathInside(candidate, root) {
  if (!candidate || !root) return false;
  const a = pathKey(candidate);
  const b = pathKey(root);
  return a === b || a.startsWith(b.endsWith('/') ? b : `${b}/`);
}

/** 从命令行里拿 `--user-data-dir` 的值。两种写法都要接：裸值，以及 Chrome 在 Windows 上
 * 把整个开关包在双引号里（`"--user-data-dir=D:\path"`）时残留的首尾引号。 */
export function extractUserDataDir(commandLine) {
  const text = String(commandLine || '');
  const match = text.match(/--user-data-dir=(?:"([^"]+)"|([^\s]+))/);
  if (!match) return '';
  const raw = match[1] || match[2] || '';
  return raw.replace(/^"+|"+$/g, '');
}

/**
 * 默认探针：列出带浏览器图像名的进程及其命令行。
 * 返回 null = 探针不可用（调用方必须当作“不确定”，而不是“空闲”）。
 */
export function defaultBrowserProcessProbe() {
  if (process.platform === 'win32') {
    const script = [
      '$ErrorActionPreference="SilentlyContinue"',
      "$rows = @(Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' OR Name='chromium.exe' OR Name='msedge.exe' OR Name='headless_shell.exe' OR Name='chrome-headless-shell.exe'\")",
      "foreach ($r in $rows) { if ($r.CommandLine) { Write-Output (\"$($r.ProcessId)\t$($r.CommandLine)\") } }",
    ].join('; ');
    try {
      const { execFileSync } = require_childProcess();
      const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
        timeout: 15000,
      });
      return String(out || '');
    } catch {
      return null;
    }
  }
  try {
    const { execFileSync } = require_childProcess();
    return execFileSync('ps', ['-eo', 'pid=,args='], { windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 15000 });
  } catch {
    return null;
  }
}

let childProcessModule = null;
function require_childProcess() {
  // 中文注释：延迟 require，跟现有工具脚本一致：单测注入 probe 时完全不碰子进程。
  if (!childProcessModule) childProcessModule = process.getBuiltinModule('node:child_process');
  return childProcessModule;
}

/**
 * profile 树到底能不能搬。返回客观理由，交给调用方打印：
 *   free           无锁文件且无持有者
 *   lockfile       根或子 profile 里有 Chrome 自己的锁标记
 *   live-process   有进程的 --user-data-dir 落在树里（孤儿 renderer 也算，它照样撑着目录句柄）
 *   probe-failed   无法完成检查——按 fail-closed 处理，不确定就不搬
 */
export function profileTreeState(root, { fsImpl = fs, probe = defaultBrowserProcessProbe } = {}) {
  const scan = (dir) => {
    if (chromeProfileLockPresent(dir, { fsImpl })) return true;
    return childDirs(dir, { fsImpl }).some((child) => chromeProfileLockPresent(child, { fsImpl }));
  };
  if (!root) return { busy: false, reason: 'free', holders: 0 };
  if (scan(root)) return { busy: true, reason: 'lockfile', holders: 0 };

  let listing;
  try {
    listing = probe();
  } catch {
    listing = null;
  }
  if (listing === null || listing === undefined) {
    return { busy: true, reason: 'probe-failed', holders: -1 };
  }
  const holders = String(listing)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && isPathInside(extractUserDataDir(line), root)).length;
  if (holders > 0) return { busy: true, reason: 'live-process', holders };
  return { busy: false, reason: 'free', holders: 0 };
}

/** 兼容旧调用：忙碌 = 不是 free（probe-failed 也算忙碌，宁可不搬）。 */
export function profileTreeBusy(root, probes = { fsImpl: fs }) {
  return profileTreeState(root, probes).busy;
}

/** 把占用理由译成人话：现场真出现过“没有锁文件但 10 个进程持有目录”的形状。 */
export function describeProfileHold(state) {
  if (state.reason === 'live-process') return `${state.holders} processes hold a --user-data-dir inside the tree`;
  if (state.reason === 'probe-failed') return 'the occupancy probe is unavailable, so we fail closed and do not move it';
  if (state.reason === 'lockfile') return 'Chrome keeps its own lock marker in the profile';
  return String(state.reason || 'held');
}

/**
 * 一次性迁移：旧根 -> 新根。幂等，且只在安全时动文件系统。
 * 状态就是返回值，调用方（doctor / 组件安装）负责把状态说出来，绝不静默。
 *   migrated      搬完了
 *   no-legacy     旧根不存在（新装或已迁移）——正常终态
 *   target-exists 新根已存在，绝不合并（宁可不搬，也不把两份 profile 搅在一起）
 *   locked        被占用（锁标记 / 活进程 / 探针不可用），本轮不搬（下轮再来）
 *   error         rename 失败（跨卷等），原因带在 error 里；旧数据原地完好
 */
export function migrateLegacyProfileRoot({
  legacyRoot,
  targetRoot,
  fsImpl = fs,
  rename = (from, to) => fsImpl.renameSync(from, to),
  probe,
  busyProbe = profileTreeState,
} = {}) {
  if (!legacyRoot || !targetRoot) return { status: 'no-legacy', legacyRoot, targetRoot };
  if (isInsideDir(legacyRoot, targetRoot)) {
    return { status: 'target-exists', legacyRoot, targetRoot, reason: 'legacy-root-inside-target' };
  }
  let legacyStat = null;
  try {
    legacyStat = fsImpl.lstatSync(legacyRoot);
  } catch {
    return { status: 'no-legacy', legacyRoot, targetRoot };
  }
  if (!legacyStat.isDirectory() || legacyStat.isSymbolicLink?.()) {
    return { status: 'no-legacy', legacyRoot, targetRoot, reason: 'legacy-not-a-plain-dir' };
  }
  try {
    fsImpl.lstatSync(targetRoot);
    return { status: 'target-exists', legacyRoot, targetRoot, reason: 'target-present' };
  } catch {
    /* 新根不存在才是我们要的情形；这里吞的只是 ENOENT。 */
  }
  const probes = { fsImpl };
  if (probe !== undefined) probes.probe = probe;
  const state = busyProbe(legacyRoot, probes);
  if (state.busy) {
    return { status: 'locked', legacyRoot, targetRoot, reason: state.reason, holders: state.holders };
  }
  try {
    fsImpl.mkdirSync(path.dirname(targetRoot), { recursive: true });
    rename(legacyRoot, targetRoot);
    return { status: 'migrated', legacyRoot, targetRoot };
  } catch (error) {
    return { status: 'error', legacyRoot, targetRoot, error: String(error.code || error.message) };
  }
}
