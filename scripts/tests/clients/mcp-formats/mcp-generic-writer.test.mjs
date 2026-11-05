// scripts/tests/clients/mcp-formats/mcp-generic-writer.test.mjs — w2-generic-writer 验收。
//
// 这条测试只写 `os.tmpdir()` 里的 fixture（用户授权：w2 不碰真实客户配置，真写盘留给 w7 逐家确认）。
// 硬门三条，逐条断言，不是注释里自述：
//   1. 装 → 读回 → 卸 之后，文件的**其余字节与安装前逐字节相同**（ADR 0008 验收 2）；
//   2. `--dry-run` 不写盘（内容 + mtime 双证，连备份目录都不建）——反例是 `aios skill add --dry-run` 的空转；
//   3. 白名单不过就**不落盘**，且理由机器可读。
// CASES 覆盖 `MCP_LANDING_OVERRIDES` 里全部可写落点（当前 17 对；`pi/project` 不可写，单独断言），
// 期望集合由补表推导，补表加了落点而测试没跟上即红。
// fixture 里「别人写的条目」刻意带手工排版（单行对象、注释、空行、内联表、`.env` 子表、行尾无换行），
// 因为整份重排式写入器在这些形状上必然破坏字节——那正是本层拒绝复用 `writeJsonConfig` 的原因。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { MCP_LANDING_OVERRIDES } from '../../../lib/clients/mcp/landing-schema.mjs';
import { readServers, removeServer, writeServer } from '../../../lib/clients/mcp/server-writer.mjs';

const PROBE = 'aios-probe-server';
const STDIO = Object.freeze({ command: 'node', args: ['/probe/server.js'], type: 'stdio' });
// 带 cwd 的那一家复用同一个探针条目：两个落点各自抄一份字面量时，standards 会把它们计成副本，
// 而更要紧的是「探针长什么样」这件事从此有了两个所有者——改一处忘另一处，测试仍然绿但测的不是同一件事。
const STDIO_CWD = Object.freeze({ ...STDIO, cwd: '.' });

const CASES = Object.freeze([
  {
    key: 'claude/home', clientId: 'claude', scope: 'home', file: '../.claude.json',
    original: `{
  "firstTimeOnboard": true,
  "mcpServers": {
    "theirs": { "command": "npx", "args": ["-y", "@other/server"] },
    "nested": {
      "command": "node",
      "args": ["/srv/a.js"],
      "env": { "A": "1" }
    }
  },
  "projects": { "E:/x": { "allowedTools": [] } }
}
`,
    entry: STDIO,
  },
  {
    key: 'claude/project', clientId: 'claude', scope: 'project', file: '.mcp.json',
    original: `{
  "mcpServers": {
    "theirs": {
      "command": "node",
      "args": ["/srv/theirs.js"],
      "cwd": "."
    }
  }
}
`,
    entry: STDIO_CWD,
  },
  {
    key: 'qoder/home', clientId: 'qoder', scope: 'home', file: 'settings.json',
    original: `{
  "editorMode": "nvim",
  "mcpServers": { "theirs": { "command": "node", "args": [] } }
}
`,
    entry: { command: 'node', args: ['/probe/server.js'], type: 'stdio', startupTimeoutSec: 10 },
  },
  {
    key: 'qoder/project', clientId: 'qoder', scope: 'project', file: '.qoder/settings.json',
    original: `{
  "$schema": "https://qoder.invalid/schema.json",
  "mcpServers": {
    "theirs": {
      "command": "node",
      "args": ["/srv/theirs.js"],
      "startupTimeoutSec": 30
    }
  }
}
`,
    entry: { command: 'node', args: ['/probe/server.js'], type: 'stdio', env: { FOO: 'bar' } },
  },
  {
    key: 'workbuddy/home', clientId: 'workbuddy', scope: 'home', file: 'mcp.json',
    original: `{
  "mcpServers": { "theirs": {"command":"node","args":[]} }
}
`,
    entry: STDIO,
  },
  {
    key: 'gemini/home', clientId: 'gemini', scope: 'home', file: 'settings.json',
    original: `{
  "mcpServers": {
    "theirs": {
      "command": "npx",
      "args": ["@other/mcp"],
      "timeout": 30000
    }
  },
  "telemetry": { "enabled": false }
}
`,
    entry: { command: 'node', args: ['/probe/server.js'], type: 'stdio', timeout: 15000 },
  },
  {
    key: 'gemini/project', clientId: 'gemini', scope: 'project', file: '.gemini/settings.json',
    original: `{
  "mcpServers": {
    "theirs": { "command": "node", "args": ["/srv/theirs.js"], "type": "stdio", "cwd": "." }
  }
}
`,
    entry: STDIO_CWD,
  },
  {
    key: 'opencode/home', clientId: 'opencode', scope: 'home', file: 'opencode.json',
    original: `{
  "$schema": "https://opencode.invalid/config.json",
  "mcp": {
    "theirs": { "type": "local", "command": ["node", "/srv/theirs.js"], "enabled": true }
  },
  "experimental": { "mcp_timeout": 10000 }
}
`,
    entry: { type: 'local', command: ['node', '/probe/server.js'], enabled: true },
  },
  {
    key: 'codex/home', clientId: 'codex', scope: 'home', file: 'config.toml',
    original: `model = "gpt-5"

[mcp_servers.theirs]
command = "node"
args = ["/srv/theirs.js"]
type = "stdio"

[mcp_servers.theirs.env]
FOO = "bar"
`,
    entry: STDIO,
  },
  {
    key: 'codex/project', clientId: 'codex', scope: 'project', file: '.codex/config.toml',
    original: `[mcp_servers.theirs]
command = "node"
args = ["/srv/theirs.js"]
approval_mode = "approve-all"
`,
    entry: { command: 'node', args: ['/probe/server.js'], type: 'stdio', approval_mode: 'approve-all' },
  },
  {
    key: 'grok/home', clientId: 'grok', scope: 'home', file: 'config.toml',
    original: `model = "grok-1"
# 行注释必须原样回来
[mcp_servers.theirs]
command = "node"
enabled = false
`,
    entry: { command: 'node', args: ['/probe/server.js'], type: 'stdio', enabled: true },
  },
  {
    key: 'grok/project', clientId: 'grok', scope: 'project', file: '.grok/config.toml',
    original: `[features]
hooks = true

[mcp_servers.theirs]
command = "node"
args = ["/srv/theirs.js", "--flag"]
enabled = true
`,
    entry: { command: 'node', args: ['/probe/server.js'], type: 'stdio', startup_timeout_sec: 10 },
  },
  {
    key: 'hermes/home', clientId: 'hermes', scope: 'home', file: 'config.yaml',
    original: `model: hermes-1

mcp_servers:
  # 手工维护的条目，注释必须原样回来
  theirs:
    command: node
    args:
      - /srv/theirs.js
    env:
      FOO: bar
  other: { command: node, args: [] }
`,
    entry: { command: 'node', args: ['/probe/server.js'], env: { FOO: 'bar' } },
  },
  {
    key: 'hermes/project', clientId: 'hermes', scope: 'project', file: '.mcp.json',
    original: `{
  "mcpServers": {
    "theirs": { "command": "node", "args": ["/srv/theirs.js"] }
  }
}
`,
    entry: STDIO,
  },
  {
    key: 'zcode/home', clientId: 'zcode', scope: 'home', file: 'cli/config.json',
    original: `{
  "hooks": { "onStart": [] },
  "mcp": {
    "version": 2,
    "servers": {
      "theirs": { "transport": "stdio", "command": "node", "args": ["/t.js"], "env": {} }
    }
  }
}
`,
    entry: { transport: 'stdio', command: 'node', args: ['/probe/server.js'], env: { FOO: 'bar' } },
  },
  {
    key: 'zcode/project', clientId: 'zcode', scope: 'project', file: '.zcode/config.json',
    original: `{
  "profile": "default",
  "mcp": {
    "servers": {
      "theirs": { "type": "stdio", "command": "node", "args": [], "env": {}, "timeoutMs": 5000 }
    }
  }
}
`,
    entry: { type: 'stdio', command: 'node', args: ['/probe/server.js'], env: {}, timeoutMs: 8000 },
  },
  {
    key: 'pi/home', clientId: 'pi', scope: 'home', file: 'agent/mcp.json',
    original: `{
  "mcpServers": {
    "code-review-graph": { "command": "uvx", "args": ["code-review-graph", "serve"], "lifecycle": "lazy" }
  }
}
`,
    entry: { command: 'node', args: ['/probe/server.js'], lifecycle: 'lazy' },
  },
]);

function makeFixture(c) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rex-mcp-writer-'));
  const filePath = path.join(dir, path.basename(c.file));
  fs.writeFileSync(filePath, c.original, 'utf8');
  return { dir, filePath, backupDir: path.join(dir, 'bak') };
}

test('每个可写落点都有对应的字节级用例（漏一家即红）', () => {
  // 期望集合直接从补表推导，不写死数字：补表加了落点而测试没跟上，这里就红。
  const expected = [];
  for (const [clientId, scopes] of Object.entries(MCP_LANDING_OVERRIDES)) {
    for (const [scope, override] of Object.entries(scopes)) {
      if (override.writable !== false) expected.push(`${clientId}/${scope}`);
    }
  }
  const covered = CASES.map((c) => `${c.clientId}/${c.scope}`).sort();
  assert.deepEqual(covered, expected.sort(), '字节级用例必须逐对盖住全部可写落点');
});

for (const c of CASES) {
  test(`${c.key}：装 → 读回 → 卸，其余字节逐字节相同；dry-run 不写盘`, async () => {
    const { dir, filePath, backupDir } = makeFixture(c);
    const base = { clientId: c.clientId, scope: c.scope, serverName: PROBE, filePath, backupDir };
    const before = fs.readFileSync(filePath, 'utf8');
    const mtimeBefore = fs.statSync(filePath).mtimeMs;

    const planned = await writeServer({ ...base, entry: c.entry, dryRun: true });
    assert.equal(planned.status, 'planned', `dry-run 返回 ${planned.status} / ${planned.reason || ''}`);
    assert.equal(fs.readFileSync(filePath, 'utf8'), before, 'dry-run 装了但写了盘（skill add --dry-run 的老毛病）');
    assert.equal(fs.statSync(filePath).mtimeMs, mtimeBefore, 'dry-run 动了 mtime');
    assert.equal(fs.existsSync(backupDir), false, 'dry-run 连备份都不该建');

    const added = await writeServer({ ...base, entry: c.entry });
    assert.equal(added.status, 'updated', `真装返回 ${added.status} / ${added.reason || ''}`);
    const afterAdd = fs.readFileSync(filePath, 'utf8');
    assert.notEqual(afterAdd, before, '装完必须真的改了文件');

    const readBack = readServers({ clientId: c.clientId, scope: c.scope, filePath });
    assert.equal(readBack.status, 'ok', `读回失败：${readBack.reason || ''}`);
    assert.deepEqual(readBack.entries[PROBE], c.entry, '读回的条目必须与装入的逐字段相同');

    const again = await writeServer({ ...base, entry: c.entry });
    assert.equal(again.status, 'unchanged', '同形状再装必须幂等，不是重写');
    assert.equal(fs.readFileSync(filePath, 'utf8'), afterAdd, 'unchanged 不该动文件');

    const removePlan = await removeServer({ ...base, dryRun: true });
    assert.equal(removePlan.status, 'planned');
    assert.equal(fs.readFileSync(filePath, 'utf8'), afterAdd, 'dry-run 卸了但写了盘');

    const removed = await removeServer({ ...base });
    assert.equal(removed.status, 'removed', `真卸返回 ${removed.status} / ${removed.reason || ''}`);
    assert.equal(removed.residue, '', `不该有残留，实得 ${removed.residue}`);
    assert.equal(fs.readFileSync(filePath, 'utf8'), before, '卸掉自己装的条目后，文件的其余字节必须逐字节相同');
    assert.ok(fs.existsSync(removed.backupPath), '改动前必须留有原文备份');
    assert.equal(readServers({ clientId: c.clientId, scope: c.scope, filePath }).entries[PROBE], undefined, '卸完还能读到条目即为假卸载');
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

test('opencode/home：桶由本次写入创建时，卸载可按 provenance 连桶收掉', async () => {
  const original = '{\n  "$schema": "https://opencode.invalid/config.json",\n  "theme": "system"\n}\n';
  const entry = { type: 'local', command: ['node', '/probe/server.js'], enabled: true };
  const { dir, filePath, backupDir } = makeFixture({ clientId: 'opencode', scope: 'home', file: 'opencode.json', original });
  const base = { clientId: 'opencode', scope: 'home', serverName: PROBE, filePath, backupDir, entry };

  const added = await writeServer(base);
  assert.equal(added.status, 'updated');
  assert.equal(added.createdBucket, true, 'mcp 桶不存在，必须由本次写入创建并报出 provenance');
  assert.deepEqual(readServers(base).entries[PROBE], entry);

  // 默认不越权：桶留空壳，但残留是机器可读的，不是悄悄留着。
  const plain = await removeServer(base);
  assert.equal(plain.status, 'removed');
  assert.equal(plain.residue, 'empty-bucket');

  // 调用方（w3 账本）证明桶是 AIOS 建的 → 连桶一起收，回到原始字节。
  assert.equal((await writeServer(base)).status, 'updated');
  const dropped = await removeServer({ ...base, dropEmptyBucket: true });
  assert.equal(dropped.status, 'removed');
  assert.equal(dropped.residue, '');
  assert.equal(fs.readFileSync(filePath, 'utf8'), original, '连桶收掉后必须逐字节回到原样');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('本来就写成内联 `{}` 的空桶：装成展开式，卸回内联 `{}`，仍逐字节回原', async () => {
  // 这条钉住 w2 实测到的两个缺陷：空桶插入时缩进算成 0 列（`detectIndentation` 把锚点取成了行首），
  // 以及删除最后一个条目时留下多行空壳、回不到原来的 `{}`。现在两边都是确定的。
  const original = '{\n  "mcp": {\n    "servers": {}\n  },\n  "profile": "default"\n}\n';
  const entry = { type: 'stdio', command: 'node', args: ['/probe/server.js'], env: {} };
  const { dir, filePath, backupDir } = makeFixture({ clientId: 'zcode', scope: 'project', file: 'config.json', original });
  const base = { clientId: 'zcode', scope: 'project', serverName: PROBE, filePath, backupDir, entry };
  assert.equal((await writeServer(base)).status, 'updated');
  const afterAdd = fs.readFileSync(filePath, 'utf8');
  assert.match(afterAdd, /\n {6}"aios-probe-server":/u, '空桶里插入的成员必须缩进到桶内一层，不是 0 列');
  const removed = await removeServer(base);
  assert.equal(removed.status, 'removed');
  assert.equal(removed.residue, 'empty-bucket', '桶空了必须报残留，不静默');
  assert.equal(fs.readFileSync(filePath, 'utf8'), original, '内联空桶必须逐字节回到原样');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('白名单不过就不落盘：未知字段、缺必需字段、不可写落点', async () => {
  const original = '{\n  "mcpServers": {\n    "theirs": { "command": "node", "args": [] }\n  }\n}\n';
  const cases = [
    { clientId: 'gemini', scope: 'home', entry: { command: 'node', args: [], startupTimeoutSec: 10 }, reason: 'unknown-field' },
    { clientId: 'pi', scope: 'home', entry: { command: 'node', args: [] }, reason: 'required-field-missing' },
    { clientId: 'pi', scope: 'project', entry: { command: 'node', args: [], type: 'stdio' }, reason: 'landing-not-writable' },
  ];
  for (const c of cases) {
    const { dir, filePath, backupDir } = makeFixture({ ...c, file: 'x.json', original });
    const result = await writeServer({ ...c, serverName: PROBE, filePath, backupDir });
    assert.equal(result.status, 'rejected', `${c.clientId}/${c.scope} 应被拒，实得 ${result.status}`);
    assert.equal(result.reason, c.reason);
    assert.equal(fs.readFileSync(filePath, 'utf8'), original, '被拒的写入必须一个字节都没动');
    assert.equal(fs.existsSync(backupDir), false, '被拒的写入不该留备份');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('同名条目形状不同即 conflict，不覆盖（等 w3 归属裁断）', async () => {
  const original = `{\n  "mcpServers": {\n    "${PROBE}": { "command": "node", "args": ["/their.js"] }\n  }\n}\n`;
  const { dir, filePath, backupDir } = makeFixture({ clientId: 'claude', scope: 'home', file: '.claude.json', original });
  const result = await writeServer({ clientId: 'claude', scope: 'home', serverName: PROBE, entry: { command: 'node', args: ['/probe/server.js'], type: 'stdio' }, filePath, backupDir });
  assert.equal(result.status, 'conflict');
  assert.equal(result.reason, 'entry-exists-differs');
  assert.equal(fs.readFileSync(filePath, 'utf8'), original, 'conflict 不许写盘');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('读不动的落点不猜：坏 JSON 直接 rejected landing-unparsable', async () => {
  const original = '{ "mcpServers": { oops\n';
  const { dir, filePath, backupDir } = makeFixture({ clientId: 'claude', scope: 'home', file: '.claude.json', original });
  const result = await writeServer({ clientId: 'claude', scope: 'home', serverName: PROBE, entry: STDIO, filePath, backupDir });
  assert.equal(result.status, 'rejected');
  assert.match(result.reason, /^landing-unparsable/);
  assert.equal(fs.readFileSync(filePath, 'utf8'), original, '解析失败即拒，原字节保留');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('没有文本形态的落点如实报 format-not-wired，不假装成功', async () => {
  const targets = { claude: { format: 'none', namespace: 'mcpServers', scopes: [{ scope: 'home', file: '../.claude.json', format: 'none' }] } };
  const { dir, filePath, backupDir } = makeFixture({ clientId: 'claude', scope: 'home', file: '.claude.json', original: '{}\n' });
  const result = await writeServer({ clientId: 'claude', scope: 'home', serverName: PROBE, entry: STDIO, filePath, backupDir, targets });
  assert.equal(result.status, 'format-not-wired');
  assert.equal(result.reason, 'landing-format-not-wired:none');
  assert.equal(fs.readFileSync(filePath, 'utf8'), '{}\n');
  fs.rmSync(dir, { recursive: true, force: true });
});
