// 中文注释：网关的「后台托管」生命周期——把原本只能前台跑（Ctrl+C 停）的网关，扩展成可由界面一键启停的常驻服务。
// 单一事实源：启停探测都在这里，CLI 子命令（gateway-start/stop/status）与 GUI API 都调它，不各写一份进程管理。
//
// 三条纪律（与仓库进程管理一致）：
//   1. 长驻子进程的 CWD 绝不钉在安装树里（resolveCwdOutsideRootDir 是唯一 owner），否则每次启动都在给下一次升级上锁。
//   2. 只绑 127.0.0.1（信任边界由 serve.mjs 持有）；本层不持密钥、不发上游请求。
//   3. 状态是客观事实：pid 活着 + 端口应答才算「运行中」；pidfile 残留但进程已死 = stale，如实报告并清理，不冒充运行。
//
// 所有副作用（spawn/kill/fs/端口探测）都可注入，便于零进程单元测试；真实集成测试用默认 impl。
import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveCwdOutsideRootDir } from '../../../foundation/platform/aios-runtime-root.mjs';
import { readConnectStatus } from '../connect/readback.mjs';

export const GATEWAY_DEFAULT_PORT = 8686;
export const GATEWAY_HOST = '127.0.0.1';
const PID_FILE = 'gateway.pid.json';

/** 安装树里的 scripts/aios.mjs（detached 子进程要执行它）；测试可注入 scriptPath 覆盖。 */
export function resolveAiosScript(fromUrl = import.meta.url) {
  return path.resolve(path.dirname(fileURLToPath(fromUrl)), '../../../../aios.mjs');
}

export function defaultStateDir(env = process.env) {
  return String(env.AIOS_GATEWAY_STATE_DIR || path.join(os.homedir(), '.aios', 'gateway'));
}

export function gatewayPidPath(stateDir) {
  return path.join(stateDir, PID_FILE);
}

export function gatewayUrl(port) {
  return `http://${GATEWAY_HOST}:${port}`;
}

function readJsonFile(file, fsImpl) {
  try {
    return JSON.parse(fsImpl.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function readGatewayPid(stateDir, fsImpl = fs) {
  const record = readJsonFile(gatewayPidPath(stateDir), fsImpl);
  return record && Number.isFinite(record.pid) && record.pid > 0 ? record : null;
}

/** pid 是否活着：signal 0 只探测不发信号。ESRCH=死了；EPERM=活着但属别人（仍算活着）。 */
export function isPidAlive(pid, killImpl = process.kill.bind(process)) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    killImpl(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/** 端口是否应答：TCP 连一下即断，不发任何 HTTP 请求（零扣费、零副作用）。 */
export function probePort(port, { host = GATEWAY_HOST, timeoutMs = 400, connectImpl = net.createConnection } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    let socket;
    try {
      socket = connectImpl({ host, port, timeout: timeoutMs }, () => {
        socket.destroy();
        done(true);
      });
    } catch {
      done(false);
      return;
    }
    socket.once('error', () => {
      socket.destroy();
      done(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      done(false);
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 轮询端口直到达到期望状态（开/关）；超时返回 false，不无限等。 */
export async function waitForPort(port, expectedOpen, { attempts = 40, delayMs = 250, probeImpl = probePort, sleepImpl = sleep } = {}) {
  for (let index = 0; index < attempts; index += 1) {
    if ((await probeImpl(port)) === expectedOpen) return true;
    if (index < attempts - 1) await sleepImpl(delayMs);
  }
  return false;
}

/** Parsed, redacted client facts stay separate from ownership and recovery. */
export function describeConnect(stateDir, fsImpl = fs, options = {}) {
  return readConnectStatus({ stateDir, fsImpl, ...options });
}

/**
 * 启动后台网关。幂等：已在跑就直接返回 alreadyRunning，不再 spawn 第二个。
 * 成功 = 端口真的应答（不是「spawn 没报错」）；起不来就清理 pidfile 并尝试收掉子进程，不留孤儿。
 */
export async function startGatewayDaemon({
  rootDir,
  port = GATEWAY_DEFAULT_PORT,
  stateDir = defaultStateDir(),
  env = process.env,
  scriptPath = resolveAiosScript(),
  spawnImpl = nodeSpawn,
  killImpl = process.kill.bind(process),
  probeImpl = probePort,
  sleepImpl = sleep,
  fsImpl = fs,
  io = console,
} = {}) {
  const chosenPort = Number(port) || GATEWAY_DEFAULT_PORT;
  fsImpl.mkdirSync(stateDir, { recursive: true });

  const existing = readGatewayPid(stateDir, fsImpl);
  if (existing && isPidAlive(existing.pid, killImpl) && (await probeImpl(existing.port || chosenPort))) {
    return { ok: true, alreadyRunning: true, pid: existing.pid, port: existing.port || chosenPort, url: gatewayUrl(existing.port || chosenPort) };
  }

  const { cwd } = resolveCwdOutsideRootDir({ cwd: process.cwd(), rootDir });
  const args = [scriptPath, 'model-router', 'gateway', '--port', String(chosenPort), '--state-dir', stateDir];
  let child;
  try {
    child = spawnImpl(process.execPath, args, { detached: true, stdio: 'ignore', cwd, env, windowsHide: true });
    child.unref?.();
  } catch (error) {
    return { ok: false, error: 'spawn-failed', detail: error instanceof Error ? error.message : String(error), port: chosenPort };
  }
  if (!child?.pid) {
    return { ok: false, error: 'spawn-failed', detail: 'no child pid', port: chosenPort };
  }

  const url = gatewayUrl(chosenPort);
  fsImpl.writeFileSync(gatewayPidPath(stateDir), `${JSON.stringify({ pid: child.pid, port: chosenPort, url, startedAt: new Date().toISOString() }, null, 2)}\n`);

  const opened = await waitForPort(chosenPort, true, { probeImpl, sleepImpl });
  if (!opened) {
    try { killImpl(child.pid, 'SIGTERM'); } catch { /* 已退出 */ }
    try { fsImpl.unlinkSync(gatewayPidPath(stateDir)); } catch { /* 无文件 */ }
    io.error?.(`Gateway failed to open port ${chosenPort} within the startup window.`);
    return { ok: false, error: 'gateway-failed-to-start', pid: child.pid, port: chosenPort, url };
  }
  return { ok: true, alreadyRunning: false, pid: child.pid, port: chosenPort, url };
}

/**
 * 停止后台网关：只对有 pidfile 的托管进程发信号（SIGTERM 优雅停，必要时 SIGKILL 兜底），等端口真的关闭。
 * 没有 pidfile（外部前台启动）不擅自杀进程，如实报告 not-managed。
 */
export async function stopGatewayDaemon({
  stateDir = defaultStateDir(),
  killImpl = process.kill.bind(process),
  probeImpl = probePort,
  sleepImpl = sleep,
  fsImpl = fs,
} = {}) {
  const record = readGatewayPid(stateDir, fsImpl);
  if (!record) {
    const portOpen = await probeImpl(GATEWAY_DEFAULT_PORT);
    return { ok: true, stopped: false, reason: portOpen ? 'not-managed' : 'not-running', port: GATEWAY_DEFAULT_PORT };
  }
  const port = record.port || GATEWAY_DEFAULT_PORT;
  if (!isPidAlive(record.pid, killImpl)) {
    try { fsImpl.unlinkSync(gatewayPidPath(stateDir)); } catch { /* 无文件 */ }
    return { ok: true, stopped: false, reason: 'stale-pid', pid: record.pid, port };
  }
  try { killImpl(record.pid, 'SIGTERM'); } catch { /* 已退出 */ }
  let closed = await waitForPort(port, false, { probeImpl, sleepImpl });
  if (!closed && isPidAlive(record.pid, killImpl)) {
    try { killImpl(record.pid, 'SIGKILL'); } catch { /* 已退出 */ }
    closed = await waitForPort(port, false, { probeImpl, sleepImpl, attempts: 20 });
  }
  try { fsImpl.unlinkSync(gatewayPidPath(stateDir)); } catch { /* 无文件 */ }
  return { ok: true, stopped: closed, pid: record.pid, port, reason: closed ? 'stopped' : 'stop-timeout' };
}

/** 网关状态：运行中（端口应答）+ 是否托管（pid 活着）+ 接入事实。pidfile 残留但不可达 = stale。 */
export async function gatewayStatus({
  stateDir = defaultStateDir(),
  home = os.homedir(),
  port = GATEWAY_DEFAULT_PORT,
  killImpl = process.kill.bind(process),
  probeImpl = probePort,
  fsImpl = fs,
  clients,
} = {}) {
  const record = readGatewayPid(stateDir, fsImpl);
  const chosenPort = record?.port || Number(port) || GATEWAY_DEFAULT_PORT;
  const portOpen = await probeImpl(chosenPort);
  const pidAlive = record ? isPidAlive(record.pid, killImpl) : false;
  const connect = describeConnect(stateDir, fsImpl, { home, ...(clients ? { clients } : {}) });
  return {
    running: portOpen,
    managed: pidAlive && portOpen,
    stale: Boolean(record) && !portOpen,
    pid: record?.pid ?? null,
    port: chosenPort,
    url: gatewayUrl(chosenPort),
    stateDir,
    connected: connect.connected,
    clients: connect.clients,
  };
}
