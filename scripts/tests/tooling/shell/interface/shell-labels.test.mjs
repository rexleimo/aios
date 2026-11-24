import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { CONSOLE_VIEWS, PRIMARY_VIEWS, legacyDestination, viewForPath } from '../../../../../apps/shell/ui/src/lib/console-navigation.ts';
import { MEMO_SCOPE_LABELS, claimStatusLabel } from '../../../../../apps/shell/ui/src/lib/console-facts.ts';
import { EVENT_ID_PATTERN } from '../../../../../apps/shell/ui/src/lib/data/memory-actions.mjs';

const ui = file => new URL(`../../../../../apps/shell/ui/src/${file}`, import.meta.url);

test('current Console has one route and an understandable label for every destination', () => {
  assert.deepEqual(PRIMARY_VIEWS.map(view => view.label), ['首页', 'Agent 客户端', '模型路由', '资源库', '记忆', '活动记录']);
  for (const [id, view] of Object.entries(CONSOLE_VIEWS)) {
    assert.equal(viewForPath(view.href), id);
    assert.ok(view.label.length > 0 && view.title.length > 0);
  }
  assert.equal(new Set(Object.values(CONSOLE_VIEWS).map(view => view.href)).size, 8);
  // 配置是二级页：有独立路由但不进主导航（主导航仍 6 项）。
  assert.equal(CONSOLE_VIEWS.routingConfig.href, '/routing/config');
  assert.equal(CONSOLE_VIEWS.routingConfig.label, '模型分配');
  assert.equal(CONSOLE_VIEWS.routingConfig.title, '模型分配');
  assert.ok(!PRIMARY_VIEWS.some(view => view.id === 'routingConfig'));
  for (const path of ['/unknown', '/__proto__', '/constructor', '/memory/nested']) {
    assert.equal(viewForPath(path), undefined);
    assert.equal(legacyDestination(path), undefined);
  }
});

test('memory labels keep uncertainty, and the scope vocabulary matches the store owner', () => {
  // 词表不能跑过真实存储：closed set 的唯一所有者是 normalizeMemoScope。
  const scopeOwner = readFileSync(
    new URL('../../../../../scripts/lib/memory/memo/storage/base/normalizers.mjs', import.meta.url),
    'utf8',
  );
  const declared = scopeOwner.match(/\['project_shared', 'agent_private', 'agent_ephemeral'\]/u);
  assert.ok(declared, 'the scope closed set moved; update the UI vocabulary deliberately, not silently');
  assert.deepEqual(Object.keys(MEMO_SCOPE_LABELS).sort(), ['agent_ephemeral', 'agent_private', 'project_shared']);

  // 不确定状态必须还能被界面表达为「没记录」，而不是被填一个默认出处。
  assert.equal(claimStatusLabel(null), '未标注验证状态');
  assert.equal(claimStatusLabel('verified'), '已验证');

  // 真实 event id 能被动作路径接受；原型那种短名（m-path）必须被拒——这就是删掉 fixture 后的意义。
  assert.equal(EVENT_ID_PATTERN.test('memo:default:20261107135831207-29b839e5'), true);
  assert.equal(EVENT_ID_PATTERN.test('m-path'), false);
});

test('the Console discloses real status and confirmed mutation boundaries', () => {
  const source = readFileSync(ui('components/console/console-workspace.tsx'), 'utf8');
  assert.match(source, /t\('shell\.workspace'\)[\s\S]*?<strong/u);
  assert.match(source, /t\('shell\.oneCollection'\)/u);
  assert.match(source, /\{facts\.totalMs\}ms/u, '页头要说得出本次采集耗时，不是只写个“实时”');
  assert.match(source, /t\('shell\.readOnlyHint'\)/u);
  assert.doesNotMatch(source, /此面板只读，写入尚未授权/u);
  assert.match(source, /mounted\.has\('tools'\)/u, 'client probes must be lazy mounted');
  assert.match(source, /<ResourcesWorkspace facts=\{facts\}/u);
  assert.doesNotMatch(source, /示例数据 · 不读取私人文件 · 不修改真实配置/u, 'the global demo banner must not come back');
  assert.doesNotMatch(source, /刷新可重置体验/u);
  assert.doesNotMatch(source, /能力进程已连接|返回正式控制台|新版交互预览/u);
  for (const retired of ['components/app-shell.tsx', 'components/sections/overview.tsx', 'components/sections/mcp.tsx', 'lib/sections.ts']) {
    assert.equal(existsSync(ui(retired)), false, `${retired} should be retired`);
  }
});

test('the fixture state is gone from the shipped UI, not just hidden', () => {
  // P0-2 的门：demo-data.ts 本体不存在，而且整个 UI 源码里没有任何 import 指向它。
  assert.equal(existsSync(ui('components/console/demo-data.ts')), false, 'fixture file must be deleted, not kept unused');
  const sources = ['components/console/console-workspace.tsx', 'components/console/home-workspace.tsx',
    'components/console/mcp-workspace.tsx', 'components/console/memory-workspace.tsx',
    'components/console/flows/memory-detail.tsx', 'components/console/flows/mcp-wizard.tsx',
    'components/console/model-routing/agent-overview.tsx', 'components/console/model-routing/routing-graph.tsx',
    'components/console/model-routing/intent-routing-section.tsx',
    'app/(console)/page.tsx', 'app/(console)/[section]/page.tsx', 'app/(console)/routing/config/page.tsx'];
  for (const file of sources) {
    const source = readFileSync(ui(file), 'utf8');
    assert.doesNotMatch(source, /from '[^']*demo-data'/u, `${file} still imports fixture state`);
    assert.doesNotMatch(source, /模拟测试通过|已检测到 · 示例|示例环境/u, `${file} still renders fabricated status text`);
  }
  // 监控/配置分离：监控页不得再挂编辑器，配置子页必须承载意图编辑。
  const monitor = readFileSync(ui('components/console/model-routing-panel.tsx'), 'utf8');
  assert.doesNotMatch(monitor, /intent-routing-section|RoutingConfigPanel/u, 'the monitor page must not embed config editors');
  const configPanel = readFileSync(ui('components/console/model-routing/routing-config.tsx'), 'utf8');
  assert.match(configPanel, /IntentRoutingSection/u, 'the config sub-page must own the intent editor');
});

test('the first screen is fed by real facts and never pays for the evidence audit', () => {
  const facts = readFileSync(ui('lib/data/console-facts.mjs'), 'utf8');
  // 实测：`aios status --json` 要 2.7s，其中 64% 在扫 29MB 证据目录（阶段 0 测量第 1 节）。
  // 首屏不展示证据审计，所以它不得出现在首屏取数路径里——这是一条会退化的门，不是一句愿望。
  assert.doesNotMatch(facts, /'status', '--json'/u, 'aios status must stay off the first-screen path');
  assert.doesNotMatch(facts, /loadStatus|runCapabilityJsonCached/u, 'the cached status loader must not be reachable from the first screen');
  assert.match(facts, /loadMcpList/u, 'service facts come from `aios mcp list`');
  for (const file of ['components/console/home-workspace.tsx', 'components/console/mcp-workspace.tsx',
    'components/console/memory-workspace.tsx', 'components/console/model-routing/agent-overview.tsx',
    'app/(console)/page.tsx', 'app/(console)/[section]/page.tsx']) {
    const source = readFileSync(ui(file), 'utf8');
    assert.doesNotMatch(source, /from '[^']*demo-data'/u, `${file} must not import fixture state`);
  }
  // 首页实时数字的唯一出处是网关决策日志端点；配置默认必须标明是配置，不能冒充观测。
  const overview = readFileSync(ui('components/console/model-routing/agent-overview.tsx'), 'utf8');
  assert.match(overview, /\/api\/model-routing\/decisions/u, 'home live counters must read the gateway decision log');
  assert.match(overview, /t\("配置默认 · 实现角色"\)/u, 'untrafficked agents must be labelled as configured, not observed');
  // 接线完成：外壳不再需要那个临时适配器，也不得留着任何 fixture 导入。
  const shell = readFileSync(ui('components/console/console-workspace.tsx'), 'utf8');
  assert.doesNotMatch(shell, /demo-data|toPrototypeProject/u, 'the migration shim must be gone once every panel is wired');
  // 采集项自己报成功失败：空数组不能冒充「用户没有东西」。
  assert.match(facts, /degraded/u);
  assert.match(facts, /sources:/u);
});

test('server route entries fetch real facts and import no fixture state', () => {
  for (const file of ['app/(console)/page.tsx', 'app/(console)/[section]/page.tsx', 'app/(console)/routing/config/page.tsx']) {
    const source = readFileSync(ui(file), 'utf8');
    assert.match(source, /import \{ ConsoleWorkspace \}/u);
    assert.match(source, /collectForRequest/u, `${file} must fetch real facts on the server for the requested workspace`);
    assert.match(source, /export const dynamic = 'force-dynamic'/u, `${file} must not be prerendered with stale data`);
    assert.doesNotMatch(source, /demo-data|MEMORIES|PROJECTS|TOOLS/u);
    assert.doesNotMatch(source, /components\/sections|AppShell/u);
  }
});
