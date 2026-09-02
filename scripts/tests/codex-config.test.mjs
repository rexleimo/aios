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
} from '../lib/native/emitters/codex-config.mjs';

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
