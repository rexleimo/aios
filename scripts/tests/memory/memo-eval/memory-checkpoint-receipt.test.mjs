import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { handleMessage } from '../../../memory-mcp-server.mjs';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');

async function withWorkspace(run) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'aios-checkpoint-receipt-'));
  // 中文注释：隔离 home。新增的 workspace 注册表写者会落在 ~/.aios/workspaces，
  // 而这里传的是临时 workspace —— 不隔离 home 就会把临时目录名写进用户真实注册表。
  // 实测污染过 7 条，所以这不是假想风险。用仓库已有约定 AIOS_HOME 指到沙箱里。
  const home = await mkdtemp(path.join(os.tmpdir(), 'aios-checkpoint-receipt-home-'));
  const previous = process.env.AIOS_WORKSPACE_ROOT;
  const previousHome = process.env.AIOS_HOME;
  process.env.AIOS_WORKSPACE_ROOT = workspace;
  process.env.AIOS_HOME = home;
  try {
    await mkdir(path.join(workspace, '.aios', 'memo', 'file', 'pinned'), { recursive: true });
    await run(workspace);
  } finally {
    if (previous === undefined) delete process.env.AIOS_WORKSPACE_ROOT;
    else process.env.AIOS_WORKSPACE_ROOT = previous;
    if (previousHome === undefined) delete process.env.AIOS_HOME;
    else process.env.AIOS_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  }
}

const callCheckpoint = async (text) => {
  const response = await handleMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'memory_checkpoint', arguments: { text } },
  });
  return response.result.content[0].text;
};

/* 中文注释（2026-10-27）：memory_checkpoint 过去的回复是无条件的 “Checkpoint pinned: …”。
 * 而 pinned 是 append-only 通道，超预算时旧 renderPinnedBlock 保留**最旧**前缀，所以刚写进去的
 * 里程碑一条都不会被注入 —— 回复却仍是成功。实测本工作区 103,694 字符 / 5,000 预算，297 条
 * checkpoint 全在服务窗口之外，只有 9 月的冒烟条目还在被注入。
 * 这个文件钉的是：工具必须区分「落盘」与「被注入」，否则调用方会把成功回复当成未来能召回。 */
test('memory_checkpoint reports whether the checkpoint actually lands in the served window', async () => {
  await withWorkspace(async () => {
    const first = await callCheckpoint('v6.14.3 released: resume --dry-run is honored at the parser');
    assert.match(first, /pinned and served/u, 'a fitting checkpoint is served, and the reply says so');
    assert.match(first, /\d+\/\d+ entries served/u, 'the reply carries the window numbers, not just success');
  });
});

test('memory_checkpoint stops claiming success when the newest entry cannot be served', async () => {
  await withWorkspace(async (workspace) => {
    const lanePath = path.join(workspace, '.aios', 'memo', 'file', 'pinned', 'default.md');
    // 把 lane 灌满：预算 5,000，已有内容几乎占满，新写的 checkpoint 不可能被完整服务。
    const filler = Array.from({ length: 24 }, (_, i) => `[checkpoint] filler ${i} ${'f'.repeat(190)}`);
    await writeFile(lanePath, `${filler.join('\n\n')}\n`, 'utf8');

    const reply = await callCheckpoint(`oversized ${'x'.repeat(5200)}`);
    assert.match(reply, /NOT served/u, 'the reply must not read as an unqualified success');
    assert.doesNotMatch(reply, /^Checkpoint pinned and served/u, 'written and served are two different facts');
  });
});

test('the served-window judgement is derived, never restated inside the tool', async () => {
  await withWorkspace(async () => {
    const reply = await callCheckpoint('budget line stays honest');
    const match = reply.match(/window (\d+)\/(\d+) chars/u);
    assert.ok(match, `expected a window readout in: ${reply}`);
    assert.ok(Number(match[1]) <= Number(match[2]), 'the served block can never exceed its own budget');
  });
});
