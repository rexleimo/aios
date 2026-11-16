import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { applyEdits, ConfigError, toEditable, validateDocument } from '../../../../apps/shell/ui/src/lib/config/model-routing.mjs';
import { getProviderForModel, loadProviders, resolveProviderApiKey } from '../../../lib/tooling/model-router/routing/providers.mjs';
import { createRoutingGatewayApp } from '../../../lib/tooling/model-router/gateway/proxy.mjs';
import { getClientRoleMatrix, resolveClientRoleModel } from '../../../lib/tooling/model-router/routing/client-role-matrix.mjs';
import { browserRuntime } from './browser/gateway-fixture.mjs';

const fixture = () => ({
  activeModel: 'custom-model',
  models: { 'custom-model': { source: 'custom', provider: 'upstream', protocols: ['claude'] } },
  providers: { upstream: {
    baseUrl: 'https://upstream.invalid', apiKeyEnv: 'env:PROVIDER_KEY', protocols: ['claude'], models: [],
    headers: { 'x-region': 'fixture' }, retryPolicy: { attempts: 3 },
    accounts: [
      { id: 'primary', apiKeyEnv: 'env:PRIMARY_KEY', weight: 3, label: 'Primary' },
      { id: 'backup', apiKeyEnv: 'env:BACKUP_KEY', weight: 1 },
      { id: 'inherited', apiKeyEnv: '', enabled: true },
    ],
  } },
  clientRoleMatrix: { default: { implementer: 'custom-model' }, clients: {} },
});
const env = { PROVIDER_KEY: 'provider-fixture', PRIMARY_KEY: 'primary-fixture', BACKUP_KEY: 'backup-fixture', ROTATED: 'rotated-fixture' };

test('adapter normalization and actual gateway forwarding honor model binding and account credentials', async () => {
  const document = fixture();
  const editable = toEditable(document);
  editable.providers[0].id = ' Upstream ';
  editable.providers[0].apiKeyEnv = ' env:ROTATED ';
  editable.customModels[0].provider = ' UPSTREAM ';
  editable.customModels[0].upstreamModel = 'Vendor/Custom-V1:Latest';
  const next = applyEdits(document, editable);
  assert.doesNotThrow(() => validateDocument(next));
  assert.deepEqual(next.providers.upstream.accounts, document.providers.upstream.accounts, 'provider-level key edits do not migrate accounts');
  assert.deepEqual(next.providers.upstream.retryPolicy, document.providers.upstream.retryPolicy);
  assert.equal(next.models['custom-model'].provider, 'upstream');
  assert.equal(toEditable(next).customModels[0].upstreamModel, 'Vendor/Custom-V1:Latest');
  assert.equal(getProviderForModel('custom-model', next).provider.id, 'upstream');

  const captured = [];
  const { app, decisions } = createRoutingGatewayApp({ registry: next, role: 'implementer', env,
    fetchImpl: async (url, init) => {
      captured.push({ url, headers: init.headers, body: JSON.parse(new TextDecoder().decode(init.body)) });
      return new Response('{}', { status: captured.length < 3 ? 401 : 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const response = await app.request('/v1/messages', { method: 'POST', body: JSON.stringify({ model: 'ignored-client-model', messages: [] }) });
  assert.equal(response.status, 200);
  await response.text();
  assert.deepEqual(captured.map((item) => item.url), Array(3).fill('https://upstream.invalid/claude/v1/messages'));
  assert.deepEqual(captured.map((item) => item.headers['x-api-key']), ['primary-fixture', 'backup-fixture', 'rotated-fixture']);
  assert.ok(captured.every((item) => item.body.model === 'Vendor/Custom-V1:Latest'));
  assert.equal(decisions[0].modelId, 'custom-model');
  assert.equal(decisions[0].upstreamModel, 'Vendor/Custom-V1:Latest');
  assert.equal(decisions[0].providerId, 'upstream');
  assert.equal(decisions[0].account, 'inherited');
  for (const value of Object.values(env)) assert.ok(!JSON.stringify(decisions).includes(value), 'decision records contain no credentials');
});

test('invalid bindings and missing credentials return 503 before classifier or upstream fetch', async () => {
  for (const { patch, credentials = env, code = 'NO_ROUTE_CONFIGURED' } of [
    { patch: { provider: 'deleted-provider' } }, { patch: { protocols: ['gemini'] } },
    { patch: { protocols: ['bogus'] } }, { patch: { protocols: [] } },
    { patch: {}, credentials: {}, code: 'PROVIDER_CREDENTIALS_MISSING' },
  ]) {
    const document = fixture();
    Object.assign(document.models['custom-model'], patch);
    if (code === 'PROVIDER_CREDENTIALS_MISSING') {
      document.models.classifier = { source: 'discovered', provider: 'classifier', protocols: ['claude'] };
      document.providers.classifier = { baseUrl: 'https://classifier.invalid', authMode: 'none', protocols: ['claude'], models: [] };
      document.intentRouting = { enabled: true, classifierModel: 'classifier', intents: [{ id: 'quick', description: 'General questions', modelId: 'classifier' }] };
    }
    let requests = 0;
    let classifications = 0;
    const { app, decisions } = createRoutingGatewayApp({ registry: document, env: credentials,
      classifyIntent: async () => { classifications++; throw new Error('must not classify'); },
      fetchImpl: async () => { requests++; throw new Error('must not fetch'); },
    });
    let routingError;
    app.onError((error) => { routingError = error; return new Response('{}', { status: 500 }); });
    const response = await app.request('/v1/messages', { method: 'POST', body: JSON.stringify({ model: 'custom-model', messages: [] }) });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { code } });
    assert.equal(routingError, undefined, 'configuration failures are handled, not unhandled 500s');
    assert.equal(classifications, 0);
    assert.equal(requests, 0, 'no implicit relay or alternate protocol request may escape');
    assert.equal(decisions[0].status, 503);
    assert.equal(decisions[0].error, code);
  }
});

test('explicit account key changes, reordering and removal preserve metadata and effective runtime behavior', () => {
  const document = fixture();
  const editable = toEditable(document);
  editable.providers[0].accounts.reverse();
  editable.providers[0].accounts[1].apiKeyEnv = 'env:ROTATED';
  const next = applyEdits(document, editable);
  assert.deepEqual(next.providers.upstream.accounts, [
    document.providers.upstream.accounts[2],
    { ...document.providers.upstream.accounts[1], apiKeyEnv: 'env:ROTATED' },
    document.providers.upstream.accounts[0],
  ]);
  const provider = loadProviders(next).upstream;
  assert.equal(resolveProviderApiKey(provider, env), 'provider-fixture');
  assert.equal(resolveProviderApiKey(provider, env, 'backup'), 'rotated-fixture');
  editable.providers[0].accounts = [];
  editable.providers[0].apiKeyEnv = '';
  const cleared = applyEdits(document, editable);
  assert.equal(resolveProviderApiKey(loadProviders(cleared).upstream, env), '', 'explicitly removing all refs leaves no hidden old key');
});

test('adapter rejects missing/incompatible bindings while preserving legacy unbound custom models and curated launcher metadata', () => {
  for (const source of ['custom', 'discovered']) {
    for (const patch of [{ provider: 'missing' }, { protocols: ['gemini'] }, { provider: {} }]) {
      const document = fixture();
      Object.assign(document.models['custom-model'], { source }, patch);
      assert.throws(() => validateDocument(document), { name: 'ConfigError', path: 'models.custom-model.provider' });
    }
  }
  const legacy = fixture();
  delete legacy.models['custom-model'].provider;
  legacy.providers.upstream.models = ['custom-model'];
  const next = applyEdits(legacy, toEditable(legacy));
  assert.equal(next.models['custom-model'].provider, undefined, 'round-trip must not introduce an implicit relay binding');
  assert.equal(getProviderForModel('custom-model', next).provider.id, 'upstream');
  next.providers.upstream.protocols = ['gemini'];
  assert.throws(() => validateDocument(next), /compatible protocol/u, 'legacy model lists use the same compatibility rule');
  assert.doesNotThrow(() => validateDocument({ models: { curated: { provider: 'codex', protocols: ['openai-response'] } } }));
});

test('adapter and runtime agree on normalized protocol aliases, provider ids and account ids', () => {
  const document = fixture();
  document.providers = { ' UPSTREAM ': { ...document.providers.upstream, protocols: ['anthropic-messages'] } };
  document.providers[' UPSTREAM '].accounts[0].id = ' PRIMARY ';
  document.models['custom-model'].provider = ' UPSTREAM ';
  document.models['custom-model'].protocols = ['messages'];
  assert.doesNotThrow(() => validateDocument(document));
  const next = applyEdits(document, toEditable(document));
  assert.deepEqual(next.providers.upstream.accounts[0], { id: 'primary', apiKeyEnv: 'env:PRIMARY_KEY', weight: 3, label: 'Primary' });
  assert.equal(getProviderForModel('custom-model', next).protocol, 'claude');
  assert.equal(resolveProviderApiKey(loadProviders(next).upstream, env, 'primary'), 'primary-fixture');
});

test('adapter rejects malformed provider arrays and plaintext/ambiguous account credentials before coercion', () => {
  for (const patch of [
    { accounts: {} }, { accounts: [null] }, { accounts: [{ id: 'p', apiKey: 'fixture-plaintext' }] },
    { accounts: [{ id: 'p' }, { id: ' P ' }] }, { accounts: [{ id: 'p', apiKeyEnv: 'not-an-env-ref' }] },
    { protocols: 'claude' }, { models: 'model' }, { protocols: ['claude', 'bogus'] }, { apiKey: 'fixture-plaintext' },
  ]) {
    const document = fixture();
    assert.throws(() => validateDocument({ ...document, providers: { upstream: { ...document.providers.upstream, ...patch } } }), ConfigError);
    const editable = toEditable(document);
    Object.assign(editable.providers[0], patch);
    assert.throws(() => validateDocument(applyEdits(document, editable)), ConfigError);
  }
});

test('matrix validation checks default and every client role ref, including deleted custom models', () => {
  for (const section of ['default', 'client']) {
    for (const value of ['missing', '__proto__', 42, false, null, {}, [], ['custom-model']]) {
      const document = fixture();
      document.clientRoleMatrix = section === 'default'
        ? { default: { implementer: value } }
        : { clients: { claude: { implementer: value } } };
      assert.throws(() => validateDocument(document), { name: 'ConfigError', path: `clientRoleMatrix.${section === 'default' ? 'default' : 'clients.claude'}.implementer` });
      assert.throws(() => validateDocument(applyEdits(document, { ...toEditable(fixture()), matrix: document.clientRoleMatrix })), ConfigError);
    }
    const document = fixture();
    document.clientRoleMatrix = section === 'default' ? { default: { implementer: 'custom-model' } } : { clients: { claude: { implementer: 'custom-model' } } };
    const editable = toEditable(document);
    editable.customModels = [];
    assert.throws(() => validateDocument(applyEdits(document, editable)), /unknown model/u);
  }
});

test('matrix validation rejects malformed maps without silently converting them into inheritance', () => {
  for (const matrix of [null, [], 'bad', { default: null }, { default: [] }, { clients: null }, { clients: [] },
    { clients: { claude: null } }, { clients: { claude: [] } }, { clients: { claude: 'custom-model' } }]) {
    assert.throws(() => validateDocument({ ...fixture(), clientRoleMatrix: matrix }), ConfigError);
    assert.throws(() => applyEdits(fixture(), { ...toEditable(fixture()), matrix }), ConfigError);
  }
});

test('matrix inheritance, normalized model refs and arbitrary role/client ids remain legitimate', () => {
  const document = fixture();
  document.clientRoleMatrix = { default: { implementer: ' CUSTOM-MODEL ', planner: '' }, clients: {
    claude: { implementer: '', planner: '   ' }, 'future-client': { 'future-role': 'custom-model' },
  } };
  assert.doesNotThrow(() => validateDocument(document));
  assert.equal(resolveClientRoleModel('claude', 'implementer', document, {}).modelId, 'custom-model');
  assert.equal(resolveClientRoleModel('claude', 'planner', document, {}), null);
  assert.deepEqual(applyEdits(document, toEditable(document)).clientRoleMatrix, document.clientRoleMatrix, 'a no-op retains raw legacy references');
  const editable = toEditable(document);
  editable.matrix.clients.claude.implementer = 'custom-model';
  assert.equal(document.clientRoleMatrix.clients.claude.implementer, '', 'nested projection edits must not mutate the source');
  editable.matrix.clients.claude.implementer = '';
  editable.matrix.default.implementer = 'custom-model';
  const next = applyEdits(document, editable);
  const expected = getClientRoleMatrix(document);
  delete expected.clients.claude;
  assert.deepEqual(getClientRoleMatrix(next), expected, 'empty client maps are pruned without changing inheritance');
  for (const client of ['claude', 'future-client']) for (const role of ['implementer', 'planner', 'future-role']) {
    assert.deepEqual(resolveClientRoleModel(client, role, next, {}), resolveClientRoleModel(client, role, document, {}));
  }
  for (const matrix of [undefined, {}, { default: {} }, { clients: {} }]) assert.doesNotThrow(() => validateDocument({ ...document, clientRoleMatrix: matrix }));
});

test('provider dialog exposes all account refs, stages explicit edits, and confirms endpoint credential risk offline', async (t) => {
  const runtime = await browserRuntime();
  let build;
  try { ({ build } = await import('esbuild')); } catch { /* Optional browser test tooling. */ }
  if (!runtime || !build) return t.skip('Chrome/Playwright or esbuild is unavailable');
  const browser = await runtime.chromium.launch({ executablePath: runtime.executablePath });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => route.abort());
  await page.setContent('<div id="root"></div>');
  const document = fixture();
  await page.evaluate((initial) => { window.initialProvider = initial; window.submissions = []; }, toEditable(document).providers[0]);
  const bundle = await build({
    stdin: { contents: `import { createElement } from 'react';
      import { createRoot } from 'react-dom/client';
      import { ModelSourceProviderDialog } from './src/components/console/gateway/model-source-provider-dialog';
      import { ModelSourceSection } from './src/components/console/model-routing/model-source-section';
      const root = createRoot(document.getElementById('root'));
      let sequence = 0;
      window.renderProvider = initialValue => root.render(createElement(ModelSourceProviderDialog, {
        key: ++sequence, initialValue, providers: [window.initialProvider], onClose() {},
        onSubmit(value) { window.submissions.push(value); }
      }));
      window.renderSummary = () => root.render(createElement(ModelSourceSection, {
        models: [], customModels: [], providers: [window.initialProvider],
        onChangeCustomModels() {}, onChangeProviders() {}, onRefresh() {}, saving: false, dirty: false
      }));
      window.renderProvider(window.initialProvider);`, resolveDir: path.resolve(import.meta.dirname, '../../../../apps/shell/ui'), sourcefile: 'provider-dialog-fixture.tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const dialog = page.getByRole('dialog');
  const field = (name) => dialog.getByRole('textbox', { name, exact: true });
  assert.equal(await field('账号 1 密钥环境变量引用').inputValue(), 'env:PRIMARY_KEY');
  assert.equal(await field('账号 2 密钥环境变量引用').inputValue(), 'env:BACKUP_KEY');
  assert.equal(await field('账号 3 密钥环境变量引用').inputValue(), '');
  assert.equal(await field('账号 1 标识').isDisabled(), true, 'existing account ids protect metadata identity');
  await field('密钥环境变量引用').fill('env:ROTATED');
  await dialog.getByRole('button', { name: '加入草稿' }).click();
  let submitted = await page.evaluate(() => window.submissions.at(-1));
  assert.deepEqual(applyEdits(document, { ...toEditable(document), providers: [submitted] }).providers.upstream.accounts, document.providers.upstream.accounts);
  await field('账号 1 密钥环境变量引用').fill('env:ROTATED');
  await field('账号 2 密钥环境变量引用').fill('');
  await dialog.getByRole('button', { name: '上移账号 2', exact: true }).click();
  await field('API 端点').fill('https://new-upstream.invalid');
  await dialog.getByRole('button', { name: '加入草稿' }).click();
  await dialog.getByText('请确认所有账号的有效密钥引用都可以发送到新的 API 端点。', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.submissions.length), 1);
  const confirmation = dialog.getByRole('checkbox', { name: '我确认这些账号密钥可以用于新的 API 端点' });
  await confirmation.check();
  await field('账号 1 密钥环境变量引用').fill('env:BACKUP_KEY');
  assert.equal(await confirmation.isChecked(), false, 'changing credential scope invalidates endpoint confirmation');
  await confirmation.check();
  await dialog.getByRole('button', { name: '加入草稿' }).click();
  submitted = await page.evaluate(() => window.submissions.at(-1));
  const next = applyEdits(document, { ...toEditable(document), providers: [submitted] });
  assert.deepEqual(next.providers.upstream.accounts.map((account) => account.id), ['backup', 'primary', 'inherited']);
  assert.equal(next.providers.upstream.accounts[0].weight, 1);
  assert.equal(next.providers.upstream.accounts[1].label, 'Primary');
  assert.equal(resolveProviderApiKey(loadProviders(next).upstream, env), 'backup-fixture');
  for (let i = 0; i < 3; i++) await dialog.getByRole('button', { name: '移除账号 1', exact: true }).click();
  await field('密钥环境变量引用').fill('');
  await dialog.getByRole('button', { name: '加入草稿' }).click();
  submitted = await page.evaluate(() => window.submissions.at(-1));
  const cleared = applyEdits(document, { ...toEditable(document), providers: [submitted] });
  assert.equal(resolveProviderApiKey(loadProviders(cleared).upstream, env), '');

  await page.evaluate(() => window.renderProvider({ ...window.initialProvider, accounts: [] }));
  await page.waitForFunction(() => document.querySelector('input[aria-label="密钥环境变量引用"]')?.value === 'env:PROVIDER_KEY');
  await field('API 端点').fill('https://provider-only.invalid');
  await dialog.getByRole('button', { name: '加入草稿' }).click();
  await dialog.getByText('请确认所有账号的有效密钥引用都可以发送到新的 API 端点。', { exact: true }).waitFor();
  await confirmation.check();
  await dialog.getByRole('button', { name: '加入草稿' }).click();
  submitted = await page.evaluate(() => window.submissions.at(-1));
  assert.equal(submitted.baseUrl, 'https://provider-only.invalid');
  assert.deepEqual(submitted.accounts, []);

  await page.evaluate(() => window.renderProvider(undefined));
  await page.waitForFunction(() => document.querySelector('input[aria-label="供应商标识"]')?.value === '');
  await field('供应商标识').fill('new-provider');
  await field('API 端点').fill('https://new.invalid');
  await field('密钥环境变量引用').fill('env:ROTATED');
  assert.equal(await confirmation.count(), 0, 'new no-account providers retain the existing add flow');
  await dialog.getByRole('button', { name: '加入草稿' }).click();
  submitted = await page.evaluate(() => window.submissions.at(-1));
  assert.equal(submitted.id, 'new-provider');
  assert.equal(submitted.accounts, undefined);
  await dialog.getByText('多账号与重试 · 可选', { exact: true }).click();
  await dialog.getByRole('button', { name: '添加账号', exact: true }).click();
  await field('账号 1 标识').fill('extra');
  await field('账号 1 密钥环境变量引用').fill('not-an-env-reference');
  await dialog.getByRole('button', { name: '加入草稿' }).click();
  await dialog.getByText('账号密钥只能填写 env:VARIABLE 引用，不能填写真实密钥。', { exact: true }).waitFor();
  await field('账号 1 密钥环境变量引用').fill('env:BACKUP_KEY');
  await dialog.getByRole('button', { name: '加入草稿' }).click();
  submitted = await page.evaluate(() => window.submissions.at(-1));
  assert.deepEqual(submitted.accounts, [{ id: 'extra', apiKeyEnv: 'env:BACKUP_KEY' }]);

  await page.evaluate(() => window.renderSummary());
  await page.getByText('配置详情', { exact: true }).click();
  const summary = page.getByRole('list', { name: 'upstream 账号有效密钥引用' });
  await summary.waitFor();
  assert.match(await summary.innerText(), /primary：env:PRIMARY_KEY/u);
  assert.match(await summary.innerText(), /backup：env:BACKUP_KEY/u);
  assert.match(await summary.innerText(), /inherited：env:PROVIDER_KEY（继承供应商）/u);
  assert.deepEqual(errors, []);
});
