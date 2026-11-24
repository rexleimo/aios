import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { browserRuntime, choose, noPageOverflow } from '../browser/gateway-fixture.mjs';
import { applyEdits, toEditable, toModelBindings, toModelCatalog, validateDocument } from '../../../../../apps/shell/ui/src/lib/config/model-routing.mjs';
import { toPolicyContext } from '../../../../../apps/shell/ui/src/lib/config/routing-policy.mjs';

const ui = path.resolve(import.meta.dirname, '../../../../../apps/shell/ui');
const rawId = ' Org/Case:% 模型 ';
const registry = () => ({
  providers: { fixture: { baseUrl: 'https://fixture.invalid/v1', authMode: 'none', protocols: ['openai-chat'], models: ['alpha', 'beta', rawId, 'paused'], extension: { keep: true } } },
  models: {
    alpha: { label: 'Alpha', protocols: ['openai-chat'] },
    beta: { label: 'Beta', protocols: ['openai-chat'] },
    [rawId]: { label: 'Raw model', protocols: ['openai-chat'], source: 'custom', provider: 'fixture', extension: { keep: true } },
    paused: { label: 'Paused', protocols: ['openai-chat'], enabled: false },
    unbound: { label: 'Unbound', protocols: ['openai-chat'] },
  },
  activeModel: 'alpha',
  roleDefaults: { implementer: { preferredModel: 'beta', extension: { target: 'not-a-reference' } } },
  routingRules: [{ taskType: 'implementer', primary: 'beta', fallback: ['missing/stale', 'alpha'], target: 'keep-metadata' }],
  routingGroups: {
    pool: { models: ['beta', 'alpha'], routing: 'smart', weights: { beta: 9 }, extension: { owner: 'fixture' } },
    opaque: { models: ['alpha', 'beta'], routing: 'weighted', weights: { alpha: 3 }, extension: { untouched: true } },
    empty: { models: [], routing: 'ordered' },
    paused: { models: ['paused'], routing: 'ordered' },
    disabled: { models: ['alpha'], routing: 'ordered', enabled: false },
  },
  intentRouting: { enabled: false, classifierModel: rawId, intents: [], rules: [{ modelId: 'missing:legacy', target: 'auto' }], extension: { keep: true } },
  extension: { model: 'auto', target: 'group:pool', keep: true },
});

async function assets() {
  const { build } = await import('esbuild');
  const require = createRequire(path.join(ui, 'package.json'));
  const { default: postcss } = await import(pathToFileURL(require.resolve('postcss')).href);
  const { default: tailwind } = await import(pathToFileURL(require.resolve('@tailwindcss/postcss')).href);
  const stylesheet = path.join(ui, 'src/app/globals.css');
  const [bundle, css] = await Promise.all([
    build({
      stdin: { contents: `import { createRoot } from 'react-dom/client';
        import { RoutingConfigPanel } from './src/components/console/model-routing/routing-config';
        import { useRoutingConfig } from './src/components/console/model-routing/use-routing-config';
        import { Button } from './src/components/console/console-ui';
        window.fetch = async (input, init = {}) => {
          const response = await window.configRequest(String(input), init);
          return new Response(JSON.stringify(response.body), { status: response.status, headers: { 'content-type': 'application/json' } });
        };
        function App() {
          const routing = useRoutingConfig();
          window.routing = routing;
          return <><RoutingConfigPanel routing={routing} /><footer className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-rex-border py-4">
            <p role="status">{routing.feedback?.text || routing.error || (routing.dirty ? '有未保存修改' : '草稿与磁盘一致')}</p>
            <Button disabled={!routing.dirty || routing.status !== 'ready'} onClick={() => void routing.save()}>保存全部修改</Button>
          </footer></>;
        }
        createRoot(document.getElementById('root')).render(<App />);`, resolveDir: ui, sourcefile: 'routing-groups-fixture.tsx', loader: 'tsx' },
      bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"test"' },
    }),
    postcss([tailwind({ base: ui })]).process(fs.readFileSync(stylesheet, 'utf8'), { from: stylesheet }),
  ]);
  return { js: bundle.outputFiles[0].text, css: css.css };
}

test('routing groups work offline through the real routing panel, shared hook and save controls', async t => {
  const runtime = await browserRuntime();
  if (!runtime) return t.skip('Chrome/Playwright is unavailable');
  const compiled = await assets();
  const browser = await runtime.chromium.launch({ executablePath: runtime.executablePath });
  t.after(() => browser.close());

  async function fixture(st, document = registry(), options = {}) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', ...options });
    page.setDefaultTimeout(10_000);
    let saved = structuredClone(document);
    let revision = 1;
    const writes = [];
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (['warning', 'error'].includes(message.type())) errors.push(message.text()); });
    await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
    await page.exposeFunction('configRequest', async (url, init) => {
      assert.equal(url, '/api/config/model-routing', 'no runtime or discovery APIs may be accessed');
      if (init.method === 'PUT') {
        const body = JSON.parse(init.body);
        assert.equal(body.expectedHash, `revision-${revision}`);
        const next = applyEdits(saved, body.editable);
        validateDocument(next, { previousDocument: saved });
        writes.push(body);
        saved = next;
        revision += 1;
        return { status: 200, body: { ok: true, hash: `revision-${revision}`, changed: ['routingGroups'], backup: null } };
      }
      assert.equal(init.method, undefined);
      return { status: 200, body: { hash: `revision-${revision}`, editable: toEditable(saved), models: toModelCatalog(saved), modelBindings: toModelBindings(saved), policyContext: toPolicyContext(saved) } };
    });
    st.after(async () => {
      await page.close();
      assert.deepEqual(requests, [], 'no network request may leave the offline fixture');
      assert.deepEqual(errors, [], 'real controls must not emit browser errors or React warnings');
    });
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div class="ml-[68px] min-w-0 md:ml-[212px]"><main id="root" class="mx-auto max-w-[1440px] px-4 py-7 lg:px-8 lg:py-9"></main></div>');
    await page.addStyleTag({ content: compiled.css });
    await page.addScriptTag({ content: compiled.js });
    await page.waitForFunction(() => window.routing?.status === 'ready');
    assert.equal(await page.evaluate(() => window.routing.dirty), false, 'legacy migration on load must not dirty the draft');
    return { page, writes, saved: () => structuredClone(saved), draft: () => page.evaluate(() => window.routing.editable) };
  }

  const task = (page, name) => page.getByRole('navigation', { name: '模型分配任务' }).getByRole('button', { name: name === '意图分流' ? /^意图分流/u : name, exact: name !== '意图分流' }).click();
  const groupRow = (page, id) => page.getByRole('listitem', { name: `模型组 ${id}`, exact: true });
  async function commit(page) {
    await page.getByRole('dialog').getByRole('button', { name: '加入草稿', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  }
  async function save(page) {
    await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
    await page.waitForFunction(() => window.routing.status === 'ready' && !window.routing.dirty && window.routing.feedback?.tone === 'ok');
  }
  async function assign(page, row, mode, option) {
    await row.getByRole('button', { name: '修改', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: mode, exact: true }).check();
    if (option) await choose(page, '指定模型', option);
    await commit(page);
  }

  await t.test('CRUD validates normalized IDs, keeps raw members, supports reorder and commits only at the bottom save', async st => {
    const initial = registry();
    const { page, draft, writes, saved } = await fixture(st, initial);
    await task(page, '模型组');
    await page.getByRole('button', { name: '新建模型组', exact: true }).click();
    const id = page.getByRole('textbox', { name: '模型组 ID', exact: true });
    assert.equal(await id.evaluate(element => element === document.activeElement), true);
    const idLabel = page.getByRole('dialog').getByText('模型组 ID', { exact: true });
    const labelBox = await idLabel.boundingBox();
    const inputBox = await id.boundingBox();
    assert.ok(labelBox && inputBox && inputBox.y - (labelBox.y + labelBox.height) >= 6,
      'the ID label keeps a visible gap above the input');
    assert.equal(await page.getByRole('button', { name: '加入草稿', exact: true }).isDisabled(), true);
    await id.fill(' POOL ');
    await page.getByText('模型组 ID 已存在。', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '加入草稿', exact: true }).isDisabled(), true);
    await id.fill(' NEW-POOL ');
    for (const model of ['Raw model', 'Alpha', 'Beta']) {
      await choose(page, '添加模型组成员', `fixture / ${model}`);
      await page.getByRole('button', { name: '添加成员', exact: true }).click();
    }
    await page.getByRole('button', { name: '下移成员 1', exact: true }).click();
    await page.getByRole('button', { name: '移除成员 1', exact: true }).click();
    await page.getByRole('button', { name: '下移成员 1', exact: true }).click();
    await page.getByRole('button', { name: '上移成员 2', exact: true }).click();
    await page.getByRole('combobox', { name: '添加模型组成员', exact: true }).click();
    assert.deepEqual(await page.getByRole('option').allTextContents(), ['选择具体模型', 'fixture / Alpha']);
    await page.keyboard.press('Escape');
    await commit(page);
    assert.deepEqual((await draft()).routingGroups.at(-1), { id: 'new-pool', models: [rawId, 'beta'], routing: 'ordered' });
    assert.deepEqual(writes, []);
    await groupRow(page, 'new-pool').getByRole('button', { name: '编辑', exact: true }).click();
    assert.equal(await id.getAttribute('readonly'), '');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '新建模型组', exact: true }).click();
    await id.fill(' scratch ');
    await commit(page);
    await groupRow(page, 'scratch').getByRole('button', { name: '删除', exact: true }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await groupRow(page, 'scratch').count(), 1);
    await groupRow(page, 'scratch').getByRole('button', { name: '删除', exact: true }).click();
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    assert.equal(await groupRow(page, 'scratch').count(), 0);
    assert.deepEqual(writes, []);
    await save(page);
    assert.equal(writes.length, 1);
    assert.deepEqual(saved().routingGroups['new-pool'], { models: [rawId, 'beta'], routing: 'ordered' });
    assert.deepEqual(saved().routingGroups.pool, initial.routingGroups.pool);
    assert.deepEqual(saved().routingGroups.opaque, initial.routingGroups.opaque);
    assert.deepEqual(saved().extension, initial.extension);
    assert.deepEqual(saved().models[rawId], initial.models[rawId]);
    assert.equal(saved().targetRefVersion, 1);
  });

  await t.test('rotate and usage groups are shown and editable as supported modes', async st => {
    const initial = registry();
    initial.routingGroups.rotating = { id: 'rotating', models: ['alpha'], routing: 'rotate' };
    initial.routingGroups.byUsage = { id: 'byUsage', models: ['alpha'], routing: 'usage' };
    const { page } = await fixture(st, initial);
    await task(page, '模型组');
    assert.match(await groupRow(page, 'rotating').innerText(), /轮询 rotate/u);
    assert.match(await groupRow(page, 'byUsage').innerText(), /最少使用 usage/u);
    await groupRow(page, 'rotating').getByRole('button', { name: '编辑', exact: true }).click();
    const mode = page.getByRole('dialog').getByRole('combobox', { name: '路由方式', exact: true });
    assert.match(await mode.innerText(), /轮询 rotate/u);
  });

  await t.test('unsupported modes and metadata survive edits until explicit conversion; enablement controls target eligibility', async st => {
    const initial = registry();
    const { page, draft, saved } = await fixture(st, initial);
    await task(page, '模型组');
    assert.match(await groupRow(page, 'pool').innerText(), /顺序（兼容旧 smart）/u);
    assert.match(await groupRow(page, 'opaque').innerText(), /不可新增分配/u);
    await groupRow(page, 'opaque').getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByRole('button', { name: '下移成员 1', exact: true }).click();
    await commit(page);
    await save(page);
    assert.deepEqual(saved().routingGroups.opaque, { ...initial.routingGroups.opaque, models: ['beta', 'alpha'] });
    await groupRow(page, 'opaque').getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByRole('button', { name: '改用顺序路由', exact: true }).click();
    await page.getByRole('checkbox', { name: '启用模型组', exact: true }).uncheck();
    await commit(page);
    assert.deepEqual(await page.evaluate(() => window.routing.targets.filter(target => target.source === 'group').map(target => target.id)), ['group:pool']);
    await groupRow(page, 'opaque').getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByRole('checkbox', { name: '启用模型组', exact: true }).check();
    await commit(page);
    assert.deepEqual(await page.evaluate(() => window.routing.targets.filter(target => target.source === 'group').map(target => target.id)), ['group:pool', 'group:opaque']);
    assert.equal((await draft()).routingGroups.find(group => group.id === 'opaque').routing, 'ordered');
    await save(page);
    assert.deepEqual(saved().routingGroups.opaque, { ...initial.routingGroups.opaque, models: ['beta', 'alpha'], routing: 'ordered', enabled: true });
  });

  await t.test('group and Auto assignments across defaults, clients and intents share one canonical save; classifiers stay raw concrete IDs', async st => {
    const initial = registry();
    const { page, draft, writes, saved } = await fixture(st, initial);
    const defaults = page.getByRole('list', { name: '全局默认分配', exact: true });
    await defaults.getByRole('listitem', { name: '普通对话分配', exact: true }).getByRole('button', { name: '修改', exact: true }).click();
    await page.getByRole('combobox', { name: '指定模型', exact: true }).click();
    assert.deepEqual(await page.getByRole('option').allTextContents(), ['请选择模型或模型组', 'fixture / Alpha', 'fixture / Beta', 'fixture / Raw model', '模型组 / pool']);
    await page.getByRole('option', { name: '模型组 / pool', exact: true }).click();
    await commit(page);
    await assign(page, defaults.getByRole('listitem', { name: '实现分配', exact: true }), '自动选择');
    assert.equal(await page.evaluate(() => window.routing.policyPreview('implementer').modelId), 'alpha');
    await task(page, '客户端例外');
    await page.getByRole('button', { name: '添加例外', exact: true }).click();
    await choose(page, '指定模型', '模型组 / pool');
    await commit(page);
    await page.getByRole('button', { name: '添加例外', exact: true }).click();
    await choose(page, '例外任务', '实现');
    await choose(page, '指定模型', '模型组 / pool');
    await commit(page);
    await task(page, '意图分流');
    await page.getByRole('switch', { name: '启用按意图路由' }).click();
    await page.getByRole('combobox', { name: '分类器模型', exact: true }).click();
    assert.deepEqual(await page.getByRole('option').allTextContents(), ['选择模型', 'fixture / Alpha', 'fixture / Beta', 'fixture / Raw model']);
    await page.getByRole('option', { name: 'fixture / Raw model', exact: true }).click();
    await page.getByRole('button', { name: '添加意图规则', exact: true }).click();
    await page.getByRole('textbox', { name: '意图 1 描述', exact: true }).fill('Use the ordered pool');
    await choose(page, '意图 1 模型', '模型组 / pool');
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '添加意图规则', exact: true }).click();
    await page.getByRole('textbox', { name: '意图 2 描述', exact: true }).fill('Use fallback rules');
    await choose(page, '意图 2 模型', '自动选择');
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const next = await draft();
    assert.equal(next.activeModel, 'group:pool');
    assert.equal(next.matrix.default.implementer, 'auto');
    assert.equal(next.clientDefaults.claude, 'group:pool');
    assert.equal(next.matrix.clients.claude.implementer, 'group:pool');
    assert.equal(next.intentRouting.classifierModel, rawId);
    assert.deepEqual(next.intentRouting.intents.map(intent => intent.modelId), ['group:pool', 'auto']);
    assert.deepEqual(writes, []);
    await save(page);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].editable, next);
    assert.equal(saved().targetRefVersion, 1);
    assert.deepEqual(saved().routingRules[0].fallback, ['model:missing%2Fstale', 'model:alpha']);
    assert.deepEqual(saved().intentRouting.rules, initial.intentRouting.rules, 'unknown intent rules remain exact metadata');
    assert.deepEqual(saved().routingGroups, initial.routingGroups);
    assert.deepEqual(saved().extension, initial.extension);
    assert.equal(saved().intentRouting.classifierModel, rawId);
    assert.deepEqual(saved().intentRouting.extension, initial.intentRouting.extension);
  });

  await t.test('deletion guards expose every schema reference and remove deleted-intent fallback blockers from the draft', async st => {
    const document = registry();
    Object.assign(document, {
      targetRefVersion: 1, activeModel: 'group:pool', clientDefaults: { codex: 'group:pool' },
      clientRoleMatrix: { default: { implementer: 'group:pool' }, clients: { codex: { implementer: 'group:pool' } } },
      envModels: { planner: 'group:pool' }, clientRoles: { codex: { planner: 'group:pool' } },
      roleDefaults: { implementer: { preferredModel: 'group:pool', fallback: ['group:pool'] }, legacy: 'group:pool' },
      routingRules: [{ taskType: 'implementer', primary: 'group:pool', fallback: ['group:pool'] }],
      intentRouting: { enabled: true, classifierModel: 'alpha', intents: [{ id: 'chat', description: 'Chat', modelId: 'group:pool', fallback: ['group:pool'] }], rules: [{ modelId: 'group:pool', fallback: ['group:pool'] }] },
    });
    const { page, writes } = await fixture(st, document);
    const expected = ['activeModel', 'clientDefaults.codex', 'clientRoleMatrix.default.implementer', 'clientRoleMatrix.clients.codex.implementer', 'envModels.planner', 'roleDefaults.implementer.preferredModel', 'roleDefaults.implementer.fallback[0]', 'routingRules[0].primary', 'routingRules[0].fallback[0]', 'intentRouting.intents[0].modelId', 'intentRouting.intents[0].fallback[0]'];
    await task(page, '模型组');
    await groupRow(page, 'pool').getByRole('button', { name: '删除', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '确认删除', exact: true }).isDisabled(), true);
    assert.deepEqual((await page.getByRole('dialog').getByRole('listitem').allTextContents()).sort(), expected.sort());
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await task(page, '意图分流');
    await page.getByRole('button', { name: '编辑意图 1', exact: true }).click();
    await page.getByRole('button', { name: '删除意图 1', exact: true }).click();
    await task(page, '模型组');
    await groupRow(page, 'pool').getByRole('button', { name: '删除', exact: true }).click();
    assert.deepEqual((await page.getByRole('dialog').getByRole('listitem').allTextContents()).sort(), expected.filter(reference => !reference.startsWith('intentRouting.intents[')).sort());
    assert.equal(await page.getByRole('button', { name: '确认删除', exact: true }).isDisabled(), true);
    assert.deepEqual(writes, []);
  });

  for (const targetRefVersion of [undefined, 1]) await t.test(`${targetRefVersion || 'legacy'} unknown metadata neither blocks group deletion nor changes during a real shared save`, async st => {
    const document = registry();
    if (targetRefVersion) document.targetRefVersion = targetRefVersion;
    document.clientRoles = { codex: { planner: 'group:pool', invalid: 'model:%GG' } };
    Object.assign(document.roleDefaults, { legacy: 'group:pool', list: ['group:pool', { preferredModel: 'model:%GG' }], flag: false, count: 7, empty: null });
    document.intentRouting.rules = [{ modelId: 'group:pool', fallback: ['model:%GG'], target: ' Group:Pool ' }];
    const { page, writes, saved } = await fixture(st, document);
    await task(page, '模型组');
    await groupRow(page, 'pool').getByRole('button', { name: '删除', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '确认删除', exact: true }).isDisabled(), false);
    assert.equal(await page.getByRole('dialog').getByRole('listitem').count(), 0);
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    assert.deepEqual(writes, []);
    await save(page);
    assert.equal(writes.length, 1);
    assert.equal(Object.hasOwn(saved().routingGroups, 'pool'), false);
    assert.deepEqual(saved().clientRoles, document.clientRoles);
    for (const key of ['legacy', 'list', 'flag', 'count', 'empty']) assert.deepEqual(saved().roleDefaults[key], document.roleDefaults[key]);
    assert.deepEqual(saved().intentRouting.rules, document.intentRouting.rules);
    assert.deepEqual(saved().extension, document.extension);
  });

  for (const width of [1440, 390]) for (const theme of ['light', 'dark']) for (const scale of [100, 200]) {
    await t.test(`${width}px ${theme} ${scale}% groups, pickers and modals remain within the viewport`, async st => {
      const document = registry();
      const id = `long-group-${'long-unbroken-name-'.repeat(5)}`;
      document.routingGroups[id] = { models: [rawId, 'alpha', 'beta'], routing: 'ordered' };
      document.models[rawId].label = 'A long descriptive concrete model label with significant raw ID bytes';
      const { page } = await fixture(st, document, { viewport: { width, height: 1000 } });
      await page.evaluate(([theme, scale]) => {
        document.documentElement.dataset.rexTheme = theme;
        document.documentElement.style.fontSize = `${scale}%`;
      }, [theme, scale]);
      for (const name of ['默认分配', '客户端例外', '意图分流', '模型组']) {
        await task(page, name);
        await noPageOverflow(page);
      }
      await groupRow(page, id).getByRole('button', { name: '编辑', exact: true }).click();
      await noPageOverflow(page);
      assert.equal(await page.getByRole('textbox', { name: '模型组 ID', exact: true }).evaluate(element => element === document.activeElement), true);
      await page.getByRole('combobox', { name: '添加模型组成员', exact: true }).click();
      await noPageOverflow(page);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await task(page, '默认分配');
      await page.getByRole('listitem', { name: '普通对话分配', exact: true }).getByRole('button', { name: '修改', exact: true }).click();
      await page.getByRole('radio', { name: '指定模型', exact: true }).check();
      await choose(page, '指定模型', `模型组 / ${id}`);
      await noPageOverflow(page);
      assert.deepEqual(await page.getByRole('dialog').getByRole('combobox').evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.getAttribute('aria-label'))), []);
      await page.keyboard.press('Escape');
      const artifacts = process.env.AIOS_GATEWAY_TEST_ARTIFACTS;
      if (artifacts) {
        fs.mkdirSync(artifacts, { recursive: true });
        await page.screenshot({ path: path.join(artifacts, `groups-${width}-${theme}-${scale}.png`), fullPage: true });
      }
      assert.equal(await page.evaluate(() => window.routing.dirty), false, 'modal cancellation must not emit shared draft changes');
    });
  }
});
