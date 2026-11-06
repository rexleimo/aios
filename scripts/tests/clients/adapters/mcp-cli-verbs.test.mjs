// scripts/tests/clients/adapters/mcp-cli-verbs.test.mjs — w4-cli-verbs 验收。
//
// 授权边界与 w2/w3 一致：只写 `os.tmpdir()`。这里的「假 HOME」是给 `getClientHomes` 用的临时目录，
// 所以 `--home-dir` + 空 env 就能把 18 个落点全部指到沙箱里，真机配置一个字节都不碰。
// 引擎判定（归属、白名单、允许集合、字节手术）已由 mcp-formats 下两份测试逐一钉死；
// 本文件只钉**命令面**：参数怎么变调用、输出投影成什么结构、退出码定在哪、以及值有没有泄漏出去。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseMcpArgs } from '../../../lib/tooling/cli/parse-args/platform/mcp.mjs';
import { MCP_LIST_SCHEMA, runMcpCommand } from '../../../lib/clients/mcp/cli.mjs';

// 哨兵值：合成字符串，只用来证明「值不会从任何输出路径漏出去」，不是真实凭据。
const SECRET = 'env-sentinel-not-a-real-secret';
const CLAUDE_FIXTURE = `{\n  "theme": "dark",\n  "mcpServers": {\n    "theirs": { "command": "node", "args": ["/theirs.js"], "env": { "TOKEN": "${SECRET}" } }\n  }\n}\n`;
const CODEX_FIXTURE = '[mcp_servers.theirs]\ncommand = "node"\nargs = ["/theirs.js"]\ntype = "stdio"\nenabled = true\n';
const PI_FIXTURE = '{\n  "mcpServers": {}\n}\n';
// gemini 的 schema 是严的：越界字段会让整份 settings.json 判废（`definitions.mjs:286-289`），
// 所以这份 fixture 里「别人的条目」本来就写成 gemini 形状，而 AIOS 要装进去的那条会被改名。
const GEMINI_FIXTURE = '{\n  "mcpServers": {\n    "theirs": { "command": "npx", "args": ["-y", "@other/server"], "timeout": 5000 }\n  }\n}\n';

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rex-mcp-cli-'));
  fs.writeFileSync(path.join(dir, '.claude.json'), CLAUDE_FIXTURE, 'utf8');
  fs.mkdirSync(path.join(dir, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.codex', 'config.toml'), CODEX_FIXTURE, 'utf8');
  fs.mkdirSync(path.join(dir, '.pi', 'agent'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.pi', 'agent', 'mcp.json'), PI_FIXTURE, 'utf8');
  fs.mkdirSync(path.join(dir, '.gemini'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.gemini', 'settings.json'), GEMINI_FIXTURE, 'utf8');
  return { homeDir: dir, ledgerDir: path.join(dir, 'ledger'), backupDir: path.join(dir, 'bak') };
}

function sink() {
  const out = { text: '', write(value) { this.text += String(value); return true; } };
  return out;
}

async function run(fx, options) {
  const stdout = sink();
  const result = await runMcpCommand(options, { stdout, env: {}, homeDir: fx.homeDir, projectRoot: fx.homeDir });
  return { result, out: stdout.text };
}

const ENTRY = { command: 'node', args: ['/probe/server.js'], type: 'stdio', startupTimeoutSec: 12 };

function parse(argv) {
  return parseMcpArgs(['mcp', ...argv]);
}

test('动词名单两处对齐：解析层认识的动词 = 引擎会执行的动词', async () => {
  const { MCP_VERBS } = await import('../../../lib/tooling/cli/parse-args/platform/mcp.mjs');
  const { MCP_READ_VERBS, MCP_WRITE_VERBS } = await import('../../../lib/clients/mcp/cli.mjs');
  assert.deepEqual([...MCP_VERBS].sort(), [...MCP_READ_VERBS, ...MCP_WRITE_VERBS].sort(), '解析层放行、引擎层不认 = 命令面说谎');
  assert.deepEqual([...MCP_READ_VERBS, ...MCP_WRITE_VERBS].sort(), ['add', 'adopt', 'disable', 'doctor', 'enable', 'list', 'remove']);
  // 引擎层对不认识的动词要说「要哪个动词」，不能报成「落点找不到」这种误导话。
  const fx = sandbox();
  await assert.rejects(() => run(fx, { subcommand: 'wat', client: 'claude', json: true }), /requires subcommand/u);
  fs.rmSync(fx.homeDir, { recursive: true, force: true });
});

test('参数层是严的：未知旗标/缺 client/越界 scope 都抛用法错误，不降级成 help', () => {
  assert.throws(() => parse(['--definitely-not-a-real-flag']), (error) => error.usage === true, '裸未知旗标必须是用法错误');
  assert.throws(() => parse(['list', '--definitely-not-a-real-flag']), (error) => error.usage === true);
  assert.throws(() => parse(['bogus-verb']), /unknown mcp verb/u);
  assert.throws(() => parse(['add', 'probe', '--command', 'node']), /needs --client/u, '写动词不许猜 client');
  assert.throws(() => parse(['add', 'probe', '--client', 'claude', '--scope', 'all', '--command', 'node']), /not all/u);
  assert.throws(() => parse(['add', 'probe', '--client', 'claude']), /needs --entry <json> or at least --command/u);
  assert.throws(() => parse(['add', 'probe', '--client', 'claude', '--entry', '{oops']), /valid JSON/u);
  assert.throws(() => parse(['add', 'probe', '--client', 'claude', '--command', 'node', '--env', 'NOEQUALS']), /KEY=VALUE/u);
  assert.throws(() => parse(['remove', '--client', 'claude']), /requires a server name/u);
  // 读面的 `--file` 必须配一个确定的落点，否则「读的是哪个文件」这句话不成立。
  assert.throws(() => parse(['list', '--file', '/tmp/x.json']), /needs a single landing/u);
  assert.equal(parse(['list', '--client', 'claude', '--scope', 'home', '--file', '/tmp/x.json']).options.file, '/tmp/x.json');
  assert.throws(() => parse(['list', '--backup-dir', '/tmp/bak']), /unknown option/u, 'backup-dir 只对写动词存在');
  assert.equal(parse(['add', 'x', '--client', 'claude', '--command', 'node', '--backup-dir', '/tmp/bak']).options.backupDir, '/tmp/bak');

  // help 展示不是错误：退 0 由 mode:'help' 表达；真动词才是 command。
  assert.equal(parse([]).mode, 'help', '裸 aios mcp 是帮助展示');
  assert.equal(parse(['--help']).mode, 'help');
  assert.equal(parse(['list', '--help']).mode, 'help');
  assert.equal(parse(['list']).mode, 'command');
});

test('参数层把条目碎片拼成一个 entry 对象，引擎只接收一份真相', () => {
  const parsed = parse([
    'add', 'code-review-graph', '--client', 'claude', '--command', 'node',
    '--arg', '/srv/a.js', '--arg', '--flag', '--type', 'stdio',
    '--env', `TOKEN=${SECRET}`, '--cwd', '/work', '--startup-timeout-sec', '30', '--json',
  ]);
  assert.equal(parsed.mode, 'command');
  assert.deepEqual(parsed.options.entry, {
    command: 'node', args: ['/srv/a.js', '--flag'], type: 'stdio',
    env: { TOKEN: SECRET }, cwd: '/work', startupTimeoutSec: 30,
  });
  assert.equal(parsed.options.json, true);
  assert.equal(parsed.options.scope, 'home', '写动词的默认 scope 是 home，不是 all');

  const whole = parse(['add', 'x', '--client', 'codex', '--entry', '{"command":"n","args":[],"enabled":false}']);
  assert.deepEqual(whole.options.entry, { command: 'n', args: [], enabled: false }, '--entry 整体覆盖碎片旗标');
  assert.throws(() => parse(['enable', 'x', '--client', 'codex', '--entry', '{}']), /does not take entry flags/u);
});

test('list 投影落点结构：文件、桶、字段名、归属，且值一律不出门', async () => {
  const fx = sandbox();
  const { result, out } = await run(fx, { subcommand: 'list', client: 'all', scope: 'all', json: true, ledgerDir: fx.ledgerDir });
  assert.equal(result.schema, MCP_LIST_SCHEMA);
  assert.equal(result.exitCode, 0);
  assert.equal(result.counts.landings, result.landings.length);
  assert.ok(result.landings.length >= 17, `18 个落点应全部出现，实得 ${result.landings.length}`);
  assert.ok(result.drift.length >= 1, 'pi 未在声明表登记，drift 必须报出来');

  const claude = result.landings.find((item) => item.clientId === 'claude' && item.scope === 'home');
  assert.equal(claude.file, path.join(fx.homeDir, '.claude.json'));
  assert.equal(claude.entryPath, 'mcpServers');
  assert.equal(claude.status, 'ok');
  assert.equal(claude.servers.length, 1);
  assert.equal(claude.servers[0].name, 'theirs');
  assert.equal(claude.servers[0].ownership, 'external', '没有账本时全机条目都是别人的');
  assert.deepEqual(claude.servers[0].fields, ['args', 'command', 'env'], '字段名要照磁盘原样列出来');
  assert.deepEqual(claude.servers[0].envKeys, ['TOKEN'], '只给键名');
  assert.match(claude.servers[0].fingerprint, /^[0-9a-f]{64}$/u);

  const codex = result.landings.find((item) => item.clientId === 'codex' && item.scope === 'home');
  assert.equal(codex.format, 'toml');
  assert.deepEqual(codex.servers[0].fields, ['args', 'command', 'enabled', 'type']);

  // 隐私是结构性的：任何一条输出路径都不许出现值。
  assert.ok(!out.includes(SECRET), 'stdout 泄漏了 env 值');
  assert.ok(!JSON.stringify(result).includes('/theirs.js'), 'stdout 泄漏了 args 值');
  assert.ok(!JSON.stringify(result).includes('dark'), 'stdout 泄漏了落点文件里其它键的值');

  const narrowed = await run(fx, { subcommand: 'list', client: 'claude', scope: 'project', json: true, ledgerDir: fx.ledgerDir });
  assert.equal(narrowed.result.counts.landings, 1, '--client/--scope 必须能收到一个落点');
  assert.equal(narrowed.result.landings[0].scope, 'project');
  fs.rmSync(fx.homeDir, { recursive: true, force: true });
});

test('--dry-run 双面都不碰盘：配置字节与 mtime 不变，账本目录不建，退出码 0', async () => {
  const fx = sandbox();
  const file = path.join(fx.homeDir, '.claude.json');
  const before = fs.statSync(file);

  const { result } = await run(fx, { subcommand: 'add', client: 'claude', scope: 'home', name: 'probe', entry: ENTRY, dryRun: true, json: true, ledgerDir: fx.ledgerDir, backupDir: fx.backupDir });
  assert.equal(result.status, 'planned');
  assert.equal(result.exitCode, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), CLAUDE_FIXTURE);
  assert.equal(fs.statSync(file).mtimeMs, before.mtimeMs, 'dry-run 之后 mtime 必须没动过');
  assert.equal(fs.existsSync(fx.ledgerDir), false, 'dry-run 不许建账本目录');
  assert.equal(fs.existsSync(fx.backupDir), false, 'dry-run 不许建备份目录');

  // 卸的 dry-run 打在 AIOS 自己拥有的条目上：别人的条目在 dry-run 之前就被归属门拒了（另一条用例钉那个）。
  await run(fx, { subcommand: 'add', client: 'claude', scope: 'home', name: 'probe', entry: ENTRY, json: true, ledgerDir: fx.ledgerDir, backupDir: fx.backupDir });
  const installed = fs.readFileSync(file, 'utf8');
  const off = await run(fx, { subcommand: 'remove', client: 'claude', scope: 'home', name: 'probe', dryRun: true, json: true, ledgerDir: fx.ledgerDir });
  assert.equal(off.result.status, 'planned');
  assert.equal(fs.readFileSync(file, 'utf8'), installed, 'dry-run 的卸不能真的卸');
  fs.rmSync(fx.homeDir, { recursive: true, force: true });
});

test('装卸走通完整闭环：installed → list 显示 owned → 卸掉后逐字节回到原样', async () => {
  const fx = sandbox();
  const file = path.join(fx.homeDir, '.claude.json');

  const add = await run(fx, { subcommand: 'add', client: 'claude', scope: 'home', name: 'probe', entry: ENTRY, json: true, ledgerDir: fx.ledgerDir, backupDir: fx.backupDir });
  assert.equal(add.result.status, 'installed', `${add.result.status} / ${add.result.reason || ''}`);
  assert.equal(add.result.exitCode, 0);
  assert.equal(add.result.landing.file, file);
  assert.ok(fs.existsSync(add.result.backupPath), '真实写入必须留原文备份');
  assert.ok(fs.readFileSync(file, 'utf8').includes('probe'));
  assert.ok(!add.out.includes('/probe/server.js'), '动作输出也不回显条目值');

  const listed = await run(fx, { subcommand: 'list', client: 'claude', scope: 'home', json: true, ledgerDir: fx.ledgerDir });
  const probe = listed.result.landings[0].servers.find((item) => item.name === 'probe');
  assert.equal(probe.ownership, 'owned');
  assert.equal(listed.result.counts.owned, 1);

  const again = await run(fx, { subcommand: 'add', client: 'claude', scope: 'home', name: 'probe', entry: ENTRY, json: true, ledgerDir: fx.ledgerDir, backupDir: fx.backupDir });
  assert.equal(again.result.status, 'unchanged', '重复安装必须是幂等判定，不是二次写入');

  const off = await run(fx, { subcommand: 'remove', client: 'claude', scope: 'home', name: 'probe', json: true, ledgerDir: fx.ledgerDir, backupDir: fx.backupDir });
  assert.equal(off.result.status, 'uninstalled');
  assert.equal(fs.readFileSync(file, 'utf8'), CLAUDE_FIXTURE, '卸掉自己装的之后，其余字节必须逐字节回到原样');
  fs.rmSync(fx.homeDir, { recursive: true, force: true });
});

test('改名落点（gemini）：命令面说得出「你给的字段在这里叫什么」，且换算后的值不出门', async () => {
  const fx = sandbox();
  const file = path.join(fx.homeDir, '.gemini', 'settings.json');
  const entry = { command: 'node', args: ['/probe/server.js'], type: 'stdio', startupTimeoutSec: 10 };
  const base = { subcommand: 'add', client: 'gemini', scope: 'home', name: 'probe', entry, ledgerDir: fx.ledgerDir, backupDir: fx.backupDir };

  // 预览就得说改名：dry-run 一句不提、真跑才冒出来，等于界面在第一屏撒谎。
  const preview = await run(fx, { ...base, dryRun: true });
  assert.equal(preview.result.status, 'planned', `${preview.result.status} / ${preview.result.reason || ''}`);
  assert.match(preview.out, /renamed: startupTimeoutSec->timeout/u, '人话输出必须报出改名');
  assert.equal(fs.readFileSync(file, 'utf8'), GEMINI_FIXTURE, 'dry-run 不许落盘');

  const human = await run(fx, base);
  assert.equal(human.result.status, 'installed', `${human.result.status} / ${human.result.reason || ''}`);
  // `rule` 而不是换算结果：这一层的输出纪律是从不打印条目内容，10000 也是内容。
  assert.deepEqual(human.result.renamed, [{ from: 'startupTimeoutSec', to: 'timeout', rule: 'x1000' }]);
  assert.match(human.out, /renamed: startupTimeoutSec->timeout/u);

  // 磁盘上是落地形状，不是提交形状；别人那条一字节不动。
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /"timeout": 10000/u, '改名 + 换算必须真的落到盘上');
  assert.doesNotMatch(text, /startupTimeoutSec/u, '规范键名不该漏进 gemini 的严格 schema（漏了整份配置判废）');
  assert.match(text, /@other\/server/u);

  // 隐私：换算后的值与 args 值都不许出现在任何一条输出路径上。
  assert.ok(!human.out.includes('10000'), '人话输出泄漏了换算后的值');
  assert.ok(!human.out.includes('/probe/server.js'), '人话输出泄漏了 args 值');
  assert.ok(!JSON.stringify(human.result).includes('10000'), '--json 输出泄漏了换算后的值');
  assert.ok(!JSON.stringify(human.result).includes('/probe/server.js'), '--json 输出泄漏了 args 值');

  // 指纹按落地形状记：重复安装必须是 unchanged。若按规范形状记，收编后的每条 gemini 条目都会永久 kept-differs。
  const again = await run(fx, { ...base, json: true });
  assert.equal(again.result.status, 'unchanged', `改过名的条目应按落地形状幂等，实得 ${again.result.status}/${again.result.reason || ''}`);
  assert.equal(fs.readFileSync(file, 'utf8'), text, 'unchanged 不该动文件');

  const listed = await run(fx, { subcommand: 'list', client: 'gemini', scope: 'home', json: true, ledgerDir: fx.ledgerDir });
  const probe = listed.result.landings[0].servers.find((item) => item.name === 'probe');
  assert.equal(probe.ownership, 'owned');
  assert.deepEqual(probe.fields, ['args', 'command', 'timeout', 'type'], '字段名要照磁盘原样列出来，界面不许显示提交名');

  const off = await run(fx, { subcommand: 'remove', client: 'gemini', scope: 'home', name: 'probe', json: true, ledgerDir: fx.ledgerDir, backupDir: fx.backupDir });
  assert.equal(off.result.status, 'uninstalled');
  assert.equal(fs.readFileSync(file, 'utf8'), GEMINI_FIXTURE, '改名不该让「卸掉自己装的之后非托管字节不变」这条门失效');
  fs.rmSync(fx.homeDir, { recursive: true, force: true });
});

test('别人的条目：不加 --adopt 就删不动；adopt 只认现状不改字节；--force 是人工覆盖位', async () => {
  const fx = sandbox();
  const file = path.join(fx.homeDir, '.claude.json');
  const base = { client: 'claude', scope: 'home', name: 'theirs', json: true, ledgerDir: fx.ledgerDir, backupDir: fx.backupDir };

  const off = await run(fx, { ...base, subcommand: 'remove' });
  assert.equal(off.result.status, 'refused-external');
  assert.equal(off.result.exitCode, 1, '拒绝必须退非 0，界面才知道这次没做成');
  assert.equal(off.result.nextAction, 'adopt');
  assert.equal(fs.readFileSync(file, 'utf8'), CLAUDE_FIXTURE);

  const adopted = await run(fx, { ...base, subcommand: 'adopt' });
  assert.equal(adopted.result.status, 'adopted');
  assert.equal(adopted.result.exitCode, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), CLAUDE_FIXTURE, '接管不改一个字节');

  const listed = await run(fx, { ...base, subcommand: 'list', client: 'claude', scope: 'home', name: undefined });
  assert.equal(listed.result.landings[0].servers[0].origin, 'adopted');

  const afterAdopt = await run(fx, { ...base, subcommand: 'remove' });
  assert.equal(afterAdopt.result.status, 'uninstalled');
  // 桶是别人先建的（账本没记 bucketCreated），删完只能留下空桶，不许把键收掉。
  assert.equal(fs.readFileSync(file, 'utf8'), '{\n  "theme": "dark",\n  "mcpServers": {}\n}\n');

  // force 不能替代接管：别人的条目没 adopt 之前，加了 force 也删不动（用户的原话是「别人要显式接管」）。
  fs.writeFileSync(file, CLAUDE_FIXTURE, 'utf8');
  const forcedForeign = await run(fx, { ...base, subcommand: 'remove', force: true });
  assert.equal(forcedForeign.result.status, 'refused-external');
  assert.equal(forcedForeign.result.exitCode, 1);
  assert.ok(fs.readFileSync(file, 'utf8').includes('theirs'), '未接管的条目不能被 force 删掉');
  fs.rmSync(fx.homeDir, { recursive: true, force: true });
});

test('--force 是「AIOS 登记过但被人改过」的人工覆盖位，不是绕过接管的口子', async () => {
  const fx = sandbox();
  const file = path.join(fx.homeDir, '.claude.json');
  const base = { client: 'claude', scope: 'home', name: 'probe', json: true, ledgerDir: fx.ledgerDir, backupDir: fx.backupDir };

  await run(fx, { ...base, subcommand: 'add', entry: ENTRY });
  // 模拟用户手改：给 AIOS 那条加一个 cwd，指纹就对不上了。
  const raw = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, raw.replace('"type": "stdio"', '"type": "stdio", "cwd": "/tampered"'), 'utf8');
  const tampered = fs.readFileSync(file, 'utf8');

  const plain = await run(fx, { ...base, subcommand: 'remove' });
  assert.equal(plain.result.status, 'kept-differs');
  assert.equal(plain.result.reason, 'entry-changed-after-aios-registration');
  assert.equal(fs.readFileSync(file, 'utf8'), tampered, '默认不删手改过的条目');

  const forced = await run(fx, { ...base, subcommand: 'remove', force: true });
  assert.equal(forced.result.status, 'uninstalled', 'force 是拿到人工决定之后的覆盖位');
  assert.ok(!fs.readFileSync(file, 'utf8').includes('probe'));
  fs.rmSync(fx.homeDir, { recursive: true, force: true });
});

test('enable/disable 只在落点真有 enabled 字段时生效；claude 家族没有，就如实拒绝', async () => {
  const fx = sandbox();
  const codexFile = path.join(fx.homeDir, '.codex', 'config.toml');
  const entry = { command: 'node', args: ['/probe/server.js'], type: 'stdio', enabled: true };

  const added = await run(fx, { subcommand: 'add', client: 'codex', scope: 'home', name: 'probe', entry, json: true, ledgerDir: fx.ledgerDir, backupDir: fx.backupDir });
  assert.equal(added.result.status, 'installed', `${added.result.status} / ${added.result.reason || ''}`);

  const off = await run(fx, { subcommand: 'disable', client: 'codex', scope: 'home', name: 'probe', json: true, ledgerDir: fx.ledgerDir, backupDir: fx.backupDir });
  assert.equal(off.result.status, 'restored', '改自己拥有的条目形状 = restore 路径');
  assert.match(fs.readFileSync(codexFile, 'utf8'), /enabled = false/u);

  const same = await run(fx, { subcommand: 'disable', client: 'codex', scope: 'home', name: 'probe', json: true, ledgerDir: fx.ledgerDir });
  assert.equal(same.result.status, 'unchanged');

  const on = await run(fx, { subcommand: 'enable', client: 'codex', scope: 'home', name: 'probe', json: true, ledgerDir: fx.ledgerDir, backupDir: fx.backupDir });
  assert.equal(on.result.status, 'restored');
  assert.match(fs.readFileSync(codexFile, 'utf8'), /enabled = true/u);

  const missing = await run(fx, { subcommand: 'disable', client: 'claude', scope: 'home', name: 'theirs', json: true, ledgerDir: fx.ledgerDir });
  assert.equal(missing.result.status, 'rejected');
  assert.equal(missing.result.reason, 'field-not-supported-by-landing');
  assert.equal(missing.result.exitCode, 1);
  assert.ok(missing.out.includes('不在此伪造'), '拒绝理由要说清去哪做，不含糊');
  assert.equal(fs.readFileSync(path.join(fx.homeDir, '.claude.json'), 'utf8'), CLAUDE_FIXTURE);
  fs.rmSync(fx.homeDir, { recursive: true, force: true });
});

test('pi 的允许集合在 CLI 上同样生效：shell/auth 被拒并附策略原文，配置不动', async () => {
  const fx = sandbox();
  const file = path.join(fx.homeDir, '.pi', 'agent', 'mcp.json');
  const base = { client: 'pi', scope: 'home', json: true, ledgerDir: fx.ledgerDir, backupDir: fx.backupDir, entry: { command: 'node', args: ['/x.js'], lifecycle: 'lazy' } };

  const shell = await run(fx, { ...base, subcommand: 'add', name: 'aios-shell' });
  assert.equal(shell.result.status, 'rejected');
  assert.equal(shell.result.reason, 'class-denied:shell');
  assert.match(shell.result.policy, /bypass the AIOS Pi safety gate/u);
  assert.equal(shell.result.policyRef, 'scripts/lib/tooling/components/integrations/pi/mcp-adapter.mjs:21-22');
  assert.equal(shell.result.exitCode, 1);
  assert.equal(fs.readFileSync(file, 'utf8'), PI_FIXTURE);

  const auth = await run(fx, { ...base, subcommand: 'add', name: 'aios-auth-tools' });
  assert.equal(auth.result.reason, 'class-denied:auth');

  const browser = await run(fx, { ...base, subcommand: 'add', name: 'mcp-browser-use' });
  assert.equal(browser.result.reason, 'browser-runtime-not-installed');
  const browserIn = await run(fx, { ...base, subcommand: 'add', name: 'mcp-browser-use', browserRuntime: true });
  assert.equal(browserIn.result.status, 'installed');

  // pi 的项目级落点今天不可写（只由 Pi 适配器自己读），CLI 不许假装能写。
  const project = await run(fx, { subcommand: 'add', client: 'pi', scope: 'project', name: 'probe', entry: { command: 'node', args: ['/x.js'] }, json: true, ledgerDir: fx.ledgerDir, projectRoot: fx.homeDir });
  assert.equal(project.result.status, 'rejected');
  assert.equal(project.result.reason, 'landing-not-writable');
  fs.rmSync(fx.homeDir, { recursive: true, force: true });
});

test('doctor 汇总只读事实：账本坏掉与落点报错都反映到退出码', async () => {
  const fx = sandbox();
  const clean = await run(fx, { subcommand: 'doctor', client: 'claude', scope: 'home', json: true, ledgerDir: fx.ledgerDir });
  assert.equal(clean.result.command, 'doctor');
  assert.equal(clean.result.exitCode, 0, `${JSON.stringify(clean.result.ledger)} / errors=${clean.result.counts.errors}`);
  assert.equal(clean.result.ledger[0].clientId, 'claude');
  assert.equal(clean.result.ledger[0].path, path.join(fx.ledgerDir, 'claude.json'), '账本位置要说成真路径，不是占位符');
  assert.equal(clean.result.ledger[0].missing, true, '沙箱里还没有账本是事实，不是错误');

  fs.mkdirSync(fx.ledgerDir, { recursive: true });
  fs.writeFileSync(path.join(fx.ledgerDir, 'claude.json'), '{ broken', 'utf8');
  const broken = await run(fx, { subcommand: 'doctor', client: 'claude', scope: 'home', json: true, ledgerDir: fx.ledgerDir });
  assert.equal(broken.result.exitCode, 1);
  assert.match(broken.result.ledger[0].corrupt, /unparsable/u);
  assert.match(broken.result.landings[0].ledgerCorrupt, /unparsable/u);
  fs.rmSync(fx.homeDir, { recursive: true, force: true });
});

test('未知落点与越界 scope 报机器可读错误，不是崩栈', async () => {
  const fx = sandbox();
  await assert.rejects(() => run(fx, { subcommand: 'list', client: 'not-a-client', scope: 'all', json: true, ledgerDir: fx.ledgerDir }), /unknown MCP client/u);
  await assert.rejects(() => run(fx, { subcommand: 'add', client: 'claude', scope: 'global', name: 'x', entry: ENTRY, json: true, ledgerDir: fx.ledgerDir }), /unknown MCP landing/u);
  await assert.rejects(() => run(fx, { subcommand: 'wat', client: 'claude', json: true }), /requires subcommand/u);
  fs.rmSync(fx.homeDir, { recursive: true, force: true });
});

test('--file 覆盖位：自检可以把落点指到任意 fixture，判定仍由补表决定', async () => {
  const fx = sandbox();
  const target = path.join(fx.homeDir, 'elsewhere.json');
  fs.writeFileSync(target, '{\n  "mcpServers": {}\n}\n', 'utf8');
  const add = await run(fx, { subcommand: 'add', client: 'claude', scope: 'home', name: 'probe', entry: ENTRY, file: target, json: true, ledgerDir: fx.ledgerDir, backupDir: fx.backupDir });
  assert.equal(add.result.status, 'installed');
  assert.equal(add.result.landing.file, target);
  assert.equal(fs.readFileSync(path.join(fx.homeDir, '.claude.json'), 'utf8'), CLAUDE_FIXTURE, '覆盖位生效时真 HOME 不许被动');
  assert.ok(fs.readFileSync(target, 'utf8').includes('probe'));

  // 读面共用同一个覆盖位：装进去之后 list 必须能在同一份文件里看到 owned。
  const listed = await run(fx, { subcommand: 'list', client: 'claude', scope: 'home', file: target, json: true, ledgerDir: fx.ledgerDir });
  assert.equal(listed.result.landings[0].file, target);
  assert.equal(listed.result.landings[0].servers[0].ownership, 'owned');
  assert.equal(listed.result.counts.owned, 1);
  fs.rmSync(fx.homeDir, { recursive: true, force: true });
});
