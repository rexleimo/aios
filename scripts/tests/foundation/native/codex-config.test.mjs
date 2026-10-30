/* 中文注释：codex 用户级 config.toml 同步（trust + MCP）行为测试。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildManagedCodexConfig,
  codexHomeDir,
  stripManagedTables,
  syncCodexHomeConfig,
} from '../../../lib/clients/native/distribution/emitters/codex-config.mjs';

const ROOT = path.resolve('E:/coding/harness-cli');

function memoryFs(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  const impl = {
    readFile: async (p) => {
      if (!files.has(p)) { const e = new Error('no'); e.code = 'ENOENT'; throw e; }
      return files.get(p);
    },
    writeFile: async (p, data) => { files.set(p, data); },
    rename: async (from, to) => { files.set(to, files.get(from)); files.delete(from); },
    mkdir: async () => {},
  };
  return { impl, files };
}

function configPath(home) {
  return path.join(codexHomeDir({}, home), 'config.toml');
}

test('buildManagedCodexConfig: trust 段 + 五大 MCP 表 + 管理区标记', () => {
  const config = buildManagedCodexConfig({ rootDir: ROOT });
  const projectHeader = `[projects.'${ROOT}']`;
  assert.match(config, new RegExp(projectHeader.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')));
  assert.match(config, /trust_level = "trusted"/);
  for (const name of ['code-review-graph', 'mcp-browser-use', 'aios-auth-tools', 'aios-shell', 'aios-memory']) {
    assert.match(config, new RegExp(`\\[mcp_servers\\.${name}\\]`));
  }
  assert.match(config, /# >>> aios-managed-begin/);
  assert.match(config, /# <<< aios-managed-end/);
});

/* 中文注释：安装树里的 CWD 是升级杀手——Windows 上目录改名只被“某进程 CWD 在该子树内”拦住
 * （实测：文件句柄/watch 句柄/Chrome profile 句柄都不拦），而 `aios update` 换入正是把旧安装目录
 * 改名让位。所以 AIOS 自己起的 MCP 服务一律不钉 cwd；工作区语义由显式契约变量承担。
 * code-review-graph 不在名单里：它是外部工具，cwd 就是它要索引的工作区，属于它的参数不是我们的布局。 */
test('buildManagedCodexConfig: AIOS 自己起的 MCP 表不钉 cwd，工作区语义靠契约变量', () => {
  const config = buildManagedCodexConfig({ rootDir: ROOT });
  const tables = new Map();
  let current = null;
  for (const line of config.split('\n')) {
    const header = line.match(/^\[([^\]]+)\]\s*$/u);
    if (header) {
      current = header[1];
      tables.set(current, []);
      continue;
    }
    if (current) tables.get(current).push(line);
  }

  for (const name of ['mcp-browser-use', 'aios-memory', 'aios-shell', 'aios-auth-tools']) {
    const body = tables.get(`mcp_servers.${name}`) || [];
    assert.ok(
      !body.some((line) => /^\s*cwd\s*=/u.test(line)),
      `mcp_servers.${name} 不得钉 cwd（会把安装树锁住）`,
    );
  }

  // 去掉了冗余的 cwd，但记忆服务的工作区根必须仍由 AIOS_WORKSPACE_ROOT 显式给出，不能漂回客户端 cwd。
  const memoryEnv = tables.get('mcp_servers.aios-memory.env') || [];
  assert.ok(
    memoryEnv.some((line) => line.includes('AIOS_WORKSPACE_ROOT') && line.includes(ROOT)),
    `aios-memory 缺 AIOS_WORKSPACE_ROOT 契约行：${memoryEnv.join(' | ')}`,
  );
});

test('syncCodexHomeConfig: 空目录 → created 且只含一个管理区', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'aios-codex-home-'));
  const { impl, files } = memoryFs();
  const result = await syncCodexHomeConfig({ rootDir: ROOT, homeDir: home, fsImpl: impl });
  assert.equal(result.status, 'created');
  const raw = files.get(configPath(home));
  assert.ok(raw);
  assert.equal(raw.match(/# >>> aios-managed-begin/gu)?.length, 1);
  assert.match(raw, /trust_level = "trusted"/);
});

test('syncCodexHomeConfig: 幂等重入 → reused', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'aios-codex-home-'));
  const { impl } = memoryFs();
  await syncCodexHomeConfig({ rootDir: ROOT, homeDir: home, fsImpl: impl });
  const result = await syncCodexHomeConfig({ rootDir: ROOT, homeDir: home, fsImpl: impl });
  assert.equal(result.status, 'reused');
});

test('syncCodexHomeConfig: 保留用户自有内容，剥离无标记的历史 AIOS 段', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'aios-codex-home-'));
  const legacy = [
    '[model]',
    'name = "gpt-5.6-sol"',
    '',
    '[mcp_servers.aios-memory]',
    'command = "node"',
    '',
    `[projects.'${ROOT}']`,
    'trust_level = "trusted"',
  ].join('\n');
  const { impl, files } = memoryFs({ [configPath(home)]: legacy });
  const result = await syncCodexHomeConfig({ rootDir: ROOT, homeDir: home, fsImpl: impl });
  assert.equal(result.status, 'updated');
  const raw = files.get(configPath(home));
  assert.match(raw, /\[model\]/);
  assert.match(raw, /name = "gpt-5\.6-sol"/);
  assert.equal(raw.match(/\[mcp_servers\.aios-memory\]/gu)?.length, 1);
  assert.equal(raw.match(new RegExp(`\\[projects\\.'${ROOT.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}'\\]`, 'gu'))?.length, 1);
});

test('stripManagedTables: 管理区整体移除，区外内容保留', () => {
  const raw = [
    'keep_me = true',
    '# >>> aios-managed-begin (AIOS codex trust + MCP; do not edit inside) >>>',
    '[mcp_servers.aios-memory]',
    'command = "node"',
    '# <<< aios-managed-end <<<',
    '[other]',
    'value = 1',
  ].join('\n');
  const next = stripManagedTables(raw, { rootDir: ROOT });
  assert.match(next, /keep_me = true/);
  assert.match(next, /\[other\]/);
  assert.doesNotMatch(next, /aios-memory/);
});

test('syncCodexHomeConfig: 易失 rootDir 不得写持久 config.toml（B7 同源守卫）', async () => {
  const volatileRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-bsk-switch-VOLATILE-'));
  const { impl, files } = memoryFs();
  const persistentHome = '/persistent/home';
  const result = await syncCodexHomeConfig({ rootDir: volatileRoot, homeDir: persistentHome, fsImpl: impl });
  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'volatile-root');
  assert.equal(result.path, path.join(persistentHome, '.codex', 'config.toml'));
  assert.equal(files.size, 0, '一个字节都不能写');
});

test('syncCodexHomeConfig: 沙箱到沙箱（两边都易失）照旧放行', async () => {
  const volatileRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-bsk-switch-SANDBOX-'));
  const sandboxHome = await mkdtemp(path.join(os.tmpdir(), 'aios-codex-sandbox-'));
  const { impl, files } = memoryFs();
  const result = await syncCodexHomeConfig({ rootDir: volatileRoot, homeDir: sandboxHome, fsImpl: impl });
  assert.equal(result.status, 'created');
  const written = files.get(path.join(sandboxHome, '.codex', 'config.toml'));
  assert.ok(written && written.includes(volatileRoot), '沙箱内写沙箱路径是预期行为');
});

test('stripManagedTables: 解码键后剥离，不让同一路径以两种拼写并存', () => {
  const winRoot = path.resolve('C:/Users/Administrator/.rexcil/aios');
  // 真实 codex 写法：basic string 里反斜杠要转义，所以文件字节是两个反斜杠。
  const escapedRoot = String.raw`"C:\\Users\\Administrator\\.rexcil\\aios"`;
  const escapedOther = String.raw`"c:\\users\\administrator\\other"`;
  const raw = [
    'model = "gpt-5"',
    '',
    `# codex 自己写的：[projects.${escapedRoot}]`,
    'trust_level = "trusted"',
    '',
    '# 无关项目必须保留（不是同一个解码后的键）',
    `[projects.${escapedOther}]`,
    'trust_level = "trusted"',
    '',
    '# 字面量式同一路径也要剥离',
    `[projects.'${winRoot}']`,
    'trust_level = "trusted"',
    '',
    '# 解不开的键（非法转义）一律保留：宁可不剔，不能猜着删别人的数据',
    String.raw`[projects."bad\escape"]`,
    'trust_level = "trusted"',
    '',
    '[mcp_servers.user-owned]',
    'command = "keep-me"',
  ].join('\n');

  const stripped = stripManagedTables(raw, { rootDir: winRoot });

  const projectHeaders = stripped.split('\n').filter((line) => /^\[projects\./.test(line));
  assert.deepEqual(projectHeaders, [
    `[projects.${escapedOther}]`,
    String.raw`[projects."bad\escape"]`,
  ]);
  assert.equal(
    projectHeaders.some((line) => line.includes('rexcil')),
    false,
    'AIOS root 的两种拼写都得被剔掉'
  );
  assert.match(stripped, /command = "keep-me"/);
  assert.match(stripped, /model = "gpt-5"/);
});

test('syncCodexHomeConfig: 用户文件已有转义形式的同键表时不产生重复键', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'aios-codex-dup-'));
  const root = path.resolve('C:/Users/Administrator/.rexcil/aios');
  const target = configPath(home);
  const { impl, files } = memoryFs({
    [target]: [
      'model = "gpt-5"',
      '',
      String.raw`[projects."C:\\Users\\Administrator\\.rexcil\\aios"]`,
      'trust_level = "trusted"',
      '',
    ].join('\n'),
  });

  await syncCodexHomeConfig({ rootDir: root, env: { CODEX_HOME: home }, fsImpl: impl });
  const text = files.get(target);

  const headers = text.split('\n').filter((line) => /^\[projects\./.test(line));
  assert.equal(headers.length, 1, `trust 表只能有一份，实际：${JSON.stringify(headers)}`);
  assert.match(headers[0], /rexcil/, '留下的必须是 AIOS root 那一份');
  assert.match(text, /model = "gpt-5"/, '用户自有内容不动');
});

test('stripManagedTables: 无标记遗留表只吞到自己的表头边界，人类后续表必须保留', () => {
  const root = path.resolve('C:/Users/Someone/.rexcil/aios');
  const raw = [
    'model = "gpt-5"',
    '',
    `[projects.'${root}']`,
    'trust_level = "trusted"',
    '',
    '# 下一个表头就是边界：以下是人类自己的表',
    '[mcp_servers.personal]',
    'command = "keep-me"',
    '',
    '[features]',
    'hooks = true',
  ].join('\n');

  const stripped = stripManagedTables(raw, { rootDir: root });
  assert.match(stripped, /model = "gpt-5"/);
  assert.match(stripped, /command = "keep-me"/);
  assert.match(stripped, /hooks = true/);
  assert.equal(stripped.includes('trust_level'), false, 'AIOS 拥有的那一段要被剔掉');
});
