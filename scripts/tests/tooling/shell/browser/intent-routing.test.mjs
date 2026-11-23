import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { browserRuntime, choose, noPageOverflow } from './gateway-fixture.mjs';

const ui = path.resolve(import.meta.dirname, '../../../../../apps/shell/ui');
const models = [
  { id: 'alpha', label: 'Alpha', provider: 'fixture', protocols: ['openai-chat'], cost: 'unknown' },
  { id: 'beta', label: 'Beta', provider: 'fixture', protocols: ['claude'], cost: 'unknown' },
  { id: 'gamma', label: 'Gamma', provider: 'fixture', protocols: ['gemini'], cost: 'unknown' },
  { id: 'disabled', label: 'Disabled', provider: 'fixture', protocols: ['openai-chat'], cost: 'unknown', enabled: false },
];
const empty = { enabled: false, classifierModel: '', intents: [] };
const rule = (id, modelId = 'beta') => ({ id, modelId, description: 'Short conversation' });
const fixtureMarkup = '<meta name="viewport" content="width=device-width,initial-scale=1"><div class="ml-[68px] min-w-0 md:ml-[212px]"><main id="root" class="mx-auto max-w-[1440px] px-4 py-7 lg:px-8 lg:py-9"></main></div>';

async function assets() {
  const { build } = await import('esbuild');
  const require = createRequire(path.join(ui, 'package.json'));
  const { default: postcss } = await import(pathToFileURL(require.resolve('postcss')).href);
  const { default: tailwind } = await import(pathToFileURL(require.resolve('@tailwindcss/postcss')).href);
  const stylesheet = path.join(ui, 'src/app/globals.css');
  const [bundle, css] = await Promise.all([
    build({
      stdin: { contents: `import { createElement } from 'react';
        import { createRoot } from 'react-dom/client';
        import { IntentRoutingSection } from './src/components/console/model-routing/intent-routing-section';
        const root = createRoot(document.getElementById('root'));
        let value = window.initialValue;
        const render = () => root.render(createElement(IntentRoutingSection, {
          value, models: window.initialModels, targets: window.initialTargets,
          onChange(next) { value = next; window.draft = next; window.draftChanges.push(next); render(); }
        }));
        window.draft = value;
        window.draftChanges = [];
        window.replaceValue = next => { value = next; window.draft = next; render(); };
        render();`, resolveDir: ui, sourcefile: 'intent-ui-fixture.tsx' },
      bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"test"' },
    }),
    postcss([tailwind({ base: ui })]).process(fs.readFileSync(stylesheet, 'utf8'), { from: stylesheet }),
  ]);
  return { js: bundle.outputFiles[0].text, css: css.css };
}

test('optional intent editor works offline with real shared controls and generated CSS', async (t) => {
  const runtime = await browserRuntime();
  if (!runtime) return t.skip('Chrome/Playwright is unavailable');
  const compiled = await assets();
  const artifacts = process.env.AIOS_GATEWAY_TEST_ARTIFACTS;
  if (artifacts) {
    fs.mkdirSync(artifacts, { recursive: true });
    const preview = { enabled: true, classifierModel: 'alpha', intents: [
      { id: 'quick', description: '快速问答、简单查询、日常闲聊', modelId: 'alpha' },
      { id: 'code', description: '编写代码、实现功能、修复 bug', modelId: 'beta' },
      { id: 'analysis', description: '复杂分析、多步骤推理与方案评审', modelId: 'gamma' },
    ] };
    fs.writeFileSync(path.join(artifacts, 'intent-preview.html'), `<!doctype html><html lang="zh-CN" data-rex-theme="light"><head><meta charset="utf-8"><title>Intent routing offline preview</title><style>${compiled.css}</style></head><body>${fixtureMarkup}<script>window.initialValue=${JSON.stringify(preview)};window.initialModels=${JSON.stringify(models)};</script><script>${compiled.js.replace(/<\/script/giu, '<\\/script')}</script><script>
      if (new URLSearchParams(location.search).has('edit')) {
        const open = () => {
          const button = document.querySelector('button[aria-label^="编辑意图"]');
          if (button) button.click(); else requestAnimationFrame(open);
        };
        requestAnimationFrame(open);
      }
    </script></body></html>`);
  }
  const browser = await runtime.chromium.launch({ executablePath: runtime.executablePath });
  t.after(() => browser.close());

  async function fixture(st, value = empty, candidates = models, options = {}, targets) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, ...options });
    const errors = [];
    const requests = [];
    page.setDefaultTimeout(10_000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (['warning', 'error'].includes(message.type())) errors.push(message.text());
    });
    await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
    st.after(async () => {
      await page.close();
      assert.deepEqual(requests, [], 'no request may leave the offline fixture');
      assert.deepEqual(errors, []);
    });
    await page.setContent(fixtureMarkup);
    await page.addStyleTag({ content: compiled.css });
    await page.evaluate(([initialValue, initialModels, initialTargets]) => Object.assign(window, { initialValue, initialModels, initialTargets: initialTargets ?? undefined }), [value, candidates, targets]);
    await page.addScriptTag({ content: compiled.js });
    await page.getByRole('switch', { name: '启用按意图路由' }).waitFor();
    return page;
  }

  async function closeEditor(page) {
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  }

  await t.test('disabled form unmounts; basic rules need no advanced input and survive toggling', async st => {
    const page = await fixture(st);
    const toggle = page.getByRole('switch', { name: '启用按意图路由' });
    assert.equal(await page.getByRole('combobox').count(), 0);
    assert.equal(await page.locator('input, textarea, details').count(), 0);
    await toggle.click();
    await page.getByText(/额外.*调用.*费用/).waitFor();
    await page.getByRole('combobox', { name: '分类器模型' }).click();
    assert.deepEqual(await page.getByRole('option').allTextContents(), ['选择模型', 'fixture / Alpha', 'fixture / Beta']);
    await page.getByRole('option', { name: 'fixture / Alpha', exact: true }).click();
    await page.getByRole('button', { name: '添加意图规则', exact: true }).click();
    await page.getByRole('textbox', { name: '意图 1 描述', exact: true }).fill('Small questions');
    await choose(page, '意图 1 模型', 'fixture / Beta');
    assert.equal(await page.getByRole('textbox', { name: '意图 1 id', exact: true }).count(), 0);
    assert.deepEqual(await page.evaluate(() => window.draft), {
      enabled: true, classifierModel: 'alpha', intents: [{ id: 'intent-1', description: 'Small questions', modelId: 'beta' }],
    });
    await closeEditor(page);
    await page.getByText('高级：内部意图 ID', { exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: '意图 1 id', exact: true }).inputValue(), 'intent-1');
    await toggle.click();
    assert.equal(await page.locator('input, textarea, details').count(), 0, 'controls unmount rather than merely becoming inaccessible');
    await toggle.click();
    assert.equal(await page.getByRole('textbox', { name: '意图 1 描述', exact: true }).count(), 0);
    await page.getByRole('button', { name: '编辑意图 1', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: '意图 1 描述', exact: true }).inputValue(), 'Small questions');
    assert.equal(await page.getByRole('textbox', { name: '意图 1 id', exact: true }).count(), 0);
    assert.match(await page.getByRole('combobox', { name: '意图 1 模型' }).innerText(), /fixture \/ Beta/);
  });

  await t.test('confidence threshold is configurable in the UI and lands in the draft', async st => {
    const page = await fixture(st, { enabled: true, classifierModel: 'alpha', intents: [{ ...rule('chat'), description: 'Chat' }] });
    const select = page.getByRole('combobox', { name: '意图置信度门槛', exact: true });
    assert.ok(await select.count(), 'the gate control is present when intent routing is enabled');
    await select.click();
    await page.getByRole('option', { name: '0.7 · 推荐', exact: true }).click();
    assert.equal(await page.evaluate(() => window.draft.confidenceThreshold), 0.7);
    await select.click();
    await page.getByRole('option', { name: '不分级（按意图直接路由）', exact: true }).click();
    assert.equal(await page.evaluate(() => window.draft.confidenceThreshold), undefined, 'clearing the gate removes it');
  });

  await t.test('rule summaries open one modal editor by keyboard without emitting edits; closing retains the draft', async st => {
    const initial = { enabled: true, classifierModel: 'alpha', intents: [
      { ...rule('chat'), description: 'Quick questions and everyday conversation' },
      { ...rule('code', 'gamma'), description: 'Write code and fix bugs' },
    ] };
    const page = await fixture(st, initial);
    const list = page.getByRole('list', { name: '意图规则', exact: true });
    assert.equal(await list.getByRole('textbox').count(), 0);
    assert.equal(await list.getByRole('combobox').count(), 0);
    assert.equal(await list.getByRole('button').count(), 2);
    assert.match(await list.innerText(), /Quick questions and everyday conversation.*fixture \/ Beta/su);
    assert.match(await list.innerText(), /Write code and fix bugs.*fixture \/ Gamma/su);
    const first = page.getByRole('button', { name: '编辑意图 1', exact: true });
    await first.focus();
    await first.press('Enter');
    const dialog = page.getByRole('dialog', { name: '编辑意图 1', exact: true });
    await dialog.waitFor();
    const description = page.getByRole('textbox', { name: '意图 1 描述', exact: true });
    assert.equal(await description.evaluate(element => element === document.activeElement), true, 'opening focuses the description');
    assert.deepEqual(await page.evaluate(() => window.draftChanges), [], 'opening a rule only changes presentation');
    const descriptionBox = await description.boundingBox();
    const modelBox = await page.getByRole('combobox', { name: '意图 1 模型', exact: true }).boundingBox();
    assert.ok(descriptionBox && modelBox && modelBox.y >= descriptionBox.y + descriptionBox.height - 1 && Math.abs(modelBox.x - descriptionBox.x) <= 1,
      'the modal form stacks fields vertically at a shared width');
    await description.fill('Updated quick questions');
    await choose(page, '意图 1 模型', 'fixture / Alpha');
    const edited = await page.evaluate(() => window.draft);
    const edits = await page.evaluate(() => window.draftChanges.length);
    await closeEditor(page);
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.match(await list.innerText(), /Updated quick questions.*fixture \/ Alpha/su);
    await first.press('Enter');
    await dialog.waitFor();
    assert.equal(await description.inputValue(), 'Updated quick questions');
    await closeEditor(page);
    await page.getByRole('button', { name: '编辑意图 2', exact: true }).press('Space');
    const secondDialog = page.getByRole('dialog', { name: '编辑意图 2', exact: true });
    await secondDialog.waitFor();
    assert.equal(await page.getByRole('textbox', { name: '意图 2 描述', exact: true }).inputValue(), 'Write code and fix bugs');
    assert.deepEqual(await page.evaluate(() => window.draft), edited);
    assert.equal(await page.evaluate(() => window.draftChanges.length), edits, 'switching and closing editors must not dirty the draft');
    await closeEditor(page);
  });

  await t.test('editable or duplicate internal IDs do not corrupt rules; deleting and adding target the right rule and restore focus', async st => {
    const initial = { enabled: true, classifierModel: 'alpha', intents: ['First', 'Middle', 'Last'].map(description => ({ id: '', description, modelId: 'beta' })) };
    const page = await fixture(st, initial);
    const second = page.getByRole('button', { name: '编辑意图 2', exact: true });
    const lastSummary = await page.getByRole('button', { name: '编辑意图 3', exact: true }).elementHandle();
    await second.click();
    const dialog = page.getByRole('dialog', { name: '编辑意图 2', exact: true });
    await dialog.waitFor();
    await closeEditor(page);
    await page.getByText('高级：内部意图 ID', { exact: true }).click();
    const id = page.getByRole('textbox', { name: '意图 2 id', exact: true });
    await id.fill('changed-id');
    assert.equal(await id.evaluate(element => element === document.activeElement), true);
    assert.deepEqual(await page.evaluate(() => window.draft.intents.map(item => item.id)), ['', 'changed-id', '']);
    await second.click();
    await dialog.waitFor();
    assert.equal(await page.getByRole('textbox', { name: '意图 2 描述', exact: true }).inputValue(), 'Middle', 'editing an ID must not change the rule description');
    await page.getByRole('button', { name: '删除意图 2', exact: true }).press('Enter');
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(await page.evaluate(() => window.draft.intents), [initial.intents[0], initial.intents[2]]);
    await page.waitForFunction(element => element === document.activeElement, lastSummary);
    assert.equal(await lastSummary.evaluate(element => element === document.activeElement), true, 'focus follows the same surviving summary, not its old index');
    assert.equal(await page.getByRole('textbox', { name: '意图 2 id', exact: true }).inputValue(), '');
    await page.getByRole('button', { name: '编辑意图 2', exact: true }).press('Enter');
    await dialog.waitFor();
    await page.getByRole('textbox', { name: '意图 2 描述', exact: true }).fill('Still the last rule');
    assert.equal(await page.evaluate(() => window.draft.intents[1].description), 'Still the last rule');
    await closeEditor(page);
    await page.getByRole('button', { name: '编辑意图 2', exact: true }).click();
    await dialog.waitFor();
    await page.getByRole('button', { name: '删除意图 2', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const only = page.getByRole('button', { name: '编辑意图 1', exact: true });
    await page.waitForFunction(element => element === document.activeElement, await only.elementHandle());
    assert.equal(await only.evaluate(element => element === document.activeElement), true, 'focus moves to the surviving rule');
    await only.click();
    const lastDialog = page.getByRole('dialog', { name: '编辑意图 1', exact: true });
    await lastDialog.waitFor();
    await page.getByRole('button', { name: '删除意图 1', exact: true }).click();
    await lastDialog.waitFor({ state: 'hidden' });
    const add = page.getByRole('button', { name: '添加意图规则', exact: true });
    await page.waitForFunction(element => element === document.activeElement, await add.elementHandle());
    assert.equal(await add.evaluate(element => element === document.activeElement), true, 'deleting the last rule focuses the add action');
    await add.press('Enter');
    const newDialog = page.getByRole('dialog', { name: '编辑意图 1', exact: true });
    await newDialog.waitFor();
    assert.equal(await page.getByRole('textbox', { name: '意图 1 描述', exact: true }).evaluate(element => element === document.activeElement), true, 'new rules enter editing with description focus');
    assert.deepEqual(await page.evaluate(() => window.draft.intents), [{ id: 'intent-1', description: '', modelId: '' }]);
    await closeEditor(page);
    assert.match(await page.getByRole('list', { name: '意图规则', exact: true }).innerText(), /待填写描述.*待选择目标模型/su);
  });

  await t.test('replacing the document resets disclosure state without leaking transient UI keys into configuration', async st => {
    const initial = { enabled: true, classifierModel: 'alpha', intents: [rule('original')] };
    const page = await fixture(st, initial);
    await page.getByRole('button', { name: '编辑意图 1', exact: true }).click();
    await page.getByRole('textbox', { name: '意图 1 描述', exact: true }).fill('Unsaved description');
    await page.evaluate(next => window.replaceValue(next), initial);
    await page.getByRole('button', { name: '编辑意图 1', exact: true }).waitFor();
    assert.equal(await page.locator('textarea').count(), 0);
    assert.deepEqual(await page.evaluate(() => window.draft), initial);
    assert.equal(await page.evaluate(() => window.draftChanges.length), 1);
    await page.getByRole('button', { name: '编辑意图 1', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: '意图 1 描述', exact: true }).inputValue(), initial.intents[0].description);
  });

  await t.test('canonical model/group/Auto targets stay separate from concrete classifiers', async st => {
    const targets = [
      ...models.map(model => ({ ...model, id: `model:${encodeURIComponent(model.id)}` })),
      { id: 'group:pool', label: 'pool', provider: '模型组', source: 'group', protocols: [], cost: 'unknown' },
      { id: 'group:disabled', label: 'disabled-group', provider: '模型组', protocols: [], cost: 'unknown', enabled: false },
    ];
    const initial = { enabled: true, classifierModel: 'alpha', intents: [rule('chat', 'model:beta')] };
    const page = await fixture(st, initial, models, {}, targets);
    assert.match(await page.getByRole('list', { name: '意图规则', exact: true }).innerText(), /fixture \/ Beta/u);
    const classifier = page.getByRole('combobox', { name: '分类器模型', exact: true });
    await classifier.click();
    assert.deepEqual(await page.getByRole('option').allTextContents(), ['选择模型', 'fixture / Alpha', 'fixture / Beta']);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '编辑意图 1', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '编辑意图 1', exact: true });
    await dialog.waitFor();
    await page.getByRole('combobox', { name: '意图 1 模型', exact: true }).click();
    assert.deepEqual(await page.getByRole('option').allTextContents(), ['选择模型', 'fixture / Alpha', 'fixture / Beta', 'fixture / Gamma', '模型组 / pool', '自动选择（不指定固定目标）']);
    await page.getByRole('option', { name: '模型组 / pool', exact: true }).click();
    assert.equal(await page.evaluate(() => window.draft.intents[0].modelId), 'group:pool');
    await choose(page, '意图 1 模型', '自动选择');
    assert.equal(await page.evaluate(() => window.draft.intents[0].modelId), 'auto');
    assert.equal(await page.evaluate(() => window.draft.classifierModel), 'alpha');
    await closeEditor(page);
    await page.getByText('高级：内部意图 ID', { exact: true }).click();
    const id = page.getByRole('textbox', { name: '意图 1 id', exact: true });
    await id.fill('edited-id');
    assert.equal(await id.evaluate(element => element === document.activeElement), true);
    await page.getByRole('button', { name: '编辑意图 1', exact: true }).click();
    await dialog.waitFor();
    assert.equal(await page.getByRole('textbox', { name: '意图 1 描述', exact: true }).inputValue(), 'Short conversation');
    await choose(page, '意图 1 模型', 'fixture / Gamma');
    assert.equal(await page.evaluate(() => window.draft.intents[0].modelId), 'model:gamma');
    await page.evaluate(next => window.replaceValue(next), initial);
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(await page.evaluate(() => window.draft), initial);
    assert.equal(await page.locator('textarea').count(), 0);
    const single = await fixture(st, empty, [models[0]], {}, targets);
    assert.equal(await single.getByRole('switch', { name: '启用按意图路由' }).isDisabled(), true, 'multiple targets do not replace the two-concrete-model threshold');
  });

  await t.test('deleting the last rule with no eligible additions leaves keyboard focus on the enabled switch', async st => {
    const page = await fixture(st, { enabled: true, classifierModel: 'gone', intents: [rule('existing', 'gone')] }, []);
    await page.getByRole('button', { name: '编辑意图 1', exact: true }).click();
    await page.getByRole('button', { name: '删除意图 1', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const toggle = page.getByRole('switch', { name: '启用按意图路由' });
    await page.waitForFunction(element => element === document.activeElement, await toggle.elementHandle());
    assert.equal(await toggle.evaluate(element => element === document.activeElement), true);
    assert.deepEqual(await page.evaluate(() => window.draft), { enabled: true, classifierModel: 'gone', intents: [] });
  });

  await t.test('generated IDs avoid existing normalized IDs deterministically', async st => {
    const page = await fixture(st, { enabled: true, classifierModel: 'alpha', intents: [rule(' INTENT-1 '), rule('intent-3')] });
    await page.getByRole('button', { name: '添加意图规则', exact: true }).click();
    await page.getByRole('textbox', { name: '意图 3 描述', exact: true }).waitFor();
    await closeEditor(page);
    await page.getByRole('button', { name: '添加意图规则', exact: true }).click();
    await page.getByRole('textbox', { name: '意图 4 描述', exact: true }).waitFor();
    assert.equal(await page.locator('textarea').count(), 1);
    assert.equal(await page.getByRole('textbox', { name: '意图 4 描述', exact: true }).evaluate(element => element === document.activeElement), true);
    assert.deepEqual(await page.evaluate(() => window.draft.intents.map(intent => intent.id)), [' INTENT-1 ', 'intent-3', 'intent-2', 'intent-4']);
  });

  for (const [name, classifierModel, modelId] of [
    ['incompatible classifier and missing target', 'gamma', 'unknown-route'],
    ['missing classifier and disabled target', 'missing-classifier', 'disabled'],
  ]) {
    await t.test(`${name} show placeholders and qualified options without changing the draft`, async st => {
      const initial = { enabled: true, classifierModel, intents: [rule('existing', modelId)] };
      const page = await fixture(st, initial);
      assert.match(await page.getByRole('list', { name: '意图规则', exact: true }).innerText(), /待选择目标模型/u);
      assert.equal(await page.locator('textarea').count(), 0);
      assert.deepEqual(await page.evaluate(() => window.draftChanges), []);
      const classifier = page.getByRole('combobox', { name: '分类器模型', exact: true });
      assert.equal(await classifier.innerText(), '选择模型');
      await classifier.click();
      assert.deepEqual(await page.getByRole('option').allTextContents(), ['选择模型', 'fixture / Alpha', 'fixture / Beta'], 'only enabled models qualified for this field may be offered');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '编辑意图 1', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '编辑意图 1', exact: true });
      await dialog.waitFor();
      const target = page.getByRole('combobox', { name: '意图 1 模型', exact: true });
      assert.equal(await target.innerText(), '选择模型');
      await target.click();
      assert.deepEqual(await page.getByRole('option').allTextContents(), ['选择模型', 'fixture / Alpha', 'fixture / Beta', 'fixture / Gamma'], 'only enabled models qualified for this field may be offered');
      await page.keyboard.press('Escape');
      const text = await page.locator('body').innerText();
      assert.doesNotMatch(text, /不可用引用|保留旧引用/u);
      assert.equal(text.includes(classifierModel), false);
      assert.equal(text.includes(modelId), false);
      assert.deepEqual(await page.evaluate(() => window.draft), initial, 'rendering and opening menus must not clear or substitute configured values');
      assert.deepEqual(await page.evaluate(() => window.draftChanges), []);
      await page.getByRole('textbox', { name: '意图 1 描述', exact: true }).fill('Edited rule');
      const edited = { ...initial, intents: [{ ...initial.intents[0], description: 'Edited rule' }] };
      assert.deepEqual(await page.evaluate(() => window.draft), edited, 'editing a description must not repair either model selection');
      await closeEditor(page);
      await choose(page, '分类器模型', 'fixture / Alpha');
      assert.deepEqual(await page.evaluate(() => window.draft), { ...edited, classifierModel: 'alpha' }, 'choosing a classifier must not change the target');
      await page.getByRole('button', { name: '编辑意图 1', exact: true }).click();
      await dialog.waitFor();
      await choose(page, '意图 1 模型', 'fixture / Beta');
      assert.deepEqual(await page.evaluate(() => window.draft), {
        ...edited, classifierModel: 'alpha', intents: [{ ...edited.intents[0], modelId: 'beta' }],
      });
      assert.match(await target.innerText(), /fixture \/ Beta/u);
      const bodyText = await page.locator('body').innerText();
      assert.doesNotMatch(bodyText, /不可用引用|保留旧引用/u);
      assert.match(bodyText, /没有兼容的路由，请求仍可能失败/u);
      assert.match(bodyText, /实际协议兼容性、认证与额度尚未验证/u);
      await closeEditor(page);
      assert.match(await classifier.innerText(), /fixture \/ Alpha/u);
    });
  }

  await t.test('empty, single and unsupported model lists do not promise a usable classifier', async st => {
    for (const candidates of [[], [models[0]], [models[2], { ...models[2], id: 'other' }]]) {
      const page = await fixture(st, empty, candidates);
      assert.equal(await page.getByRole('switch', { name: '启用按意图路由' }).isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: '清空意图设置', exact: true }).count(), 0);
      assert.equal(await page.getByRole('combobox').count(), 0);
      if (candidates.length === 1) {
        const explanation = await page.locator('#root').innerText();
        assert.match(explanation, /一个合资格的已绑定模型.*直接选择，无需分类器/);
        assert.match(explanation, /仍可能因协议翻译、认证或额度而失败.*不代表生成可用/);
      }
    }
  });

  for (const [name, candidates, classifierModel, intents] of [
    ['no models', [], 'gone', [rule('existing', 'gone')]],
    ['one model', [models[0]], 'gone', [rule('existing', 'gone')]],
    ['no classifier protocols', [models[2], { ...models[2], id: 'other' }], 'gone', [rule('existing', 'gone')]],
    ['classifier only', [], 'gone', []],
    ['rules only', [], '', [rule('existing', 'gone')]],
  ]) {
    await t.test(`disabled nonempty settings with ${name} can be explicitly cleared, never on cancel`, async st => {
      const initial = { enabled: false, classifierModel, intents, extension: { owner: 'fixture' } };
      const page = await fixture(st, initial, candidates, { viewport: { width: 390, height: 640 }, reducedMotion: 'reduce' });
      await page.evaluate(() => {
        document.documentElement.dataset.rexTheme = 'dark';
        document.documentElement.style.fontSize = '200%';
      });
      assert.equal(await page.getByRole('switch', { name: '启用按意图路由' }).isDisabled(), true);
      assert.equal(await page.getByRole('combobox').count(), 0);
      const clear = page.getByRole('button', { name: '清空意图设置', exact: true });
      assert.equal(await clear.count(), 1, 'repair must remain available even when enabling is impossible');
      assert.deepEqual(await page.evaluate(() => window.draftChanges), [], 'rendering must not repair settings');
      await clear.press('Enter');
      const dialog = page.getByRole('dialog', { name: '清空意图设置？', exact: true });
      const cancel = dialog.getByRole('button', { name: '取消', exact: true });
      await cancel.waitFor();
      assert.equal(await cancel.evaluate(element => element === document.activeElement), true, 'confirmation initially focuses the safe action');
      assert.match(await dialog.innerText(), /保存全部修改/u);
      await noPageOverflow(page);
      const box = await dialog.boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 391 && box.y + box.height <= 641);
      await cancel.press('Enter');
      await dialog.waitFor({ state: 'hidden' });
      await page.waitForFunction(element => element === document.activeElement, await clear.elementHandle());
      assert.equal(await clear.evaluate(element => element === document.activeElement), true, 'cancellation restores opener focus');
      assert.deepEqual(await page.evaluate(() => window.draft), initial);
      await clear.press('Enter');
      await dialog.waitFor();
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert.deepEqual(await page.evaluate(() => window.draftChanges), [], 'cancel and Escape must not emit draft edits');
      await clear.press('Enter');
      await dialog.getByRole('button', { name: '确认清空', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      const expected = { ...initial, classifierModel: '', intents: [] };
      assert.deepEqual(await page.evaluate(() => window.draft), expected);
      assert.deepEqual(await page.evaluate(() => window.draftChanges), [expected], 'confirmation emits exactly one explicit draft change');
      assert.equal(await clear.count(), 0);
      assert.equal(await page.getByRole('switch', { name: '启用按意图路由' }).getAttribute('aria-checked'), 'false');
    });
  }

  for (const width of [1440, 390]) for (const theme of ['light', 'dark']) for (const scale of [100, 200]) {
    await t.test(`${width}px ${theme} ${scale}% text wraps without horizontal overflow`, async st => {
      const longModels = models.map(model => ({ ...model, provider: 'provider-with-a-long-name', label: `${model.label} with a long descriptive model name and upstream protocol configuration` }));
      const page = await fixture(st, { enabled: true, classifierModel: 'alpha', intents: [
        { ...rule('intent-1', 'alpha'), description: '快速问答、简单查询、日常闲聊；用清晰简短的方式回答用户的问题。' },
        { ...rule('intent-2', 'beta'), description: '编写代码、实现功能、修复 bug，或对现有方案进行详细分析与审查。' },
        { id: 'intent-3', description: '', modelId: '' },
      ] }, longModels, {
        viewport: { width, height: 1000 }, reducedMotion: 'reduce',
      });
      await page.evaluate(([theme, scale]) => {
        document.documentElement.dataset.rexTheme = theme;
        document.documentElement.style.fontSize = `${scale}%`;
      }, [theme, scale]);
      const artifacts = process.env.AIOS_GATEWAY_TEST_ARTIFACTS;
      if (artifacts) {
        fs.mkdirSync(artifacts, { recursive: true });
        await page.screenshot({ path: path.join(artifacts, `intent-summary-${width}-${theme}-${scale}.png`), fullPage: true });
      }
      await noPageOverflow(page);
      const summaryLabels = page.getByRole('list', { name: '意图规则', exact: true }).locator('button > span:nth-child(2) > span:nth-child(2) > span');
      assert.equal(await summaryLabels.count(), 3);
      assert.deepEqual(await summaryLabels.evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent)), [], 'summary model names wrap without clipping');
      assert.deepEqual(await summaryLabels.evaluateAll(elements => elements.filter(element => element.getBoundingClientRect().width < 5 * Number.parseFloat(getComputedStyle(element).fontSize)).map(element => element.textContent)), [], 'summary actions and numbering must not squeeze model names into single-character columns');
      await page.getByRole('button', { name: '编辑意图 1', exact: true }).press('Enter');
      const dialog = page.getByRole('dialog', { name: '编辑意图 1', exact: true });
      await dialog.waitFor();
      await noPageOverflow(page);
      const clipped = await page.getByRole('combobox').evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.getAttribute('aria-label')));
      assert.deepEqual(clipped, [], 'selected model labels wrap instead of overflowing their controls');
      const narrow = await page.getByRole('combobox').evaluateAll(elements => elements.filter(element => {
        const label = element.firstElementChild;
        return label.getBoundingClientRect().width < 5 * Number.parseFloat(getComputedStyle(label).fontSize);
      }).map(element => element.getAttribute('aria-label')));
      assert.deepEqual(narrow, [], 'nested padding must not squeeze model labels into single-character columns at 200%');
      if (artifacts) {
        await page.screenshot({ path: path.join(artifacts, `intent-${width}-${theme}-${scale}.png`), fullPage: true });
      }
      await closeEditor(page);
      await page.getByText('高级：内部意图 ID', { exact: true }).click();
      await page.getByRole('textbox', { name: '意图 1 id', exact: true }).waitFor();
      await noPageOverflow(page);
      assert.equal(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), 0, 'reduced motion leaves no running animation');
    });
  }
});
