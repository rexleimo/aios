// w7 证据生成器的纯函数与「拒绝写盘」分支（不碰真实客户端配置）。
//
// 这个驱动的价值全在它的**保守**：拿不到事实就写 host-unsupported、目标文件不存在就不创建、
// 落点被读门拒绝就照抄理由。这三条如果用一次性的手工脚本做，下一轮就没人知道它们还在不在，
// 所以这里把它们钉成用例——每一例都断言「没有写任何文件」。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { captureLanding, hasCommand, probeEntryFor } from '../../../../scripts/mcp-landing-evidence.mjs';

function tempFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-evidence-'));
  return { dir, file: path.join(dir, name) };
}

test('probe 条目按落点形状给：pi 带 lifecycle 不带 type，opencode 是 local 形状，hermes 不带 type', () => {
  const pi = probeEntryFor('pi');
  assert.equal(pi.lifecycle, 'lazy');
  assert.equal('type' in pi, false, 'pi 的条目不接受 type（它的 doctor 做 JSON.stringify 精确比对）');

  const opencode = probeEntryFor('opencode');
  assert.equal(opencode.type, 'local');
  assert.ok(Array.isArray(opencode.command), 'opencode 的 command 是数组');
  assert.equal(opencode.enabled, true);

  const hermes = probeEntryFor('hermes');
  assert.equal('type' in hermes, false, 'hermes 的实测键集没有 type');

  assert.equal(probeEntryFor('claude').type, 'stdio');
  // 探针条目永不带 env：证据卡要能公开。
  for (const clientId of ['claude', 'codex', 'gemini', 'opencode', 'hermes', 'grok', 'pi']) {
    assert.equal('env' in probeEntryFor(clientId), false, `${clientId} 的探针条目带了 env`);
  }
});

test('hasCommand 只看 PATH：存在返回 true、不存在返回 false、可注入 fs 环境', () => {
  assert.equal(hasCommand('definitely-not-an-aios-binary-xyz'), false);
  assert.equal(hasCommand('node'), true, 'node 一定在 PATH 上（本仓库的测试就是它跑的）');

  const fakePath = path.join(os.tmpdir(), `aios-fake-bin-${process.pid}`);
  const fakeFs = { existsSync: (candidate) => candidate === path.join(fakePath, 'headroom.exe') || candidate === path.join(fakePath, 'headroom') };
  assert.equal(hasCommand('headroom', { env: { PATH: fakePath, PATHEXT: '.EXE' }, fsImpl: fakeFs }), true);
  assert.equal(hasCommand('other', { env: { PATH: fakePath, PATHEXT: '.EXE' }, fsImpl: fakeFs }), false);
});

test('客户端不在 PATH 上 → host-unsupported + 原文，且不写盘', async () => {
  const { dir, file } = tempFile('config.json');
  fs.writeFileSync(file, '{}\n', 'utf8');
  const card = await captureLanding(
    { clientId: 'workbuddy', scope: 'home', file, format: 'json', entryPath: 'mcpServers', writable: true, registered: true },
    { apply: true },
  );
  assert.equal(card.status, 'host-unsupported');
  assert.match(card.reason, /client binary not on PATH: workbuddy/u);
  assert.equal(fs.readFileSync(file, 'utf8'), '{}\n', 'host-unsupported 不许写盘');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('配置文件不存在 → 跳过（不为取证创建配置文件），且文件仍然不存在', async () => {
  const { dir, file } = tempFile('mcp.json');
  const card = await captureLanding(
    { clientId: 'claude', scope: 'home', file, format: 'json', entryPath: 'mcpServers', writable: true, registered: true },
    { apply: true },
  );
  assert.equal(card.status, 'unverified');
  assert.equal(card.fileExists, false);
  assert.match(card.reason, /config file absent/u);
  assert.equal(fs.existsSync(file), false, '取证不许凭空创建客户端配置');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('读门拒绝的落点 → landing-not-writable 原文，不写盘', async () => {
  const { dir, file } = tempFile('config.json');
  fs.writeFileSync(file, '{}\n', 'utf8');
  const card = await captureLanding(
    { clientId: 'pi', scope: 'project', file, format: 'json', entryPath: 'mcpServers', writable: false, registered: true, status: 'rejected', reason: 'landing-not-writable' },
    { apply: true },
  );
  assert.equal(card.status, 'unverified');
  assert.match(card.reason, /landing-not-writable/u);
  assert.equal(fs.readFileSync(file, 'utf8'), '{}\n');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('预演模式只记 before-hash 与计划，不执行任何一步', async () => {
  const { dir, file } = tempFile('config.json');
  fs.writeFileSync(file, '{}\n', 'utf8');
  const card = await captureLanding(
    { clientId: 'claude', scope: 'home', file, format: 'json', entryPath: 'mcpServers', writable: true, registered: true },
    { apply: false },
  );
  assert.equal(card.status, 'planned');
  assert.deepEqual(card.steps.map((step) => step.step), ['before-hash']);
  assert.match(String(card.steps[0].value), /^sha256:[0-9a-f]{64}$/u);
  assert.equal(fs.readFileSync(file, 'utf8'), '{}\n');
  fs.rmSync(dir, { recursive: true, force: true });
});