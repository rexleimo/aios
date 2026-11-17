import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { choose, noPageOverflow, visible } from './gateway-fixture.mjs';
import { assignmentRow } from './routing-policy-workspace.mjs';

const configuration = {
  models: [
    { id: 'alpha', label: 'Shared name', provider: 'cloud', protocols: ['openai-chat'], source: 'discovered' },
    { id: 'beta', label: 'Shared name', provider: 'local', protocols: ['claude'], source: 'discovered', enabled: false },
  ],
  editable: {
    providers: [
      { id: 'cloud', baseUrl: 'https://cloud.invalid/v1', apiKeyEnv: 'env:CLOUD_KEY', protocols: ['openai-chat'], models: [] },
      { id: 'local', baseUrl: 'http://127.0.0.1:11434', apiKeyEnv: '', authMode: 'none', endpointStyle: 'standard', protocols: ['claude'], models: [] },
      { id: 'empty', baseUrl: 'http://127.0.0.1:11435', apiKeyEnv: '', authMode: 'none', protocols: ['claude'], models: [], enabled: false },
    ],
    customModels: [
      { id: 'custom-cloud', label: 'Cloud custom', upstreamModel: 'Org/Cloud', provider: 'cloud', protocols: ['openai-chat'] },
      { id: 'legacy', label: 'Legacy unbound', provider: '', protocols: ['claude'] },
    ],
  },
};

async function selectProvider(page, id, width) {
  if (width < 1024) await choose(page, '选择供应商', new RegExp(`^${id} ·`));
  else await page.getByRole('navigation', { name: '供应商列表' }).getByRole('button', { name: `选择供应商 ${id}`, exact: true }).click();
}

export async function runModelSourceBrowserChecks(t, { fixture, baseUrl, chooseTheme }) {
  for (const [width, theme, reducedMotion] of [[1440, 'light', 'no-preference'], [390, 'dark', 'reduce'], [1440, 'dark', 'reduce'], [390, 'light', 'no-preference']]) {
    await t.test(`provider-owned model collections at ${width}px ${theme}`, async st => {
      const { page, state, saved } = await fixture(st, { configuration, viewport: { width, height: 1000 }, reducedMotion });
      await page.goto(`${baseUrl}/routing?section=providers`);
      await chooseTheme(page, theme);
      const children = () => page.getByRole('list', { name: / 模型$/ });
      await visible(page, page.getByRole('list', { name: 'cloud 模型', exact: true }));
      assert.equal(await children().getByRole('listitem').count(), 2);
      assert.equal(await page.getByText('Legacy unbound', { exact: true }).isVisible(), false);
      assert.equal(await page.getByRole('listitem').filter({ hasText: 'Cloud custom' }).count(), 1);

      await page.getByRole('textbox', { name: '搜索模型目录' }).fill('Cloud custom');
      assert.equal(await children().getByRole('listitem').count(), 1);
      await selectProvider(page, 'local', width);

      await page.getByRole('navigation', { name: '网关工作区' }).getByRole('button', { name: /模型分配/ }).click();
      await assignmentRow(page, '实现').getByRole('button', { name: '修改', exact: true }).click();
      await page.getByRole('dialog').getByRole('radio', { name: '指定模型', exact: true }).check();
      await page.getByRole('combobox', { name: '指定模型', exact: true }).click();
      assert.doesNotMatch(await page.getByRole('listbox').innerText(), /beta|Legacy unbound/u, 'management-only definitions cannot enter strategy pickers');
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').count(), 1, 'first Escape dismisses only the model list');
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'detached' });
      assert.notEqual(await page.evaluate(() => document.body.style.pointerEvents), 'none', 'closing nested model selection must release the page');
      await page.getByRole('navigation', { name: '网关工作区' }).getByRole('button', { name: /供应商与模型/ }).click();
      assert.equal(await page.getByRole('textbox', { name: '搜索模型目录' }).inputValue(), '');
      await visible(page, page.getByRole('list', { name: 'local 模型', exact: true }));
      assert.equal(await children().getByRole('listitem').count(), 1);
      assert.match(await children().innerText(), /已停用/u);
      assert.doesNotMatch(await children().innerText(), /Cloud custom/u);
      await choose(page, '筛选模型来源', '自定义');
      await visible(page, page.getByRole('heading', { name: '没有符合条件的模型', exact: true }));
      await selectProvider(page, 'cloud', width);
      assert.equal(await children().getByRole('listitem').count(), 2, 'switching parent resets source filters');
      await selectProvider(page, 'local', width);

      const artifacts = process.env.AIOS_GATEWAY_TEST_ARTIFACTS;
      if (artifacts) {
        fs.mkdirSync(artifacts, { recursive: true });
        await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
        await page.screenshot({ path: path.join(artifacts, `provider-children-${width}-${theme}.png`), fullPage: true });
        await children().scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(artifacts, `provider-children-${width}-${theme}-viewport.png`) });
      }
      await noPageOverflow(page);
      const horizontal = await children().evaluate(node => ({ content: node.scrollWidth, width: node.clientWidth }));
      assert.ok(horizontal.content <= horizontal.width + 1, 'child models must not rely on horizontal scrolling');

      await page.getByRole('button', { name: '手动添加', exact: true }).click();
      const dialog = page.getByRole('dialog');
      assert.equal(await dialog.getByRole('textbox', { name: '所属供应商', exact: true }).inputValue(), 'local');
      assert.equal(await dialog.getByRole('textbox', { name: '所属供应商', exact: true }).isDisabled(), true);
      await dialog.getByRole('textbox', { name: '真实上游模型 ID', exact: true }).fill('Org/Exact-Case');
      await dialog.getByRole('button', { name: '加入草稿', exact: true }).click();
      assert.equal(await children().getByRole('listitem').count(), 2);
      assert.equal(state.writes.length, 0);
      assert.equal(state.refreshes, 0);
      assert.equal(await page.getByRole('button', { name: '刷新模型目录', exact: true }).isDisabled(), true);

      await page.getByRole('button', { name: '移除供应商 local', exact: true }).click();
      await dialog.getByRole('button', { name: '确认移除', exact: true }).click();
      await visible(page, page.getByText(/仍被模型引用/));
      assert.equal(await children().getByRole('listitem').count(), 2);

      await selectProvider(page, '待绑定模型', width);
      await visible(page, page.getByText('Legacy unbound', { exact: true }));
      assert.equal(await page.getByRole('button', { name: '手动添加', exact: true }).count(), 0);
      await page.getByRole('button', { name: '编辑模型 legacy', exact: true }).click();
      await dialog.getByRole('textbox', { name: '真实上游模型 ID', exact: true }).fill('Legacy/Model');
      await choose(page, '模型供应商', 'local');
      await dialog.getByRole('button', { name: '加入草稿', exact: true }).click();
      await visible(page, page.getByRole('list', { name: 'local 模型', exact: true }));
      assert.equal(await children().getByRole('listitem').count(), 3);

      await selectProvider(page, 'empty', width);
      await visible(page, page.getByRole('heading', { name: '这个供应商还没有模型', exact: true }));
      await page.getByRole('button', { name: '移除供应商 empty', exact: true }).click();
      await dialog.getByRole('button', { name: '确认移除', exact: true }).click();
      await visible(page, page.getByRole('list', { name: 'cloud 模型', exact: true }));
      await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
      await visible(page, page.getByText('与已读取配置一致', { exact: true }));
      const model = saved().customModels.find(item => item.upstreamModel === 'Org/Exact-Case');
      assert.equal(model.provider, 'local');
      assert.deepEqual(model.protocols, ['claude'], 'the initial protocol must match the selected parent');
      assert.equal(saved().customModels.find(item => item.id === 'legacy').provider, 'local');
      assert.equal(saved().providers.some(item => item.id === 'empty'), false);
      assert.equal(state.refreshes, 0);
      await noPageOverflow(page);
      if (reducedMotion === 'reduce') assert.equal(await page.evaluate(() => document.getAnimations().filter(item => item.playState === 'running').length), 0);
    });
  }

  for (const width of [1440, 390]) {
    await t.test(`provider editors keep short-screen keyboard actions and focus at ${width}px`, async st => {
      const { page, state } = await fixture(st, { configuration, viewport: { width, height: 640 }, reducedMotion: 'reduce' });
      await page.goto(`${baseUrl}/routing?section=providers`);
      await chooseTheme(page, width === 390 ? 'dark' : 'light');
      const add = page.getByRole('button', { name: '添加供应商', exact: true });
      await add.focus();
      await add.press('Enter');
      const dialog = page.getByRole('dialog');
      await visible(page, dialog);
      assert.equal(await dialog.getByRole('textbox', { name: '供应商标识', exact: true }).evaluate(node => node === document.activeElement), true);
      await dialog.getByRole('textbox', { name: '供应商标识', exact: true }).fill('keyboard-provider');
      await dialog.getByRole('textbox', { name: 'API 端点', exact: true }).fill('http://127.0.0.1:11435/v1');
      for (const name of ['取消', '加入草稿']) {
        const button = dialog.getByRole('button', { name, exact: true });
        const box = await button.boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= 641, `${name} stays in the short viewport`);
        await button.click({ trial: true });
      }
      const summary = dialog.getByText('多账号与重试 · 可选', { exact: true });
      await summary.focus();
      await summary.press('Enter');
      await dialog.getByRole('button', { name: '添加账号', exact: true }).press('Enter');
      await dialog.getByRole('button', { name: '账号 1 密钥来源：环境变量引用', exact: true }).click();
      await dialog.getByRole('textbox', { name: '账号 1 密钥环境变量引用', exact: true }).fill('env:KEYBOARD_KEY');
      const focusedBox = await dialog.getByRole('textbox', { name: '账号 1 密钥环境变量引用', exact: true }).boundingBox();
      const footerBox = await dialog.getByRole('button', { name: '加入草稿', exact: true }).locator('..').boundingBox();
      assert.ok(focusedBox && footerBox && focusedBox.y + focusedBox.height <= footerBox.y, 'the sticky actions must not cover the focused field');
      const artifacts = process.env.AIOS_GATEWAY_TEST_ARTIFACTS;
      if (artifacts) await page.screenshot({ path: path.join(artifacts, `provider-editor-${width}x640.png`) });
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      await page.waitForFunction(node => node === document.activeElement, await add.elementHandle());
      assert.equal(await add.evaluate(node => node === document.activeElement), true, 'cancel restores the opener');
      assert.equal(state.writes.length, 0);

      await selectProvider(page, 'local', width);
      const manual = page.getByRole('button', { name: '手动添加', exact: true });
      await manual.focus();
      await manual.press('Enter');
      const upstream = dialog.getByRole('textbox', { name: '真实上游模型 ID', exact: true });
      assert.equal(await upstream.evaluate(node => node === document.activeElement), true);
      await upstream.fill('Keyboard/Model');
      await dialog.getByRole('button', { name: '加入草稿', exact: true }).focus();
      await page.keyboard.press('Tab');
      assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, 'tab is trapped in the editor');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      await page.waitForFunction(node => node === document.activeElement, await manual.elementHandle());
      assert.equal(await manual.evaluate(node => node === document.activeElement), true);
      assert.equal(state.writes.length, 0);
      await noPageOverflow(page);
    });
  }

  await t.test('ambiguous legacy provider declarations cannot bypass removal protection', async st => {
    const legacy = { ...configuration, editable: {
      ...configuration.editable,
      providers: configuration.editable.providers.map(provider => ({ ...provider, models: ['legacy'] })),
      customModels: [{ id: 'legacy', label: 'Legacy unbound', provider: '', protocols: ['claude'] }],
    } };
    const { page, state } = await fixture(st, { configuration: legacy });
    await page.goto(`${baseUrl}/routing?section=providers`);
    await selectProvider(page, 'empty', 1440);
    await page.getByRole('button', { name: '移除供应商 empty', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认移除', exact: true }).click();
    await visible(page, page.getByText(/仍被模型引用/));
    await visible(page, page.getByRole('navigation', { name: '供应商列表' }).getByRole('button', { name: '选择供应商 empty', exact: true }));
    assert.equal(state.writes.length, 0);
    assert.equal(await page.getByRole('button', { name: '保存全部修改', exact: true }).isDisabled(), true);
  });

  for (const width of [1440, 390]) {
    await t.test(`independent API presets and auth share the safe draft boundary at ${width}px`, async st => {
      const { page, state, saved } = await fixture(st, { configuration, viewport: { width, height: 640 }, reducedMotion: 'reduce' });
      await page.goto(`${baseUrl}/routing?section=providers`);
      await chooseTheme(page, width === 390 ? 'dark' : 'light');
      await page.getByRole('button', { name: '添加供应商', exact: true }).click();
      const dialog = page.getByRole('dialog');
      const field = name => dialog.getByRole('textbox', { name, exact: true });
      await choose(page, '供应商预设', '智谱 GLM');
      await choose(page, '地区或套餐', 'Coding Plan');
      assert.equal(await field('API 端点').inputValue(), 'https://open.bigmodel.cn/api/coding/paas/v4');
      await dialog.getByRole('button', { name: 'API 密钥来源：环境变量引用', exact: true }).click();
      await field('密钥环境变量引用').fill('env:FIXTURE_CHANNEL');
      await dialog.getByText('其他 API 地址', { exact: true }).click();
      await field('Anthropic Messages 地址').fill('https://messages.invalid/api/anthropic');
      await choose(page, 'Anthropic 密钥请求头', 'Authorization: Bearer');
      await dialog.getByText('自定义请求头', { exact: true }).click();
      await dialog.getByRole('button', { name: '添加请求头', exact: true }).click();
      await field('请求头 1 名称').fill('x-tenant-id');
      await field('请求头 1 值').fill('fixture-tenant');
      await dialog.getByRole('button', { name: '加入草稿', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      assert.equal(state.writes.length, 0);
      assert.equal(state.refreshes, 0);
      assert.equal(await page.getByRole('button', { name: '刷新模型目录', exact: true }).isDisabled(), true);
      await page.getByRole('navigation', { name: '网关工作区' }).getByRole('button', { name: /模型分配/ }).click();
      await page.getByRole('navigation', { name: '网关工作区' }).getByRole('button', { name: /供应商与模型/ }).click();
      await page.getByRole('button', { name: '编辑供应商 zhipu', exact: true }).click();
      assert.equal(await field('API 端点').inputValue(), 'https://open.bigmodel.cn/api/coding/paas/v4');
      await dialog.getByText('其他 API 地址', { exact: true }).click();
      await field('Anthropic Messages 地址').fill('https://changed.invalid/anthropic');
      const confirmation = dialog.getByRole('checkbox', { name: '我确认这些账号密钥可以用于新的 API 端点', exact: true });
      await confirmation.check();
      await field('OpenAI Responses 地址').fill('https://responses.invalid/tenant/v1');
      assert.equal(await confirmation.isChecked(), false, 'another API destination resets consent');
      await confirmation.check();
      await field('请求头 1 值').fill('env:FIXTURE_TENANT');
      assert.equal(await confirmation.isChecked(), false, 'header credential scope resets consent');
      await confirmation.check();
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await noPageOverflow(page);
      await dialog.getByRole('button', { name: '加入草稿', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      for (const status of [503, 409]) {
        state.failSave = status;
        await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
        await visible(page, page.getByText(status === 409 ? /配置已被其他窗口或 CLI 修改/ : 'fixture save unavailable', { exact: status !== 409 }));
        const staged = state.writes.at(-1).editable.providers.find(provider => provider.id === 'zhipu');
        assert.equal(staged.protocolBaseUrls.claude, 'https://changed.invalid/anthropic');
        assert.equal(staged.protocolBaseUrls['openai-response'], 'https://responses.invalid/tenant/v1');
        assert.equal(staged.authHeader, 'bearer');
        assert.deepEqual(staged.headers, { 'x-tenant-id': 'env:FIXTURE_TENANT' });
        assert.equal(saved().providers.some(provider => provider.id === 'zhipu'), false);
      }
      state.failSave = false;
      await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
      await visible(page, page.getByText('与已读取配置一致', { exact: true }));
      assert.equal(saved().providers.find(provider => provider.id === 'zhipu').presetRegion, 'coding');
      await page.getByRole('button', { name: '编辑供应商 zhipu', exact: true }).click();
      await field('API 端点').fill('https://never-saved.invalid/v1');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await page.getByRole('button', { name: '保存全部修改', exact: true }).isDisabled(), true);
      assert.equal(saved().providers.find(provider => provider.id === 'zhipu').baseUrl, 'https://open.bigmodel.cn/api/coding/paas/v4');
      assert.equal(state.refreshes, 0);
      assert.deepEqual(state.gatewayActions, []);
      await noPageOverflow(page);
      const artifacts = process.env.AIOS_GATEWAY_TEST_ARTIFACTS;
      if (artifacts) await page.screenshot({ path: path.join(artifacts, `provider-apis-${width}x640-200pct.png`) });
    });
  }
}
