import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import { browserRuntime } from '../browser/gateway-fixture.mjs';
import { serializeTargetRef } from '../../../../lib/tooling/model-router/routing/targets.mjs';

const modelRef = id => serializeTargetRef({ kind: 'model', id });
const rawId = ' Org/Case:% model ';
const emptyMatrix = () => ({ default: {}, clients: {} });
const profile = (matrix, extra = {}) => ({ name: 'Fixture', matrix, ...extra });

test('local role profiles preserve versioned intent and historical literal IDs offline', async t => {
  const runtime = await browserRuntime();
  assert.ok(runtime, 'Chrome/Playwright is required for profile acceptance tests');
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { flushSync } from 'react-dom';
      import { RoutingProfiles } from './src/components/console/gateway/routing-profiles';
      const root = createRoot(document.getElementById('root')); let revision = 0;
      window.applied = [];
      window.renderProfiles = props => flushSync(() => root.render(<RoutingProfiles key={++revision} {...props}
        onApply={matrix => window.applied.push(matrix)} />));`,
      resolveDir: path.resolve(import.meta.dirname, '../../../../../apps/shell/ui'), sourcefile: 'routing-profiles-fixture.tsx', loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
  });
  const browser = await runtime.chromium.launch({ executablePath: runtime.executablePath });
  t.after(() => browser.close());

  async function fixture(st, stored = [], props = {}, storageOptions = {}) {
    const page = await browser.newPage({ viewport: { width: 1080, height: 900 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(1500);
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
    await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
    await page.setContent('<style>svg{width:14px;height:14px}[role=dialog]{position:fixed;inset:10%;background:white;overflow:auto;z-index:50}</style><div id="root"></div>');
    await page.evaluate(({ stored, storageOptions }) => {
      window.storage = { value: typeof stored === 'string' ? stored : JSON.stringify(stored), writes: [], ...storageOptions };
      Object.defineProperty(window, 'localStorage', { value: {
        getItem(key) { if (key !== 'aios.profiles' || window.storage.failRead) throw new Error('fixture read denied'); return window.storage.value; },
        setItem(key, value) { if (key !== 'aios.profiles' || window.storage.failWrite) throw new Error('fixture write denied'); window.storage.writes.push(value); window.storage.value = value; },
      } });
      window.fetch = () => { throw new Error('profiles must not call any API'); };
    }, { stored, storageOptions });
    st.after(async () => {
      await page.close();
      assert.deepEqual(requests, [], 'no request may leave the offline profile fixture');
      assert.deepEqual(errors, [], 'real profile controls must not emit browser errors or warnings');
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const renderProps = { matrix: emptyMatrix(), modelIds: ['beta'], ...props };
    await page.evaluate(props => window.renderProfiles(props), renderProps);
    await page.getByRole('button', { name: '保存为方案', exact: true }).waitFor();
    return { page, renderProps };
  }
  const read = page => page.evaluate(() => ({ stored: JSON.parse(window.storage.value), writes: window.storage.writes, applied: window.applied }));
  async function save(page, name = 'New fixture') {
    await page.getByRole('button', { name: '保存为方案', exact: true }).click();
    await page.getByRole('textbox', { name: '方案名称', exact: true }).fill(name);
    await page.getByRole('dialog').getByRole('button', { name: '保存方案', exact: true }).click();
  }
  async function apply(page, index = 0) {
    await page.getByRole('button', { name: '应用到草稿', exact: true }).nth(index).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认应用', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
  }

  await t.test('new snapshots carry a version and apply canonical model references after remount', async st => {
    const matrix = { default: { implementer: modelRef('beta'), 'Future-Role': modelRef(rawId), empty: '' }, clients: { 'Future-Client': { reviewer: modelRef('model:beta') } } };
    const { page, renderProps } = await fixture(st, [], { matrix, modelIds: ['beta', rawId, 'model:beta'] });
    await save(page);
    const stored = [profile(matrix, { name: 'New fixture', targetRefVersion: 1 })];
    assert.deepEqual((await read(page)).stored, stored);
    await page.evaluate(props => window.renderProfiles(props), { ...renderProps, matrix: emptyMatrix() });
    await apply(page);
    assert.deepEqual(await read(page), { stored, writes: [JSON.stringify(stored)], applied: [matrix] });
  });

  await t.test('unversioned auto, group and model prefixes are always literal model IDs, without catalog guessing', async st => {
    const ids = ['auto', 'group:pool', 'model:beta', rawId, ' BETA '];
    const matrix = { default: Object.fromEntries(ids.map((id, index) => [`Future-Role-${index}`, id])), clients: { 'Future-Client': { reviewer: 'group:pool', empty: '' } } };
    const legacy = profile(matrix);
    const { page, renderProps } = await fixture(st, [legacy], { modelIds: ids, targetIds: ids.map(modelRef).concat('group:pool') });
    await apply(page);
    const migrated = { default: Object.fromEntries(ids.map((id, index) => [`Future-Role-${index}`, modelRef(id)])), clients: { 'Future-Client': { reviewer: modelRef('group:pool'), empty: '' } } };
    assert.deepEqual(await read(page), { stored: [legacy], writes: [], applied: [migrated] });
    await save(page);
    const persisted = (await read(page)).stored;
    assert.deepEqual(persisted[0], legacy, 'saving another profile must not relabel historical literal IDs as canonical syntax');
    assert.equal(persisted[1].targetRefVersion, 1);
    await page.evaluate(props => window.renderProfiles(props), renderProps);
    await apply(page);
    assert.deepEqual((await read(page)).applied, [migrated, migrated]);
  });

  await t.test('versioned group and Auto intent survives save and remount, including zero concrete models', async st => {
    const matrix = { default: { implementer: 'group:pool', reviewer: 'auto' }, clients: { codex: { implementer: 'auto' } } };
    const { page, renderProps } = await fixture(st, [], { matrix, modelIds: [], targetIds: ['group:pool'] });
    await save(page);
    await page.evaluate(props => window.renderProfiles(props), { ...renderProps, matrix: emptyMatrix() });
    await apply(page);
    assert.deepEqual((await read(page)).applied, [matrix]);
    const autoOnly = profile({ default: { reviewer: 'auto' }, clients: {} }, { targetRefVersion: 1 });
    await page.evaluate(value => { window.storage.value = JSON.stringify([value]); window.renderProfiles({ matrix: { default: {}, clients: {} }, modelIds: [], targetIds: [] }); }, autoOnly);
    await apply(page);
    assert.deepEqual((await read(page)).applied, [matrix, autoOnly.matrix]);
  });

  await t.test('missing, unbound and paused targets reject the whole profile without dropping any reference', async st => {
    const { page, renderProps } = await fixture(st);
    for (const value of ['model:missing', 'model:paused', 'group:missing', 'group:paused', 'group:pool', 'auto']) {
      const stored = profile({ default: { implementer: value, reviewer: 'model:beta' }, clients: { future: { role: value } } }, value === 'auto' ? {} : { targetRefVersion: 1 });
      await page.evaluate(({ stored, props }) => { window.storage.value = JSON.stringify([stored]); window.renderProfiles(props); }, { stored, props: { ...renderProps, modelIds: ['beta'], targetIds: ['model:beta', modelRef('group:pool')] } });
      await apply(page);
      assert.deepEqual(await read(page), { stored: [stored], writes: [], applied: [] }, value);
      await page.getByText(/未应用/u).waitFor();
    }
  });

  await t.test('malformed canonical targets and unknown versions stay recoverable but cannot apply', async st => {
    const { page, renderProps } = await fixture(st);
    for (const [targetRefVersion, value] of [[1, 'model:%GG'], [1, 'group:a/b'], [0, 'beta'], [2, 'beta'], ['1', 'beta'], [null, 'beta']]) {
      const stored = profile({ default: { implementer: value }, clients: {} }, { targetRefVersion });
      await page.evaluate(({ stored, props }) => { window.storage.value = JSON.stringify([stored]); window.renderProfiles(props); }, { stored, props: renderProps });
      await apply(page);
      assert.deepEqual(await read(page), { stored: [stored], writes: [], applied: [] });
      await page.getByText(/未应用/u).waitFor();
    }
    await save(page);
    assert.equal((await read(page)).stored[0].targetRefVersion, null, 'a newly saved profile must not silently discard an unsupported older entry');
  });

  await t.test('invalid storage is never overwritten by an apparently empty profile list', async st => {
    const { page, renderProps } = await fixture(st);
    for (const stored of ['{', '{}', JSON.stringify([profile({ default: { role: null }, clients: {} })]), JSON.stringify([profile({ default: {}, clients: [] })])]) {
      await page.evaluate(({ stored, props }) => { window.storage.value = stored; window.renderProfiles(props); }, { stored, props: renderProps });
      await page.getByRole('status').waitFor();
      assert.equal(await page.getByRole('button', { name: '保存为方案', exact: true }).isDisabled(), true);
      assert.deepEqual(await page.evaluate(() => ({ value: window.storage.value, writes: window.storage.writes })), { value: stored, writes: [] });
    }
  });

  await t.test('storage write failures retain the existing profile and never report success', async st => {
    const stored = profile(emptyMatrix(), { targetRefVersion: 1 });
    const { page } = await fixture(st, [stored], {}, { failWrite: true });
    await save(page);
    await page.getByRole('dialog').getByText(/浏览器存储不可用/u).waitFor();
    assert.deepEqual(await read(page), { stored: [stored], writes: [], applied: [] });
  });
});
