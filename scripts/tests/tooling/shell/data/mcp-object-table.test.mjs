// MCP 对象表的数据层与入口契约（w6）。
//
// 这一份只测两件客观事实：
//   ① 数据层：状态 token 的判定、行/数字的展平、动作 argv 的白名单构造（非法输入必须被拒，
//      而不是被「清理」成一个看起来能用的命令）；
//   ② 入口契约：导航 registry 与 `[section]` 路由的 PAGES 必须一一对应（`/usage` 幽灵就是这条失守的产物），
//      页面里的站内链接必须指向真实存在的 section。
// 判据全部来自源码文本与纯函数，不需要起 Next 服务，也不需要 TS 运行时。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  MCP_ACTIONS,
  MCP_SCOPES,
  buildMcpArgv,
  deriveLandingStatus,
  flattenMcpServers,
  summarizeMcp,
} from '../../../../../apps/shell/ui/src/lib/data/mcp.mjs';

import { CONSOLE_VIEWS, LEGACY_ROUTES, legacyDestination, viewForPath } from '../../../../../apps/shell/ui/src/lib/console-navigation.ts';

const ui = (file) => new URL(`../../../../../apps/shell/ui/${file}`, import.meta.url);

const LANDINGS = [
  {
    clientId: 'claude',
    scope: 'home',
    file: '/home/u/.claude.json',
    format: 'json',
    entryPath: 'mcpServers',
    writable: true,
    registered: true,
    unverifiedFields: [],
    status: 'ok',
    ledgerCorrupt: '',
    servers: [
      { name: 'aios-shell', ownership: 'owned', fields: ['command', 'args', 'type'], envKeys: ['AIOS_MCP_PROXY'], fingerprint: 'abc123def456', lastVerifiedAt: '2026-11-05T00:00:00.000Z', bucketCreated: false },
      { name: 'theirs', ownership: 'external', fields: ['command'], envKeys: [], fingerprint: 'ffffeeee', lastVerifiedAt: null, bucketCreated: false },
    ],
  },
  {
    clientId: 'hermes',
    scope: 'home',
    file: '/home/u/.hermes/config.yaml',
    format: 'yaml',
    entryPath: 'mcp_servers',
    writable: true,
    registered: true,
    unverifiedFields: ['enabled', 'tools'],
    status: 'ok',
    ledgerCorrupt: '',
    servers: [{ name: 'headroom', ownership: 'conflict', fields: ['command', 'args'], envKeys: [], fingerprint: 'deadbeef', lastVerifiedAt: null, bucketCreated: true }],
  },
  {
    clientId: 'opencode',
    scope: 'home',
    file: '/home/u/.config/opencode/opencode.json',
    format: 'opencode-json',
    entryPath: 'mcp',
    writable: true,
    registered: true,
    unverifiedFields: [],
    status: 'error',
    reason: 'Unexpected token }',
    ledgerCorrupt: '',
    servers: [],
  },
];

const PAYLOAD = { schema: 'mcp.list.v1', command: 'list', landings: LANDINGS, counts: { drift: [{ clientId: 'pi', scope: 'home', kind: 'unregistered-in-declaration-table' }] } };

test('状态 token 只看客观事实：读失败 > 证据卡 > 声明漂移 > 无证据', () => {
  const evidence = new Map([['claude-home', { status: 'verified', reason: '' }]]);
  assert.equal(deriveLandingStatus({ status: 'error', reason: 'boom', registered: true }, { evidence }).token, 'landing-error');
  // 没有证据卡时，「声明表里没有这个落点」才用作解释（pi 的用户级就是这种）。
  assert.equal(deriveLandingStatus({ status: 'ok', registered: false, clientId: 'pi', scope: 'home' }, { evidence }).token, 'landing-unregistered');
  // 有证据卡时它优先：pi 用户级证据卡 verified → 就是 verified，不该被「声明表没登记」压成 unregistered。
  assert.equal(deriveLandingStatus({ status: 'ok', registered: false, clientId: 'claude', scope: 'home' }, { evidence }).token, 'landing-verified');
  assert.equal(deriveLandingStatus({ status: 'ok', registered: true, clientId: 'claude', scope: 'home' }, { evidence }).token, 'landing-verified');
  // 没有证据卡 = 未验证；原因照抄落点表里的 unverified 字段，不编。
  const unverified = deriveLandingStatus({ status: 'ok', registered: true, clientId: 'hermes', scope: 'home', unverifiedFields: ['enabled', 'tools'] }, { evidence });
  assert.equal(unverified.token, 'landing-unverified');
  assert.match(unverified.reason, /enabled, tools/u);
  const bare = deriveLandingStatus({ status: 'ok', registered: true, clientId: 'nobody', scope: 'home' }, { evidence });
  assert.equal(bare.reason, 'no client evidence recorded yet');
  // 存在卡 ≠ 通过：`host-unsupported` 的卡必须仍然显示成未验证，并把卡的 reason 原文带出来。
  const hostCard = new Map([['qoder-home', { status: 'host-unsupported', reason: 'client binary not on PATH: qoder' }]]);
  const hosted = deriveLandingStatus({ status: 'ok', registered: true, clientId: 'qoder', scope: 'home' }, { evidence: hostCard });
  assert.equal(hosted.token, 'landing-unverified');
  assert.match(hosted.reason, /client binary not on PATH/u);
});

test('行与数字都从 payload 数出来：同名条目在不同落点是不同对象', () => {
  const evidence = new Map([['claude-home', { status: 'verified', reason: '' }]]);
  const rows = flattenMcpServers(PAYLOAD, { evidence });
  assert.deepEqual(rows.map((row) => row.id), [
    'claude/home/aios-shell',
    'claude/home/theirs',
    'hermes/home/headroom',
  ]);
  assert.equal(rows[0].status, 'landing-verified');
  assert.equal(rows[1].status, 'landing-verified', '同一落点的两行共享落点状态');
  assert.equal(rows[2].status, 'landing-unverified');
  assert.equal(rows[2].ownership, 'conflict');
  assert.equal(rows[2].bucketCreated, true);

  const summary = summarizeMcp(PAYLOAD, { evidence });
  assert.equal(summary.landings, 3);
  assert.equal(summary.servers, 3);
  assert.equal(summary.owned, 1);
  assert.equal(summary.external, 1);
  assert.equal(summary.conflict, 1);
  assert.equal(summary.landingVerified, 1);
  assert.equal(summary.landingUnverified, 1);
  assert.equal(summary.landingError, 1);
  assert.equal(summary.drift.length, 1, 'drift 从 counts.drift 透传，不自己算');
});

test('没有证据卡时，每个落点都诚实地读作 landing-unverified（今天就是这种状态）', () => {
  const rows = flattenMcpServers(PAYLOAD, { evidence: new Map() });
  const claude = rows.find((row) => row.id === 'claude/home/aios-shell');
  assert.equal(claude.status, 'landing-unverified');
  assert.equal(claude.statusReason, 'no client evidence recorded yet');
});

test('动作 argv 由闭合集合 + 事实校验构造：非法输入一律拒绝，不做「清理后可用」', () => {
  const landings = LANDINGS.map(({ clientId, scope, writable }) => ({ clientId, scope, writable }));
  assert.deepEqual(MCP_ACTIONS, ['add', 'remove', 'adopt', 'doctor']);
  assert.deepEqual(MCP_SCOPES, ['home', 'project']);

  assert.match(buildMcpArgv('install', {}, { landings }).error, /unknown action/u);
  assert.match(buildMcpArgv('add', { name: 'x', client: 'nope', entry: { command: 'node' } }, { landings }).error, /unknown client/u);
  assert.match(buildMcpArgv('add', { name: 'x', client: 'claude', scope: 'all', entry: { command: 'node' } }, { landings }).error, /invalid scope/u);
  assert.match(buildMcpArgv('add', { name: 'x', client: 'claude', scope: 'project', entry: { command: 'node' } }, { landings }).error, /unknown landing/u);
  // 名字是 argv 的一个元素，所以字符集与长度都必须先收死。
  for (const bad of ['', ' x', 'x y', '--force', 'a'.repeat(65), 'x;rm -rf /']) {
    assert.match(buildMcpArgv('add', { name: bad, client: 'claude', entry: { command: 'node' } }, { landings }).error, /invalid server name/u, `应拒：${JSON.stringify(bad)}`);
  }
  assert.match(buildMcpArgv('add', { name: 'ok', client: 'claude', entry: 'node' }, { landings }).error, /entry must be a JSON object/u);
  assert.match(buildMcpArgv('add', { name: 'ok', client: 'claude', entry: { command: 'node', pad: 'x'.repeat(9000) } }, { landings }).error, /exceeds/u);
  // 不可写的落点不给写（pi 项目级就是这样）。
  assert.match(buildMcpArgv('add', { name: 'ok', client: 'claude', entry: { command: 'node' } }, { landings: [{ clientId: 'claude', scope: 'home', writable: false }] }).error, /landing-not-writable/u);

  // 合法：add 带 entry + 布尔位；argv 是数组，不含任何拼接痕迹。
  const add = buildMcpArgv('add', { name: 'aios-probe', client: 'claude', scope: 'home', entry: { command: 'node', args: ['/p.js'] }, dryRun: true, confirm: true }, { landings });
  assert.deepEqual(add.argv, ['mcp', 'add', 'aios-probe', '--client', 'claude', '--scope', 'home', '--entry', '{"command":"node","args":["/p.js"]}', '--dry-run', '--json']);
  // confirm 是路由层的事，不进 argv（CLI 没有这个 flag）。
  assert.equal(add.argv.includes('confirm'), false);

  const remove = buildMcpArgv('remove', { name: 'aios-probe', client: 'claude', adopt: true, force: true }, { landings });
  assert.deepEqual(remove.argv, ['mcp', 'remove', 'aios-probe', '--client', 'claude', '--scope', 'home', '--adopt', '--force', '--json']);

  const adopt = buildMcpArgv('adopt', { name: 'theirs', client: 'claude' }, { landings });
  assert.deepEqual(adopt.argv, ['mcp', 'adopt', 'theirs', '--client', 'claude', '--scope', 'home', '--json']);

  // doctor 是整表体检：不需要 name；给了 client 就必须是已知客户端。
  assert.deepEqual(buildMcpArgv('doctor', {}, { landings }).argv, ['mcp', 'doctor', '--json']);
  assert.deepEqual(buildMcpArgv('doctor', { client: 'hermes' }, { landings }).argv, ['mcp', 'doctor', '--client', 'hermes', '--json']);
  assert.match(buildMcpArgv('doctor', { client: 'nope' }, { landings }).error, /unknown client/u);
});

test('current destinations and old bookmarks resolve to a real Console view', () => {
  assert.deepEqual(Object.values(CONSOLE_VIEWS).map(view => view.href), ['/', '/tools', '/mcp', '/memory', '/activity', '/settings']);
  assert.deepEqual(LEGACY_ROUTES, { '/prototype': '/', '/overview': '/', '/sessions': '/activity', '/usage': '/activity', '/matrix': '/tools' });
  for (const [path, target] of Object.entries(LEGACY_ROUTES)) {
    assert.equal(legacyDestination(path), target);
    assert.ok(viewForPath(target), `${path} must not point at a missing view`);
    assert.equal(legacyDestination(target), undefined, 'redirects must not loop');
  }
});

test('the current route uses the same navigation owner and preserves unknown-route rejection', () => {
  const source = readFileSync(ui('src/app/(console)/[section]/page.tsx'), 'utf8');
  assert.match(source, /legacyDestination\(pathname\)/u);
  assert.match(source, /viewForPath\(pathname\)/u);
  assert.match(source, /if \(!view\) notFound\(\)/u);
  assert.doesNotMatch(source, /components\/sections|PAGES|sectionById/u);
});

test('API 路由不碰 shell，动作 argv 只来自 buildMcpArgv', () => {
  const route = readFileSync(ui('src/app/api/mcp/route.ts'), 'utf8');
  assert.match(route, /buildMcpArgv/u, '必须用白名单构造器');
  assert.doesNotMatch(route, /shell:\s*true/u, '不许开 shell');
  assert.doesNotMatch(route, /execSync|exec\(/u, '不许用字符串命令');
  // body 的字段只能经 buildMcpArgv 变成 argv：这里钉住「没有把 body 直接拼进数组」这件事。
  assert.doesNotMatch(route, /\[\s*script\s*,[^;]*body\./u);
});