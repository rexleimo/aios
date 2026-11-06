// scripts/tests/clients/mcp-formats/mcp-ledger-ownership.test.mjs — w3-ledger-ownership 验收。
//
// 与 w2 同一条授权：只写 `os.tmpdir()`，账本也指到临时目录，不碰 `~/.aios` 与任何真实客户配置。
// 这里验的是**归属与允许集合**这两道门，字节手术由 `mcp-generic-writer.test.mjs` 负责；
// 但每条拒绝都附「配置一字节未动」的断言——安全门的全部意义就在于拒绝是真的拒绝。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { AUTH_TOOLS_ALIAS, PRIMARY_BROWSER_ALIAS, SHELL_ALIAS } from '../../../lib/tooling/components/browser/constants.mjs';
import { CRG_MCP_ALIAS } from '../../../lib/tooling/components/codemap/constants.mjs';
import { buildAiosPiMcpServers } from '../../../lib/tooling/components/integrations/pi/mcp-adapter.mjs';
import { MCP_ENTRY_CLASSES, assertEntryClassAllowed, classifyServerName } from '../../../lib/clients/mcp/entry-classes.mjs';
import { installServer, uninstallServer, verifyServer } from '../../../lib/clients/mcp/install-policy.mjs';
import {
  canonicalizeMcpEntry,
  classifyMcpOwnership,
  fingerprintMcpEntry,
  readMcpLedger,
  releaseOwnership,
} from '../../../lib/clients/mcp/ledger.mjs';
import { readServers, writeServer } from '../../../lib/clients/mcp/server-writer.mjs';

const PROBE = 'code-review-graph'; // 用真实 AIOS 类别名，user-defined 走另一条断言
const ENTRY = Object.freeze({ command: 'node', args: ['/probe/server.js'], type: 'stdio' });
const CLAUDE_ORIG = '{\n  "mcpServers": {\n    "theirs": { "command": "node", "args": [] }\n  }\n}\n';

function setup({ original = CLAUDE_ORIG, file = '.claude.json', createFile = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rex-mcp-own-'));
  const filePath = path.join(dir, file);
  if (createFile) fs.writeFileSync(filePath, original, 'utf8');
  return { dir, filePath, ledgerDir: path.join(dir, 'ledger'), backupDir: path.join(dir, 'bak') };
}

/** 篡改必须打在 AIOS 自己那条上：改别人的条目不该影响归属判定（下面另一条用例正是要这个）。 */
function tamper(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const next = raw.replace('"type": "stdio"', '"type": "stdio", "cwd": "/tampered"');
  assert.notEqual(next, raw, '篡改脚本没命中 AIOS 的条目');
  fs.writeFileSync(filePath, next, 'utf8');
}

test('装一条即记账：owned，且字节与 w2 直写完全一致（claude 落点无改名，策略层不该动字节）', async () => {
  const fx = setup();
  const twin = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rex-mcp-twin-')), '.claude.json');
  fs.writeFileSync(twin, CLAUDE_ORIG, 'utf8');

  const result = await installServer({ clientId: 'claude', scope: 'home', serverName: PROBE, entry: ENTRY, ...fx });
  assert.equal(result.status, 'installed', `${result.status} / ${result.reason || ''}`);
  assert.equal(result.classification.status, 'owned');
  assert.equal(result.record.origin, 'aios');
  await writeServer({ clientId: 'claude', scope: 'home', serverName: PROBE, entry: ENTRY, filePath: twin, backupDir: path.join(os.tmpdir(), 'unused') });
  assert.equal(fs.readFileSync(fx.filePath, 'utf8'), fs.readFileSync(twin, 'utf8'), '归属层不得改变写入层的字节');

  const verified = await verifyServer({ clientId: 'claude', scope: 'home', serverName: PROBE, filePath: fx.filePath, ledgerDir: fx.ledgerDir });
  assert.equal(verified.classification.status, 'owned');
  fs.rmSync(fx.dir, { recursive: true, force: true });
});

test('gemini 落点：规范形状先改名再记账，账本指纹与磁盘形状同一份（收编不自造 kept-differs）', async () => {
  // 这条是 w5a 字段变换位的存在理由，不是锦上添花：
  // gemini 的白名单只认 `timeout`（`landing-schema.mjs` 的 GEMINI_FIELDS），而 AIOS 的规范条目写 `startupTimeoutSec`。
  // 若先按规范形状记指纹、再按落地形状写盘，条目一装上就永久 `kept-differs`——四家收编后会得到四个幽灵。
  const original = '{\n  "mcpServers": {\n    "theirs": { "command": "node", "args": [], "timeout": 30000 }\n  }\n}\n';
  const fx = setup({ original, file: 'settings.json' });
  const canonical = { command: 'node', args: ['/probe/server.js'], type: 'stdio', startupTimeoutSec: 10 };
  const result = await installServer({ clientId: 'gemini', scope: 'home', serverName: PROBE, entry: canonical, ...fx });
  assert.equal(result.status, 'installed', `${result.status} / ${result.reason || ''}`);
  assert.deepEqual(result.renamed, [{ from: 'startupTimeoutSec', to: 'timeout', rule: 'x1000' }], '改名要回报，且只报键名与换算规则——值不进这一层的输出');
  const onDisk = readServers({ clientId: 'gemini', scope: 'home', filePath: fx.filePath }).entries[PROBE];
  assert.equal(Object.prototype.hasOwnProperty.call(onDisk, 'startupTimeoutSec'), false, '规范名不该留在别人家的文件里');
  assert.equal(onDisk.timeout, 10000, '秒→毫秒依据既有所有者 mcp-gemini.mjs:5，不是这层自己定的');
  assert.equal(result.classification.status, 'owned', '指纹与磁盘形状不同一份即为幽灵 kept-differs/conflict');

  const verified = await verifyServer({ clientId: 'gemini', scope: 'home', serverName: PROBE, filePath: fx.filePath, ledgerDir: fx.ledgerDir, desired: canonical });
  assert.equal(verified.classification.status, 'owned', 'doctor 拿规范形状核验落地形状，不得判成 conflict');

  const again = await installServer({ clientId: 'gemini', scope: 'home', serverName: PROBE, entry: canonical, ...fx });
  assert.equal(again.status, 'unchanged', '幂等：同一条规范形状再装不该重写');
  fs.rmSync(fx.dir, { recursive: true, force: true });
});

test('改名不是丢字段的口子：白名单外的键仍按 unknown-field 拒，一个字节都不动', async () => {
  // 私有写入器的做法是「按白名单过滤掉不认识的键」（`zcode-schema.mjs:33-48`），本层拒绝这种静默：
  // 悄悄丢掉一个键＝交付方以为装上了，客户端那边却没有。
  const fx = setup({ original: '{\n  "mcpServers": {}\n}\n', file: 'settings.json' });
  const result = await installServer({
    clientId: 'gemini', scope: 'home', serverName: PROBE,
    entry: { command: 'node', args: [], startupTimeoutSec: 10, oopsUnknown: true }, ...fx,
  });
  assert.equal(result.status, 'rejected', `应拒，实得 ${result.status}`);
  assert.equal(result.reason, 'unknown-field');
  assert.deepEqual(result.unknownFields, ['oopsUnknown'], '被拒的理由要点名，不能笼统说「形状不合」');
  assert.equal(fs.readFileSync(fx.filePath, 'utf8'), '{\n  "mcpServers": {}\n}\n', '被拒的写入必须一字节未动');
  fs.rmSync(fx.dir, { recursive: true, force: true });
});

test('改名的两种矛盾输入即拒：两个名字同时给、以及非数字的时长', async () => {
  const fx = setup({ original: '{\n  "mcpServers": {}\n}\n', file: 'settings.json' });
  const both = await installServer({
    clientId: 'gemini', scope: 'home', serverName: PROBE,
    entry: { command: 'node', args: [], type: 'stdio', startupTimeoutSec: 10, timeout: 30000 }, ...fx,
  });
  assert.equal(both.status, 'rejected');
  assert.equal(both.reason, 'transform-target-conflict', '两个名字给出不一致的时长，猜哪边都是错的');
  assert.equal(both.conflictFrom, 'startupTimeoutSec');
  assert.equal(both.field, 'timeout');

  const notNumeric = await installServer({
    clientId: 'gemini', scope: 'home', serverName: PROBE,
    entry: { command: 'node', args: [], startupTimeoutSec: 'soon' }, ...fx,
  });
  assert.equal(notNumeric.status, 'rejected');
  assert.equal(notNumeric.reason, 'transform-not-numeric');
  const untouched = fs.readFileSync(fx.filePath, 'utf8');
  assert.equal(untouched, '{\n  "mcpServers": {}\n}\n', '两种拒绝都不许留下半截条目');
  fs.rmSync(fx.dir, { recursive: true, force: true });
});

test('restore 走原地替换：条目留在它原来的位置，别人的相邻条目与注释不搬家', async () => {
  // w5a 之前的 restore 是「先卸再装」，TOML 会把 `[mcp_servers.x]` 整节搬到文件末尾。
  // 内容等价不等于无损：位置也是别人的字节——挨着节写的注释会跟着错位。
  // 顺序有讲究：先让 AIOS 自己装一次（拿到归属），再篡改磁盘那一份，才构成 `kept-differs`；
  // 在 fixture 里预放同名条目测出来的是 external（从未归 AIOS），走不到 restore 这条路。
  const original = `model = "gpt-5"

# 挨着条目写的注释：节一搬家它就错位
[mcp_servers.theirs]
command = "node"
args = ["/srv/theirs.js"]
`;
  const fx = setup({ original, file: 'config.toml' });
  const base = { clientId: 'codex', scope: 'home', serverName: PROBE, entry: { command: 'node', args: ['/probe/server.js'], type: 'stdio' }, ...fx };
  const first = await installServer(base);
  assert.equal(first.status, 'installed', `${first.status} / ${first.reason || ''}`);
  const installed = fs.readFileSync(fx.filePath, 'utf8');
  const probeAt = installed.indexOf('[mcp_servers.' + PROBE + ']');
  assert.ok(probeAt > installed.indexOf('[mcp_servers.theirs]'), 'AIOS 的节由末尾追加而来，本用例测的是它之后别乱动');

  const tamperedRaw = installed.replace('args = ["/probe/server.js"]', 'args = ["/tampered.js"]');
  assert.notEqual(tamperedRaw, installed, '篡改脚本没命中 AIOS 的条目');
  fs.writeFileSync(fx.filePath, tamperedRaw, 'utf8');

  const kept = await installServer(base);
  assert.equal(kept.status, 'kept-differs', `应判 kept-differs，实得 ${kept.status}`);
  const restored = await installServer({ ...base, restore: true });
  assert.equal(restored.status, 'restored', `${restored.status} / ${restored.reason || ''}`);
  const after = fs.readFileSync(fx.filePath, 'utf8');
  assert.equal(after.indexOf('[mcp_servers.' + PROBE + ']'), probeAt, 'restore 是原地替换：节的位置一个字符都不该挪');
  assert.ok(after.includes(`# 挨着条目写的注释：节一搬家它就错位
[mcp_servers.theirs]
command = "node"
args = ["/srv/theirs.js"]`), '别人的节与它前面的注释必须逐字节原样');
  assert.equal(readServers({ clientId: 'codex', scope: 'home', filePath: fx.filePath }).entries[PROBE].args.join(), '/probe/server.js');
  assert.equal((await verifyServer({ clientId: 'codex', scope: 'home', serverName: PROBE, filePath: fx.filePath, ledgerDir: fx.ledgerDir })).classification.status, 'owned');
  fs.rmSync(fx.dir, { recursive: true, force: true });
});

test('用户手改过的条目 = kept-differs：装卸都拒，字节不动；adopt 认下现状后可正常卸，force 是人工覆盖位', async () => {
  const fx = setup();
  const base = { clientId: 'claude', scope: 'home', serverName: PROBE, entry: ENTRY, ...fx };
  await installServer(base);
  tamper(fx.filePath);
  const tampered = fs.readFileSync(fx.filePath, 'utf8');

  const add = await installServer(base);
  assert.equal(add.status, 'kept-differs');
  assert.equal(add.reason, 'entry-changed-after-aios-registration', '理由沿用 headroom 的原文，不换说法');
  assert.equal(add.nextAction, 'adopt');

  const off = await uninstallServer(base);
  assert.equal(off.status, 'kept-differs');
  assert.equal(fs.readFileSync(fx.filePath, 'utf8'), tampered, 'kept-differs 的两道拒绝都不许动盘');

  // adopt = 「认下用户改的这份」：只刷指纹，不改一个字节，之后它就是 owned。
  const reclaimed = await installServer({ ...base, adopt: true });
  assert.equal(reclaimed.status, 'adopted');
  // 接管之后：磁盘那份已经是「AIOS 认领的现状」，但它与 AIOS 想要的形状仍不同 → conflict。
  // 界面必须显示这个 conflict（这才是「接管了但形状过期」的真话），要按 AIOS 形状重装得走 restore。
  assert.equal(reclaimed.classification.status, 'conflict');
  assert.equal(reclaimed.wrote, false);
  assert.equal(fs.readFileSync(fx.filePath, 'utf8'), tampered, '认下现状不改字节');
  const off2 = await uninstallServer(base);
  assert.equal(off2.status, 'uninstalled');
  assert.equal(fs.readFileSync(fx.filePath, 'utf8'), CLAUDE_ORIG, 'adopt 之后卸载仍要逐字节回到原样');

  // 人工覆盖位：不 adopt，直接 force 才允许删改过的条目。
  await installServer(base);
  tamper(fx.filePath);
  const forced = await uninstallServer({ ...base, force: true });
  assert.equal(forced.status, 'uninstalled');
  assert.ok(!fs.readFileSync(fx.filePath, 'utf8').includes(PROBE));
  fs.rmSync(fx.dir, { recursive: true, force: true });
});

test('restore：形状过期时先卸再装，且只动自己那一条', async () => {
  const fx = setup();
  const base = { clientId: 'claude', scope: 'home', serverName: PROBE, ...fx };
  await installServer({ ...base, entry: ENTRY });

  const desired = { command: 'node', args: ['/probe/server.js', '--v2'], type: 'stdio' };
  const plain = await installServer({ ...base, entry: desired });
  assert.equal(plain.status, 'conflict', '账本对得上但 AIOS 想要的形状过期 = conflict，默认不覆盖');
  assert.equal(fs.readFileSync(fx.filePath, 'utf8').includes('--v2'), false, 'conflict 的拒绝必须不落盘');

  const restored = await installServer({ ...base, entry: desired, restore: true });
  assert.equal(restored.status, 'restored');
  assert.equal(restored.classification.status, 'owned');
  const read = readServers({ clientId: 'claude', scope: 'home', filePath: fx.filePath });
  assert.deepEqual(read.entries[PROBE], desired, '恢复后磁盘上就是新形状');

  // 与「直接往原始文件里装新形状」逐字节相同：restore 的两步不能留下别人的排版改动。
  const twin = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rex-mcp-twin2-')), '.claude.json');
  fs.writeFileSync(twin, CLAUDE_ORIG, 'utf8');
  await writeServer({ clientId: 'claude', scope: 'home', serverName: PROBE, entry: desired, filePath: twin, backupDir: path.join(os.tmpdir(), 'unused2') });
  assert.equal(fs.readFileSync(fx.filePath, 'utf8'), fs.readFileSync(twin, 'utf8'));
  fs.rmSync(fx.dir, { recursive: true, force: true });
});

test('别人的条目：不 adopt 就不写不删；adopt 只按磁盘现状记账，不改内容', async () => {
  const fx = setup();
  const foreign = { clientId: 'claude', scope: 'home', serverName: 'theirs', entry: ENTRY, ...fx };

  const add = await installServer(foreign);
  assert.equal(add.status, 'refused-external');
  assert.equal(add.reason, 'not-owned-by-aios');
  assert.equal(add.classification.status, 'external');
  assert.equal(fs.readFileSync(fx.filePath, 'utf8'), CLAUDE_ORIG, 'external 的拒绝必须一字节不动');

  const off = await uninstallServer({ ...foreign, entry: undefined });
  assert.equal(off.status, 'refused-external');
  assert.equal(off.nextAction, 'adopt');
  assert.ok(fs.readFileSync(fx.filePath, 'utf8').includes('"theirs"'), '未接管的条目不能被删');

  const adopted = await installServer({ ...foreign, adopt: true });
  assert.equal(adopted.status, 'adopted');
  assert.equal(adopted.wrote, false, '接管不是覆盖');
  assert.equal(fs.readFileSync(fx.filePath, 'utf8'), CLAUDE_ORIG, '接管一个字都不改');
  assert.equal(adopted.record.origin, 'adopted');
  fs.rmSync(fx.dir, { recursive: true, force: true });
});

test('pi 的允许集合：shell 与 auth 被拒且带策略原文，crg 放行，browser 需运行时已装', async () => {
  const shellEntry = { command: 'node', args: ['/probe/shell.js'], lifecycle: 'lazy' };
  const fx = setup({ file: 'mcp.json', original: '{}\n' });
  const piBase = { clientId: 'pi', scope: 'home', filePath: fx.filePath, ledgerDir: fx.ledgerDir, backupDir: fx.backupDir, entry: shellEntry };

  const shell = await installServer({ ...piBase, serverName: SHELL_ALIAS });
  assert.equal(shell.status, 'rejected');
  assert.equal(shell.reason, 'class-denied:shell');
  assert.match(shell.policy, /a shell MCP tool would bypass the AIOS Pi safety gate/u);
  assert.equal(shell.policyRef, 'scripts/lib/tooling/components/integrations/pi/mcp-adapter.mjs:21-22');
  assert.equal(fs.readFileSync(fx.filePath, 'utf8'), '{}\n', '被允许集合拒掉的条目不落盘');

  const auth = await installServer({ ...piBase, serverName: AUTH_TOOLS_ALIAS });
  assert.equal(auth.reason, 'class-denied:auth');

  const browser = await installServer({ ...piBase, serverName: PRIMARY_BROWSER_ALIAS });
  assert.equal(browser.reason, 'browser-runtime-not-installed');
  const browserOk = await installServer({ ...piBase, serverName: PRIMARY_BROWSER_ALIAS, browserRuntimeInstalled: true });
  assert.equal(browserOk.status, 'installed');

  const crg = await installServer({ ...piBase, serverName: CRG_MCP_ALIAS, entry: { command: 'uvx', args: ['code-review-graph', 'serve'], lifecycle: 'lazy' } });
  assert.equal(crg.status, 'installed');
  // claude 上 shell/auth 不在禁止名单里：允许集合是每客户端的，不是一刀切。
  const onClaude = assertEntryClassAllowed({ clientId: 'claude', serverName: SHELL_ALIAS });
  assert.equal(onClaude.ok, true);
  fs.rmSync(fx.dir, { recursive: true, force: true });
});

test('账本读不到 = 只读面：配置一字节不动，也不建备份', async () => {
  const fx = setup();
  // 让账本文件路径本身是一个目录：readFile 抛 EISDIR，不是「没有账本」而是「账本不可用」。
  fs.mkdirSync(path.join(fx.ledgerDir, 'claude.json'), { recursive: true });
  const result = await installServer({ clientId: 'claude', scope: 'home', serverName: PROBE, entry: ENTRY, ...fx });
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, 'ledger-unavailable');
  assert.match(result.detail, /EISDIR/u);
  assert.equal(fs.readFileSync(fx.filePath, 'utf8'), CLAUDE_ORIG);
  assert.equal(fs.existsSync(fx.backupDir), false);
  fs.rmSync(fx.dir, { recursive: true, force: true });
});

test('账本写不进去就把配置回滚：没有归属记录的改动不留在线上', async () => {
  const failing = async () => { throw new Error('disk full'); };

  const fx = setup();
  const off = await installServer({ clientId: 'claude', scope: 'home', serverName: PROBE, entry: ENTRY, ...fx, writeImpl: failing });
  assert.equal(off.status, 'rejected');
  assert.equal(off.reason, 'ledger-unavailable');
  assert.equal(off.rolledBack, 'restored-from-backup');
  assert.equal(fs.readFileSync(fx.filePath, 'utf8'), CLAUDE_ORIG, '回滚必须逐字节回到改前');

  const fresh = setup({ createFile: false });
  const created = await installServer({ clientId: 'claude', scope: 'home', serverName: PROBE, entry: ENTRY, ...fresh, writeImpl: failing });
  assert.equal(created.rolledBack, 'removed-created-file');
  assert.equal(fs.existsSync(fresh.filePath), false, '本次新建又没记上账的文件必须删掉自己建的那份');
  fs.rmSync(fx.dir, { recursive: true, force: true });
  fs.rmSync(fresh.dir, { recursive: true, force: true });
});

test('dry-run 双面都不写：配置不变、账本目录不建', async () => {
  const fx = setup();
  const plan = await installServer({ clientId: 'claude', scope: 'home', serverName: PROBE, entry: ENTRY, ...fx, dryRun: true });
  assert.equal(plan.status, 'planned');
  assert.equal(fs.readFileSync(fx.filePath, 'utf8'), CLAUDE_ORIG);
  assert.equal(fs.existsSync(fx.ledgerDir), false, 'dry-run 不许创建账本目录');

  await installServer({ clientId: 'claude', scope: 'home', serverName: PROBE, entry: ENTRY, ...fx });
  const offPlan = await uninstallServer({ clientId: 'claude', scope: 'home', serverName: PROBE, ...fx, dryRun: true });
  assert.equal(offPlan.status, 'planned');
  assert.ok(fs.readFileSync(fx.filePath, 'utf8').includes(PROBE), 'dry-run 的卸不能真的卸');
  fs.rmSync(fx.dir, { recursive: true, force: true });
});

test('桶是本次建的：provenance 走账本，卸载后逐字节回到原样', async () => {
  const original = '{\n  "$schema": "https://opencode.invalid/config.json",\n  "theme": "system"\n}\n';
  const fx = setup({ file: 'opencode.json', original });
  const entry = { type: 'local', command: ['node', '/probe/server.js'], enabled: true };
  const result = await installServer({ clientId: 'opencode', scope: 'home', serverName: PROBE, entry, ...fx });
  assert.equal(result.status, 'installed');
  assert.equal(result.createdBucket, true);
  assert.equal(result.record.bucketCreated, true, '桶 provenance 必须落到账本，w4/w6 才读得到');

  const off = await uninstallServer({ clientId: 'opencode', scope: 'home', serverName: PROBE, ...fx });
  assert.equal(off.status, 'uninstalled');
  assert.equal(off.residue, '', '账本说桶是我们建的，就必须连桶收掉');
  assert.equal(fs.readFileSync(fx.filePath, 'utf8'), original, '回到原始字节');
  fs.rmSync(fx.dir, { recursive: true, force: true });
});

test('release 之后条目变回 external：AIOS 不再声称拥有它', async () => {
  const fx = setup();
  await installServer({ clientId: 'claude', scope: 'home', serverName: PROBE, entry: ENTRY, ...fx });
  const released = await releaseOwnership({ clientId: 'claude', scope: 'home', serverName: PROBE }, { ledgerDir: fx.ledgerDir });
  assert.equal(released.released, true);
  const verified = await verifyServer({ clientId: 'claude', scope: 'home', serverName: PROBE, filePath: fx.filePath, ledgerDir: fx.ledgerDir });
  assert.equal(verified.classification.status, 'external');
  const again = await uninstallServer({ clientId: 'claude', scope: 'home', serverName: PROBE, ...fx });
  assert.equal(again.status, 'refused-external', '放掉归属之后就再也删不动了');
  fs.rmSync(fx.dir, { recursive: true, force: true });
});

test('账本坏掉时不静默重写：corrupt 标记 + 条目按 external 处理', async () => {
  const fx = setup();
  await installServer({ clientId: 'claude', scope: 'home', serverName: PROBE, entry: ENTRY, ...fx });
  fs.writeFileSync(path.join(fx.ledgerDir, 'claude.json'), '{ not json', 'utf8');
  const ledger = await readMcpLedger('claude', { ledgerDir: fx.ledgerDir });
  assert.equal(ledger.corrupt.startsWith('unparsable'), true, '坏账本必须报出来');
  const result = await installServer({ clientId: 'claude', scope: 'home', serverName: PROBE, entry: ENTRY, ...fx });
  assert.equal(result.status, 'refused-external', '账本读不出来时，宁可拒绝也不覆盖别人的条目');
  assert.ok(fs.readFileSync(fx.filePath, 'utf8').includes(PROBE), '拒绝即原样');
  fs.rmSync(fx.dir, { recursive: true, force: true });
});

test('指纹口径：键序无关，args 顺序相关，全字段都算', () => {
  const a = { command: 'node', args: ['/x.js', '--flag'], type: 'stdio' };
  const b = { type: 'stdio', args: ['/x.js', '--flag'], command: 'node' };
  assert.equal(fingerprintMcpEntry(a), fingerprintMcpEntry(b));
  assert.notEqual(fingerprintMcpEntry(a), fingerprintMcpEntry({ ...a, args: ['--flag', '/x.js'] }));
  // integrations 的窄指纹（只留 url/type/command/args/env）会漏掉 pi 的 lifecycle 与 gemini 的 timeout：
  // 本层要担保的是「还是不是我写的那一份」，所以这些字段必须进指纹。
  assert.notEqual(fingerprintMcpEntry({ command: 'n', args: [], lifecycle: 'lazy' }), fingerprintMcpEntry({ command: 'n', args: [] }));
  assert.notEqual(fingerprintMcpEntry({ command: 'n', args: [], timeout: 1 }), fingerprintMcpEntry({ command: 'n', args: [], timeout: 2 }));
  assert.deepEqual(canonicalizeMcpEntry({ b: 1, a: { z: [], y: undefined } }), { a: { z: [] }, b: 1 });
});

test('归属四态判定是纯函数，边界各有其名', () => {
  const fp = fingerprintMcpEntry(ENTRY);
  assert.equal(classifyMcpOwnership({ actual: null, ledgerEntry: { fingerprint: fp } }).status, 'absent');
  assert.equal(classifyMcpOwnership({ actual: ENTRY, ledgerEntry: null }).status, 'external');
  assert.equal(classifyMcpOwnership({ actual: ENTRY, ledgerEntry: { fingerprint: 'zz' } }).status, 'kept-differs');
  assert.equal(classifyMcpOwnership({ actual: ENTRY, ledgerEntry: { fingerprint: fp } }).status, 'owned');
  const conflict = classifyMcpOwnership({ actual: ENTRY, desired: { command: 'node', args: ['/other.js'], type: 'stdio' }, ledgerEntry: { fingerprint: fp } });
  assert.equal(conflict.status, 'conflict', '账本对得上但想要的形状不同 = conflict，不是 kept-differs');
});

test('类别表与仓库真实别名常量对齐（别名一漂移这里就红）', () => {
  assert.equal(MCP_ENTRY_CLASSES[PRIMARY_BROWSER_ALIAS], 'browser');
  assert.equal(MCP_ENTRY_CLASSES[AUTH_TOOLS_ALIAS], 'auth');
  assert.equal(MCP_ENTRY_CLASSES[SHELL_ALIAS], 'shell');
  assert.equal(MCP_ENTRY_CLASSES[CRG_MCP_ALIAS], 'crg');
  // pi 实际托管的 server 名单直接取自适配器，不抄清单：适配器加一个名字，这里就要求类别表跟上，
  // 而且每一个都必须过 pi 的允许集合（否则 pi 自己登记的东西会被自己的门拒掉）。
  const managed = Object.keys(buildAiosPiMcpServers({ aiosRoot: 'E:/aios-root', browserRuntime: true, headroomExecutable: 'headroom' }));
  assert.ok(managed.length >= 4, `pi 托管名单应至少 4 个，实得 ${managed.length}`);
  for (const name of managed) {
    assert.ok(MCP_ENTRY_CLASSES[name], `pi 托管的 ${name} 必须在类别表里`);
    assert.equal(assertEntryClassAllowed({ clientId: 'pi', serverName: name, browserRuntimeInstalled: true }).ok, true, `pi 托管的 ${name} 不该被 pi 的允许集合拒掉`);
  }
  assert.equal(classifyServerName('some-user-server'), 'user-defined');
  assert.equal(classifyServerName(''), 'user-defined');
});
