import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { CONSOLE_VIEWS, PRIMARY_VIEWS, legacyDestination, viewForPath } from '../../../../../apps/shell/ui/src/lib/console-navigation.ts';
import { MEMORIES, MEMORY_STATE } from '../../../../../apps/shell/ui/src/components/console/demo-data.ts';

const ui = file => new URL(`../../../../../apps/shell/ui/src/${file}`, import.meta.url);

test('current Console has one route and an understandable label for every destination', () => {
  assert.deepEqual(PRIMARY_VIEWS.map(view => view.label), ['首页', 'AI 工具', 'MCP 服务', '记忆', '活动记录']);
  for (const [id, view] of Object.entries(CONSOLE_VIEWS)) {
    assert.equal(viewForPath(view.href), id);
    assert.ok(view.label.length > 0 && view.title.length > 0);
  }
  assert.equal(new Set(Object.values(CONSOLE_VIEWS).map(view => view.href)).size, 6);
  for (const path of ['/unknown', '/__proto__', '/constructor', '/memory/nested']) {
    assert.equal(viewForPath(path), undefined);
    assert.equal(legacyDestination(path), undefined);
  }
});

test('memory labels retain uncertainty and project-qualified identity in the fixture', () => {
  assert.equal(MEMORY_STATE.current.label, '未发现更新记录');
  assert.equal(MEMORY_STATE.updated.label, '已被更新');
  assert.equal(MEMORY_STATE.candidate.label, '待确认');
  assert.ok(MEMORIES.some(memory => memory.source === null));
  const collisions = MEMORIES.filter(memory => memory.id === 'm-path');
  assert.equal(collisions.length, 2, 'fixture must exercise same event id across projects');
  assert.equal(new Set(collisions.map(memory => `${memory.project}:${memory.id}`)).size, 2);
});

test('the current Console keeps explicit sample disclosure and has no legacy return entry', () => {
  const source = readFileSync(ui('components/console/console-workspace.tsx'), 'utf8');
  assert.match(source, /示例数据 · 不读取私人文件 · 不修改真实配置/u);
  assert.doesNotMatch(source, /能力进程已连接|返回正式控制台|新版交互预览/u);
  for (const retired of ['components/app-shell.tsx', 'components/sections/overview.tsx', 'components/sections/mcp.tsx', 'lib/sections.ts']) {
    assert.equal(existsSync(ui(retired)), false, `${retired} should be retired`);
  }
});

test('server route entries import only the client view component, not its fixture state', () => {
  for (const file of ['app/(console)/page.tsx', 'app/(console)/[section]/page.tsx']) {
    const source = readFileSync(ui(file), 'utf8');
    assert.match(source, /import \{ ConsoleWorkspace \}/u);
    assert.doesNotMatch(source, /demo-data|MEMORIES|PROJECTS|TOOLS/u);
    assert.doesNotMatch(source, /components\/sections|AppShell/u);
  }
});
