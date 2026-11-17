import assert from 'node:assert/strict';
import { noPageOverflow, visible } from '../gateway-fixture.mjs';

const installButton = dialog => dialog.getByRole('button', { name: '安装服务', exact: true });

async function previewSearch(page, dialog) {
  await dialog.getByRole('button', { name: '跑真实 dry-run 预览', exact: true }).click();
  await visible(page, dialog.getByText('aios mcp add aios-search --dry-run', { exact: true }));
}

async function consentToInstall(dialog) {
  const confirm = installButton(dialog);
  assert.equal(await confirm.count(), 1, 'a successful Search preview must expose a separate confirmed install');
  assert.equal(await confirm.isDisabled(), true, 'preview alone is not consent');
  const consent = dialog.getByRole('checkbox');
  assert.equal(await consent.count(), 1, 'installation requires explicit consent after preview');
  assert.equal(await consent.isChecked(), false);
  await consent.check();
  assert.equal(await confirm.isEnabled(), true);
  return confirm;
}

async function installAndRefresh(page, confirm) {
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/mcp') && response.request().method() === 'POST'),
    page.waitForRequest(request => new URL(request.url()).pathname === '/mcp' && request.headers().rsc === '1'
      && request.headers()['next-router-prefetch'] !== '1'),
    confirm.click(),
  ]);
}

async function searchWizard(page, baseUrl) {
  await page.goto(`${baseUrl}/mcp`);
  await page.getByRole('button', { name: '添加 DeepSeek 搜索', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await visible(page, dialog.getByRole('heading', { name: '添加 MCP 服务', exact: true }));
  const landing = await dialog.getByRole('radio', { checked: true }).locator('..').innerText();
  const selected = /^Claude Code · (user|home)\n/u.exec(landing);
  assert.ok(selected, `Search must target the selected writable Claude landing: ${landing}`);
  await dialog.getByRole('button', { name: '下一步', exact: true }).click();
  return { dialog, scope: selected[1] };
}

export async function runResourceBrowserChecks(t, { fixture, baseUrl }) {
  await t.test('resource /mcp tabs lazily load shared inventories, preserve state and run only explicit doctor', async st => {
    const { page, state } = await fixture(st, { viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(`${baseUrl}/mcp`);
    await visible(page, page.getByRole('tablist', { name: '资源库分类', exact: true }));
    assert.equal(await page.getByRole('tab', { name: 'MCP', exact: true }).getAttribute('aria-selected'), 'true');
    assert.deepEqual(state.manageReads, [], 'unvisited resource panels must not fetch');
    await page.getByRole('tab', { name: 'Skills', exact: true }).click();
    await visible(page, page.getByRole('heading', { name: '技能落点 · 3 / 3', exact: true }));
    await visible(page, page.getByText('外部持有，不覆盖', { exact: true }));
    assert.equal(await page.getByRole('button', { name: '同步 manual（pi/global）', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: '移除 edited（claude/global）', exact: true }).isDisabled(), true);
    await page.getByRole('tab', { name: 'Subagents', exact: true }).click();
    await visible(page, page.getByRole('heading', { name: '规范角色 · 2 / 2', exact: true }));
    await visible(page, page.getByText('missing smoke evidence', { exact: true }));
    assert.deepEqual(state.manageActions, []);
    await page.getByRole('button', { name: '运行角色体检', exact: true }).click();
    await visible(page, page.getByText('体检完成：1 个角色被阻止参与实时工作流。', { exact: true }));
    assert.deepEqual(state.manageActions, [{ resource: 'agents', action: 'doctor' }]);
    const reads = [...state.manageReads];
    await page.getByRole('tab', { name: 'MCP', exact: true }).click();
    await visible(page, page.getByRole('heading', { name: '服务清单', exact: true }));
    await page.getByRole('tab', { name: 'Subagents', exact: true }).click();
    await visible(page, page.getByText('体检完成：1 个角色被阻止参与实时工作流。', { exact: true }));
    assert.deepEqual(state.manageReads, reads, 'visited panels retain their read state when changing resource tabs');
    assert.equal(new URL(page.url()).pathname, '/mcp');
    assert.deepEqual(state.gatewayActions, []);
    assert.deepEqual(state.clientActions, []);
    await noPageOverflow(page);
  });

  await t.test('Search preset has inherited-env guidance, no secret field, dry-run and cancel never write', async st => {
    const { page, state } = await fixture(st);
    const { dialog, scope } = await searchWizard(page, baseUrl);
    await visible(page, dialog.getByText(/DEEPSEEK_API_KEY.*不要在此填写密钥/));
    await visible(page, dialog.getByText(state.preset.costNotice, { exact: true }));
    assert.equal(await dialog.getByRole('textbox', { name: '环境变量名称', exact: true }).count(), 0);
    assert.equal(await dialog.getByLabel('环境变量值', { exact: true }).isVisible(), false);
    assert.equal(await dialog.getByRole('textbox', { name: '服务名称', exact: true }).inputValue(), 'aios-search');
    assert.equal(await dialog.getByRole('textbox', { name: '启动程序', exact: true }).inputValue(), state.preset.entry.command);
    assert.deepEqual(state.mcpActions, []);
    assert.equal(await installButton(dialog).count(), 0, 'configuration is not an install authorization');
    await dialog.getByRole('button', { name: '跑真实 dry-run 预览', exact: true }).click();
    await visible(page, dialog.getByText('/fixture/claude/config.json → mcpServers.aios-search · 配置现共 123 字节', { exact: true }));
    assert.deepEqual(state.mcpActions, [{ action: 'add', client: 'claude', scope, name: 'aios-search',
      entry: { type: 'stdio', ...state.preset.entry }, dryRun: true }]);
    const previewId = state.mcpPreview.id;
    await consentToInstall(dialog);
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/mcp' && response.request().method() === 'DELETE'),
      dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click(),
    ]);
    assert.deepEqual(state.mcpCancellations, [previewId]);
    assert.equal(state.mcpPreview, null, 'cancelling revokes even an explicitly checked approval');
    assert.equal(state.presetReads, 1);
    assert.equal(state.mcpActions.filter(body => !body.dryRun).length, 0);
    assert.doesNotMatch(JSON.stringify(state.mcpActions), /DEEPSEEK_API_KEY|"env"/);
  });

  await t.test('Search preset lookup errors stay visible without opening a generic or writable wizard', async st => {
    const { page, state } = await fixture(st);
    state.failPreset = 503;
    await page.goto(`${baseUrl}/mcp`);
    await page.getByRole('button', { name: '添加 DeepSeek 搜索', exact: true }).click();
    await visible(page, page.getByRole('alert').filter({ hasText: 'fixture search preset unavailable' }));
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.deepEqual(state.mcpActions, []);
  });

  await t.test('Search preset requires a separate confirmed write after preview with no secret in either request', async st => {
    const { page, state } = await fixture(st);
    const { dialog } = await searchWizard(page, baseUrl);
    await previewSearch(page, dialog);
    assert.equal(state.mcpActions.length, 1);
    assert.equal(state.mcpActions[0].dryRun, true);
    const revision = state.mcpPreviewRevision;
    const previewId = state.mcpPreview.id;
    const confirm = await consentToInstall(dialog);
    assert.equal(state.mcpActions.length, 1, 'checking consent does not itself install');
    const refreshes = state.consoleRefreshes;
    await installAndRefresh(page, confirm);
    assert.deepEqual(state.mcpActions[1], { ...state.mcpActions[0], dryRun: false, confirm: true, previewId });
    assert.deepEqual(state.mcpInstallRevisions, [revision], 'the opaque approval binds to exactly the previewed CLI revision');
    assert.equal(state.mcpPreviewRevision, null, 'installation consumes its preview authorization');
    assert.equal(state.mcpPreview, null);
    await visible(page, dialog.getByRole('heading', { name: '安装完成', exact: true }));
    assert.ok(state.consoleRefreshes > refreshes, 'installation refreshes the server facts');
    assert.doesNotMatch(JSON.stringify(state.mcpActions), /DEEPSEEK_API_KEY|"env"/);
  });

  await t.test('Search rejected preview never enables a confirmed write', async st => {
    const { page, state } = await fixture(st);
    state.failMcpPreview = true;
    const { dialog } = await searchWizard(page, baseUrl);
    await previewSearch(page, dialog);
    await visible(page, dialog.getByText('fixture unsafe Search preview rejected', { exact: true }));
    const confirm = installButton(dialog);
    assert.ok(await confirm.count() === 0 || await confirm.isDisabled(), 'an HTTP 200 rejected preview cannot authorize installation');
    assert.equal(state.mcpPreviewRevision, null);
    assert.equal(state.mcpActions.length, 1);
    assert.equal(state.mcpActions[0].dryRun, true);
  });

  for (const verdict of ['http-error', 'ok-false']) {
    await t.test(`Search ${verdict} install consumes preview, refreshes facts and requires fresh consent`, async st => {
      const { page, state } = await fixture(st);
      state.failMcp = verdict === 'http-error' ? 503 : 0;
      state.failMcpVerdict = verdict === 'ok-false';
      const { dialog } = await searchWizard(page, baseUrl);
      await previewSearch(page, dialog);
      const stalePreviewId = state.mcpPreview.id;
      const staleRevision = state.mcpPreviewRevision;
      const confirm = await consentToInstall(dialog);
      const refreshes = state.consoleRefreshes;
      await installAndRefresh(page, confirm);
      await visible(page, dialog.getByText(verdict === 'http-error' ? 'fixture MCP install transport failure' : 'fixture MCP install rejected after partial work', { exact: true }));
      assert.equal(state.mcpPreviewRevision, null);
      assert.equal(state.mcpPreview, null);
      assert.ok(state.consoleRefreshes > refreshes, 'even a failed write must refresh facts');
      assert.equal(state.mcpActions.at(-1).previewId, stalePreviewId);
      assert.equal(await dialog.getByRole('heading', { name: '安装完成', exact: true }).count(), 0);
      assert.ok(await installButton(dialog).count() === 0 || await installButton(dialog).isDisabled(), 'failed installation cannot reuse the old preview');
      state.failMcp = 0;
      state.failMcpVerdict = false;
      await dialog.getByRole('button', { name: '上一步', exact: true }).click();
      await previewSearch(page, dialog);
      assert.notEqual(state.mcpPreviewRevision, staleRevision);
      const freshRevision = state.mcpPreviewRevision;
      const freshPreviewId = state.mcpPreview.id;
      assert.notEqual(freshPreviewId, stalePreviewId);
      await installAndRefresh(page, await consentToInstall(dialog));
      assert.deepEqual(state.mcpActions.map(body => body.dryRun), [true, false, true, false]);
      assert.equal(state.mcpActions.at(-1).previewId, freshPreviewId);
      assert.deepEqual(state.mcpInstallRevisions, [staleRevision, freshRevision]);
      await visible(page, dialog.getByRole('heading', { name: '安装完成', exact: true }));
      assert.doesNotMatch(JSON.stringify(state.mcpActions), /DEEPSEEK_API_KEY|"env"/);
    });
  }
}
