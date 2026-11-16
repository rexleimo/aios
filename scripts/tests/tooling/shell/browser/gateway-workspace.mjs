import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { browserRuntime, choose, gatewayFixture, noPageOverflow, visible } from './gateway-fixture.mjs';
import { runModelSourceBrowserChecks } from './model-source-workspace.mjs';

async function chooseTheme(page, theme) {
  const href = page.url();
  // Draft controls are mounted only after the hydrated configuration fetch completes.
  await page.getByRole('combobox', { name: '实现全局模型', exact: true, includeHidden: true }).waitFor({ state: 'attached' });
  // Next's development indicator can cover this sidebar button on mobile.
  await page.getByRole('button', { name: '设置', exact: true }).press('Enter');
  const control = page.getByRole('button', { name: theme === 'dark' ? '深色' : '明亮', exact: true });
  await control.click();
  assert.equal(await control.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('html').getAttribute('data-rex-theme'), theme);
  await page.goBack();
  await page.waitForURL(href);
  await visible(page, page.getByRole('navigation', { name: '网关工作区' }));
}

export async function runGatewayBrowserChecks(t, { baseUrl, token }) {
  const runtime = await browserRuntime();
  if (!runtime) {
    await t.test('gateway browser regressions', st => st.skip('Playwright Core or Chrome is unavailable'));
    return;
  }
  const browser = await runtime.chromium.launch({ executablePath: runtime.executablePath });
  t.after(() => browser.close());
  const fixture = async (st, options) => {
    const value = await gatewayFixture(browser, baseUrl, token, options);
    st.after(() => value.close());
    return value;
  };

  await runModelSourceBrowserChecks(t, { fixture, baseUrl, chooseTheme });

  await t.test('gateway draft survives sections, history, other views and ws deep links', async st => {
    const { page, state, saved } = await fixture(st);
    await page.goto(`${baseUrl}/routing/config?ws=browser-fixture`);
    await visible(page, page.getByRole('heading', { name: '全局角色默认' }));
    await choose(page, '实现全局模型', /Beta/);
    await visible(page, page.getByText('有未保存的修改', { exact: true }));
    await page.getByRole('navigation', { name: '网关工作区' }).getByRole('button', { name: /供应商与模型/ }).click();
    assert.equal(new URL(page.url()).searchParams.get('ws'), 'browser-fixture');
    assert.equal(new URL(page.url()).searchParams.get('section'), 'providers');
    assert.equal(await page.getByRole('button', { name: '刷新模型目录', exact: true }).isDisabled(), true);
    await page.getByRole('navigation', { name: '网关工作区' }).getByRole('button', { name: /请求记录/ }).click();
    await visible(page, page.getByRole('heading', { name: '请求明细' }));
    await page.goBack();
    await visible(page, page.getByRole('heading', { name: '上游供应商' }));
    await page.goBack();
    await visible(page, page.getByRole('combobox', { name: '实现全局模型', exact: true }));
    assert.match(await page.getByRole('combobox', { name: '实现全局模型', exact: true }).innerText(), /Beta/);
    await page.goForward();
    await visible(page, page.getByRole('heading', { name: '上游供应商' }));
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: 'AI 工具', exact: true }).click();
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '路由配置', exact: true }).click();
    assert.match(await page.getByRole('combobox', { name: '实现全局模型', exact: true }).innerText(), /Beta/);
    assert.equal(state.writes.length, 0, 'tab changes must not write configuration');
    await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
    await visible(page, page.getByText('配置已保存，写入前已自动备份。', { exact: true }));
    assert.equal(saved().matrix.default.implementer, 'model-beta');
    await page.reload();
    assert.match(await page.getByRole('combobox', { name: '实现全局模型', exact: true }).innerText(), /Beta/);
    assert.equal(new URL(page.url()).searchParams.get('ws'), 'browser-fixture');
    // Empty values must round-trip through Radix without exposing its internal sentinel.
    await choose(page, '实现全局模型', /自动策略/);
    await choose(page, 'claude 实现模型', /Beta/);
    await choose(page, 'claude 实现模型', /继承全局/);
    await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
    await visible(page, page.getByText('与已读取配置一致', { exact: true }));
    assert.equal(saved().matrix.default.implementer, '');
    assert.equal(saved().matrix.clients.claude.implementer, '');
    assert.doesNotMatch(JSON.stringify(state.writes), /__rex_empty_option__/);
  });

  await t.test('failed saves and 409 retain the draft; reload and discard require confirmation', async st => {
    const { page, state } = await fixture(st);
    await page.goto(`${baseUrl}/routing/config`);
    await choose(page, '实现全局模型', /Beta/);
    for (const status of [503, 409]) {
      state.failSave = status;
      await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
      await visible(page, page.getByText(status === 409 ? /配置已被其他窗口或 CLI 修改/ : 'fixture save unavailable', { exact: status !== 409 }));
      assert.match(await page.getByRole('combobox', { name: '实现全局模型', exact: true }).innerText(), /Beta/);
      await visible(page, page.getByText('有未保存的修改', { exact: true }));
    }
    await page.getByRole('button', { name: '重新读取配置', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '继续编辑' }).click();
    assert.match(await page.getByRole('combobox', { name: '实现全局模型', exact: true }).innerText(), /Beta/);
    state.failRead = true;
    await page.getByRole('button', { name: '重新读取配置', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认重新读取' }).click();
    await visible(page, page.getByText(/配置快照未能更新，当前草稿已保留/));
    assert.match(await page.getByRole('combobox', { name: '实现全局模型', exact: true }).innerText(), /Beta/);
    state.failRead = false;
    await page.getByRole('button', { name: '放弃修改', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认放弃修改' }).click();
    assert.match(await page.getByRole('combobox', { name: '实现全局模型', exact: true }).innerText(), /自动策略/);
    assert.equal(state.writes.length, 2);
  });

  await t.test('providers and custom models stage changes; discovery has dirty and confirmation gates', async st => {
    const { page, state, saved } = await fixture(st);
    await page.goto(`${baseUrl}/routing?section=providers`);
    await page.getByRole('button', { name: '添加供应商', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: '供应商标识', exact: true }).fill('my-upstream');
    await dialog.getByRole('textbox', { name: 'API 端点', exact: true }).fill('ftp://example.invalid');
    await dialog.getByRole('button', { name: '加入草稿' }).click();
    await visible(page, dialog.getByText(/HTTP\(S\)/));
    await dialog.getByRole('textbox', { name: 'API 端点', exact: true }).fill('https://example.invalid/v1');
    await dialog.getByRole('textbox', { name: '密钥环境变量引用', exact: true }).fill('not-an-env-reference');
    await dialog.getByRole('button', { name: '加入草稿' }).click();
    await visible(page, dialog.getByText(/不能填写真实密钥/));
    await dialog.getByRole('textbox', { name: '密钥环境变量引用', exact: true }).fill('env:MY_FIXTURE_KEY');
    await dialog.getByRole('button', { name: '加入草稿' }).click();
    await visible(page, page.getByRole('button', { name: '编辑供应商 my-upstream' }));
    await page.getByRole('button', { name: '手动添加', exact: true }).click();
    await dialog.getByRole('textbox', { name: '真实上游模型 ID', exact: true }).fill('My-Real-Model');
    await dialog.getByRole('textbox', { name: '模型标识', exact: true }).fill('my-custom');
    await dialog.getByRole('textbox', { name: '模型显示名称', exact: true }).fill('My Custom');
    assert.equal(await dialog.getByRole('textbox', { name: '所属供应商', exact: true }).inputValue(), 'my-upstream');
    await dialog.getByRole('button', { name: '加入草稿' }).click();
    assert.equal(state.writes.length, 0);
    await page.getByRole('navigation', { name: '网关工作区' }).getByRole('button', { name: /路由策略/ }).click();
    await choose(page, '实现全局模型', /My Custom/);
    await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
    await visible(page, page.getByText('与已读取配置一致', { exact: true }));
    assert.equal(saved().matrix.default.implementer, 'my-custom');
    assert.equal(saved().customModels[0].provider, 'my-upstream');
    assert.equal(saved().customModels[0].upstreamModel, 'My-Real-Model');
    assert.equal(saved().providers.find(provider => provider.id === 'my-upstream').endpointStyle, 'standard');
    await page.getByRole('navigation', { name: '网关工作区' }).getByRole('button', { name: /供应商与模型/ }).click();
    await page.getByRole('button', { name: '编辑供应商 my-upstream' }).click();
    await dialog.getByRole('textbox', { name: 'API 端点', exact: true }).fill('https://example.invalid/updated');
    await dialog.getByRole('checkbox', { name: '我确认这些账号密钥可以用于新的 API 端点' }).check();
    await dialog.getByRole('button', { name: '加入草稿' }).click();
    assert.equal(await page.getByRole('button', { name: '刷新模型目录', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: '放弃修改', exact: true }).click();
    await dialog.getByRole('button', { name: '确认放弃修改' }).click();
    await page.getByRole('button', { name: '刷新模型目录', exact: true }).click();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(state.refreshes, 0);
    await page.getByRole('button', { name: '刷新模型目录', exact: true }).click();
    state.refreshFailures = [{ provider: 'fixture', errors: [{ protocol: 'claude', error: 'fixture network failure' }] }];
    await dialog.getByRole('button', { name: '确认刷新', exact: true }).click();
    await visible(page, page.getByText(/发现 2 个模型/));
    await visible(page, page.getByText(/部分来源读取失败：fixture \/ claude；已有目录已保留/));
    assert.equal(state.refreshes, 1);
    await page.getByRole('textbox', { name: '搜索模型目录' }).fill('My Custom');
    assert.equal(await page.getByRole('list', { name: 'my-upstream 模型', exact: true }).getByRole('listitem').count(), 1);
  });

  await t.test('empty access is truthful at desktop and 390px; explicit local setup stays separate from runtime', async st => {
    const { page, state, saved } = await fixture(st, { empty: true, viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
    const artifacts = process.env.AIOS_GATEWAY_TEST_ARTIFACTS;
    if (artifacts) fs.mkdirSync(artifacts, { recursive: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${baseUrl}/routing`);
      await visible(page, page.getByRole('heading', { name: '尚未配置模型访问', exact: true }));
      await visible(page, page.getByText('运行时就绪：监听已启动，但尚无模型访问配置', { exact: true }));
      for (const button of await page.getByRole('button', { name: '接入', exact: true }).all()) assert.equal(await button.isDisabled(), true);
      await noPageOverflow(page);
      if (artifacts) await page.screenshot({ path: path.join(artifacts, `gateway-empty-overview-${width}.png`), fullPage: true });
      await page.getByRole('navigation', { name: '网关工作区' }).getByRole('button', { name: /路由策略/ }).click();
      await visible(page, page.getByRole('heading', { name: '尚无可路由模型', exact: true }));
      assert.equal(await page.getByRole('combobox', { name: '实现全局模型', exact: true }).isDisabled(), true);
      await noPageOverflow(page);
      if (artifacts) await page.screenshot({ path: path.join(artifacts, `gateway-empty-policy-${width}.png`), fullPage: true });
    }
    await page.getByRole('navigation', { name: '网关工作区' }).getByRole('button', { name: /供应商与模型/ }).click();
    await visible(page, page.getByText('添加第一个模型来源', { exact: true }));
    assert.equal(await page.getByRole('button', { name: '刷新模型目录', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: '添加供应商', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: '供应商标识', exact: true }).fill('local');
    await dialog.getByRole('textbox', { name: 'API 端点', exact: true }).fill('http://127.0.0.1:19001/v1');
    await choose(page, '供应商认证方式', /无需认证/);
    await dialog.getByRole('button', { name: '加入草稿', exact: true }).click();
    await page.getByRole('button', { name: '手动添加', exact: true }).click();
    await dialog.getByRole('textbox', { name: '真实上游模型 ID', exact: true }).fill('Org/Model-Instruct');
    await dialog.getByRole('button', { name: '加入草稿', exact: true }).click();
    assert.equal(state.writes.length, 0);
    await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
    await visible(page, page.getByText('与已读取配置一致', { exact: true }));
    assert.equal(saved().providers[0].authMode, 'none');
    assert.equal(saved().providers[0].endpointStyle, 'standard');
    assert.equal(saved().customModels[0].upstreamModel, 'Org/Model-Instruct');
    assert.equal(saved().customModels[0].provider, 'local');
    await page.getByRole('navigation', { name: '网关工作区' }).getByRole('button', { name: /运行总览/ }).click();
    await visible(page, page.getByText('运行时就绪：监听已启动，但尚无模型访问配置', { exact: true }));
    assert.equal(state.gatewayActions.length, 0, 'saved models must not imply a restarted or connected runtime');
    assert.equal(state.refreshes, 0, 'manual setup must not make an implicit discovery request');
    await noPageOverflow(page);
    assert.equal(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), 0);
  });

  await t.test('local role profiles only change the draft; client reset and apply are confirmed', async st => {
    const { page, state } = await fixture(st);
    await page.goto(`${baseUrl}/routing/config`);
    await choose(page, '实现全局模型', /Beta/);
    await choose(page, 'claude 实现模型', /Beta/);
    await page.getByRole('button', { name: '保存为方案', exact: true }).click();
    await page.getByRole('textbox', { name: '方案名称' }).fill('Browser fixture');
    await page.getByRole('dialog').getByRole('button', { name: '保存方案', exact: true }).click();
    assert.equal(state.writes.length, 0);
    await page.getByRole('button', { name: '清除此客户端覆盖' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '清除覆盖', exact: true }).click();
    assert.match(await page.getByRole('combobox', { name: 'claude 实现模型', exact: true }).innerText(), /继承/);
    await page.getByRole('button', { name: '放弃修改', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认放弃修改' }).click();
    await page.getByRole('button', { name: '应用到草稿', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认应用', exact: true }).click();
    assert.match(await page.getByRole('combobox', { name: '实现全局模型', exact: true }).innerText(), /Beta/);
    assert.equal(state.writes.length, 0);
    const profiles = await page.evaluate(() => JSON.parse(localStorage.getItem('aios.profiles')));
    assert.deepEqual(Object.keys(profiles[0]).sort(), ['matrix', 'name']);
    assert.equal(profiles[0].matrix.clients.claude.implementer, 'model-beta');
  });

  await t.test('runtime control is confirmed and separate from traffic; request filters preserve totals', async st => {
    const { page, state } = await fixture(st);
    await page.goto(`${baseUrl}/routing`);
    await visible(page, page.getByText('有客户端仍指向网关。', { exact: false }));
    await page.getByText('手动接入（隔离模式，不碰真实配置）', { exact: true }).click();
    await visible(page, page.getByText('aios model-router connect --isolated --port 3127', { exact: true }));
    assert.equal(await page.getByRole('button', { name: '接入', exact: true }).first().isDisabled(), true);
    await page.getByRole('button', { name: '启动网关', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(state.gatewayActions.length, 0);
    await page.getByRole('button', { name: '启动网关', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认启动', exact: true }).click();
    await visible(page, page.getByRole('button', { name: '关闭网关', exact: true }));
    assert.deepEqual(state.gatewayActions, [{ action: 'start', confirm: true, port: 3127 }]);
    await page.getByRole('button', { name: '接入', exact: true }).first().click();
    await visible(page, page.getByRole('dialog').getByText(/http:\/\/127\.0\.0\.1:3127/));
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/model-routing/gateway') && response.request().method() === 'GET'),
      page.getByRole('dialog').getByRole('button', { name: '确认接入', exact: true }).click(),
    ]);
    assert.deepEqual(state.gatewayActions[1], { action: 'connect', confirm: true, client: 'codex', port: 3127 });
    await page.getByRole('navigation', { name: '网关工作区' }).getByRole('button', { name: /请求记录/ }).click();
    await visible(page, page.getByRole('heading', { name: '请求明细' }));
    await choose(page, '筛选请求结果', '仅失败');
    assert.equal(await page.locator('tbody tr:visible').count(), 1);
    await page.getByRole('button', { name: '查看请求 1' }).click();
    await visible(page, page.getByRole('dialog').getByText('fixture upstream unavailable'));
    assert.equal(await page.getByRole('dialog').getByText('未记录', { exact: true }).count(), 2, 'missing token data must not become zero');
    await page.keyboard.press('Escape');
    await choose(page, '筛选请求结果', '全部结果');
    await page.getByRole('textbox', { name: '搜索请求' }).fill('model-alpha');
    assert.equal(await page.locator('tbody tr:visible').count(), 2);
    const before = state.gatewayReads;
    // Cross one gateway poll interval while its section is inactive.
    await page.waitForTimeout(2800);
    assert.equal(state.gatewayReads, before);
    assert.match(await page.locator('main').innerText(), /日志内请求\s+3/);
    await page.getByRole('textbox', { name: '搜索请求' }).fill('');
    await page.getByRole('button', { name: '查看请求 2' }).focus();
    await page.evaluate(() => { window.__focusedRequest = document.activeElement; });
    state.recent.unshift({ recordKey: 'fixture-4', at: '2026-11-15T08:00:01Z', clientId: 'pi', modelId: 'model-beta', status: 200 });
    await page.waitForResponse(response => response.url().includes('/api/model-routing/decisions?limit=100'));
    await page.getByRole('button', { name: '查看请求 4' }).waitFor();
    assert.equal(await page.evaluate(() => window.__focusedRequest === document.activeElement && document.activeElement?.isConnected), true, 'newest-first polling must keep keyboard focus on the same request');
  });

  await t.test('short mobile dirty save bar keeps all actions reachable and confirmations safe', async st => {
    const { page, state, saved } = await fixture(st, { viewport: { width: 390, height: 640 }, reducedMotion: 'reduce' });
    await page.goto(`${baseUrl}/routing/config`);
    await choose(page, '实现全局模型', /Beta/);
    await chooseTheme(page, 'dark');
    await visible(page, page.getByText('有未保存的修改', { exact: true }));
    for (const name of ['重新读取配置', '放弃修改', '保存全部修改']) {
      const button = page.getByRole('button', { name, exact: true });
      const box = await button.boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 391 && box.y + box.height <= 641, `${name} must remain inside the short mobile viewport`);
      await button.click({ trial: true });
    }
    await noPageOverflow(page);
    const artifacts = process.env.AIOS_GATEWAY_TEST_ARTIFACTS;
    if (artifacts) {
      fs.mkdirSync(artifacts, { recursive: true });
      await page.screenshot({ path: path.join(artifacts, 'gateway-dirty-save-bar-390x640.png') });
    }
    await page.getByRole('button', { name: '重新读取配置', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '继续编辑', exact: true }).click();
    assert.match(await page.getByRole('combobox', { name: '实现全局模型', exact: true }).innerText(), /Beta/);
    await page.getByRole('button', { name: '放弃修改', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认放弃修改', exact: true }).click();
    assert.match(await page.getByRole('combobox', { name: '实现全局模型', exact: true }).innerText(), /自动策略/);
    await choose(page, '实现全局模型', /Beta/);
    await page.getByRole('button', { name: '重新读取配置', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认重新读取', exact: true }).click();
    await visible(page, page.getByText('与已读取配置一致', { exact: true }));
    assert.equal(state.writes.length, 0, 'discard and reload must not save');
    await choose(page, '实现全局模型', /Beta/);
    await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
    await visible(page, page.getByText('与已读取配置一致', { exact: true }));
    assert.equal(saved().matrix.default.implementer, 'model-beta');
    assert.equal(state.writes.length, 1);
  });

  await t.test('desktop, 390px dark and reduced-motion layouts have no document overflow', async st => {
    const { page } = await fixture(st);
    const artifacts = process.env.AIOS_GATEWAY_TEST_ARTIFACTS;
    if (artifacts) fs.mkdirSync(artifacts, { recursive: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: width === 390 ? 'reduce' : 'no-preference' });
      for (const section of ['overview', 'providers', 'policy', 'requests']) {
        await page.goto(`${baseUrl}${section === 'policy' ? '/routing/config' : `/routing?section=${section}`}`);
        const ready = section === 'overview' ? '本地网关' : section === 'providers' ? '上游供应商' : section === 'policy' ? '全局角色默认' : '请求明细';
        await visible(page, page.getByRole('heading', { name: ready, exact: true }));
        await chooseTheme(page, width === 390 ? 'dark' : 'light');
        await visible(page, page.getByRole('heading', { name: ready, exact: true }));
        if (artifacts) {
          await page.screenshot({ path: path.join(artifacts, `gateway-${section}-${width}.png`), fullPage: true });
          if (width === 390) await page.screenshot({ path: path.join(artifacts, `gateway-${section}-${width}-viewport.png`) });
        }
        await noPageOverflow(page);
        if (section === 'providers' && width === 390) {
          await page.getByRole('button', { name: '编辑供应商 fixture', exact: true }).click();
          const dialog = page.getByRole('dialog');
          const box = await dialog.boundingBox();
          assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= 1001, 'provider form must fit the mobile viewport');
          if (artifacts) await page.screenshot({ path: path.join(artifacts, 'gateway-provider-dialog-390.png') });
          await dialog.getByRole('button', { name: '取消', exact: true }).click();
          await noPageOverflow(page);
        }
        if (section === 'policy') {
          await page.getByRole('combobox', { name: '实现全局模型', exact: true }).click();
          const box = await page.getByRole('listbox').boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'model menu must fit the viewport');
          await page.keyboard.press('Escape');
        }
      }
      if (width === 390) {
        const animated = await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length);
        assert.equal(animated, 0, 'reduced motion must not leave running animations');
      }
    }
    await page.goto(`${baseUrl}/gateway?ws=browser-fixture`);
    assert.equal(new URL(page.url()).pathname, '/routing');
    assert.equal(new URL(page.url()).searchParams.get('ws'), 'browser-fixture');
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const pathname of ['/routing', '/routing?section=providers', '/routing/config', '/routing?section=requests']) {
      await page.goto(`${baseUrl}${pathname}`);
      await chooseTheme(page, 'light');
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await visible(page, page.getByRole('navigation', { name: '网关工作区' }));
      await noPageOverflow(page);
    }
  });
}
