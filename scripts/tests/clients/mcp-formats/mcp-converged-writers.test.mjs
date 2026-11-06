// scripts/tests/clients/mcp-formats/mcp-converged-writers.test.mjs — w5b：收编后的三家仍满足同一条门。
//
// 这一份只回答一个问题：把私有写入器的**文本手术**换成通用路径之后，
// 「装→读回→卸→非托管字节逐字节回到原样」这条门是否还成立，以及「先算后写」的纯计算面是否真的不写盘。
// 与 w5a 的能力用例分开，是因为它测的不是能力本身，而是「谁在用这些能力」（codemap / browser 迁移写入器）。
// 目录预算：scripts/tests/clients/mcp-formats/ 8 格顶格，所以它和 w5a 的能力用例分成两份、共享同一批 fixture 入口。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { planServerEdits } from '../../../lib/clients/mcp/server-writer.mjs';
import { insertEntry } from '../../../lib/clients/mcp/formats/json-editor.mjs';
import { insertTomlEntry, readTomlEntries, removeTomlEntry, replaceTomlEntry } from '../../../lib/clients/mcp/formats/toml-editor.mjs';
import {
  injectCrgIntoClientTarget,
  inspectCodemapMcpTarget,
  removeCrgFromClientTarget,
} from '../../../lib/tooling/components/codemap/targets/mcp-targets.mjs';

// ── w5b：codemap 的文件写入收编到通用路径后，门还是那条门 ─────────────────────
//
// 旧实现（`codemap/targets/mcp-targets/{json,toml,yaml}.mjs`）都是整份重排：JSON 走
// `JSON.stringify(parsed, null, 2)`、TOML 用正则整段替换、YAML 用 `document.setIn` 后整份 `String()`。
// 于是「装一个条目」的副作用是别人写在同一份文件里的缩进/注释/键序也一起变。收编后应当只剩托管条目在动。
// 这一组就是那条边的验收：**别人的字节不变 + 卸掉自己装的之后逐字节回到原样**。
const CRG = 'code-review-graph';
const SILENT = { log: () => {} };

const CODEMAP_CASES = [
  {
    key: 'json',
    clientKey: 'claude',
    format: 'mcp-json',
    file: 'config.json',
    // 4 空格缩进：整份重排会把它改成 2 空格——正是收编要消掉的那种副作用。
    original: '{\n    "theme": "dark",\n    "mcpServers": {\n        "theirs": { "command": "npx", "args": ["-y", "@other/server"] }\n    }\n}\n',
  },
  {
    key: 'toml',
    clientKey: 'codex',
    format: 'codex-toml',
    file: 'config.toml',
    // 注释紧挨着下一段：段被搬走或空行被压缩，注释就与它描述的东西脱节。
    original: 'model = "gpt-5"\n\n# 这条注释属于下面的段，重排就会错位\n[mcp_servers.theirs]\ncommand = "node"\nargs = ["/srv/theirs.js"]\n\n[history]\npersistence = "save-all"\n',
  },
  {
    key: 'yaml',
    clientKey: 'hermes',
    format: 'hermes-yaml',
    file: 'config.yaml',
    original: '# hermes 用户配置\nmodel: hermes-1\n\nmcp_servers:\n  # 手工维护的注释\n  theirs:\n    command: node\n    args:\n      - /srv/theirs.js\n',
  },
];

test('w5b/codemap：装卸只动托管条目，别人的字节不变，卸完逐字节回到原样（三家族）', async () => {
  for (const c of CODEMAP_CASES) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `aios-w5b-${c.key}-`));
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-w5b-project-'));
    const filePath = path.join(dir, c.file);
    fs.writeFileSync(filePath, c.original, 'utf8');
    const target = { path: filePath, clientKey: c.clientKey, format: c.format, createIfMissing: true };

    const injected = await injectCrgIntoClientTarget(target, elsewhere, { io: SILENT });
    assert.equal(injected.status, 'updated', `${c.key} 注入实得 ${injected.status}/${injected.reason || ''}`);

    const after = fs.readFileSync(filePath, 'utf8');
    // ① 托管条目真的在，且解析后是 CRG 的 serve 入口（doctor 读的也是这条判定）。
    assert.equal(inspectCodemapMcpTarget(target).valid, true, `${c.key} 装完必须能被 doctor 认成有效 CRG 条目`);
    // ② 别人的字节没被重排。逐条钉住最容易被动到的三件事：缩进、注释与所属行的相邻关系、块风格。
    //    旧写入器（整份 JSON.stringify / 整段重写）在这三条上分别会失败。
    const unmanaged = {
      // eslint-disable-next-line no-template-curly-in-string
      json: ['\n    "theme": "dark",', '"theirs": { "command": "npx", "args": ["-y", "@other/server"] }'],
      toml: ['# 这条注释属于下面的段，重排就会错位\n[mcp_servers.theirs]', '[history]\npersistence = "save-all"'],
      yaml: ['\n  # 手工维护的注释\n  theirs:', 'model: hermes-1'],
    }[c.key];
    for (const fragment of unmanaged) {
      assert.ok(after.includes(fragment), `${c.key} 的非托管字节被改了：缺少 ${JSON.stringify(fragment)}`);
    }

    const removed = await removeCrgFromClientTarget(target, { io: SILENT, projectRoot: elsewhere });
    assert.equal(removed.status, 'removed', `${c.key} 卸载实得 ${removed.status}/${removed.reason || ''}`);
    // ③ 卸完必须逐字节回到原样（不是「语义等价」）：否则「装→卸」本身就是一次别人的配置改写。
    assert.equal(fs.readFileSync(filePath, 'utf8'), c.original, `${c.key} 卸载后未回到原始字节`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
});

test('w5b/codemap：未知格式标签是机器可读拒绝，不再把 JSON 写进别人的 TOML', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-w5b-format-'));
  const filePath = path.join(dir, 'config.toml');
  fs.writeFileSync(filePath, 'model = "gpt-5"\n', 'utf8');
  const target = { path: filePath, clientKey: 'codex', format: 'toml', createIfMissing: true };

  const result = await injectCrgIntoClientTarget(target, dir, { io: SILENT });
  assert.equal(result.status, 'error');
  assert.match(result.reason, /format-not-wired:toml/u);
  assert.equal(fs.readFileSync(filePath, 'utf8'), 'model = "gpt-5"\n', '被拒的注入不许动盘');
  // doctor 也要说同一句话，不能把它读成「missing」。
  assert.match(inspectCodemapMcpTarget(target).reason, /format-not-wired:toml/u);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── TOML 子表能力（w5b 收编 browser TOML 方言的前置） ─────────────────────────
test('TOML：对象值写成一级子表，读回并进父条目，替换/删除后其余字节不变', () => {
  const original = 'model = "gpt-5"\n\n[mcp_servers.theirs]\ncommand = "node"\nargs = ["/t.js"]\n\n[mcp_servers.theirs.env]\nFOO = "bar"\n';
  // ① 读：`[x.env]` 的键并进父条目（旧 reader 把子表整段丢掉，上层会把它误判成 kept-differs）。
  assert.deepEqual(readTomlEntries(original, ['mcp_servers']).entries.theirs, { command: 'node', args: ['/t.js'], env: { FOO: 'bar' } });

  // ② 写：对象值 → 子表（codex 的现实形状），标量/数组留在父段。
  const inserted = insertTomlEntry(original, ['mcp_servers'], 'probe', { type: 'stdio', command: 'node', args: ['/p.js'], startup_timeout_sec: 10, env: { A: '1' } });
  assert.match(inserted.text, /\[mcp_servers\.probe\.env\]\nA = "1"/u, 'env 必须写成子表');
  assert.doesNotMatch(inserted.text, /env = \{/u, '不许把 env 写成内联表');
  assert.match(inserted.text, /startup_timeout_sec = 10/u, '数字字段不加引号');
  assert.deepEqual(readTomlEntries(inserted.text, ['mcp_servers']).entries.probe,
    { type: 'stdio', command: 'node', args: ['/p.js'], startup_timeout_sec: 10, env: { A: '1' } });

  // ③ 替换：段留在原位置，子表跟着条目一起重写（留下一份没人认领的旧 env 才是真错）。
  const replaced = replaceTomlEntry(inserted.text, ['mcp_servers'], 'probe', { type: 'stdio', command: 'node', args: ['/p2.js'], env: { A: '9', B: '8' } });
  const probe = readTomlEntries(replaced.text, ['mcp_servers']).entries.probe;
  assert.deepEqual(probe, { type: 'stdio', command: 'node', args: ['/p2.js'], env: { A: '9', B: '8' } });
  assert.equal(replaced.text.split('[mcp_servers.probe.env]').length - 1, 1, '替换后只能有一个 env 子表');

  // ④ 删除：父段与子表一起走，文件逐字节回到原文（别人的 env 子表不受影响）。
  const removed = removeTomlEntry(replaced.text, ['mcp_servers'], 'probe');
  assert.equal(removed.text, original, '删掉自己装的条目后必须逐字节回到原样');
  assert.match(removed.text, /\[mcp_servers\.theirs\.env\]/u, '别人的子表不许被带走');
});
