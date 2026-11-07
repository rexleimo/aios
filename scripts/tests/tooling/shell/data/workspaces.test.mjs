// scripts/tests/tooling/shell/data/workspaces.test.mjs
// 工作区切换的契约测试：清单来源、key 边界、以及「读不到 ≠ 没有」。
//
// 这组存在的原因不是「新功能要配测试」，而是项目切换**必须**不能变成一个任意目录读取器：
// 页面交出的只有 key，而 key 只在本机清单里才有效。边界没有钉住，这个功能就是漏洞本身。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const { discoverWorkspaces, resolveWorkspaceKey, scanRoots } = await import(
  pathToFileURL(path.resolve(process.cwd(), 'scripts/lib/foundation/workspaces/discover.mjs')).href
);
const { workspaceKey, registryRoot, recordWorkspace, listWorkspaces } = await import(
  pathToFileURL(path.resolve(process.cwd(), 'scripts/lib/foundation/workspaces/registry.mjs')).href
);
const { listSessions, auditSessionStore } = await import(
  pathToFileURL(path.resolve(process.cwd(), 'apps/shell/ui/src/lib/data/sessions.mjs')).href
);

/** 每个测试自己建家目录并在结束时回收：注册表写在 `~/.aios/workspaces`，不能用真的家。 */
function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function writeMemoStore(dir, lines) {
  const memo = path.join(dir, '.aios', 'memo', 'file');
  fs.mkdirSync(memo, { recursive: true });
  fs.writeFileSync(path.join(memo, 'events.jsonl'), `${lines.join('\n')}\n`);
  return dir;
}

function makeRepo(parent) {
  return writeMemoStore(fs.mkdtempSync(path.join(parent, 'repo-')), [
    JSON.stringify({ schemaVersion: 1, eventId: 'a', ts: '2026-11-01T00:00:00.000Z', space: 'default', text: 'one' }),
    JSON.stringify({ schemaVersion: 1, eventId: 'b', ts: '2026-11-07T09:00:00.000Z', space: 'default', text: 'two' }),
  ]);
}

function makeSibling(parent, name, { withMemo = true } = {}) {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir, { recursive: true });
  if (withMemo) {
    writeMemoStore(dir, [
      JSON.stringify({ schemaVersion: 1, eventId: 'c', ts: '2026-10-20T00:00:00.000Z', space: 'default', text: 'sibling' }),
    ]);
  }
  return dir;
}

test('discovery lists the current repo and sibling memo stores, keyed by the registry owner', (t) => {
  const home = tempHome(t);
  const parent = fs.mkdtempSync(path.join(home, 'parent-'));
  const repo = makeRepo(parent);
  makeSibling(parent, 'north-star');

  const items = discoverWorkspaces({ rootDir: repo, homeDir: home });
  const names = items.map((item) => item.name);
  assert.equal(names.includes(path.basename(repo)), true, '当前工程必须在清单里');
  assert.equal(names.includes('north-star'), true, '同级真实记忆仓必须被发现：写者缺失期间这是唯一事实来源');

  const current = items.find((item) => item.current);
  assert.equal(current.path, path.resolve(repo));
  assert.equal(current.memos, 2);
  assert.equal(current.lastActivityAt, '2026-11-07T09:00:00.000Z', '活跃度取记忆仓最新一条，不是文件 mtime');
  // key 必须由注册表那个所有者算出：界面与 CLI 各算一套就会有两个身份空间。
  assert.equal(current.key, workspaceKey(current.path));
  assert.deepEqual(scanRoots({ rootDir: repo, env: {} }), [path.dirname(path.resolve(repo)), path.resolve(repo)]);
});

test('a directory without a memo store is not a workspace', (t) => {
  const home = tempHome(t);
  const parent = fs.mkdtempSync(path.join(home, 'parent-'));
  const repo = makeRepo(parent);
  makeSibling(parent, 'plain-dir', { withMemo: false });

  const names = discoverWorkspaces({ rootDir: repo, homeDir: home }).map((item) => item.name);
  assert.equal(names.includes('plain-dir'), false, '没有记忆仓的目录不能进清单，否则清单退化成目录列表器');
});

test('the key boundary refuses raw paths, malformed keys, and out-of-list digests', (t) => {
  const home = tempHome(t);
  const parent = fs.mkdtempSync(path.join(home, 'parent-'));
  const repo = makeRepo(parent);
  const outside = makeSibling(parent, 'secrets', { withMemo: false });

  assert.equal(resolveWorkspaceKey('', { rootDir: repo, homeDir: home }).reason, 'bad-key');
  assert.equal(resolveWorkspaceKey(outside, { rootDir: repo, homeDir: home }).reason, 'bad-key', '把路径当 key 交回来必须被拒');

  // 一个**算得对但不在清单里**的 key（系统目录）也进不来：清单本身就是允许列表。
  const systemKey = workspaceKey(process.platform === 'win32' ? 'C:\\Windows' : '/etc');
  const refused = resolveWorkspaceKey(systemKey, { rootDir: repo, homeDir: home });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'not-listed');

  const listed = resolveWorkspaceKey(workspaceKey(path.resolve(repo)), { rootDir: repo, homeDir: home });
  assert.equal(listed.ok, true);
  assert.equal(listed.workspace.path, path.resolve(repo));
});

test('sessions without meta.json are excluded from the list AND reported as skipped', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-sessions-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, '.aios', 'context-db', 'sessions');
  fs.mkdirSync(path.join(dir, 'agent-20261107T000000Z'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'agent-20261107T000000Z', 'meta.json'),
    JSON.stringify({
      sessionId: 'agent-20261107T000000Z',
      project: 'repo',
      goal: 'real',
      status: 'running',
      updatedAt: '2026-11-07T00:00:00.000Z',
    }),
  );
  // 测试残留：只有候选文件、没有 meta.json。旧实现把它算成一条会话（本机实测 26 报出 / 真实 18）。
  fs.mkdirSync(path.join(dir, 'demo-session'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'demo-session', 'session-close-memory-candidate.json'), '{}');

  assert.equal(listSessions(root).length, 1, '没有元数据的目录不是会话');
  const audit = auditSessionStore(root);
  assert.equal(audit.dirs, 2);
  assert.equal(audit.withMeta, 1);
  assert.deepEqual(audit.withoutMeta, ['demo-session'], '跳过必须是可显示的事实，不是静默过滤');
});


test('the registry honours AIOS_HOME so a test sandbox cannot pollute the real one', (t) => {
  // 中文注释：这条钉的是我引入过的真实事故——写者上线后，一轮回归把临时沙箱名
  // （aios-session-start-* / aios-checkpoint-receipt-*）登进了用户真实 `~/.aios/workspaces`，
  // 实测 7 条。隔离用仓库已有约定 `AIOS_HOME`（registry.mjs 的 resolveRegistryHome）。
  const home = tempHome(t);
  const previous = process.env.AIOS_HOME;
  process.env.AIOS_HOME = home;
  t.after(() => {
    if (previous === undefined) delete process.env.AIOS_HOME;
    else process.env.AIOS_HOME = previous;
  });

  assert.equal(registryRoot(), path.join(home, '.aios', 'workspaces'), 'registryRoot 必须认 AIOS_HOME');
  const written = recordWorkspace({ rootDir: process.cwd() });
  assert.ok(written && written.startsWith(home), `登记项必须落在隔离家目录里，实际：${written}`);
  assert.equal(listWorkspaces().length, 1, '读也必须读同一张隔离后的表');
  assert.equal(fs.existsSync(path.join(os.homedir(), '.aios', 'workspaces', path.basename(String(written)))), false,
    '真实家目录里不能因为这条测试长出文件');
});
