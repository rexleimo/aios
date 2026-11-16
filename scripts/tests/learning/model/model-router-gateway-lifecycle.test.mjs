// 网关后台托管生命周期（#44）：start/status/stop 的客观事实判定。
// 单元用注入 impl（零进程）；末尾一条真实集成（起真网关→查状态→停→端口关闭），零扣费、必清理。
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  GATEWAY_DEFAULT_PORT,
  describeConnect,
  gatewayPidPath,
  gatewayStatus,
  isPidAlive,
  probePort,
  readGatewayPid,
  resolveAiosScript,
  startGatewayDaemon,
  stopGatewayDaemon,
  waitForPort,
} from '../../../lib/tooling/model-router/lifecycle/daemon.mjs';

// 内存 fs：只实现生命周期用到的几个方法，键是绝对路径。
function memFs(seed = {}) {
  const files = new Map(Object.entries(seed));
  const dirs = new Set();
  return {
    files,
    readFileSync: (file) => {
      if (!files.has(file)) { const error = new Error('ENOENT'); error.code = 'ENOENT'; throw error; }
      return files.get(file);
    },
    writeFileSync: (file, content) => { files.set(file, String(content)); },
    existsSync: (file) => files.has(file),
    unlinkSync: (file) => { if (!files.delete(file)) { const error = new Error('ENOENT'); error.code = 'ENOENT'; throw error; } },
    mkdirSync: (dir) => { dirs.add(dir); },
  };
}

function fakeSocket({ open }) {
  const socket = new EventEmitter();
  socket.destroy = () => {};
  queueMicrotask(() => {
    if (open) socket.emit('connect');
    else socket.emit('error', Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }));
  });
  return socket;
}

const pidRecord = (pid, port = GATEWAY_DEFAULT_PORT) => JSON.stringify({ pid, port, url: `http://127.0.0.1:${port}`, startedAt: 'x' });

test('isPidAlive：signal 0 探测；ESRCH=死，EPERM=活（属别人），非法 pid=死', () => {
  assert.equal(isPidAlive(123, () => {}), true);
  assert.equal(isPidAlive(123, () => { throw Object.assign(new Error('x'), { code: 'ESRCH' }); }), false);
  assert.equal(isPidAlive(123, () => { throw Object.assign(new Error('x'), { code: 'EPERM' }); }), true);
  assert.equal(isPidAlive(0, () => {}), false);
  assert.equal(isPidAlive(-1, () => {}), false);
});

test('probePort：连上=true，拒绝/超时=false，且 socket 被销毁', async () => {
  let destroyed = 0;
  const connectImpl = (opts, onConnect) => {
    const socket = fakeSocket({ open: true });
    const originalDestroy = socket.destroy;
    socket.destroy = () => { destroyed += 1; originalDestroy(); };
    queueMicrotask(() => onConnect?.());
    return socket;
  };
  assert.equal(await probePort(8686, { connectImpl }), true);
  assert.ok(destroyed >= 1);
  assert.equal(await probePort(8686, { connectImpl: () => fakeSocket({ open: false }) }), false);
});

test('waitForPort：达到期望即返回 true；始终不达则超时 false（不无限等）', async () => {
  let calls = 0;
  const probeImpl = async () => { calls += 1; return calls >= 3; };
  assert.equal(await waitForPort(8686, true, { probeImpl, sleepImpl: async () => {}, attempts: 5 }), true);
  assert.equal(calls, 3);
  assert.equal(await waitForPort(8686, true, { probeImpl: async () => false, sleepImpl: async () => {}, attempts: 4 }), false);
});

test('startGatewayDaemon：已在跑则幂等返回 alreadyRunning，不再 spawn', async () => {
  const stateDir = '/state';
  const fsImpl = memFs({ [gatewayPidPath(stateDir)]: pidRecord(999, 8686) });
  let spawned = 0;
  const result = await startGatewayDaemon({
    rootDir: '/install', stateDir, fsImpl,
    killImpl: () => {}, probeImpl: async () => true,
    spawnImpl: () => { spawned += 1; return { pid: 1, unref() {} }; },
  });
  assert.equal(result.ok, true);
  assert.equal(result.alreadyRunning, true);
  assert.equal(result.pid, 999);
  assert.equal(spawned, 0);
});

test('startGatewayDaemon：成功写 pidfile，且 CWD 被挪出安装树（不留升级锁）', async () => {
  const stateDir = '/state';
  const fsImpl = memFs();
  let captured;
  const result = await startGatewayDaemon({
    rootDir: process.cwd(), stateDir, fsImpl,
    killImpl: () => {}, probeImpl: async () => true, sleepImpl: async () => {},
    spawnImpl: (cmd, args, opts) => { captured = { cmd, args, opts }; return { pid: 4242, unref() {} }; },
  });
  assert.equal(result.ok, true);
  assert.equal(result.pid, 4242);
  assert.equal(captured.opts.detached, true);
  assert.equal(captured.opts.stdio, 'ignore');
  // 测试 cwd 在安装树内 → 必须被改选到主目录，绝不把 CWD 钉在树里。
  assert.equal(captured.opts.cwd, os.homedir());
  assert.deepEqual(captured.args.slice(1, 3), ['model-router', 'gateway']);
  assert.ok(captured.args.includes('--state-dir'));
  const written = JSON.parse(fsImpl.readFileSync(gatewayPidPath(stateDir)));
  assert.equal(written.pid, 4242);
  assert.equal(written.port, GATEWAY_DEFAULT_PORT);
});

test('startGatewayDaemon：端口起不来 → 失败、收掉子进程、删 pidfile（不留孤儿）', async () => {
  const stateDir = '/state';
  const fsImpl = memFs();
  const signals = [];
  const result = await startGatewayDaemon({
    rootDir: '/install', stateDir, fsImpl,
    killImpl: (pid, sig) => { signals.push([pid, sig]); },
    probeImpl: async () => false, sleepImpl: async () => {},
    spawnImpl: () => ({ pid: 5555, unref() {} }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'gateway-failed-to-start');
  assert.deepEqual(signals, [[5555, 'SIGTERM']]);
  assert.equal(fsImpl.existsSync(gatewayPidPath(stateDir)), false);
});

test('startGatewayDaemon：spawn 抛错 → spawn-failed，不写 pidfile', async () => {
  const fsImpl = memFs();
  const result = await startGatewayDaemon({
    rootDir: '/install', stateDir: '/state', fsImpl,
    spawnImpl: () => { throw new Error('boom'); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'spawn-failed');
  assert.equal(fsImpl.existsSync(gatewayPidPath('/state')), false);
});

test('stopGatewayDaemon：无 pidfile 时区分 not-running 与 not-managed（外部前台）', async () => {
  const fsImpl = memFs();
  const down = await stopGatewayDaemon({ stateDir: '/state', fsImpl, probeImpl: async () => false });
  assert.equal(down.reason, 'not-running');
  const external = await stopGatewayDaemon({ stateDir: '/state', fsImpl, probeImpl: async () => true });
  assert.equal(external.reason, 'not-managed');
  assert.equal(external.stopped, false);
});

test('stopGatewayDaemon：pid 已死 → stale-pid，清理 pidfile', async () => {
  const stateDir = '/state';
  const fsImpl = memFs({ [gatewayPidPath(stateDir)]: pidRecord(777) });
  const result = await stopGatewayDaemon({ stateDir, fsImpl, killImpl: () => { throw Object.assign(new Error('x'), { code: 'ESRCH' }); }, probeImpl: async () => false });
  assert.equal(result.reason, 'stale-pid');
  assert.equal(fsImpl.existsSync(gatewayPidPath(stateDir)), false);
});

test('stopGatewayDaemon：SIGTERM 优雅停，等端口关闭后删 pidfile', async () => {
  const stateDir = '/state';
  const fsImpl = memFs({ [gatewayPidPath(stateDir)]: pidRecord(888) });
  const signals = [];
  let open = true;
  const result = await stopGatewayDaemon({
    stateDir, fsImpl,
    killImpl: (pid, sig) => { if (sig === 0) return; signals.push(sig); if (sig === 'SIGTERM') open = false; },
    probeImpl: async () => open, sleepImpl: async () => {},
  });
  assert.equal(result.stopped, true);
  assert.equal(result.reason, 'stopped');
  assert.deepEqual(signals, ['SIGTERM']);
  assert.equal(fsImpl.existsSync(gatewayPidPath(stateDir)), false);
});

test('stopGatewayDaemon：SIGTERM 不停则 SIGKILL 兜底', async () => {
  const stateDir = '/state';
  const fsImpl = memFs({ [gatewayPidPath(stateDir)]: pidRecord(999) });
  const signals = [];
  let open = true;
  const result = await stopGatewayDaemon({
    stateDir, fsImpl,
    killImpl: (pid, sig) => { if (sig === 0) return; signals.push(sig); if (sig === 'SIGKILL') open = false; },
    probeImpl: async () => open, sleepImpl: async () => {},
  });
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(result.stopped, true);
});

test('gatewayStatus：running/managed/stale 三态如实，不拿残留 pidfile 冒充运行', async () => {
  const stateDir = '/state';
  const seeded = memFs({ [gatewayPidPath(stateDir)]: pidRecord(1234, 8686) });
  const live = await gatewayStatus({ stateDir, fsImpl: seeded, killImpl: () => {}, probeImpl: async () => true });
  assert.equal(live.running, true);
  assert.equal(live.managed, true);
  assert.equal(live.stale, false);
  const dead = await gatewayStatus({ stateDir, fsImpl: seeded, killImpl: () => { throw Object.assign(new Error('x'), { code: 'ESRCH' }); }, probeImpl: async () => false });
  assert.equal(dead.running, false);
  assert.equal(dead.managed, false);
  assert.equal(dead.stale, true);
  const empty = await gatewayStatus({ stateDir: '/none', fsImpl: memFs(), probeImpl: async () => false });
  assert.equal(empty.running, false);
  assert.equal(empty.pid, null);
});

test('describeConnect：从 connect-state 给出每客户端接入事实与可复制命令（单一源）', () => {
  const stateDir = '/state';
  const fsImpl = memFs({
    [path.join(stateDir, 'connect-state.json')]: JSON.stringify({ gatewayUrl: 'http://127.0.0.1:8686', clients: ['claude', 'pi'], piModel: 'gateway-default' }),
    [path.join(stateDir, 'claude-settings.json')]: '{}',
    [path.join(stateDir, 'pi-home', '.pi', 'agent', 'models.json')]: '{}',
  });
  const info = describeConnect(stateDir, fsImpl);
  assert.equal(info.connected, true);
  const claude = info.clients.find((c) => c.client === 'claude');
  const codex = info.clients.find((c) => c.client === 'codex');
  assert.equal(claude.connected, true);
  assert.equal(claude.artifactExists, true);
  assert.match(claude.launch, /^claude --settings /u);
  assert.equal(codex.connected, false);
  assert.match(codex.launch, /CODEX_HOME=/u);
});

test('resolveAiosScript 指向真实存在的 scripts/aios.mjs', () => {
  const script = resolveAiosScript();
  assert.equal(path.basename(script), 'aios.mjs');
  assert.equal(path.basename(path.dirname(script)), 'scripts');
  assert.ok(fs.existsSync(script));
});

// 真实集成：起一个真网关（空闲端口、隔离 stateDir），查状态→停→端口关闭。零扣费（不发上游请求），必清理。
test('真实生命周期：start→status(running)→stop→端口关闭，无孤儿', { timeout: 60_000 }, async (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-gw-life-'));
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const { port: free } = server.address(); server.close(() => resolve(free)); });
  });
  t.after(async () => {
    await stopGatewayDaemon({ stateDir }).catch(() => {});
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  const started = await startGatewayDaemon({ rootDir: process.cwd(), port, stateDir });
  assert.equal(started.ok, true, `start failed: ${started.error || ''}`);
  const running = await gatewayStatus({ stateDir, port });
  assert.equal(running.running, true);
  assert.equal(running.managed, true);
  assert.equal(running.pid, started.pid);

  const stopped = await stopGatewayDaemon({ stateDir });
  assert.equal(stopped.stopped, true);
  const after = await gatewayStatus({ stateDir, port });
  assert.equal(after.running, false);
  assert.equal(await probePort(port), false, '端口必须真的关闭，不留孤儿');
});