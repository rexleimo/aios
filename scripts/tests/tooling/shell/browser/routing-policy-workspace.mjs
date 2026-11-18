import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyEdits, migrateEditableTargets, validateDocument } from '../../../../../apps/shell/ui/src/lib/config/model-routing.mjs';
import { choose, noPageOverflow, visible } from './gateway-fixture.mjs';

export const assignmentRow = (page, task, client = '') => page.getByRole('listitem', { name: `${client ? `${client} ` : ''}${task}分配`, exact: true });

export async function policyTask(page, name) {
  await page.getByRole('navigation', { name: '模型分配任务' }).getByRole('button', { name, exact: true }).click();
}

export async function assign(page, task, option, client = '') {
  await policyTask(page, client ? '客户端例外' : '默认分配');
  if (client) {
    await choose(page, '选择例外客户端', client);
    if (await assignmentRow(page, task, client).count() === 0) {
      await page.getByRole('button', { name: '添加例外', exact: true }).click();
      await choose(page, '例外任务', task);
    } else await assignmentRow(page, task, client).getByRole('button', { name: '修改', exact: true }).click();
  } else await assignmentRow(page, task).getByRole('button', { name: '修改', exact: true }).click();
  const dialog = page.getByRole('dialog');
  if (option === 'inherit') await dialog.getByRole('radio', { name: '恢复继承', exact: true }).check();
  else if (option === 'auto') await dialog.getByRole('radio', { name: '自动选择', exact: true }).check();
  else {
    await dialog.getByRole('radio', { name: '指定模型', exact: true }).check();
    await choose(page, '指定模型', option);
  }
  await dialog.getByRole('button', { name: '加入草稿', exact: true }).click();
}

export async function runPolicyBrowserChecks(t, { fixture, baseUrl, chooseTheme }) {
  await t.test('policy tasks persist ordinary defaults, sparse client exceptions and optional intent honestly', async st => {
    const { page, state, saved } = await fixture(st);
    await page.goto(`${baseUrl}/routing/config?ws=browser-fixture`);
    await visible(page, page.getByRole('button', { name: '保存全部修改', exact: true }));
    await visible(page, page.getByRole('heading', { name: '模型分配', exact: true, level: 2 }));
    assert.equal(await page.getByRole('navigation', { name: '模型分配任务' }).count(), 1);
    assert.equal(await page.getByRole('navigation', { name: '网关工作区' }).getByRole('button', { name: /^模型分配/ }).getAttribute('aria-current'), 'page');
    const sidebar = page.getByRole('navigation', { name: '主导航' });
    assert.equal(await sidebar.getByRole('button', { name: '路由配置', exact: true }).count(), 0);
    assert.equal(await sidebar.getByRole('button', { name: '模型路由', exact: true }).getAttribute('aria-current'), 'page');
    assert.equal(await page.getByRole('list', { name: '全局默认分配' }).getByRole('combobox').count(), 0, 'default results are not permanent editors');
    await assign(page, '普通对话', /fixture \/ Beta/);
    assert.match(await assignmentRow(page, '普通对话').innerText(), /fixture \/ Beta/);
    assert.match(await assignmentRow(page, '普通对话').innerText(), /全局指定/);
    await assign(page, '实现', /fixture \/ Alpha/);
    await assign(page, '普通对话', /fixture \/ Alpha/, 'claude');
    assert.equal(await page.getByRole('list', { name: '客户端例外分配' }).getByRole('listitem').count(), 1);
    await assign(page, '实现', /fixture \/ Beta/, 'claude');
    assert.equal(await page.getByRole('list', { name: '客户端例外分配' }).getByRole('listitem').count(), 2);
    await assign(page, '普通对话', 'inherit', 'claude');
    assert.equal(await assignmentRow(page, '普通对话', 'claude').count(), 0);
    await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
    await visible(page, page.getByText('与已读取配置一致', { exact: true }));
    assert.equal(saved().targetRefVersion, 1);
    assert.equal(saved().activeModel, 'model:model-beta');
    assert.equal(saved().matrix.default.implementer, 'model:model-alpha');
    assert.equal(saved().matrix.clients.claude.implementer, 'model:model-beta');
    assert.equal(saved().clientDefaults.claude, undefined);
    await policyTask(page, '意图分流');
    assert.equal(await page.getByRole('combobox', { name: '分类器模型', exact: true }).count(), 0);
    await page.getByRole('switch', { name: '启用按意图路由' }).click();
    await visible(page, page.getByText('意图分类会额外增加分类器调用与费用。携带会话标识时，同一轮工具续轮复用已判断的意图，不重复分类。', { exact: true }));
    await choose(page, '分类器模型', /fixture \/ Alpha/);
    await page.getByRole('button', { name: '添加意图规则', exact: true }).click();
    await page.getByRole('textbox', { name: '意图 1 描述', exact: true }).fill('Short conversation');
    await choose(page, '意图 1 模型', /fixture \/ Beta/);
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const rules = page.getByRole('list', { name: '意图规则', exact: true });
    assert.equal(await rules.getByRole('textbox').count(), 0);
    assert.equal(await rules.getByRole('combobox').count(), 0);
    assert.match(await rules.innerText(), /Short conversation.*fixture \/ Beta/su);
    assert.equal(saved().intentRouting.enabled, false, 'collapsing a rule does not persist its draft');
    const writes = state.writes.length;
    await policyTask(page, '默认分配');
    await policyTask(page, '意图分流');
    assert.match(await rules.innerText(), /Short conversation.*fixture \/ Beta/su);
    assert.equal(state.writes.length, writes, 'task navigation only changes presentation');
    assert.equal(await page.getByRole('textbox', { name: '意图 1 id', exact: true }).count(), 0);
    await page.getByText('高级：内部意图 ID', { exact: true }).click();
    assert.notEqual(await page.getByRole('textbox', { name: '意图 1 id', exact: true }).inputValue(), '');
    await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
    await visible(page, page.getByText('与已读取配置一致', { exact: true }));
    assert.equal(saved().intentRouting.enabled, true);
    assert.equal(saved().intentRouting.classifierModel, 'model-alpha');
    assert.equal(saved().intentRouting.intents[0].modelId, 'model:model-beta');
    await page.getByRole('button', { name: '编辑意图 1', exact: true }).press('Space');
    assert.equal(await page.getByRole('textbox', { name: '意图 1 描述', exact: true }).inputValue(), 'Short conversation');
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('button', { name: '保存全部修改', exact: true }).isDisabled(), true, 'opening a saved rule is not a draft edit');
    assert.equal(state.writes.length, writes + 1, 'only unified save persists the rule');
    assert.equal(state.gatewayActions.length, 0);
    await noPageOverflow(page);
  });

  await t.test('fresh installation has no assigned models, injected options or enabled intent routing', async st => {
    const configuration = {
      models: [], policyContext: { roleDefaults: {}, routingRules: [] },
      editable: {
        providers: [], activeModel: '', clientDefaults: {}, customModels: [],
        matrix: { default: {}, clients: {} }, routingGroups: [],
        intentRouting: { enabled: false, classifierModel: '', intents: [] },
      },
    };
    const { page, state, saved } = await fixture(st, { empty: true, configuration });
    const modelReferences = /model-alpha|model-beta|Alpha|Beta|claude-sonnet|gpt-\d|gemini-\d|不可用引用|保留旧引用/u;
    const read = page.waitForResponse(response => new URL(response.url()).pathname === '/api/config/model-routing' && response.request().method() === 'GET');
    await page.goto(`${baseUrl}/routing?section=policy`);
    const snapshot = await (await read).json();
    assert.deepEqual(snapshot.editable, configuration.editable, 'empty overrides must not merge in fixture defaults');
    assert.deepEqual(snapshot.models, []);
    assert.deepEqual(snapshot.modelBindings, []);
    assert.deepEqual(snapshot.policyContext, configuration.policyContext);
    assert.ok(snapshot.auto.every(role => role.autoModelId === '' && role.effectiveModelId === ''));
    await visible(page, page.getByRole('heading', { name: '尚无可路由模型', exact: true }));
    assert.match(await assignmentRow(page, '普通对话').innerText(), /未配置默认路由/u);
    assert.match(await assignmentRow(page, '实现').innerText(), /未配置默认路由/u);
    assert.doesNotMatch(await page.locator('main').innerText(), modelReferences);
    assert.equal(await page.locator('main').getByRole('combobox').count(), 0);
    assert.equal(await page.getByRole('option').count(), 0);
    for (const button of await page.getByRole('list', { name: '全局默认分配' }).getByRole('button', { name: '修改', exact: true }).all()) {
      assert.equal(await button.isDisabled(), true);
    }
    await policyTask(page, '客户端例外');
    await visible(page, page.getByRole('heading', { name: '全部继承', exact: true }));
    assert.equal(await page.getByRole('button', { name: '添加例外', exact: true }).isDisabled(), true);
    assert.doesNotMatch(await page.locator('main').innerText(), modelReferences);
    await policyTask(page, '意图分流');
    const toggle = page.getByRole('switch', { name: '启用按意图路由' });
    assert.equal(await toggle.getAttribute('aria-checked'), 'false');
    assert.equal(await toggle.isDisabled(), true);
    assert.equal(await page.locator('main').getByRole('combobox').count(), 0);
    assert.equal(await page.getByRole('option').count(), 0);
    assert.equal(await page.getByRole('textbox').count(), 0);
    assert.doesNotMatch(await page.locator('main').innerText(), modelReferences);
    assert.equal(await page.getByRole('button', { name: '保存全部修改', exact: true }).isDisabled(), true);
    assert.deepEqual(saved(), configuration.editable);
    assert.equal(state.writes.length, 0, 'reading and navigating an empty installation must not write configuration');
    assert.equal(state.gatewayActions.length, 0);
    await noPageOverflow(page);
  });

  for (const count of [0, 1]) {
    await t.test(`disabled invalid intent with ${count} bound models clears only on confirmation and unified save`, async st => {
      const models = count ? [{ id: 'model-alpha', label: 'Alpha', protocols: ['openai-chat'], provider: 'fixture', source: 'curated', cost: 'low' }] : [];
      const providers = [{ id: 'fixture', baseUrl: 'https://example.invalid/v1', apiKeyEnv: 'env:FIXTURE_KEY', protocols: ['openai-chat'], models: models.map(model => model.id) }];
      const intentRouting = { enabled: false, classifierModel: 'gone', intents: [{ id: 'code', description: 'Code', modelId: 'gone' }] };
      const document = {
        providers: { fixture: providers[0] }, models: Object.fromEntries(models.map(model => [model.id, model])), intentRouting,
      };
      assert.throws(() => validateDocument(document), { name: 'ConfigError', message: /intentRouting.*"gone"/u });
      const { page, state, saved } = await fixture(st, { viewport: { width: 390, height: 640 }, reducedMotion: 'reduce', configuration: {
        models, policyContext: { roleDefaults: {}, routingRules: [] }, editable: { providers, intentRouting },
      } });
      const initial = saved();
      await page.goto(`${baseUrl}/routing?section=policy`);
      await policyTask(page, '意图分流');
      const toggle = page.getByRole('switch', { name: '启用按意图路由' });
      assert.equal(await toggle.isDisabled(), true);
      assert.equal(await toggle.getAttribute('aria-checked'), 'false');
      const clear = page.getByRole('button', { name: '清空意图设置', exact: true });
      await clear.press('Enter');
      const dialog = page.getByRole('dialog', { name: '清空意图设置？', exact: true });
      await dialog.waitFor();
      const artifacts = process.env.AIOS_GATEWAY_TEST_ARTIFACTS;
      if (artifacts) {
        fs.mkdirSync(artifacts, { recursive: true });
        await page.screenshot({ path: path.join(artifacts, `intent-clear-${count}-models-390.png`) });
      }
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await page.waitForFunction(element => element === document.activeElement, await clear.elementHandle());
      assert.equal(await clear.evaluate(element => element === document.activeElement), true);
      assert.equal(await page.getByRole('button', { name: '保存全部修改', exact: true }).isDisabled(), true);
      assert.deepEqual(saved(), initial);
      assert.equal(state.writes.length, 0);
      if (count) await assign(page, '实现', /fixture \/ Alpha/u);
      await policyTask(page, '意图分流');
      await clear.press('Enter');
      await dialog.getByRole('button', { name: '确认清空', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await clear.count(), 0);
      assert.equal(await toggle.getAttribute('aria-checked'), 'false');
      assert.deepEqual(saved(), initial, 'confirmation only changes the shared draft, not saved configuration');
      assert.equal(state.writes.length, 0);
      await policyTask(page, '默认分配');
      if (count) assert.match(await assignmentRow(page, '实现').innerText(), /fixture \/ Alpha/u);
      await policyTask(page, '意图分流');
      assert.equal(await clear.count(), 0, 'explicit repair survives task navigation');
      await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
      await visible(page, page.getByText('与已读取配置一致', { exact: true }));
      assert.deepEqual(saved(), {
        ...migrateEditableTargets(initial), intentRouting: { enabled: false, classifierModel: '', intents: [] },
        matrix: { default: count ? { implementer: 'model:model-alpha' } : {}, clients: {} },
      });
      assert.equal(state.writes.length, 1);
      assert.deepEqual(state.writes[0].editable, saved());
      assert.doesNotThrow(() => validateDocument(applyEdits(document, saved())));
      assert.equal(state.gatewayActions.length, 0);
      await noPageOverflow(page);
    });
  }

  await t.test('bound assignments cancel without mutation; targeted and client-wide inheritance preserve unrelated assignments', async st => {
    const { page, state, saved } = await fixture(st, { configuration: { editable: {
      activeModel: 'model-beta', clientDefaults: { claude: 'model-alpha', codex: 'model-beta' },
      matrix: {
        default: { implementer: 'model-beta', reviewer: 'model-alpha' },
        clients: { claude: { implementer: 'model-beta', reviewer: 'model-beta' }, codex: { reviewer: 'model-alpha' } },
      },
    } } });
    const initial = saved();
    await page.goto(`${baseUrl}/routing?section=policy`);
    await visible(page, assignmentRow(page, '实现'));
    assert.match(await assignmentRow(page, '普通对话').innerText(), /fixture \/ Beta/u);
    assert.match(await assignmentRow(page, '实现').innerText(), /fixture \/ Beta/u);
    await assignmentRow(page, '实现').getByRole('button', { name: '修改', exact: true }).click();
    const dialog = page.getByRole('dialog');
    assert.match(await dialog.getByRole('combobox', { name: '指定模型', exact: true }).innerText(), /fixture \/ Beta/u);
    await choose(page, '指定模型', /fixture \/ Alpha/);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    assert.match(await assignmentRow(page, '实现').innerText(), /fixture \/ Beta/u);
    assert.equal(await page.getByRole('button', { name: '保存全部修改', exact: true }).isDisabled(), true);
    assert.deepEqual(saved(), initial);
    assert.equal(state.writes.length, 0);
    await assign(page, '实现', 'inherit');
    assert.match(await assignmentRow(page, '实现').innerText(), /fixture \/ Alpha/u);
    assert.match(await assignmentRow(page, '实现').innerText(), /角色默认/u);
    assert.match(await assignmentRow(page, '普通对话').innerText(), /fixture \/ Beta/u);
    assert.match(await assignmentRow(page, '审查').innerText(), /fixture \/ Alpha/u);
    await assign(page, '实现', 'inherit', 'claude');
    assert.equal(await assignmentRow(page, '实现', 'claude').count(), 0);
    assert.match(await assignmentRow(page, '普通对话', 'claude').innerText(), /fixture \/ Alpha/u);
    assert.match(await assignmentRow(page, '审查', 'claude').innerText(), /fixture \/ Beta/u);
    await policyTask(page, '客户端例外');
    await page.getByRole('button', { name: '恢复此客户端全部继承', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await page.getByRole('list', { name: '客户端例外分配' }).getByRole('listitem').count(), 2);
    assert.match(await assignmentRow(page, '普通对话', 'claude').innerText(), /fixture \/ Alpha/u);
    assert.match(await assignmentRow(page, '审查', 'claude').innerText(), /fixture \/ Beta/u);
    await page.getByRole('button', { name: '恢复此客户端全部继承', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认恢复继承', exact: true }).click();
    await visible(page, page.getByRole('heading', { name: '全部继承', exact: true }));
    await choose(page, '选择例外客户端', 'codex');
    assert.match(await assignmentRow(page, '普通对话', 'codex').innerText(), /fixture \/ Beta/u);
    assert.match(await assignmentRow(page, '审查', 'codex').innerText(), /fixture \/ Alpha/u);
    assert.deepEqual(saved(), initial, 'inheritance only changes the draft before explicit save');
    assert.equal(state.writes.length, 0);
    await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
    await visible(page, page.getByText('与已读取配置一致', { exact: true }));
    assert.deepEqual(saved(), {
      ...migrateEditableTargets(initial),
      clientDefaults: { codex: 'model:model-beta' },
      matrix: { default: { reviewer: 'model:model-alpha' }, clients: { codex: { reviewer: 'model:model-alpha' } } },
    });
    assert.equal(state.writes.length, 1);
  });

  for (const [name, policyContext, source] of [
    ['empty-role preference', { roleDefaults: { '': { preferredModel: 'model-beta' } }, routingRules: [] }, '角色默认'],
    ['empty-task primary', { roleDefaults: {}, routingRules: [{ taskType: '', primary: 'model-beta', fallback: ['model-alpha'] }] }, '任务规则'],
  ]) {
    await t.test(`ordinary conversation retains legacy ${name} before scalar defaults`, async st => {
      const { page, state } = await fixture(st, { configuration: { policyContext, editable: {
        activeModel: 'model-alpha', clientDefaults: { claude: 'model-alpha' },
      } } });
      await page.goto(`${baseUrl}/routing?section=policy`);
      await visible(page, assignmentRow(page, '普通对话'));
      assert.match(await assignmentRow(page, '普通对话').innerText(), /fixture \/ Beta/u);
      assert.ok((await assignmentRow(page, '普通对话').innerText()).includes(source));
      await policyTask(page, '客户端例外');
      assert.match(await assignmentRow(page, '普通对话', 'claude').innerText(), /fixture \/ Beta/u);
      await assignmentRow(page, '普通对话', 'claude').getByRole('button', { name: '修改', exact: true }).click();
      await page.getByRole('radio', { name: '恢复继承', exact: true }).check();
      assert.match(await page.getByRole('dialog').innerText(), /fixture \/ Beta/u);
      await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
      assert.equal(state.writes.length, 0);
      assert.equal(await page.getByRole('button', { name: '保存全部修改', exact: true }).isDisabled(), true);
    });
  }

  for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'light'], [390, 'dark']]) {
    await t.test(`policy tasks and keyboard editor fit ${width}px ${theme}, reduced motion and 200% text`, async st => {
      const { page, state } = await fixture(st, { viewport: { width, height: 640 }, reducedMotion: 'reduce', configuration: { editable: {
        activeModel: 'model-alpha', clientDefaults: { claude: 'model-alpha' },
        matrix: { default: { implementer: 'model-beta' }, clients: { claude: { reviewer: 'model-beta' } } },
        intentRouting: { enabled: true, classifierModel: 'model-alpha', intents: [{ id: 'quick', description: 'Short questions and ordinary conversation', modelId: 'model-beta' }] },
        routingGroups: [{ id: 'legacy-review', models: ['model-alpha', 'model-beta'], routing: 'weight' }],
      } } });
      await page.goto(`${baseUrl}/routing?section=policy`);
      await chooseTheme(page, theme);
      const artifacts = process.env.AIOS_GATEWAY_TEST_ARTIFACTS;
      if (artifacts) fs.mkdirSync(artifacts, { recursive: true });
      for (const name of ['默认分配', '客户端例外', '意图分流', '模型组']) {
        await policyTask(page, name);
        await noPageOverflow(page);
        if (artifacts) await page.screenshot({ path: path.join(artifacts, `policy-${width}-${theme}-${['默认分配', '客户端例外', '意图分流', '模型组'].indexOf(name)}.png`), fullPage: true });
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        await noPageOverflow(page);
        await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
      }
      await policyTask(page, '默认分配');
      const edit = assignmentRow(page, '实现').getByRole('button', { name: '修改', exact: true });
      await edit.press('Enter');
      const dialog = page.getByRole('dialog');
      const box = await dialog.boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= 641);
      await dialog.getByRole('radio', { name: '指定模型', exact: true }).check();
      await choose(page, '指定模型', /fixture \/ Alpha/);
      await dialog.getByRole('button', { name: '加入草稿', exact: true }).press('Enter');
      await dialog.waitFor({ state: 'hidden' });
      await page.waitForFunction(element => element === document.activeElement, await edit.elementHandle());
      assert.equal(await edit.evaluate(element => element === document.activeElement), true, 'editor must restore focus to the result-row action');
      assert.match(await assignmentRow(page, '实现').innerText(), /fixture \/ Alpha/u);
      await visible(page, page.getByText(/修改摘要/));
      if (artifacts) await page.screenshot({ path: path.join(artifacts, `policy-${width}-${theme}-dirty.png`) });
      await noPageOverflow(page);
      assert.equal(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), 0);
      assert.equal(state.writes.length, 0);
    });
  }
}
