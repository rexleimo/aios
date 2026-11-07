/* 中文注释：进程身份平台层——只回答"操作系统怎么说这个 pid"，不含任何租约策略。
 *
 * 为什么需要它（2026-10-26 B2 实测）：本仓曾有四处各自实现 `isProcessAlive`，且语义**互相矛盾**：
 * `solo-journal/content/owner.mjs` 在 EPERM 时判死（于是崩溃对账会给一个活着但属于他人的进程
 * 写假崩溃记录），而 `spawn.mjs` / `watchdog/signals.mjs` 判活。同时，`kill(pid,0)` 只能证明
 * "这个号有人用"，无法证明"还是原来那个进程"——PID 复用后旧租约会一直被当成 owner-alive。
 *
 * 判定不用精确身份匹配：进程必然在它写下认领时刻**之前**就启动了，所以
 * `实际启动时间 > 认领时刻 + 容差` 就等于"这个 pid 已被复用"。这是一次有界比较。
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

import { getCommandSpawnSpec } from './spawn.mjs';

/* Linux 上 USER_HZ 事实上是 100；写成可注入常量而不是猜：拿不到时按 100 计算，
   并在结果里带上来源，让调用方能判断这是近似值。 */
const DEFAULT_LINUX_CLK_TCK = 100;
const DEFAULT_PROBE_TIMEOUT_MS = 1200;

/* 中文注释：单一 owner：任何要拿 pid 去做判断的地方都走这里。 */
export function normalizeProcessPid(value) {
  /* 中文注释：不能直接用 parseInt 了事——它会把 1.5 截成 1，于是个小数就拿到了
     另一个真实进程的号，去探测井被判“活着”。数字入参必须是整数，字符串才允许解析。 */
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  const text = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(text)) return null;
  const pid = Number.parseInt(text, 10);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/* 中文注释：信号 0 只探测不发信号。ESRCH = 不存在；EPERM = 存在但无权限发信号，
   必须算活——把它算成死会制造假崩溃记录，这是本文件要消灭的第一个缺陷。 */
export function probeProcessLiveness(pid, { killProbe } = {}) {
  const normalized = normalizeProcessPid(pid);
  if (normalized === null) return { alive: false, code: 'invalid' };
  const probe = killProbe || ((value) => process.kill(value, 0));
  try {
    probe(normalized);
    return { alive: true, code: 'alive' };
  } catch (error) {
    const code = error?.code;
    if (code === 'EPERM') return { alive: true, code: 'eperm' };
    if (code === 'ESRCH') return { alive: false, code: 'esrch' };
    /* 中文注释：未知错误一律不宣布死亡。"证明不了"不是"已证明死亡"。 */
    return { alive: true, code: code ? `other:${code}` : 'other' };
  }
}

export function isProcessAlive(pid, options = {}) {
  return probeProcessLiveness(pid, options).alive;
}

/* ---------------- 启动时间采集：三平台后端，解析逻辑可独立单测 ---------------- */

export function parseLinuxProcStat({ statText, btimeText, clkTck = DEFAULT_LINUX_CLK_TCK }) {
  const statLine = String(statText || '').trim().split('\n')[0] || '';
  /* 中文注释：comm 字段可以包含空格与括号，所以必须从最后一个 ')' 之后切分，
     否则第 22 字段会错位——这是 /proc/<pid>/stat 解析的经典陷阱。 */
  const closer = statLine.lastIndexOf(')');
  if (closer < 0) return null;
  const tail = statLine.slice(closer + 1).trim().split(/\s+/);
  if (tail.length < 20) return null;
  const startTimeTicks = Number(tail[19]); // field 22: state=3 之后第 19 个
  if (!Number.isFinite(startTimeTicks) || startTimeTicks < 0) return null;

  const btimeMatch = /(^|\n)btime\s+(\d+)/.exec(String(btimeText || ''));
  if (!btimeMatch) return null;
  const btimeSec = Number(btimeMatch[2]);
  if (!Number.isFinite(btimeSec)) return null;

  const ticks = Number.isFinite(clkTck) && clkTck > 0 ? clkTck : DEFAULT_LINUX_CLK_TCK;
  return {
    startMs: Math.round(btimeSec * 1000 + (startTimeTicks * 1000) / ticks),
    detail: `proc-stat:btime=${btimeSec},ticks=${startTimeTicks},clkTck=${ticks}`,
  };
}

export function parseDarwinLstart(stdoutText) {
  const text = String(stdoutText || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return { startMs: parsed, detail: 'ps-lstart' };
}

/* 中文注释：Windows 侧取 PowerShell 的 UTC ISO 串（调用方命令里已 ToUniversalTime），
   解析失败就当不可证明，绝不猜。 */
export function parseWindowsStartTime(stdoutText) {
  const text = String(stdoutText || '').trim();
  if (!text) return null;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return { startMs: parsed, detail: 'powershell-starttime' };
}

/* 中文注释：参数必须是真实存在的 PowerShell 开关（-NoProfile / -NonInteractive）；
   写错参数会让命令直接失败，而被误判成"不可证明"——那是一次把实现错误洗成降级的典型路径。 */
const WINDOWS_START_TIME_SCRIPT = '(Get-Process -Id <PID> -ErrorAction Stop).StartTime.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")';
const WINDOWS_PS_ARGS = ['-NoProfile', '-NonInteractive', '-Command'];
const DARWIN_PS_ARGS = ['-o', 'lstart=', '-p'];

function syncCapture(command, args, { timeoutMs = DEFAULT_PROBE_TIMEOUT_MS, spawnSyncImpl = spawnSync } = {}) {
  /* 中文注释：走本层的 getCommandSpawnSpec，Windows 的 npm shim / shell 规则由它统一决定，
     不在这里另起一套执行路径（同一条判断不留两个 owner）。 */
  const spec = getCommandSpawnSpec(command, args, {});
  const result = spawnSyncImpl(spec.command, spec.args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
    shell: spec.shell ?? false,
    /* 中文注释：watchdog 在无控制台的宿主里采样，探测子进程同样不得新建可见窗口。 */
    windowsHide: true,
  });
  return {
    status: result?.status ?? 1,
    stdout: result?.stdout || '',
    stderr: result?.stderr || '',
    error: result?.error || null,
  };
}

/* 中文注释：结果缓存——同一个 pid 的启动时间是不变量，而 Windows 探测要起一次 PowerShell。
   缓存只在本次进程生命周期内有效，键为平台+pid；不可证明的结果不缓存，避免一次偶发超时
   把后续对账永久降级。 */
const startTimeCache = new Map();

export function readProcessStartTimeMs(pid, {
  platform = process.platform,
  captureImpl,
  readTextImpl,
  fileExistsImpl,
  clkTck,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
  useCache = true,
} = {}) {
  const normalized = normalizeProcessPid(pid);
  if (normalized === null) return { startMs: null, source: 'invalid', detail: 'pid is not a positive integer' };

  const cacheKey = `${platform}:${normalized}`;
  if (useCache && startTimeCache.has(cacheKey)) return startTimeCache.get(cacheKey);

  const capture = captureImpl || ((command, args) => syncCapture(command, args, { timeoutMs }));
  const readText = readTextImpl || ((target) => readFileSync(target, 'utf8'));
  const fileExists = fileExistsImpl || ((target) => existsSync(target));

  let outcome;
  if (platform === 'linux') {
    const procDir = `/proc/${normalized}`;
    if (!fileExists(procDir)) {
      outcome = { startMs: null, source: 'proc', detail: `${procDir} not readable` };
    } else {
      try {
        outcome = parseLinuxProcStat({
          statText: readText(`${procDir}/stat`),
          btimeText: readText('/proc/stat'),
          clkTck,
        }) || { startMs: null, source: 'proc', detail: 'starttime fields unparsable' };
      } catch (error) {
        outcome = { startMs: null, source: 'proc', detail: `read failed: ${error?.code || error?.message || 'unknown'}` };
      }
    }
  } else if (platform === 'darwin') {
    const result = capture('ps', [...DARWIN_PS_ARGS, String(normalized)]);
    outcome = result.status === 0
      ? parseDarwinLstart(result.stdout) || { startMs: null, source: 'ps', detail: 'lstart unparsable' }
      : { startMs: null, source: 'ps', detail: `ps status=${result.status}` };
  } else if (platform === 'win32') {
    const script = WINDOWS_START_TIME_SCRIPT.replace('<PID>', String(normalized));
    const result = capture('powershell', [...WINDOWS_PS_ARGS, script]);
    outcome = result.status === 0
      ? parseWindowsStartTime(result.stdout) || { startMs: null, source: 'powershell', detail: 'start time unparsable' }
      : { startMs: null, source: 'powershell', detail: `powershell status=${result.status}${result.error ? `,error=${result.error?.code || ''}` : ''}` };
  } else {
    outcome = { startMs: null, source: 'unsupported-platform', detail: `no start-time backend for ${platform}` };
  }

  const frozen = Object.freeze(outcome);
  if (useCache && frozen.startMs !== null) startTimeCache.set(cacheKey, frozen);
  return frozen;
}

export function __clearProcessStartTimeCache() {
  startTimeCache.clear();
}
