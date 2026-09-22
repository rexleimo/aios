/* 中文注释：BSK（BrowserSkill）模式下发 + 连接基线的 CI 单测。
   覆盖 step 4：三步引导文案 + 工具集转发表 + version_skew:false 判定；
   覆盖 step 3：切到 bsk 时下发引导（互斥三态下，bsk 与 Playwright 不共线）。 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BSK_INSTALL_STEPS,
  BSK_TOOL_MAP,
  parseBskStatusJson,
  renderBskInstallGuide,
  printBskInstallGuide,
  checkBskConnect,
  resolveBskRuntime,
} from '../lib/components/browser/bsk-writer.mjs';
import { switchBrowserMcpMode } from '../lib/components/browser/switch.mjs';
import { resolveBrowserMode } from '../lib/components/browser/mcp-mode.mjs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// ── 静态数据契约 ──

test('BSK_INSTALL_STEPS：三步（install/connect/run）结构完整', () => {
  assert.deepEqual(BSK_INSTALL_STEPS.map((s) => s.stage), ['install', 'connect', 'run']);
  for (const step of BSK_INSTALL_STEPS) {
    assert.equal(typeof step.title, 'string');
    assert.ok(step.title.length > 0);
    assert.equal(typeof step.command, 'string');
    assert.ok(step.command.length > 0);
    assert.equal(typeof step.note, 'string');
  }
});

test('BSK_TOOL_MAP：每个 browser 工具有对应的 bsk CLI 转发表项', () => {
  assert.ok(BSK_TOOL_MAP.length >= 5, '至少覆盖 snapshot/screenshot/navigate/connect 等');
  const byBrowser = new Map(BSK_TOOL_MAP.map((e) => [e.browser, e]));
  for (const entry of BSK_TOOL_MAP) {
    assert.equal(typeof entry.usage, 'string');
    assert.match(entry.usage, /^bsk /u, `usage 以 bsk 命令开头: ${entry.usage}`);
    assert.equal(typeof entry.description, 'string');
    assert.equal(byBrowser.get(entry.browser), entry, '按 browser 键唯一');
  }
  assert.ok(byBrowser.has('snapshot'));
  assert.ok(byBrowser.has('screenshot'));
  assert.ok(byBrowser.has('navigate'));
});

// ── parseBskStatusJson：version_skew:false 基线判定 ──

test('parseBskStatusJson：version_skew:false → ok，解析浏览器名', () => {
  const parsed = parseBskStatusJson(JSON.stringify({
    version_skew: false,
    browsers: [{ name: 'chrome' }, { id: 'chrome-headless' }],
    processId: 4321,
  }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.version_skew, false);
  assert.deepEqual(parsed.browsers, ['chrome', 'chrome-headless']);
  assert.equal(parsed.processId, 4321);
  assert.equal(parsed.reason, null);
});

test('parseBskStatusJson：version_skew:true → 未连上', () => {
  const parsed = parseBskStatusJson(JSON.stringify({ version_skew: true, browsers: [] }));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, 'version_skew=true');
  assert.deepEqual(parsed.browsers, []);
});

test('parseBskStatusJson：JSON 非法 / 非对象 → ok:false，不抛', () => {
  assert.equal(parseBskStatusJson('not json').ok, false);
  assert.equal(parseBskStatusJson('[1,2,3]').ok, false, '数组顶值非对象');
  assert.equal(parseBskStatusJson('').ok, false);
});

// ── render/print 引导 ──

test('renderBskInstallGuide：包含三步与工具集映射与 version_skew 基线', () => {
  const lines = renderBskInstallGuide();
  const blob = lines.join('\n');
  for (const step of BSK_INSTALL_STEPS) {
    assert.ok(blob.includes(`[${step.stage}]`), `含阶段 ${step.stage}`);
    assert.ok(blob.includes(step.command), `含命令 ${step.command}`);
  }
  assert.ok(blob.includes('Tool map'), '含工具集映射标题');
  for (const entry of BSK_TOOL_MAP) {
    assert.ok(blob.includes(entry.browser), `含工具 ${entry.browser}`);
    assert.ok(blob.includes(entry.usage), `含 usage ${entry.usage}`);
  }
  assert.ok(blob.includes('version_skew:false'), '含连通性基线说明');
  assert.ok(blob.includes('mutually exclusive with Playwright'), '互斥提示');
});

test('printBskInstallGuide：把引导逐行交给 io', () => {
  const lines = [];
  printBskInstallGuide({ io: { log: (m) => lines.push(m) } });
  assert.ok(lines.length >= BSK_INSTALL_STEPS.length + BSK_TOOL_MAP.length);
  assert.ok(lines.some((l) => l.includes('BSK / BrowserSkill')));
});

// ── checkBskConnect：version_skew:false 基线（注入运行时）──

test('checkBskConnect：bsk CLI 缺失 → 不报错，reason=bsk-cli-missing', async () => {
  const verdict = await checkBskConnect({
    runtime: {
      commandExists: () => false,
      captureCommand: () => { throw new Error('should not be called'); },
    },
    io: { log() {} },
  });
  assert.equal(verdict.checked, false);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'bsk-cli-missing');
});

test('checkBskConnect：dryRun → ok:null', async () => {
  const verdict = await checkBskConnect({
    dryRun: true,
    runtime: { commandExists: () => true, captureCommand: () => { throw new Error('should not run'); } },
    io: { log() {} },
  });
  assert.equal(verdict.checked, false);
  assert.equal(verdict.ok, null);
  assert.equal(verdict.reason, 'dry-run');
});

test('checkBskConnect：命令失败 → ok:false', async () => {
  const verdict = await checkBskConnect({
    runtime: {
      commandExists: () => true,
      captureCommand: () => ({ status: 127, stdout: '', stderr: 'not found' }),
    },
    io: { log() {} },
  });
  assert.equal(verdict.checked, true);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'command-failed');
  assert.equal(verdict.status, 127);
});

test('checkBskConnect：version_skew:true → 未连上', async () => {
  const verdict = await checkBskConnect({
    runtime: {
      commandExists: () => true,
      captureCommand: () => ({ status: 0, stdout: JSON.stringify({ version_skew: true, browsers: [] }) }),
    },
    io: { log() {} },
  });
  assert.equal(verdict.checked, true);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'version-skew');
});

test('checkBskConnect：version_skew:false + 浏览器 → 连接成功', async () => {
  const verdict = await checkBskConnect({
    runtime: {
      commandExists: () => true,
      captureCommand: () => ({
        status: 0,
        stdout: JSON.stringify({ version_skew: false, browsers: [{ name: 'chrome' }], processId: 99 }),
      }),
    },
    io: { log() {} },
  });
  assert.equal(verdict.checked, true);
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.browsers, ['chrome']);
  assert.equal(verdict.processId, 99);
});

// ── 注入式运行时契约 ──

test('resolveBskRuntime：未注入时回退真实命令函数', () => {
  const rt = resolveBskRuntime();
  assert.equal(typeof rt.commandExists, 'function');
  assert.equal(typeof rt.captureCommand, 'function');
});

// ── 切换命令互斥：切到 bsk 后产出引导，切回 playwright 不再带引导 ──

test('switch 到 bsk：落盘 + 产出 BSK 引导；切回 playwright 不带引导', async () => {
  const rootDir = await mkdtemp('aios-bsk-switch-');
  await mkdir(path.join(rootDir, 'config'), { recursive: true });

  const bskLogs = [];
  const switchBsk = await switchBrowserMcpMode({
    rootDir, mode: 'bsk',
    io: { log: (m) => bskLogs.push(String(m)) },
  });
  assert.equal(switchBsk.mode, 'bsk');
  assert.equal(resolveBrowserMode(null, { rootDir }), 'bsk');
  const bskBlob = bskLogs.join('\n');
  assert.ok(bskBlob.includes('BSK / BrowserSkill'), '切到 bsk 下发引导');

  const pwLogs = [];
  const switchPw = await switchBrowserMcpMode({
    rootDir, mode: 'playwright',
    io: { log: (m) => pwLogs.push(String(m)) },
  });
  assert.equal(switchPw.mode, 'playwright');
  assert.equal(resolveBrowserMode(null, { rootDir }), 'playwright');
  const pwBlob = pwLogs.join('\n');
  assert.ok(!pwBlob.includes('BSK / BrowserSkill'), '切回 playwright 不带 BSK 引导');

  // 写回的 settings 是合法 JSON 且存了 mode
  const settings = JSON.parse(await readFile(path.join(rootDir, 'config', 'settings.json'), 'utf8'));
  assert.equal(settings.browser.mcp, 'playwright');
});
