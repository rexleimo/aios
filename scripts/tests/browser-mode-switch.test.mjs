/* 中文注释：浏览器 MCP 切换命令 + 交互式选型的测试。
   - switchBrowserMcpMode：落 settings → re-materialize，非法/缺省抛错。
   - selectBrowserMode / promptBrowserMode：注入 selectFn 模拟 TTY 选型。 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';

import { BROWSER_MODES, DEFAULT_BROWSER_MODE, resolveBrowserMode } from '../lib/components/browser/mcp-mode.mjs';
import { switchBrowserMcpMode } from '../lib/components/browser/switch.mjs';
import { promptBrowserMode, selectBrowserMode } from '../lib/components/browser/prompt.mjs';

async function tmpRoot() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aios-switch-'));
  return { rootDir: dir, settingsPath: path.join(dir, 'config', 'settings.json') };
}

function silentIo() {
  return { log() {}, warn() {}, error() {} };
}

test('switchBrowserMcpMode 落盘 mode 并回读一致', async () => {
  const { rootDir, settingsPath } = await tmpRoot();
  const result = await switchBrowserMcpMode({ rootDir, mode: 'playwright', io: silentIo() });
  assert.equal(result.mode, 'playwright');
  assert.equal(resolveBrowserMode(null, { rootDir }), 'playwright');
  const file = JSON.parse(await readFile(settingsPath, 'utf8'));
  assert.deepEqual(file.browser, { mcp: 'playwright' });
});

test('switchBrowserMcpMode 支持三态切换', async () => {
  const { rootDir } = await tmpRoot();
  for (const mode of BROWSER_MODES) {
    const result = await switchBrowserMcpMode({ rootDir, mode, io: silentIo() });
    assert.equal(result.mode, mode, `${mode} 归一结果`);
    assert.equal(resolveBrowserMode(null, { rootDir }), mode, `${mode} 读回一致`);
  }
});

test('switchBrowserMcpMode 非法 mode 抛错（不让隐式归一为 none）', async () => {
  const { rootDir } = await tmpRoot();
  await assert.rejects(
    () => switchBrowserMcpMode({ rootDir, mode: 'garbage', io: silentIo() }),
    /unknown browser mode 'garbage'/,
  );
});

test('switchBrowserMcpMode 缺省 mode 抛错', async () => {
  const { rootDir } = await tmpRoot();
  await assert.rejects(
    () => switchBrowserMcpMode({ rootDir, mode: undefined, io: silentIo() }),
    /unknown browser mode/,
  );
});

test('switchBrowserMcpMode 返回 migrate 结果（即使 materialize 失败只告警不阻塞切换）', async () => {
  const { rootDir } = await tmpRoot();
  // 没有真实仓库 local MCP，migrate 会对各客户端抛错，但切命令本身不阻塞。
  const result = await switchBrowserMcpMode({ rootDir, mode: 'bsk', io: silentIo() });
  assert.equal(result.mode, 'bsk');
  assert.ok(result.hasOwnProperty('migrationResult'));
});

// 交互式选型（注入 selectFn 模拟 TTY 选择）
async function runSelect(fn) {
  const { rootDir } = await tmpRoot();
  const chosen = await selectBrowserMode({
    message: 'pick',
    selectFn: async ({ message, choices }) => {
      assert.ok(Array.isArray(choices) && choices.length >= 3);
      return fn(choices);
    },
    io: silentIo(),
  });
  assert.ok(BROWSER_MODES.includes(chosen), `选型结果合法: ${chosen}`);
  return { rootDir, chosen };
}

test('selectBrowserMode 选择 bsk 返回合法 mode', async () => {
  const { chosen } = await runSelect((choices) =>
    choices.find((c) => c.value === 'bsk').value);
  assert.equal(chosen, 'bsk');
});

test('promptBrowserMode 提问后落盘 mode', async () => {
  const { rootDir } = await tmpRoot();
  const chosen = await promptBrowserMode({
    rootDir,
    selectFn: async ({ message, choices }) => {
      assert.ok(Array.isArray(choices) && choices.length >= 3, `选型项合法: ${message}`);
      return choices.find((c) => c.value === 'playwright').value;
    },
    io: silentIo(),
  });
  assert.equal(chosen, 'playwright');
  assert.equal(resolveBrowserMode(null, { rootDir }), 'playwright', 'prompt 写入 settings');
});

test('promptBrowserMode 默认值（无输入回退 none）', async () => {
  const { rootDir } = await tmpRoot();
  const chosen = await promptBrowserMode({
    rootDir,
    selectFn: async () => DEFAULT_BROWSER_MODE,
    io: silentIo(),
  });
  assert.equal(chosen, DEFAULT_BROWSER_MODE);
  assert.equal(resolveBrowserMode(null, { rootDir }), DEFAULT_BROWSER_MODE);
});
