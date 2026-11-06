// scripts/tests/clients/mcp-formats/mcp-writer-capabilities.test.mjs — 写路径能力与「收编后仍成立」的验收。
//
// 这一份测两批事：
//   w5a（能力）：① `replaceServer`：同名不同形状原地改写（json/toml/yaml 三家族），条目位置不变；
//     ② 桶外根键：`requiresRootKeys` 真的被写路径消费（缺了按默认值补、补了回报 provenance、
//     卸载时只有「账本证明是我建的且值没被人改」才回收）；③ `createIfMissing`：声明「不许凭空建文件」的落点缺文件即拒；
//     ④ 字段变换位：四家改名表逐条生效、矛盾/非数字输入拒。
//   w5b（收编）：codemap 的文件写入改经同一条通用路径后，**非托管字节不变** + 托管条目语义一致
//     （装→读回→卸→逐字节回到原样），以及未知格式标签不再「当 JSON 写」而是机器可读拒绝。
// 为什么 w5b 的用例也落在这份文件：`scripts/tests/clients/mcp-formats/` 目录预算 8/8 顶格
// （`clients/` 自身也满，开不了子目录），同族的旧 browser 写入器方言测试已合并为
// `mcp-legacy-migration.test.mjs`；剩下的容量只能用来钉「收编后仍然成立」这件事本身。
// 与 w2 同一授权：只写 `os.tmpdir()` 的 fixture，不碰任何真实客户端配置。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { planServerEdits, readServers, removeServer, replaceServer, writeServer } from '../../../lib/clients/mcp/server-writer.mjs';
import { ENTRY_FIELD_RENAMES, landingRenames, normalizeEntryForLanding } from '../../../lib/clients/mcp/entry-transforms.mjs';
import { insertYamlEntry } from '../../../lib/clients/mcp/formats/yaml-editor.mjs';
import { insertEntry } from '../../../lib/clients/mcp/formats/json-editor.mjs';
import {
  injectCrgIntoClientTarget,
  inspectCodemapMcpTarget,
  removeCrgFromClientTarget,
} from '../../../lib/tooling/components/codemap/targets/mcp-targets.mjs';
import { dropRootKeys, ensureRootKeys, hasRootKey } from '../../../lib/clients/mcp/formats/json-editor.mjs';
import { OPENCODE_MCP_TIMEOUT_MS } from '../../../lib/clients/opencode/config.mjs';
import { PROBE, STDIO, makeFixture } from './writer-fixtures.mjs';

test('opencode/home：桶与桶外根键都由本次写入创建时，卸载按 provenance 一起收掉', async () => {
  const original = '{\n  "$schema": "https://opencode.invalid/config.json",\n  "theme": "system"\n}\n';
  const entry = { type: 'local', command: ['node', '/probe/server.js'], enabled: true };
  const { dir, filePath, backupDir } = makeFixture({ clientId: 'opencode', scope: 'home', file: 'opencode.json', original });
  const base = { clientId: 'opencode', scope: 'home', serverName: PROBE, filePath, backupDir, entry };

  const added = await writeServer(base);
  assert.equal(added.status, 'updated');
  assert.equal(added.createdBucket, true, 'mcp 桶不存在，必须由本次写入创建并报出 provenance');
  // w5a：`requiresRootKeys` 从此真的被消费——这份 fixture 没有 `experimental`，写入必须把它补上并回报出来，
  // 否则「卸载回到原字节」在没有 `experimental` 的真实 opencode.json 上永远过不去。
  assert.deepEqual(added.createdRootKeys, ['experimental.mcp_timeout'], '补出来的桶外根键必须逐条回报');
  assert.deepEqual(readServers(base).entries[PROBE], entry);

  // 默认不越权：桶留空壳、根键留着，但残留都是机器可读的，不是悄悄留着。
  const plain = await removeServer(base);
  assert.equal(plain.status, 'removed');
  assert.equal(plain.residue, 'empty-bucket');
  assert.deepEqual(plain.droppedRootKeys, [], '没给 provenance 就不许动别人的键');

  // 调用方（w3 账本）证明桶与根键都是 AIOS 建的 → 一起收，回到原始字节。
  assert.equal((await writeServer(base)).status, 'updated');
  const dropped = await removeServer({
    ...base, dropEmptyBucket: true,
    dropRootKeys: added.createdRootKeys,
    rootKeyValues: { 'experimental.mcp_timeout': OPENCODE_MCP_TIMEOUT_MS },
  });
  assert.equal(dropped.status, 'removed');
  assert.equal(dropped.residue, '');
  assert.deepEqual(dropped.droppedRootKeys, ['experimental.mcp_timeout']);
  assert.equal(fs.readFileSync(filePath, 'utf8'), original, '连桶与根键都收掉后必须逐字节回到原样');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('桶外根键：已存在的值一概不碰，被人改过的值不许回收', async () => {
  // 别人写了 `mcp_timeout: 5000`——AIOS 的默认是 90000，但门是「非托管字节不变」，不是「统一成我的值」。
  const original = '{\n  "experimental": { "mcp_timeout": 5000 },\n  "theme": "system"\n}\n';
  const { dir, filePath, backupDir } = makeFixture({ clientId: 'opencode', scope: 'home', file: 'opencode.json', original });
  const base = { clientId: 'opencode', scope: 'home', serverName: PROBE, filePath, backupDir };
  const added = await writeServer({ ...base, entry: { type: 'local', command: ['node', '/p.js'], enabled: true } });
  assert.equal(added.status, 'updated');
  assert.deepEqual(added.createdRootKeys, [], '键已存在即不算本次创建');
  const after = fs.readFileSync(filePath, 'utf8');
  assert.match(after, /"mcp_timeout": 5000/u, '已存在的根键值必须原样保留');
  // 卸载时值不匹配 → 不回收（它已被采纳）。
  const off = await removeServer({ ...base, dropRootKeys: ['experimental.mcp_timeout'], rootKeyValues: { 'experimental.mcp_timeout': 90000 } });
  assert.equal(off.status, 'removed');
  assert.deepEqual(off.droppedRootKeys, [], '值被人改过的根键不属于 AIOS，不许回收');
  assert.match(fs.readFileSync(filePath, 'utf8'), /"mcp_timeout": 5000/u);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('桶外根键原语：只声明不给默认值即不建（交给写路径判「缺失即拒」），空父壳随叶子一起回收', () => {
  // 这条直接打原语：`requiresRootKeys` 的「没有 createWith」这一支在真实补表里不存在（唯一声明者带默认值），
  // 但它是「不许猜一个值写进别人配置」这条规则的实现处，没有用例就等于没钉住。
  const text = '{\n  "theme": "system"\n}\n';
  const noDefault = ensureRootKeys(text, [{ path: 'a.b', createWith: undefined }]);
  assert.equal(noDefault.text, text, '没有默认值的键一个字节都不许写');
  assert.deepEqual(noDefault.filled, []);
  assert.equal(hasRootKey(noDefault.text, 'a.b'), false);

  // 叶子被回收时，本次建的空父壳一起走；别人留下的兄弟不动。
  const built = ensureRootKeys(text, [{ path: 'a.b', createWith: 1 }]);
  assert.deepEqual(built.filled, ['a.b']);
  assert.equal(hasRootKey(built.text, 'a.b'), true);
  const dropped = dropRootKeys(built.text, ['a.b'], { 'a.b': 1 });
  assert.deepEqual(dropped.dropped, ['a.b']);
  assert.equal(dropped.text, text, '父壳是本次建的，回收后必须逐字节回到原样');

  const sibling = '{\n  "theme": "system",\n  "a": { "b": 1, "other": true }\n}\n';
  const kept = dropRootKeys(sibling, ['a.b'], { 'a.b': 1 });
  assert.deepEqual(kept.dropped, ['a.b']);
  assert.match(kept.text, /"other": true/u, '父对象还有别人的键时，只许删叶子');
  assert.doesNotMatch(kept.text, /"b"\s*:/u, '叶子必须真的消失');
});


test('replaceServer：同名不同形状原地改写，非托管字节逐字节不变（三家族）', async () => {
  const cases = [
    {
      key: 'json', clientId: 'claude', scope: 'home', file: '.claude.json',
      regionStart: '"' + PROBE + '":', regionAfter: '"nested": {',
      entry: { command: 'node', args: ['/probe/server.js'], type: 'stdio', env: { FOO: 'bar' }, cwd: '.' },
      original: `{
  "firstTimeOnboard": true,
  "mcpServers": {
    "theirs": { "command": "npx", "args": ["-y", "@other/server"] },
    "${PROBE}": { "command": "node", "args": ["/stale.js"], "type": "stdio" },
    "nested": {
      "command": "node",
      "args": ["/srv/b.js"]
    }
  }
}
`,
    },
    {
      key: 'toml', clientId: 'codex', scope: 'home', file: 'config.toml',
      regionStart: '[mcp_servers.' + PROBE + ']', regionAfter: '[mcp_servers.theirs]',
      entry: { command: 'node', args: ['/probe/server.js'], type: 'stdio', cwd: '.', startup_timeout_sec: 10 },
      original: `model = "gpt-5"

# 挨着条目的注释，位置一变就错位
[mcp_servers.${PROBE}]
command = "node"
args = ["/stale.js"]
type = "stdio"

[mcp_servers.theirs]
command = "node"
args = ["/srv/theirs.js"]
`,
    },
    {
      key: 'yaml', clientId: 'hermes', scope: 'home', file: 'config.yaml',
      regionStart: PROBE + ':', regionAfter: '  theirs:',
      // hermes 用户级的实测键集里没有 `type`（`HERMES_YAML_FIELDS`），带上它就等于测的是拒绝路径而不是替换路径。
      entry: { command: 'node', args: ['/probe/server.js'], env: { FOO: 'bar' }, cwd: '.' },
      original: `model: hermes-1

mcp_servers:
  # 手工维护的注释必须原样回来
  ${PROBE}:
    command: node
    args:
      - /stale.js
  theirs:
    command: node
    args:
      - /srv/theirs.js
`,
    },
  ];
  for (const c of cases) {
    const { dir, filePath, backupDir } = makeFixture(c);
    const base = { clientId: c.clientId, scope: c.scope, serverName: PROBE, filePath, backupDir };
    const before = fs.readFileSync(filePath, 'utf8');
    // 每家的替换形状按**该家白名单**给：codex 的实测键集没有 `env`（`landing-schema.mjs` 的 CODEX_TOML_FIELDS），
    // 拿 claude 的形状去换 codex 会先撞上 `unknown-field`——那是门在对，不是测试要绕的东西。
    const nextEntry = c.entry;

    // dry-run 不许动盘
    const plan = await replaceServer({ ...base, entry: nextEntry, dryRun: true });
    assert.equal(plan.status, 'planned', `${c.key} dry-run 实得 ${plan.status}/${plan.reason || ''}`);
    assert.equal(fs.readFileSync(filePath, 'utf8'), before, `${c.key} replace 的 dry-run 写了盘`);

    const replaced = await replaceServer({ ...base, entry: nextEntry });
    assert.equal(replaced.status, 'replaced', `${c.key} 实得 ${replaced.status}/${replaced.reason || ''}`);
    assert.ok(fs.existsSync(replaced.backupPath), `${c.key} replace 前必须留原文备份`);
    assert.deepEqual(readServers(base).entries[PROBE], nextEntry, `${c.key} 读回必须与替换进去的逐字段相同`);

    // 位置与别人的字节：条目前面的部分与条目后面的部分都必须与原文逐字节相同，只有条目自身那段变了。
    // 这里不用「整段前缀 + 正则找条目起点」那种写法：TOML 的起点是 `[mcp_servers.x]` 而非 `x:`，
    // 一个通用正则会找不到而返回 -1，slice(0,-1) 就把「前缀没变」测成了「几乎整份没变」——假绿。
    const after = fs.readFileSync(filePath, 'utf8');
    const head = before.slice(0, before.indexOf(c.regionStart));
    const tail = before.slice(before.indexOf(c.regionAfter));
    assert.ok(after.startsWith(head), `${c.key} 条目之前的字节被改了`);
    assert.ok(after.endsWith(tail), `${c.key} 条目之后的字节被改了`);
    assert.ok(after.indexOf(c.regionStart) >= head.length, `${c.key} 条目起点被挪到了前面的字节里`);
    assert.notEqual(after, before, `${c.key} replace 必须真的改了文件`);
    assert.equal(after.indexOf(c.regionAfter), after.length - tail.length, `${c.key} 相邻条目的位置不该动`);

    // 幂等与「不存在即拒」：replace 不是 insert 的另一种写法。
    assert.equal((await replaceServer({ ...base, entry: c.entry })).status, 'unchanged', `${c.key} 同形状再替换应幂等`);
    // 条目名换成不存在的：必须 `not-found`，不许顺手插入。用本落点合法的形状，否则先撞上白名单（那也是对的，只是测不到这条分支）。
    assert.equal((await replaceServer({ ...base, entry: c.entry, serverName: 'no-such-server' })).status, 'not-found', `${c.key} 缺条目即 not-found，不许顺手插入`);
    assert.equal(fs.readFileSync(filePath, 'utf8'), after, `${c.key} not-found 的替换不该动盘`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('createIfMissing 真的被消费：声明不建文件的落点，缺文件即拒且不创建', async () => {
  // 声明表把这一格留空时的默认是 per-scope 的（`definitions.mjs:265`：home false、project true），
  // 以前这格从来没进过写路径，所以「按 Boolean(值)」把它读成 false 也没人疼。现在它管能不能凭空建别人的配置文件。
  const targets = { claude: { format: 'json', namespace: 'mcpServers', scopes: [{ scope: 'home', file: '../.claude.json' }] } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rex-mcp-create-'));
  const filePath = path.join(dir, '.claude.json');
  const refused = await writeServer({
    clientId: 'claude', scope: 'home', serverName: PROBE, entry: STDIO, filePath,
    backupDir: path.join(dir, 'bak'), targets,
  });
  assert.equal(refused.status, 'rejected', `应拒，实得 ${refused.status}`);
  assert.equal(refused.reason, 'landing-file-missing');
  assert.equal(fs.existsSync(filePath), false, '被拒的写入不许把文件建出来');
  assert.equal(fs.existsSync(path.join(dir, 'bak')), false, '被拒的写入不该留备份目录');

  // 同一落点显式声明可建，就真的建出来（默认值不是「一律不建」）。
  const creating = { claude: { format: 'json', namespace: 'mcpServers', scopes: [{ scope: 'home', file: '../.claude.json', createIfMissing: true }] } };
  const made = await writeServer({
    clientId: 'claude', scope: 'home', serverName: PROBE, entry: STDIO, filePath,
    backupDir: path.join(dir, 'bak2'), targets: creating,
  });
  assert.equal(made.status, 'created', `应创建，实得 ${made.status}/${made.reason || ''}`);
  assert.equal(fs.existsSync(filePath), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

// 下面的两条钉住「字段变换插件位」本身：改名表是数据，规则却有三条硬约束——
// 只改名/只换算不丢字段、目标键冲突即拒、没登记的落点原样不动。
// 集成路径目前只有 gemini 一条（`mcp-cli-verbs.test.mjs` 的改名闭环），zcode/codex/grok 在表里是数据，
// 数量少但每一条都会在 w5b 收编时被真写上盘——没有这条表驱动用例，改错一个 scale 也没人发现。
test('字段变换：四家改名表逐条生效，换算只改单位不丢字段，未登记落点原样不动', () => {
  const canonical = { command: 'node', args: ['/probe/server.js'], env: { A: '1' }, startupTimeoutSec: 10 };
  const expected = [
    ['gemini', { command: 'node', args: ['/probe/server.js'], env: { A: '1' }, timeout: 10_000 }, 'x1000'],
    ['zcode', { command: 'node', args: ['/probe/server.js'], env: { A: '1' }, timeoutMs: 10_000 }, 'x1000'],
    ['codex', { command: 'node', args: ['/probe/server.js'], env: { A: '1' }, startup_timeout_sec: 10 }, 'rename'],
    ['grok', { command: 'node', args: ['/probe/server.js'], env: { A: '1' }, startup_timeout_sec: 10 }, 'rename'],
  ];
  for (const [clientId, want, rule] of expected) {
    const shaped = normalizeEntryForLanding(clientId, 'home', canonical);
    assert.equal(shaped.ok, true, `${clientId} 应可变换：${shaped.reason || ''}`);
    assert.deepEqual(shaped.entry, want, `${clientId} 的落地形状不对`);
    assert.deepEqual(shaped.renamed, [{ from: 'startupTimeoutSec', to: Object.keys(want).pop(), rule }], `${clientId} 的改名说明不对`);
    // 说明里不带值：`renamed` 进 CLI 输出，值是条目内容。
    assert.ok(!JSON.stringify(shaped.renamed).includes('10000'), `${clientId} 的改名说明泄漏了换算后的值`);
    // 幂等：拿落地形状再跑一遍不该再改名（表里没有 `timeout` 这样的 from 键）。
    const again = normalizeEntryForLanding(clientId, 'home', shaped.entry);
    assert.deepEqual(again.renamed, [], `${clientId} 二次变换必须无事可做`);
    assert.deepEqual(again.entry, want, `${clientId} 二次变换不许改形状`);
  }
  // 没登记的落点（claude 家族用的就是规范形状）原样返回，不是「删掉不认识的字段」。
  for (const clientId of ['claude', 'qoder', 'workbuddy', 'hermes', 'opencode', 'pi']) {
    assert.deepEqual(landingRenames(clientId, 'home'), [], `${clientId} 不该有改名规则`);
    assert.deepEqual(normalizeEntryForLanding(clientId, 'home', canonical).entry, canonical, `${clientId} 的条目被动了`);
  }
  // 表本身别偷偷变大：新增一条改名就是新增一个会被真写到别人配置里的形状，得是显式决定。
  assert.deepEqual(Object.keys(ENTRY_FIELD_RENAMES).sort(), ['codex', 'gemini', 'grok', 'zcode']);
});

test('字段变换：矛盾输入与非数字时长都拒，不猜哪一边对', () => {
  // 同时给了规范键与落点键且值不一致——猜哪个都是替调用方做决定。
  const conflict = normalizeEntryForLanding('gemini', 'home', { startupTimeoutSec: 10, timeout: 30_000 });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, 'transform-target-conflict');
  assert.equal(conflict.field, 'timeout');
  assert.equal(conflict.conflictFrom, 'startupTimeoutSec');

  const notNumeric = normalizeEntryForLanding('zcode', 'home', { startupTimeoutSec: 'soon' });
  assert.equal(notNumeric.ok, false);
  assert.equal(notNumeric.reason, 'transform-not-numeric');
  assert.equal(notNumeric.field, 'startupTimeoutSec');

  // 值一致不算矛盾（重复表达同一件事），仍按落地形状收口。
  const agree = normalizeEntryForLanding('gemini', 'home', { startupTimeoutSec: 30, timeout: 30_000 });
  assert.equal(agree.ok, true, `一致的同义输入不该被拒：${agree.reason || ''}`);
  assert.equal(agree.entry.timeout, 30_000);
  assert.equal('startupTimeoutSec' in agree.entry, false, '规范键名不许留在落地形状里');
});

const CRG = 'code-review-graph';
test('YAML 落点：桶不存在时从零建桶（空文件这条路径 w2/w5a 的 fixture 都没走过）', () => {
  // 2026-11-05 实测：`setIn(path, {})` 在这个 yaml 版本上会留下一个「读着像 map、写不进子键」的节点，
  // 紧跟子的 `setIn([...path, name])` 抛 `Expected YAML collection`。真实表现是
  // codemap doctor --fix 对**全新**的 hermes config.yaml 注入失败——而 w2 的 hermes fixture 都自带桶。
  const created = insertYamlEntry('', ['mcp_servers'], CRG, { command: 'uvx', args: ['code-review-graph', 'serve'] });
  assert.equal(created.createdBucket, true);
  assert.match(created.text, new RegExp(CRG, 'u'));
});

// ── 先算后写：纯 planner（browser 家族的两段式契约就靠它） ─────────────────────
test('planServerEdits：只算不写，多条目一次算完；写盘由调用方一次性完成', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-plan-'));
  const filePath = path.join(dir, 'config.json');
  // 原文：用户条目 + 一个待迁移的旧别名；4 空格缩进（整份重排会改掉它）。
  const original = '{\n    "theme": "dark",\n    "mcpServers": {\n        "theirs": { "command": "node", "args": ["/t.js"] },\n        "puppeteer-stealth": { "command": "node", "args": ["/old.js"] }\n    }\n}\n';
  fs.writeFileSync(filePath, original, 'utf8');
  const before = fs.statSync(filePath).mtimeMs;

  const planned = planServerEdits({
    filePath,
    shape: { format: 'json', entryPath: 'mcpServers', allowedFields: null, createIfMissing: true },
    edits: [
      { action: 'remove', serverName: 'puppeteer-stealth' },
      { action: 'upsert', serverName: 'aios-shell', entry: { command: 'node', args: ['/shell.js'] } },
      { action: 'upsert', serverName: 'aios-auth-tools', entry: { command: 'python', args: ['/auth.py'] } },
    ],
  });
  assert.equal(planned.status, 'planned');
  // ① 算的时候一个字节都不许落盘（mtime 也不许动），更不许建备份目录。
  assert.equal(fs.readFileSync(filePath, 'utf8'), original, 'plan 阶段写了盘');
  assert.equal(fs.statSync(filePath).mtimeMs, before, 'plan 阶段动了 mtime');
  assert.equal(fs.existsSync(path.join(dir, '.aios-config-backups')), false, 'plan 阶段建了备份目录');

  // ② 结果一次成型：旧别名消失、两条新条目在、别人的缩进还在。
  const parsed = JSON.parse(planned.text);
  assert.equal(parsed.mcpServers['puppeteer-stealth'], undefined, 'remove 编辑没生效');
  assert.deepEqual(parsed.mcpServers['aios-shell'], { command: 'node', args: ['/shell.js'] });
  assert.deepEqual(parsed.mcpServers['aios-auth-tools'], { command: 'python', args: ['/auth.py'] });
  assert.ok(planned.text.includes('\n        "theirs"') || planned.text.includes('"theirs": { "command": "node", "args": ["/t.js"] }'),
    '用户条目的原字节被重排了');
  assert.deepEqual(planned.outcomes.map((o) => `${o.action}:${o.status}`), ['remove:removed', 'upsert:inserted', 'upsert:inserted']);

  // ③ 同一份计划再算一遍是 unchanged（幂等的判据在 planner 里，不在调用方的比较里）。
  const repeated = planServerEdits({
    filePath: path.join(dir, 'other.json'),
    shape: { format: 'json', entryPath: 'mcpServers', allowedFields: null, createIfMissing: true },
    edits: [],
  });
  assert.equal(repeated.status, 'unchanged');

  // ④ 白名单由调用方声明时才生效：未知字段整份拒绝，且仍未写盘。
  const rejected = planServerEdits({
    filePath,
    shape: { format: 'json', entryPath: 'mcpServers', allowedFields: ['command', 'args'], createIfMissing: true },
    edits: [{ action: 'upsert', serverName: 'aios-shell', entry: { command: 'node', weird: true } }],
  });
  assert.equal(rejected.status, 'rejected');
  assert.deepEqual(rejected.unknownFields, ['weird']);
  assert.equal(fs.readFileSync(filePath, 'utf8'), original, '被拒的计划不许写盘');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('JSON 嵌套桶从零创建：`mcp.servers` 在空/无桶文件上可建（w2 一直没走过这条路径）', () => {
  // 实测 bug（2026-11-05）：`reduceRight` 拼出的桶文本没有逐层包花括号，得到非法 JSON
  // `{"mcp": "servers": {}}`，紧接着 findBucketStart 失败 → `failed to create bucket`。
  // browser 的项目级 zcode 落点（文件不存在 + 点路径）正好走这条路。
  for (const [label, text] of [['空文件', '{}\n'], ['无桶文件', '{\n  "theme": "dark"\n}\n']]) {
    const inserted = insertEntry(text, ['mcp', 'servers'], 'aios-shell', { command: 'node', args: ['x'] });
    const parsed = JSON.parse(inserted.text);
    assert.deepEqual(parsed.mcp.servers['aios-shell'], { command: 'node', args: ['x'] }, `${label} 建桶失败`);
    if (text.includes('theme')) assert.equal(parsed.theme, 'dark', `${label} 的既有键被丢了`);
  }
});
