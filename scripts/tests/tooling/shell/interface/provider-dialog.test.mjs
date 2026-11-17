import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { browserRuntime } from '../browser/gateway-fixture.mjs';
import { connectionUrls, endpointFingerprint, selectPreset, updateConnection } from '../../../../../apps/shell/ui/src/components/console/gateway/provider/connections.mjs';
import { PROVIDER_PRESETS } from '../../../../../apps/shell/ui/src/components/console/gateway/provider/presets.mjs';
import { applyEdits, validateDocument } from '../../../../../apps/shell/ui/src/lib/config/model-routing.mjs';

test('presets distinguish plans and keep each API base, without credentials or implicit models', () => {
  const initial = { id: '', apiKeyEnv: '', baseUrl: '', protocols: [], models: [] };
  const payg = selectPreset(initial, 'zhipu', 'api');
  const coding = selectPreset(initial, 'zhipu', 'coding');
  assert.equal(payg.protocolBaseUrls['openai-chat'], 'https://open.bigmodel.cn/api/paas/v4');
  assert.equal(coding.protocolBaseUrls['openai-chat'], 'https://open.bigmodel.cn/api/coding/paas/v4');
  assert.equal(coding.protocolBaseUrls['openai-response'], 'https://open.bigmodel.cn/api/v1');
  assert.equal(coding.protocolBaseUrls.claude, 'https://open.bigmodel.cn/api/anthropic');
  assert.deepEqual(coding.models, []);
  assert.equal(coding.apiKeyEnv, '');
  assert.equal(selectPreset(initial, 'ollama').authMode, 'none');
  assert.equal(initial.id, '');
  for (const preset of PROVIDER_PRESETS.filter(item => item.id !== 'custom')) {
    const draft = selectPreset(initial, preset.id);
    assert.doesNotThrow(() => validateDocument(applyEdits({}, { providers: [draft] })), `${preset.id} must be stageable`);
  }
});

test('legacy connection projection preserves destinations until an explicit endpoint edit', () => {
  const legacy = { id: 'old', baseUrl: 'https://relay.invalid', protocols: ['openai-chat', 'claude', 'gemini'] };
  assert.deepEqual(connectionUrls(legacy), {
    'openai-chat': 'https://relay.invalid/openai/v1', claude: 'https://relay.invalid/claude/v1', gemini: 'https://relay.invalid/gemini/v1beta',
  });
  const next = updateConnection(legacy, 'claude', 'https://other.invalid/api/anthropic');
  assert.equal(next.protocolBaseUrls['openai-chat'], 'https://relay.invalid/openai/v1');
  assert.equal(next.protocolBaseUrls.gemini, 'https://relay.invalid/gemini/v1beta');
  assert.equal(next.protocolBaseUrls.claude, 'https://other.invalid/api/anthropic');
  assert.notEqual(endpointFingerprint(next), endpointFingerprint(legacy));
  assert.equal(legacy.protocolBaseUrls, undefined);
  assert.equal(endpointFingerprint({ ...legacy, apiKeyEnv: 'env:NEW', preset: 'custom' }), endpointFingerprint(legacy));
});

test('editing an active API preserves dormant bases without silently enabling credential destinations', () => {
  const initial = { baseUrl: 'https://active.invalid', protocols: ['claude'], protocolBaseUrls: { claude: 'https://active.invalid', gemini: 'https://unused.invalid' } };
  const next = updateConnection(initial, 'claude', 'https://active.invalid/');
  assert.deepEqual(next.protocols, ['claude']);
  assert.equal(next.protocolBaseUrls.gemini, initial.protocolBaseUrls.gemini);
  assert.equal(endpointFingerprint(next), endpointFingerprint(initial));
  const activated = updateConnection(next, 'gemini', initial.protocolBaseUrls.gemini);
  assert.deepEqual(activated.protocols, ['claude', 'gemini']);
  assert.notEqual(endpointFingerprint(activated), endpointFingerprint(initial), 'enabling a saved but unused destination requires confirmation');
});

test('provider form stages multi-API presets, channel auth and headers; cancel and per-API credential risk stay explicit', async t => {
  const runtime = await browserRuntime();
  const { build } = await import('esbuild');
  assert.ok(runtime, 'browser tooling is required for this provider acceptance test');
  const browser = await runtime.chromium.launch({ executablePath: runtime.executablePath });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 740 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.abort());
  await page.setContent('<div id="root"></div>');
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { flushSync } from 'react-dom';
      import { ModelSourceProviderDialog } from './src/components/console/gateway/model-source-provider-dialog';
      const root = createRoot(document.getElementById('root')); let revision = 0;
      window.submissions = []; window.closeCount = 0;
      window.render = initialValue => flushSync(() => root.render(React.createElement(ModelSourceProviderDialog, {
        key: ++revision, initialValue, providers: [], onSubmit(value) { window.submissions.push(value); }, onClose() { window.closeCount++; }
      }))); window.render();`, resolveDir: path.resolve(import.meta.dirname, '../../../../../apps/shell/ui'), sourcefile: 'provider-acceptance.tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const dialog = page.getByRole('dialog');
  const field = name => dialog.getByRole('textbox', { name, exact: true });
  const choose = async (name, label) => {
    await dialog.getByRole('combobox', { name, exact: true }).click();
    await page.getByRole('option', { name: label, exact: true }).click();
  };
  await choose('供应商预设', '智谱 GLM');
  await choose('地区或套餐', 'Coding Plan');
  assert.equal(await field('API 端点').inputValue(), 'https://open.bigmodel.cn/api/coding/paas/v4');
  await field('密钥环境变量引用').fill('env:CHANNEL_KEY');
  await dialog.getByText('其他 API 地址', { exact: true }).click();
  assert.equal(await field('Anthropic Messages 地址').inputValue(), 'https://open.bigmodel.cn/api/anthropic');
  await field('Anthropic Messages 地址').fill('https://messages.invalid/custom/anthropic');
  await choose('Anthropic 密钥请求头', 'Authorization: Bearer');
  await dialog.getByText('自定义请求头', { exact: true }).click();
  await dialog.getByRole('button', { name: '添加请求头', exact: true }).click();
  await field('请求头 1 名称').fill('x-channel-key');
  await field('请求头 1 值').fill('env:CHANNEL_HEADER');
  assert.equal(await dialog.getByRole('combobox', { name: '供应商端点路径格式' }).count(), 0);
  await dialog.getByRole('button', { name: '加入草稿', exact: true }).click();
  await page.waitForFunction(() => window.submissions.length === 1);
  const submitted = await page.evaluate(() => window.submissions[0]);
  assert.equal(submitted.protocolBaseUrls.claude, 'https://messages.invalid/custom/anthropic');
  assert.equal(submitted.authHeader, 'bearer');
  assert.deepEqual(submitted.headers, { 'x-channel-key': 'env:CHANNEL_HEADER' });
  assert.equal(submitted.presetRegion, 'coding');

  await page.evaluate(value => window.render(value), submitted);
  await field('API 端点').waitFor();
  await dialog.getByText('其他 API 地址', { exact: true }).click();
  await field('Anthropic Messages 地址').fill('https://new-destination.invalid/anthropic');
  await dialog.getByRole('button', { name: '加入草稿', exact: true }).click();
  const confirmation = dialog.getByRole('checkbox', { name: '我确认这些账号密钥可以用于新的 API 端点' });
  await confirmation.waitFor();
  assert.match(await dialog.getByRole('list', { name: '需要确认的 API 地址', exact: true }).innerText(), /Anthropic Messages：https:\/\/new-destination.invalid\/anthropic/u);
  assert.match(await dialog.getByRole('list', { name: '需要确认的凭据范围', exact: true }).innerText(), /请求头 x-channel-key：env:CHANNEL_HEADER/u);
  assert.equal(await page.evaluate(() => window.submissions.length), 1);
  await confirmation.check();
  await field('OpenAI Responses 地址').fill('https://responses.invalid/v1');
  assert.equal(await confirmation.isChecked(), false, 'editing another API destination invalidates consent');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await page.evaluate(() => window.closeCount), 1);
  assert.equal(await page.evaluate(() => window.submissions.length), 1, 'cancel cannot stage a changed connection');
  for (const patch of [
    { protocolBaseUrls: { ...submitted.protocolBaseUrls, claude: 'https://messages.invalid/api?key=forbidden' } },
    { headers: { Authorization: 'fixture-plaintext-secret' } },
    { headers: { Cookie: 'fixture-cookie' } },
    { headers: { Host: 'other.invalid' } },
    { headers: { 'x-region': 'one', 'X-REGION': 'two' } },
    { authMode: 'none', headers: { 'x-tenant': 'env:EXTRA_CREDENTIAL' } },
  ]) {
    await page.evaluate(value => window.render(value), { ...submitted, ...patch });
    await field('API 端点').waitFor();
    await dialog.getByRole('button', { name: '加入草稿', exact: true }).click();
    await dialog.getByRole('status').waitFor();
    assert.ok((await dialog.getByRole('status').innerText()).length > 0, 'invalid connection is explained');
    assert.equal(await page.evaluate(() => window.submissions.length), 1, `invalid connection cannot stage: ${JSON.stringify(patch)}`);
  }
  const legacy = { id: 'legacy', baseUrl: 'https://relay.invalid', apiKeyEnv: 'env:LEGACY_KEY', protocols: ['claude'], models: [] };
  await page.evaluate(value => window.render(value), legacy);
  await field('API 端点').waitFor();
  assert.equal(await field('API 端点').inputValue(), 'https://relay.invalid/claude/v1');
  await dialog.getByRole('button', { name: '加入草稿', exact: true }).click();
  await page.waitForFunction(() => window.submissions.length === 2);
  const unchanged = await page.evaluate(() => window.submissions.at(-1));
  assert.deepEqual(unchanged, legacy, 'merely opening and staging must not migrate a legacy connection');
  assert.deepEqual(errors, []);
});
