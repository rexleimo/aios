import assert from 'node:assert/strict';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { build } from 'esbuild';
import { browserRuntime } from '../browser/gateway-fixture.mjs';
import { agentInventory, revision, skillInventory, skillReport } from './resources-fixtures.mjs';

const facts = {
  kind: 'aios.console-facts.v1', rootDir: '/fixture', generatedAt: agentInventory.generatedAt,
  clients: [{ clientId: 'claude', installed: true, services: 1, scopes: [], landingTokens: [], configFiles: [], unreadable: [], declaredOnly: false }],
  degraded: [], services: { loaded: true, error: null, summary: { landings: 1 }, rows: [{
    id: 'offline-mcp', name: 'offline-mcp', clientId: 'claude', scope: 'global', file: '/fixture/mcp.json',
    format: 'json', writable: true, ownership: 'external', status: 'landing-unverified', statusReason: 'offline fixture', fields: [], lastVerifiedAt: null,
  }] },
};
const bundle = await build({
  stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { flushSync } from 'react-dom';
    import { ResourcesWorkspace } from './src/components/console/resources-workspace';
    const root = createRoot(document.getElementById('root')); let revision = 0;
    window.renderResources = () => flushSync(() => root.render(React.createElement(ResourcesWorkspace, { key: ++revision, facts: ${JSON.stringify(facts)} })));
    window.renderResources();`, resolveDir: path.resolve(import.meta.dirname, '../../../../../apps/shell/ui'), sourcefile: 'resources-acceptance.tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'standalone-navigation-boundary', setup(builder) {
    // The real MCP wizard and router refresh run in clients-resources' isolated Next app.
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'next/navigation', namespace: 'standalone-navigation' }));
    builder.onLoad({ filter: /.*/, namespace: 'standalone-navigation' }, () => ({
      contents: 'export function useRouter() { throw new Error("MCP navigation requires the isolated Console browser suite"); }', loader: 'js',
    }));
  } }],
});
let browser;
before(async () => {
  const runtime = await browserRuntime();
  assert.ok(runtime, 'isolated browser tooling is required for resource acceptance tests');
  browser = await runtime.chromium.launch({ executablePath: runtime.executablePath });
});
after(async () => { await browser?.close(); });

async function offlinePage(t, reads = {}) {
  const context = await browser.newContext({ viewport: { width: 1080, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  const network = [];
  await page.route('**/*', route => { network.push(route.request().url()); return route.abort(); });
  await page.setContent('<style>[role=tabpanel][data-state=inactive]{display:none} [role=dialog]{position:fixed;inset:5%;overflow:auto;background:white;z-index:50} svg{max-width:24px}</style><div id="root"></div>');
  await page.evaluate(({ skills, agents, reads }) => {
    window.fixture = { reads: { skills: { data: skills }, agents: { data: agents }, ...reads }, actions: [], calls: [], pending: [], unexpected: [] };
    // Never delegate to native fetch: even unexpected requests fail inside this fixture.
    window.fetch = async (input, init = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const call = { url: `${url.pathname}${url.search}`, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null, aborted: false };
      init.signal?.addEventListener('abort', () => { call.aborted = true; }, { once: true });
      window.fixture.calls.push(call);
      const resource = url.searchParams.get('resource');
      let spec;
      if (url.pathname === '/api/manage' && call.method === 'GET' && ['skills', 'agents'].includes(resource)) spec = window.fixture.reads[resource];
      else if (url.pathname === '/api/manage' && call.method === 'POST') spec = window.fixture.actions.shift();
      if (!spec) {
        window.fixture.unexpected.push(call);
        throw new Error('unexpected offline request');
      }
      if (spec.hold) await new Promise(resolve => window.fixture.pending.push({ resolve, call }));
      if (spec.failure) throw new Error(spec.failure);
      return Response.json(spec.raw ? spec.data : { ok: true, data: spec.data }, { status: spec.status || 200 });
    };
  }, { skills: skillInventory, agents: agentInventory, reads });
  t.after(async () => {
    const unexpected = await page.evaluate(() => window.fixture.unexpected);
    await context.close();
    assert.deepEqual(network, [], 'no browser request may reach the network');
    assert.deepEqual(unexpected, [], 'all management requests must have injected responses');
    assert.deepEqual(errors, [], 'the rendered workspace must not emit errors or warnings');
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  assert.deepEqual(errors, [], 'the standalone component bundle must render without browser setup errors');
  return page;
}

const tab = (page, name) => page.getByRole('tab', { name, exact: true });
const dialog = page => page.getByRole('dialog');
const previewButton = page => dialog(page).getByRole('button', { name: '生成预览', exact: true });
const confirmation = page => dialog(page).getByRole('checkbox', { name: /^我已核对预览/u });
const section = (page, preview = true) => dialog(page).getByRole('region', { name: preview ? '技能操作预览' : '技能操作结果', exact: true });
const posts = page => page.evaluate(() => window.fixture.calls.filter(call => call.method === 'POST').map(call => call.body));
const getCount = (page, resource) => page.evaluate(resource => window.fixture.calls.filter(call => call.method === 'GET' && call.url.endsWith(`resource=${resource}`)).length, resource);
const setRead = (page, resource, spec) => page.evaluate(({ resource, spec }) => { window.fixture.reads[resource] = spec; }, { resource, spec });
const enqueue = (page, ...specs) => page.evaluate(specs => { window.fixture.actions.push(...specs); }, specs);
const release = page => page.evaluate(() => { const pending = window.fixture.pending.shift(); if (!pending) throw new Error('no held request'); pending.resolve(); });
async function waitGets(page, resource, count) {
  await page.waitForFunction(({ resource, count }) => window.fixture.calls.filter(call => call.method === 'GET' && call.url.endsWith(`resource=${resource}`)).length === count, { resource, count });
}
async function choose(page, name, option) {
  await page.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function keyboardChoose(page, name, option) {
  const select = page.getByRole('combobox', { name, exact: true });
  await select.focus();
  await select.press('ArrowDown');
  const item = page.getByRole('option', { name: option, exact: true });
  await item.focus();
  await item.press('Enter');
}
async function openSkills(page) {
  await tab(page, 'Skills').click();
  await page.getByRole('heading', { name: /^技能落点/u }).waitFor();
}
async function generate(page, request, patch = {}) {
  await enqueue(page, { data: { ...skillReport(request), ...patch } });
  await previewButton(page).click();
  await section(page).waitFor();
}

test('keyboard tabs reuse actual MCP facts, load inventories lazily, and retain mounted filters', async t => {
  const skills = { ...skillInventory, warnings: [{ path: '/fixture/unreadable', reason: 'fixture permission warning' }] };
  const page = await offlinePage(t, { skills: { data: skills, hold: true } });
  assert.equal(await tab(page, 'MCP').getAttribute('aria-selected'), 'true');
  await page.getByText('offline-mcp', { exact: true }).waitFor();
  assert.equal(await getCount(page, 'skills'), 0);
  assert.equal(await getCount(page, 'agents'), 0);
  await tab(page, 'MCP').focus();
  await tab(page, 'MCP').press('ArrowRight');
  await page.getByText('正在读取 Skills 清单…', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '安装技能', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('heading', { name: '清单中没有匹配的技能落点' }).count(), 0);
  await release(page);
  await page.getByRole('heading', { name: '技能落点 · 3 / 3', exact: true }).waitFor();
  assert.equal(await page.getByText('加载：未知', { exact: true }).count(), 3);
  assert.equal(await page.getByText('加载：已加载', { exact: true }).count(), 0);
  await page.getByText('/fixture/unreadable：fixture permission warning', { exact: true }).waitFor();
  await keyboardChoose(page, '按客户端筛选技能', 'pi');
  await page.getByRole('heading', { name: '技能落点 · 1 / 3', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '同步 manual（pi/global）', exact: true }).isDisabled(), true);
  await tab(page, 'Skills').focus();
  await tab(page, 'Skills').press('ArrowRight');
  await page.getByRole('heading', { name: '规范角色 · 2 / 2', exact: true }).waitFor();
  await page.getByText('投影目标（不是本机安装证明）：claude', { exact: true }).first().waitFor();
  await page.getByText('smoke：.aios/agents/smoke/projected.json', { exact: true }).waitFor();
  await keyboardChoose(page, '按角色阶段筛选', '候选');
  await page.getByRole('heading', { name: '规范角色 · 1 / 2', exact: true }).waitFor();
  await page.getByText('工作流未启用', { exact: true }).waitFor();
  await page.getByText('证据：缺少证据', { exact: true }).waitFor();
  await tab(page, 'Subagents').focus();
  await tab(page, 'Subagents').press('ArrowLeft');
  await page.getByRole('heading', { name: '技能落点 · 1 / 3', exact: true }).waitFor();
  await tab(page, 'Skills').press('Home');
  await page.getByText('offline-mcp', { exact: true }).waitFor();
  await tab(page, 'MCP').press('End');
  await page.getByRole('heading', { name: '规范角色 · 1 / 2', exact: true }).waitFor();
  assert.equal(await getCount(page, 'skills'), 1);
  assert.equal(await getCount(page, 'agents'), 1);
  assert.deepEqual(await posts(page), []);
});

test('both inventories distinguish read failures, unsupported contracts, malformed data, retry, and genuine empty results', async t => {
  for (const [resource, label, inventory, listKey, emptyTitle] of [
    ['skills', 'Skills', skillInventory, 'skills', '清单中没有匹配的技能落点'],
    ['agents', 'Subagents', agentInventory, 'agents', '目录中没有匹配角色'],
  ]) await t.test(resource, async t => {
    const page = await offlinePage(t, { [resource]: { data: { ok: false, error: 'fixture permission denied' } } });
    await tab(page, label).click();
    await page.getByText(/读取失败：fixture permission denied/u).waitFor();
    assert.equal(await page.getByRole('heading', { name: emptyTitle, exact: true }).count(), 0);
    await setRead(page, resource, { data: { error: 'fixture unsupported' }, status: 501, raw: true });
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await page.getByText(/当前运行时不支持.+fixture unsupported/u).waitFor();
    await setRead(page, resource, { data: { ...inventory, [listKey]: null } });
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await page.getByText(/字段不完整，不能把读取异常当作空/u).waitFor();
    assert.equal(await page.getByRole('heading', { name: emptyTitle, exact: true }).count(), 0);
    await setRead(page, resource, { data: { ...inventory, [listKey]: [] } });
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await page.getByRole('heading', { name: emptyTitle, exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '重试', exact: true }).count(), 0);
    assert.equal(await getCount(page, resource), 4);
    assert.deepEqual(await posts(page), []);
  });
});

test('late inventory completion cannot overwrite a fresh mount after its signal was aborted', async t => {
  const page = await offlinePage(t, { skills: { data: skillInventory, hold: true } });
  await tab(page, 'Skills').click();
  await page.getByText('正在读取 Skills 清单…', { exact: true }).waitFor();
  await setRead(page, 'skills', { data: { ...skillInventory, skills: [] } });
  await page.evaluate(() => window.renderResources());
  await openSkills(page);
  await page.getByRole('heading', { name: '清单中没有匹配的技能落点', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.fixture.calls[0].aborted), true);
  await release(page);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByRole('heading', { name: '清单中没有匹配的技能落点', exact: true }).waitFor();
  assert.equal(await getCount(page, 'skills'), 2);
});

test('install, selected-row sync and remove require preview, explicit consent and the exact revision; ownership stays protected', async t => {
  const inventory = structuredClone(skillInventory);
  for (const ownership of ['linked', 'unverified', 'error']) inventory.skills.push({ ...inventory.skills[0], name: ownership, path: `/fixture/${ownership}`, ownership });
  const page = await offlinePage(t, { skills: { data: inventory } });
  await openSkills(page);
  for (const name of ['manual', 'edited', 'linked', 'error']) {
    const client = name === 'manual' ? 'pi' : 'claude';
    for (const action of ['同步', '移除']) assert.equal(await page.getByRole('button', { name: `${action} ${name}（${client}/global）`, exact: true }).isDisabled(), true);
  }
  assert.equal(await page.getByRole('button', { name: '同步 unverified（claude/global）', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: '安装技能', exact: true }).click();
  assert.equal(await previewButton(page).isDisabled(), true);
  assert.equal(await confirmation(page).count(), 0);
  await keyboardChoose(page, '已登记技能', 'hello（内置）');
  await choose(page, '安装范围', '当前工程');
  for (const client of ['claude', 'pi']) await dialog(page).getByRole('checkbox', { name: new RegExp(`^${client}`) }).check();
  const install = { resource: 'skills', action: 'install', name: 'hello', kind: 'builtin', scope: 'project', clients: ['claude', 'pi'] };
  await generate(page, install);
  const apply = dialog(page).getByRole('button', { name: '确认安装', exact: true });
  assert.equal(await apply.isDisabled(), true);
  assert.equal((await posts(page)).length, 1);
  assert.match(await section(page).innerText(), /共享此落点的客户端：claude、pi/u);
  await confirmation(page).check();
  await enqueue(page, { data: skillReport(install, false), hold: true });
  await apply.click();
  await page.waitForFunction(() => window.fixture.pending.length === 1);
  assert.equal(await dialog(page).getByRole('button', { name: '正在处理…', exact: true }).isDisabled(), true);
  assert.equal(await dialog(page).getByRole('button', { name: '关闭', exact: true }).isDisabled(), true);
  await dialog(page).getByRole('button', { name: '关闭弹窗', exact: true }).click();
  assert.equal(await dialog(page).isVisible(), true, 'in-flight writes cannot dismiss their result');
  await release(page);
  await section(page, false).waitFor();
  assert.ok((await section(page, false).innerText()).includes('备份：/fixture/backups/hello'));
  assert.equal(await confirmation(page).count(), 0);
  await waitGets(page, 'skills', 2);
  await dialog(page).getByRole('button', { name: '关闭', exact: true }).click();
  const expected = [{ ...install, dryRun: true }, { ...install, dryRun: false, confirm: true, expectedRevision: revision }];
  for (const [action, label] of [['sync', '同步'], ['remove', '移除']]) {
    const request = { resource: 'skills', action, name: 'hello', kind: 'builtin', scope: 'global', clients: ['claude'] };
    await page.getByRole('button', { name: `${label} hello（claude/global）`, exact: true }).click();
    assert.ok((await dialog(page).innerText()).includes('落点：/fixture/claude/skills/hello'));
    assert.equal(await dialog(page).getByRole('combobox').count(), 0, 'selected-row operations cannot silently broaden targets');
    await generate(page, request);
    await confirmation(page).check();
    await enqueue(page, { data: skillReport(request, false) });
    await dialog(page).getByRole('button', { name: `确认${label}`, exact: true }).click();
    await section(page, false).waitFor();
    assert.equal(await confirmation(page).count(), 0);
    expected.push({ ...request, dryRun: true }, { ...request, dryRun: false, confirm: true, expectedRevision: revision });
    await waitGets(page, 'skills', expected.length / 2 + 1);
    await dialog(page).getByRole('button', { name: '关闭', exact: true }).click();
  }
  assert.deepEqual(await posts(page), expected);
  assert.equal(await page.getByText('加载：未知', { exact: true }).count(), inventory.skills.length, 'a write cannot invent loaded evidence');
});

test('editing source, name, clients, scope or catalogue selection invalidates both preview and consent without a write', async t => {
  const inventory = structuredClone(skillInventory);
  inventory.available.push({ ...inventory.available[0], name: 'other' });
  const page = await offlinePage(t, { skills: { data: inventory } });
  await openSkills(page);
  await page.getByRole('button', { name: '安装技能', exact: true }).click();
  await choose(page, '技能来源', '新的外部来源');
  const name = dialog(page).getByRole('textbox', { name: '技能名称', exact: true });
  const source = dialog(page).getByRole('textbox', { name: '外部来源路径或 Git URL', exact: true });
  await name.fill('demo');
  await source.fill('--live');
  await dialog(page).getByRole('checkbox', { name: /^claude/u }).check();
  assert.equal(await previewButton(page).isDisabled(), true);
  await source.fill('/fixture/external');
  let request = { resource: 'skills', action: 'install', name: 'demo', kind: 'external', scope: 'global', clients: ['claude'], source: '/fixture/external' };
  async function invalidate(edit) {
    await generate(page, request);
    await confirmation(page).check();
    await edit();
    assert.equal(await section(page).count(), 0);
    assert.equal(await confirmation(page).count(), 0);
    assert.equal(await dialog(page).getByRole('button', { name: '确认安装', exact: true }).count(), 0);
  }
  await invalidate(() => name.fill('demo-next'));
  request = { ...request, name: 'demo-next' };
  await invalidate(() => source.fill('/fixture/next-source'));
  request = { ...request, source: '/fixture/next-source' };
  await invalidate(() => dialog(page).getByRole('checkbox', { name: /^pi/u }).check());
  request = { ...request, clients: ['claude', 'pi'] };
  await invalidate(() => choose(page, '安装范围', '当前工程'));
  assert.equal(await previewButton(page).isDisabled(), true, 'changing scope requires explicitly selecting clients again');
  await dialog(page).getByRole('checkbox', { name: /^pi/u }).check();
  request = { ...request, clients: ['pi'], scope: 'project' };
  await invalidate(() => choose(page, '技能来源', '内置目录 / 已登记外部技能'));
  await choose(page, '已登记技能', 'hello（内置）');
  await dialog(page).getByRole('checkbox', { name: /^claude/u }).check();
  request = { resource: 'skills', action: 'install', name: 'hello', kind: 'builtin', scope: 'project', clients: ['claude'] };
  await invalidate(() => choose(page, '已登记技能', 'other（内置）'));
  await dialog(page).getByRole('button', { name: '关闭', exact: true }).click();
  const requests = await posts(page);
  assert.equal(requests.length, 6);
  assert.ok(requests.every(request => request.dryRun === true && request.confirm === undefined && request.expectedRevision === undefined));
  assert.deepEqual(requests[4], { resource: 'skills', action: 'install', name: 'demo-next', kind: 'external', scope: 'project', clients: ['pi'], source: '/fixture/next-source', dryRun: true });
});

test('unsafe previews cannot enable apply, and stale or uncertain writes consume approval and refresh inventory', async t => {
  const page = await offlinePage(t);
  await openSkills(page);
  await page.getByRole('button', { name: '同步 hello（claude/global）', exact: true }).click();
  const request = { resource: 'skills', action: 'sync', name: 'hello', kind: 'builtin', scope: 'global', clients: ['claude'] };
  const good = skillReport(request);
  for (const patch of [
    { ok: false, error: 'fixture conflict', results: [{ ...good.results[0], status: 'conflict' }] },
    { revision: undefined },
    { results: [{ ...good.results[0], status: 'linked' }] },
  ]) {
    await generate(page, request, patch);
    assert.equal(await confirmation(page).count(), 0);
    assert.equal(await dialog(page).getByRole('button', { name: '确认同步', exact: true }).count(), 0);
  }
  for (const patch of [{ dryRun: false }, { results: [] }]) {
    await enqueue(page, { data: { ...good, ...patch } });
    await previewButton(page).click();
    await dialog(page).getByRole('alert').filter({ hasText: '模式不一致' }).waitFor();
    assert.equal(await section(page).count(), 0);
    assert.equal(await confirmation(page).count(), 0);
  }
  await generate(page, request);
  await confirmation(page).check();
  await enqueue(page, { data: { ok: false, error: 'preview-stale', results: [] } });
  await dialog(page).getByRole('button', { name: '确认同步', exact: true }).click();
  await dialog(page).getByRole('alert').filter({ hasText: '预览已过期' }).waitFor();
  assert.equal(await confirmation(page).count(), 0);
  await waitGets(page, 'skills', 2);
  const nextRevision = 'b'.repeat(64);
  await generate(page, request, { revision: nextRevision });
  await confirmation(page).check();
  await enqueue(page, { failure: 'fixture uncertain transport failure' });
  await dialog(page).getByRole('button', { name: '确认同步', exact: true }).click();
  await dialog(page).getByRole('alert').filter({ hasText: '请刷新清单并重新预览，勿重复提交旧预览' }).waitFor();
  assert.equal(await confirmation(page).count(), 0);
  assert.equal(await section(page).count(), 0);
  await waitGets(page, 'skills', 3);
  const writes = (await posts(page)).filter(request => request.dryRun === false);
  assert.deepEqual(writes.map(request => request.expectedRevision), [revision, nextRevision]);
  assert.ok(writes.every(request => request.confirm === true));
});

test('Subagents expose only local doctor, render blocked evidence as a real verdict, and recover from doctor failure', async t => {
  const page = await offlinePage(t);
  await tab(page, 'Subagents').click();
  await page.getByRole('heading', { name: '规范角色 · 2 / 2', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^(安装|编辑|删除|启动|运行 smoke|运行 probe)/u }).count(), 0);
  await enqueue(page, { data: agentInventory, hold: true });
  await page.getByRole('button', { name: '运行角色体检', exact: true }).click();
  await page.waitForFunction(() => window.fixture.pending.length === 1);
  assert.equal(await page.getByRole('button', { name: '正在体检…', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '刷新角色目录', exact: true }).isDisabled(), true);
  await release(page);
  await page.getByRole('status').filter({ hasText: '体检完成：1 个角色被阻止参与实时工作流' }).waitFor();
  await page.getByText('阻塞角色：candidate', { exact: true }).waitFor();
  assert.match(await page.locator('[aria-label="角色体检结果"]').innerText(), /candidate：missing smoke evidence/u);
  await enqueue(page, { status: 503, raw: true, data: { error: 'fixture doctor unavailable' } });
  await page.getByRole('button', { name: '运行角色体检', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'fixture doctor unavailable' }).waitFor();
  assert.equal(await page.locator('[aria-label="角色体检结果"]').count(), 0, 'a failed rerun cannot retain an apparently current report');
  assert.equal(await page.getByRole('button', { name: '运行角色体检', exact: true }).isEnabled(), true);
  assert.deepEqual(await posts(page), [{ resource: 'agents', action: 'doctor' }, { resource: 'agents', action: 'doctor' }]);
  assert.equal(await getCount(page, 'skills'), 0, 'doctor cannot depend on the unrelated skill inventory');
});
