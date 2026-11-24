import assert from 'node:assert/strict';
import { choose, noPageOverflow, visible } from '../gateway-fixture.mjs';

const labels = { claude: 'Claude Code', codex: 'Codex', pi: 'Pi' };
const toggle = (page, id) => page.getByRole('switch', { name: `${labels[id]} 接入网关`, exact: true });
const panel = (page, id) => toggle(page, id).locator('xpath=ancestor::div[contains(@class,"min-w-0")][2]');
const readyGateway = { running: true, ready: true };
const groupConfiguration = { editable: { routingGroups: [
  { id: 'offline-fallback', enabled: true, routing: 'ordered', models: ['model-alpha', 'model-beta'] },
  { id: 'disabled-fixture', enabled: false, routing: 'ordered', models: ['model-alpha'] },
] } };

async function openClients(page, baseUrl) {
  await page.goto(`${baseUrl}/tools`);
  await visible(page, page.getByRole('heading', { name: 'Agent 客户端', exact: true }));
  await page.getByRole('button', { name: '刷新客户端状态', exact: true }).waitFor();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find(element => element.textContent?.trim() === '刷新客户端状态');
    return button && !button.disabled;
  });
  await page.waitForFunction(() => !document.querySelector('main')?.textContent.includes('正在读取客户端安装、网关与模型目录'));
  const showRest = page.getByRole('button', { name: /^显示其余/u });
  if (await showRest.count()) await showRest.click();
}

async function expandClient(page, id) {
  const details = page.getByRole('button', { name: `${labels[id]} 详情`, exact: true });
  if (await details.getAttribute('aria-expanded') === 'false') await details.click();
}

export async function runAgentBrowserChecks(t, { fixture, baseUrl }) {
  await t.test('Agent installation unknown, PATH missing and config presence remain separate facts', async st => {
    const { page, state } = await fixture(st);
    Object.assign(state.clients[0], { installed: null, version: null, executable: null, update: { supported: false } });
    Object.assign(state.clients[1], { installed: false, version: null, executable: null, update: { supported: false } });
    await openClients(page, baseUrl);
    await expandClient(page, 'claude');
    await visible(page, panel(page, 'claude').getByText('安装状态未验证（读取异常，不代表未安装）', { exact: true }));
    await expandClient(page, 'codex');
    await visible(page, panel(page, 'codex').getByText('PATH 中未检测到程序（不等于本机绝无安装）', { exact: true }));
    await expandClient(page, 'pi');
    await visible(page, panel(page, 'pi').getByText(/已检测到程序 · 1.2.3/));
    for (const id of ['claude', 'codex', 'pi']) {
      await expandClient(page, id);
      await visible(page, panel(page, id).getByText('配置存在不代表程序已安装', { exact: true }));
    }
    await expandClient(page, 'claude');
    assert.equal(await panel(page, 'claude').getByRole('button', { name: '预览客户端更新' }).isDisabled(), true);
    assert.equal(state.clientActions.length, 0);
    assert.equal(state.gatewayActions.length, 0);
  });

  await t.test('Agent installation read failure is not rendered as an empty or missing install', async st => {
    const { page, state } = await fixture(st);
    state.failClients = 503;
    await openClients(page, baseUrl);
    await expandClient(page, 'claude');
    await visible(page, page.getByRole('alert').filter({ hasText: '安装信息未读到：fixture installation inventory unavailable' }));
    await visible(page, panel(page, 'claude').getByText('安装信息未读到', { exact: true }));
    assert.doesNotMatch(await panel(page, 'claude').innerText(), /PATH 中未检测到程序/);
    assert.equal(state.clientActions.length, 0);
  });

  for (const [option, target] of [[/Alpha · model-alpha/, 'model:model-alpha'], [/路由组 · offline-fallback/, 'group:offline-fallback'], [/AIOS Auto/, 'auto']]) {
    await t.test(`Agent confirmed connect sends canonical ${target}, actual port and no runtime action`, async st => {
      const { page, state } = await fixture(st, { configuration: groupConfiguration, gatewayStatus: readyGateway });
      await openClients(page, baseUrl);
      const expectedRevision = state.catalogHash;
      assert.match(expectedRevision, /^[a-f0-9]{64}$/u);
      await choose(page, 'Codex 模型', option);
      assert.equal(state.gatewayActions.length, 0, 'selecting a target is not a write');
      await toggle(page, 'codex').click();
      await visible(page, page.getByRole('dialog').getByText(new RegExp(`3127.*${target}`)));
      await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
      assert.equal(state.gatewayActions.length, 0, 'cancelling must not connect');
      await toggle(page, 'codex').click();
      await page.getByRole('dialog').getByRole('button', { name: '确认写入接入配置', exact: true }).click();
      await visible(page, page.getByText('客户端配置操作已完成并重新读取；请以更新后的状态为准。', { exact: true }));
      assert.deepEqual(state.gatewayActions, [{ action: 'connect', client: 'codex', port: 3127, target, expectedRevision, confirm: true }]);
      assert.equal(await toggle(page, 'codex').getAttribute('aria-checked'), 'true');
      await page.reload();
      await openClients(page, baseUrl);
      await expandClient(page, 'codex');
      await visible(page, panel(page, 'codex').getByText('配置已接入 · inplace', { exact: true }));
      assert.equal(state.connectionOverrides.codex.target, target);
    });
  }

  await t.test('Agent connected target changes and native capability are distinct from disconnect', async st => {
    const { page, state } = await fixture(st, { gatewayStatus: readyGateway, configuration: groupConfiguration });
    await openClients(page, baseUrl);
    await expandClient(page, 'claude');
    await choose(page, 'Claude Code 模型', /Alpha · model-alpha/);
    await panel(page, 'claude').getByRole('button', { name: '应用默认目标', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认写入接入配置', exact: true }).click();
    await visible(page, page.getByText('客户端配置操作已完成并重新读取；请以更新后的状态为准。', { exact: true }));
    assert.deepEqual(state.gatewayActions[0], { action: 'connect', client: 'claude', port: 3127, target: 'model:model-alpha', expectedRevision: state.catalogHash, confirm: true });
    await choose(page, 'Claude Code 模型', '客户端自行选择 · 不固定目标');
    await panel(page, 'claude').getByRole('button', { name: '应用默认目标', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认写入接入配置', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.deepEqual(state.gatewayActions[1], { action: 'connect', client: 'claude', port: 3127, target: 'native', expectedRevision: state.catalogHash, confirm: true });
    await page.getByRole('combobox', { name: 'Pi 模型', exact: true }).click();
    assert.equal(await page.getByRole('option', { name: '客户端自行选择 · 不固定目标', exact: true }).count(), 0);
    assert.equal(await page.getByRole('option', { name: /disabled-fixture/ }).count(), 0);
    await page.keyboard.press('Escape');
    await expandClient(page, 'pi');
    await visible(page, panel(page, 'pi').getByText('fixture Pi has no safe native target mode', { exact: true }));
  });

  await t.test('Agent toggle off confirms disconnect and restore, never gateway stop', async st => {
    const { page, state } = await fixture(st, { gatewayStatus: readyGateway });
    await openClients(page, baseUrl);
    await toggle(page, 'claude').click();
    await visible(page, page.getByRole('dialog').getByText(/不停止网关服务/));
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(state.gatewayActions.length, 0);
    await toggle(page, 'claude').click();
    await page.getByRole('dialog').getByRole('button', { name: '确认断开并还原', exact: true }).click();
    await visible(page, panel(page, 'claude').getByText('未接入', { exact: true }));
    assert.deepEqual(state.gatewayActions, [{ action: 'disconnect', client: 'claude', confirm: true }]);
    assert.equal(state.gatewayStatus.running, true);
    assert.equal(await toggle(page, 'claude').getAttribute('aria-checked'), 'false');
  });

  for (const [label, hash] of [['missing', undefined], ['null', null], ['empty', ''], ['malformed', 'not-a-hash'], ['uppercase', 'A'.repeat(64)]]) {
    await t.test(`Agent ${label} catalog hash blocks connect/apply but preserves safe owned disconnect`, async st => {
      const { page, state } = await fixture(st, { gatewayStatus: readyGateway });
      await openClients(page, baseUrl);
      await expandClient(page, 'claude');
      await choose(page, 'Claude Code 模型', /Alpha · model-alpha/);
      const apply = panel(page, 'claude').getByRole('button', { name: '应用默认目标', exact: true });
      assert.equal(await apply.isEnabled(), true);
      state.catalogHash = hash;
      await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === '/api/config/model-routing' && response.request().method() === 'GET'),
        page.getByRole('button', { name: '刷新客户端状态', exact: true }).click(),
      ]);
      await page.waitForFunction(() => !document.querySelector('main')?.textContent.includes('正在读取客户端安装、网关与模型目录'));
      assert.equal(await toggle(page, 'codex').isDisabled(), true, 'an invalid catalog cannot authorize a new connection');
      assert.equal(await apply.isDisabled(), true, 'an invalid catalog cannot authorize applying a target');
      assert.equal(await toggle(page, 'claude').isEnabled(), true, 'owned disconnect remains independent of catalog availability');
      assert.deepEqual(state.gatewayActions, []);
      await toggle(page, 'claude').click();
      await page.getByRole('dialog').getByRole('button', { name: '确认断开并还原', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached' });
      assert.deepEqual(state.gatewayActions, [{ action: 'disconnect', client: 'claude', confirm: true }]);
      assert.equal(await toggle(page, 'claude').getAttribute('aria-checked'), 'false');
    });
  }

  for (const action of ['connect', 'apply']) {
    await t.test(`Agent stale catalog ${action} closes consent, reloads and requires a fresh hash and confirmation`, async st => {
      const { page, state } = await fixture(st, { gatewayStatus: readyGateway });
      const id = action === 'connect' ? 'codex' : 'claude';
      await openClients(page, baseUrl);
      await expandClient(page, id);
      const staleRevision = state.catalogHash;
      await choose(page, `${labels[id]} 模型`, /Beta · model-beta/);
      const trigger = action === 'connect' ? toggle(page, id) : panel(page, id).getByRole('button', { name: '应用默认目标', exact: true });
      await trigger.click();
      const reads = { catalog: state.catalogReads, gateway: state.gatewayReads, clients: state.clientReads };
      state.catalogHash = 'b'.repeat(64);
      await page.getByRole('dialog').getByRole('button', { name: '确认写入接入配置', exact: true }).click();
      await visible(page, page.getByRole('alert').filter({ hasText: 'fixture catalog revision changed; refresh targets and confirm again' }));
      assert.equal(await page.getByRole('dialog').count(), 0, 'a rejected revision consumes the old confirmation');
      assert.ok(state.catalogReads > reads.catalog && state.gatewayReads > reads.gateway && state.clientReads > reads.clients, 'stale writes reread catalog, connection and installation facts');
      assert.equal(state.gatewayActions.length, 1);
      assert.equal(state.gatewayActions[0].expectedRevision, staleRevision, 'confirmation forwards the captured hash, not a replacement');
      assert.equal(await toggle(page, id).getAttribute('aria-checked'), String(action === 'apply'), 'a stale revision is rejected before any write');
      assert.equal(await page.getByText('客户端配置操作已完成并重新读取；请以更新后的状态为准。', { exact: true }).count(), 0);
      await choose(page, `${labels[id]} 模型`, /Beta · model-beta/);
      await trigger.click();
      await visible(page, page.getByRole('dialog').getByRole('button', { name: '确认写入接入配置', exact: true }));
      assert.equal(state.gatewayActions.length, 1, 'rereading the catalog does not grant new consent');
      await page.getByRole('dialog').getByRole('button', { name: '确认写入接入配置', exact: true }).click();
      await visible(page, page.getByText('客户端配置操作已完成并重新读取；请以更新后的状态为准。', { exact: true }));
      assert.deepEqual(state.gatewayActions[1], { action: 'connect', client: id, port: 3127, target: 'model:model-beta', expectedRevision: state.catalogHash, confirm: true });
    });
  }

  for (const action of ['connect', 'disconnect']) for (const verdict of ['ok-false', 'http-409']) {
    await t.test(`Agent uncertain ${action} ${verdict} consumes consent and rereads possible writes`, async st => {
      const { page, state } = await fixture(st, { gatewayStatus: readyGateway });
      const id = action === 'connect' ? 'codex' : 'claude';
      state.failGatewayAction = verdict === 'http-409' ? 409 : 0;
      state.failGatewayVerdict = verdict === 'ok-false';
      await openClients(page, baseUrl);
      const reads = state.gatewayReads;
      const catalogReads = state.catalogReads;
      await toggle(page, id).click();
      await page.getByRole('dialog').getByRole('button', { name: action === 'connect' ? '确认写入接入配置' : '确认断开并还原', exact: true }).click();
      await visible(page, page.getByRole('alert').filter({ hasText: 'fixture gateway mutation uncertain after possible write' }));
      assert.equal(await page.getByRole('dialog').count(), 0, 'uncertain writes consume the old confirmation');
      assert.ok(state.gatewayReads > reads, 'uncertain writes must reread gateway status');
      assert.ok(state.catalogReads > catalogReads, 'uncertain writes must reread the target catalog');
      assert.equal(await toggle(page, id).getAttribute('aria-checked'), String(action === 'connect'), 'readback reflects the possible write, not the old assumption');
      assert.equal(await page.getByText('客户端配置操作已完成并重新读取；请以更新后的状态为准。', { exact: true }).count(), 0);
      assert.deepEqual(state.gatewayActions, [{ action, client: id, ...(action === 'connect' ? { port: 3127, target: 'auto', expectedRevision: state.catalogHash } : {}), confirm: true }]);
      await toggle(page, id).click();
      await visible(page, page.getByRole('dialog').getByRole('button', { name: action === 'connect' ? '确认断开并还原' : '确认写入接入配置', exact: true }));
      assert.equal(state.gatewayActions.length, 1, 'readback changes do not authorize a second write');
      await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
      assert.equal(state.gatewayActions.length, 1);
    });
  }

  await t.test('Agent update preview and cancel are read-only; confirm forwards exactly its revision', async st => {
    const { page, state } = await fixture(st);
    await openClients(page, baseUrl);
    await expandClient(page, 'claude');
    const preview = panel(page, 'claude').getByRole('button', { name: '预览客户端更新', exact: true });
    await preview.click();
    await visible(page, page.getByRole('dialog').getByText(/fixture\/runtime\/npm-cli.js/));
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.deepEqual(state.clientActions, [{ action: 'preview-update', client: 'claude' }]);
    await preview.click();
    await page.getByRole('dialog').getByRole('button', { name: '确认更新客户端', exact: true }).waitFor();
    const revision = state.previews.claude;
    await page.getByRole('dialog').getByRole('button', { name: '确认更新客户端', exact: true }).click();
    await page.keyboard.press('Escape');
    await visible(page, page.getByText('更新命令已完成并重新读取版本；客户端不会自动重启。', { exact: true }));
    assert.deepEqual(state.clientActions.at(-1), { action: 'update', client: 'claude', expectedRevision: revision, confirm: true });
    await visible(page, panel(page, 'claude').getByText(/已检测到程序 · 1.2.4/));
    assert.equal(state.gatewayActions.length, 0);
  });

  for (const status of [409, 503]) {
    await t.test(`Agent update HTTP ${status} consumes stale preview and requires a new preview`, async st => {
      const { page, state } = await fixture(st);
      state.failUpdate = status;
      await openClients(page, baseUrl);
      await expandClient(page, 'claude');
      const preview = panel(page, 'claude').getByRole('button', { name: '预览客户端更新', exact: true });
      await preview.click();
      await page.getByRole('dialog').getByRole('button', { name: '确认更新客户端', exact: true }).waitFor();
      const staleRevision = state.previews.claude;
      await page.getByRole('dialog').getByRole('button', { name: '确认更新客户端', exact: true }).click();
      await page.keyboard.press('Escape');
      await visible(page, page.getByRole('alert').filter({ hasText: 'fixture update failed; obtain a new preview' }));
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(state.clientActions.filter(action => action.action === 'update').length, 1);
      await preview.click();
      await page.getByRole('dialog').getByRole('button', { name: '确认更新客户端', exact: true }).waitFor();
      assert.notEqual(state.previews.claude, staleRevision);
      state.failUpdate = 0;
      const freshRevision = state.previews.claude;
      await page.getByRole('dialog').getByRole('button', { name: '确认更新客户端', exact: true }).click();
      await page.keyboard.press('Escape');
      await visible(page, page.getByText('更新命令已完成并重新读取版本；客户端不会自动重启。', { exact: true }));
      assert.equal(state.clientActions.at(-1).expectedRevision, freshRevision);
    });
  }

  for (const status of ['drift', 'unreadable']) {
    await t.test(`Agent ${status} readback blocks toggle and target mutation at 390px`, async st => {
      const { page, state } = await fixture(st, { gatewayStatus: readyGateway, viewport: { width: 390, height: 900 },
        connectionOverrides: { claude: { connected: true, target: 'model:model-alpha', readback: { status }, ownership: { status: status === 'drift' ? 'drift' : 'unknown' } } } });
      await openClients(page, baseUrl);
      await expandClient(page, 'claude');
      await visible(page, panel(page, 'claude').getByText(/请先检查配置及恢复记录/));
      assert.equal(await toggle(page, 'claude').isDisabled(), true);
      await choose(page, 'Claude Code 默认目标', /Beta · model-beta/);
      assert.equal(await panel(page, 'claude').getByRole('button', { name: '应用默认目标' }).isDisabled(), true);
      assert.equal(state.gatewayActions.length, 0);
      await noPageOverflow(page);
    });
  }
}
