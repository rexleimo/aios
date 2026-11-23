// 首屏事实装配（console-facts）的契约测试。
//
// 这个文件守的是路线图 P0-1/P0-2 换过来的三条客观事实：
//   ① 首屏**不为证据审计付钱**——一次采集里不允许出现 `aios status` 的 spawn；
//   ② 「读不到」与「用户没有东西」必须是两个可区分的返回值（`degraded[]` + `services.loaded`）；
//   ③ 每个数字都有出处（`sources[]`），界面拿不到任何自算常量。
// 取数全部走注入的 runImpl + 系统临时目录里的 fixture，不碰真实用户配置。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach } from 'node:test';

import {
  collectConsoleFacts,
  CONSOLE_FACTS_KIND,
} from '../../../../../apps/shell/ui/src/lib/data/console-facts.mjs';
import {
  MEMO_EXCERPT_CHARS,
  readMemoEvents,
  readPinnedMemo,
} from '../../../../../apps/shell/ui/src/lib/data/memo-store.mjs';

const MCP_LIST_SCHEMA = 'mcp.list.v1';

/**
 * 临时 fixture 目录由注册表统一回收，不靠每条测试自己 `rmSync` 收尾：
 * 断言中途抛错时，收尾那一行根本执行不到——实测漏下过 12 个目录。
 * 前缀形状是 `aios-<fixture>-<6 位随机>`，所以 `npm run tmp:gc` 也能扫到残留。
 */
const createdRoots = [];
function tempRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  createdRoots.push(root);
  return root;
}
afterEach(() => {
  for (const root of createdRoots.splice(0).reverse()) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function fixtureRepo({ withMemoFile = true, withCapabilities = true } = {}) {
  const root = tempRoot('aios-console-facts-');
  // resolveCapabilityCli only recognises a root carrying scripts/aios.mjs (the
  // marker that replaced the old cwd/../../.. guess). Without it every capability
  // read short-circuits to { ok:false } and the injected runImpl is never called,
  // so the "which commands does the first screen spawn" assertions see nothing.
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts', 'aios.mjs'), '// fixture capability entry\n');
  if (withCapabilities) {
    fs.mkdirSync(path.join(root, 'config'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'config', 'host-capabilities.json'),
      JSON.stringify({
        schemaVersion: 1,
        clients: {
          claude: { targetLevel: 'L2', capabilities: [], limits: [] },
          codex: { targetLevel: 'L1', capabilities: [], limits: [] },
          // 声明了但本机永远不会有落点的一个：用来验「声明 ≠ 有问题」这条区分。
          cursor: { targetLevel: 'L0', capabilities: [], limits: [] },
        },
      }),
    );
  }
  if (withMemoFile) {
    const memoDir = path.join(root, '.aios', 'memo', 'file');
    fs.mkdirSync(path.join(memoDir, 'pinned'), { recursive: true });
    const events = [
      { schemaVersion: 1, eventId: 'memo:a', ts: '2026-11-01T00:00:00.000Z', kind: 'memo', text: 'older fact', refs: [], space: 'default' },
      { schemaVersion: 1, eventId: 'memo:b', ts: '2026-11-05T00:00:00.000Z', kind: 'memo', text: `x`.repeat(MEMO_EXCERPT_CHARS + 40), refs: [], space: 'default', claimStatus: 'verified', provenance: { trust: 'local_manual', sourceRef: 'session-1' } },
      { schemaVersion: 1, eventId: 'memo:c', ts: '2026-11-07T00:00:00.000Z', kind: 'memo', text: '[checkpoint] newest milestone', refs: [], space: 'default', scope: 'project_shared' },
      'this line is not json at all',
    ];
    fs.writeFileSync(path.join(memoDir, 'events.jsonl'), events.map((line) => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n'));
    fs.writeFileSync(path.join(memoDir, 'pinned', 'default.md'), 'first pinned block\n\nsecond pinned block\n');
  }
  const sessionDir = path.join(root, '.aios', 'context-db', 'sessions', 'sess-1');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir, 'meta.json'),
    JSON.stringify({
      sessionId: 'sess-1',
      agent: 'demo',
      project: 'north-star',
      goal: 'prove the collector',
      status: 'done',
      createdAt: '2026-11-06T00:00:00.000Z',
      updatedAt: '2026-11-06T00:00:00.000Z',
    }),
  );
  return root;
}

/** 一份最小但形状真实的 `mcp.list.v1`：claude 有落点，codex 读失败，cursor 不出现。 */
function mcpPayload() {
  return {
    schema: MCP_LIST_SCHEMA,
    command: 'mcp list',
    landings: [
      {
        clientId: 'claude', scope: 'home', file: '/home/u/.claude.json', format: 'json', writable: true, registered: true, status: 'ok', servers: [
          { name: 'srv-a', ownership: 'owned', fields: ['command'] },
          { name: 'srv-b', ownership: 'conflict', fields: ['command'] },
        ],
      },
      {
        clientId: 'codex', scope: 'home', file: '/home/u/.codex/config.toml', format: 'toml', writable: true, registered: true, status: 'error', reason: 'config read failed', servers: [],
      },
    ],
    counts: { landings: 2, servers: 2, drift: 1 },
    drift: [{ clientId: 'claude', scope: 'home', name: 'srv-a', kind: 'removed' }],
  };
}

/** 注入的取数替身：记录每一次 argv，好让「不许 spawn status」成为可检查的事实而不是口头承诺。 */
function injectedRunner({ failMcp = false, rootHint } = {}) {
  const calls = [];
  const runImpl = async (_exe, argv) => {
    const args = argv.slice(1); // execFile's args array starts at the script path
    calls.push(args.join(' '));
    if (args[0] === 'mcp') {
      if (failMcp) throw Object.assign(new Error('capability process absent'), { code: 'ENOENT' });
      return { stdout: JSON.stringify(mcpPayload()), stderr: '' };
    }
    if (args[0] === 'memory') {
      return { stdout: JSON.stringify({ totals: { events: 3, spaces: 1, superseded: 0 }, spaces: [{ space: 'default', events: 3 }], pinned: [{ chars: 120 }] }), stderr: '' };
    }
    if (args[0] === 'workspaces') {
      return { stdout: JSON.stringify(workspacesPayload(rootHint)), stderr: '' };
    }
    throw new Error(`unexpected capability call: ${args.join(' ')}`);
  };
  return { calls, runImpl };
}

/** 工作区清单替身：形状与 `aios workspaces list --json` 一字不差。 */
function workspacesPayload(currentPath) {
  const item = (name, absolute, memos, extra = {}) => ({
    key: Buffer.from(absolute).toString('hex').slice(0, 12),
    name,
    path: absolute,
    origin: ['evidence'],
    registeredLastSeenAt: null,
    missing: false,
    stale: false,
    current: Boolean(extra.current),
    lastActivityAt: extra.lastActivityAt ?? null,
    memos,
    sessions: extra.sessions ?? 0,
  });
  const current = currentPath ?? '/repo';
  return {
    schema: 'aios.workspaces.v1',
    scanRoots: [current],
    workspaces: [
      item(path.basename(current), current, 7, { current: true, sessions: 2, lastActivityAt: '2026-11-07T10:00:00.000Z' }),
      item('north-star', '/repo/north-star', 3, { sessions: 1, lastActivityAt: '2026-11-06T10:00:00.000Z' }),
    ],
  };
}

test('the first screen assembles every fact without ever spawning the evidence audit', async () => {
  const root = fixtureRepo();
  const { calls, runImpl } = injectedRunner({ rootHint: root });
  const facts = await collectConsoleFacts({ rootDir: root, runImpl });

  assert.equal(facts.kind, CONSOLE_FACTS_KIND);
  // 允许的命令面是枚举出来的：多一条就要在这里说清它为什么上首屏。
  // 仍然绝对不允许 `status`——那个 2.7s 与首屏无关（阶段0 实测）。
  assert.deepEqual(
    calls,
    ['mcp list --json', 'memory report --json', 'workspaces list --json'],
    'the first screen reads three commands, not the status audit',
  );
  assert.ok(!calls.some((call) => call.includes('status')), 'aios status must stay off the first-screen path');
  assert.deepEqual(facts.degraded, []);
  assert.equal(facts.services.loaded, true);
  assert.equal(facts.services.rows.length, 2);
  assert.equal(facts.memoryTotals.events, 3);
});

test('clients come from the landing table; a declared-only client is not an error and not a pass', async () => {
  const root = fixtureRepo();
  const { runImpl } = injectedRunner({ rootHint: root });
  const facts = await collectConsoleFacts({ rootDir: root, runImpl });

  assert.equal(facts.declaredClientCount, 3);
  const byId = new Map(facts.clients.map((client) => [client.clientId, client]));
  assert.equal(byId.get('claude').installed, true);
  assert.equal(byId.get('claude').services, 2);
  assert.equal(byId.get('codex').installed, true, 'a landing that failed to read is still a landing on this machine');
  assert.equal(byId.get('cursor').installed, false);
  assert.equal(byId.get('cursor').declaredOnly, true);
  // 排序事实：命中的在前，只声明的沉底。
  assert.equal(facts.clients[0].installed, true);
  assert.equal(facts.clients[facts.clients.length - 1].clientId, 'cursor');
});

test('issues are counted from facts, and each one carries where it came from', async () => {
  const root = fixtureRepo();
  const { runImpl } = injectedRunner({ rootHint: root });
  const facts = await collectConsoleFacts({ rootDir: root, runImpl });

  const kinds = facts.issues.map((issue) => issue.kind).sort();
  assert.deepEqual(kinds, ['config-unreadable', 'drift', 'ownership-conflict']);
  for (const issue of facts.issues) {
    assert.ok(issue.detail.length > 0, `${issue.kind} must say what is wrong`);
    assert.ok(issue.source.length > 0, `${issue.kind} must name the command it came from`);
  }
});

test('a failed collector degrades into a named reason, never into an empty list claiming emptiness', async () => {
  const root = fixtureRepo();
  const { runImpl } = injectedRunner({ failMcp: true });
  const facts = await collectConsoleFacts({ rootDir: root, runImpl });

  assert.equal(facts.services.loaded, false, '"we could not read it" is not "there is nothing here"');
  assert.ok(facts.services.error);
  assert.ok(facts.degraded.some((entry) => entry.item === 'mcp'));
  assert.equal(facts.services.rows.length, 0);
  // 其余采集项不受牵连：这是「各自成功、各自失败」的实际含义。
  assert.equal(facts.memories.length, 3);
  assert.equal(facts.sessions.length, 1);
});

test('a missing memo store is reported as absent, not as a user with no memory', async () => {
  const root = fixtureRepo({ withMemoFile: false });
  const { runImpl } = injectedRunner({ rootHint: root });
  const facts = await collectConsoleFacts({ rootDir: root, runImpl });

  assert.equal(facts.memories.length, 0);
  assert.ok(facts.degraded.some((entry) => entry.item === 'memo'), 'the reader must say it found no file');
});

test('every number the page shows has a named origin', async () => {
  const root = fixtureRepo();
  const { runImpl } = injectedRunner({ rootHint: root });
  const facts = await collectConsoleFacts({ rootDir: root, runImpl });

  const fields = facts.sources.map((source) => source.field);
  for (const key of ['clients / services / issues', 'declaredClients', 'sessions / projects', 'memories', 'memoryTotals']) {
    assert.ok(fields.includes(key), `no origin for ${key}`);
  }
});

test('projects are the real machine workspaces, current one first, not session-name guesses', async () => {
  const root = fixtureRepo();
  const { runImpl } = injectedRunner({ rootHint: root });
  const facts = await collectConsoleFacts({ rootDir: root, runImpl });

  assert.equal(facts.projects.length, 2);
  assert.equal(facts.projects[0].current, true, 'the machine must show the user their own workspace first');
  assert.equal(facts.projects[0].name, path.basename(root));
  // 每条都带得上服务端重新采集的柄与真实条数，而不是一个光名字。
  assert.match(facts.projects[0].key, /^[0-9a-f]{12}$/u);
  assert.equal(facts.projects[0].memos, 7);
  assert.equal(facts.projects.some((project) => project.name === 'workspace-memory'), false, '记忆空间伪会话不是项目');
  // 清单读不到要说成降级，不能假称「本机就这一个工程」。
  assert.equal(facts.workspaces.length, 2);
  assert.equal(facts.sources.some((entry) => entry.field === 'workspaces'), true);
});

test('memo reader keeps newest-first order, truncates, and counts malformed lines instead of dropping them silently', () => {
  const root = fixtureRepo();
  const result = readMemoEvents({ rootDir: root });

  assert.equal(result.ok, true);
  assert.equal(result.totalEvents, 4);
  assert.equal(result.malformed, 1, 'a line that is not JSON is a fact about the file, not a silent skip');
  assert.deepEqual(result.rows.map((row) => row.id), ['memo:c', 'memo:b', 'memo:a']);
  assert.equal(result.rows[0].checkpoint, true);
  assert.equal(result.rows[0].scope, 'project_shared');
  assert.ok(result.rows[1].excerpt.length <= MEMO_EXCERPT_CHARS + 1);
  assert.equal(result.rows[1].sourceRef, 'session-1');
  assert.equal(result.rows[2].sourceRef, null, 'no source is null, never an invented one');
  assert.equal(result.rows[2].claimStatus, null);
});

test('the memo reader distinguishes an absent file from an unreadable one', () => {
  const missing = readMemoEvents({ rootDir: tempRoot('aios-memo-empty-') });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'no-memo-file');

  const pinned = readPinnedMemo({ rootDir: fixtureRepo() });
  assert.equal(pinned.ok, true);
  assert.deepEqual(pinned.entries, ['first pinned block', 'second pinned block']);
});
