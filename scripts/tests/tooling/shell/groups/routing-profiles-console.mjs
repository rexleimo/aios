import assert from 'node:assert/strict';
import { visible } from '../browser/gateway-fixture.mjs';
import { assign, assignmentRow, policyTask } from '../browser/routing-policy-workspace.mjs';

async function openProfiles(page) {
  await page.getByRole('button', { name: '策略工具', exact: true }).click();
  await page.getByRole('menuitem', { name: '角色覆盖方案（仅角色矩阵）', exact: true }).click();
}

async function closeProfiles(page) {
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.notEqual(await page.evaluate(() => document.body.style.pointerEvents), 'none', 'nested profile confirmation must release the page');
}

async function saveProfile(page, name) {
  await page.getByRole('button', { name: '保存为方案', exact: true }).click();
  await page.getByRole('textbox', { name: '方案名称' }).fill(name);
  await page.getByRole('dialog').getByRole('button', { name: '保存方案', exact: true }).click();
  await visible(page, page.getByText('角色覆盖方案已保存在此浏览器。', { exact: true }));
}

async function applyProfile(page, index = 0) {
  await page.getByRole('button', { name: '应用到草稿', exact: true }).nth(index).click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: '确认应用', exact: true }) });
  await dialog.getByRole('button', { name: '确认应用', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
}

const readProfiles = page => page.evaluate(() => JSON.parse(localStorage.getItem('aios.profiles')));
const group = { id: 'pool', models: ['model-beta', 'model-alpha'], routing: 'ordered' };

export async function runRoutingProfileBrowserChecks(t, { fixture, baseUrl }) {
  await t.test('local role profiles only change the draft; client reset and apply are confirmed', async st => {
    const { page, state } = await fixture(st);
    await page.goto(`${baseUrl}/routing/config`);
    await assign(page, '实现', /Beta/);
    await assign(page, '实现', /Beta/, 'claude');
    await openProfiles(page);
    await saveProfile(page, 'Browser fixture');
    assert.equal(state.writes.length, 0);
    await closeProfiles(page);
    await page.getByRole('button', { name: '恢复此客户端全部继承' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认恢复继承', exact: true }).click();
    await visible(page, page.getByRole('heading', { name: '全部继承', exact: true }));
    await page.getByRole('button', { name: '放弃修改', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认放弃修改', exact: true }).click();
    await openProfiles(page);
    await applyProfile(page);
    await visible(page, page.getByText('方案已应用到草稿，尚未写入配置。', { exact: true }));
    await closeProfiles(page);
    await policyTask(page, '默认分配');
    assert.match(await assignmentRow(page, '实现').innerText(), /Beta/);
    assert.equal(state.writes.length, 0);
    const profiles = await readProfiles(page);
    assert.deepEqual(Object.keys(profiles[0]).sort(), ['matrix', 'name', 'targetRefVersion']);
    assert.equal(profiles[0].targetRefVersion, 1);
    assert.equal(profiles[0].matrix.clients.claude.implementer, 'model:model-beta');
  });

  await t.test('Console profile caller preserves group, Auto and model kinds across discard, remount and unified save', async st => {
    const { page, state, saved } = await fixture(st, { configuration: { editable: {
      targetRefVersion: 1, activeModel: 'model:model-alpha', clientDefaults: { claude: 'model:model-alpha' },
      routingGroups: [group],
      intentRouting: { enabled: true, classifierModel: 'model-alpha', intents: [{ id: 'review', description: 'Review', modelId: 'model:model-beta' }] },
    } } });
    const initial = saved();
    await page.goto(`${baseUrl}/routing/config`);
    await assign(page, '实现', /模型组 \/ pool/);
    await assign(page, '规划', 'auto');
    await assign(page, '审查', /Beta/);
    await assign(page, '实现', 'auto', 'codex');
    await assign(page, '规划', /模型组 \/ pool/, 'codex');
    await openProfiles(page);
    await saveProfile(page, 'Kinds survive remount');
    const matrix = { default: { implementer: 'group:pool', planner: 'auto', reviewer: 'model:model-beta' },
      clients: { codex: { implementer: 'auto', planner: 'group:pool' } } };
    const profiles = [{ name: 'Kinds survive remount', matrix, targetRefVersion: 1 }];
    assert.deepEqual(await readProfiles(page), profiles, 'snapshot must preserve target kinds, not merely resolved model labels');
    await closeProfiles(page);
    await page.getByRole('button', { name: '放弃修改', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认放弃修改', exact: true }).click();
    await page.reload();
    await assign(page, '普通对话', /Beta/);
    await openProfiles(page);
    await applyProfile(page);
    await visible(page, page.getByText('方案已应用到草稿，尚未写入配置。', { exact: true }));
    assert.deepEqual(await readProfiles(page), profiles);
    assert.deepEqual(saved(), initial, 'applying a browser profile must not persist configuration');
    assert.equal(state.writes.length, 0);
    await closeProfiles(page);
    await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
    await visible(page, page.getByText('与已读取配置一致', { exact: true }));
    assert.deepEqual(saved(), { ...initial, activeModel: 'model:model-beta', matrix });
    assert.equal(state.writes.length, 1);
    assert.equal(state.refreshes, 0);
    assert.deepEqual(state.gatewayActions, []);
  });

  await t.test('Console applies historical syntax-looking IDs literally without rewriting the stored profile', async st => {
    const ids = ['auto', 'group:pool', 'model:beta', 'model%3Abeta', ' BETA '];
    const models = ['model-alpha', 'model-beta', ...ids].map((id, index) => ({ id, label: `Literal ${index}`, provider: 'fixture', protocols: ['openai-chat'] }));
    const { page, state, saved } = await fixture(st, { configuration: { models, editable: {
      providers: [{ id: 'fixture', baseUrl: 'https://example.invalid/v1', authMode: 'none', protocols: ['openai-chat'], models: models.map(model => model.id) }],
      routingGroups: [group],
    } } });
    const legacy = { name: 'Historical literals', matrix: { default: {
      implementer: 'auto', reviewer: 'group:pool', planner: 'model:beta', 'security-reviewer': 'model%3Abeta', 'team-lead': ' BETA ',
    }, clients: { codex: { implementer: 'group:pool' } } } };
    const expected = { default: { implementer: 'model:auto', reviewer: 'model:group%3Apool', planner: 'model:model%3Abeta',
      'security-reviewer': 'model:model%253Abeta', 'team-lead': 'model:%20BETA%20' }, clients: { codex: { implementer: 'model:group%3Apool' } } };
    let stored = JSON.stringify([legacy]);
    await page.goto(`${baseUrl}/routing/config`);
    await visible(page, page.getByRole('button', { name: '策略工具', exact: true }));
    await page.evaluate(stored => localStorage.setItem('aios.profiles', stored), stored);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt) await page.reload();
      await openProfiles(page);
      await applyProfile(page);
      await visible(page, page.getByText('方案已应用到草稿，尚未写入配置。', { exact: true }));
      assert.equal(await page.evaluate(() => localStorage.getItem('aios.profiles')), stored, 'applying must leave legacy storage byte-for-byte unchanged');
      if (!attempt) {
        await saveProfile(page, 'Canonical copy');
        assert.deepEqual(await readProfiles(page), [legacy, { name: 'Canonical copy', matrix: expected, targetRefVersion: 1 }]);
        stored = await page.evaluate(() => localStorage.getItem('aios.profiles'));
      }
      await closeProfiles(page);
    }
    assert.equal(state.writes.length, 0);
    await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
    await visible(page, page.getByText('与已读取配置一致', { exact: true }));
    assert.deepEqual(saved().matrix, expected);
    assert.equal(await page.evaluate(() => localStorage.getItem('aios.profiles')), stored);
    assert.deepEqual(state.gatewayActions, []);
  });

  await t.test('Console rejects missing, paused, unbound and malformed profile targets atomically', async st => {
    const models = [
      { id: 'model-alpha', label: 'Alpha' }, { id: 'model-beta', label: 'Beta' },
      { id: 'paused', label: 'Paused', enabled: false }, { id: 'unbound', label: 'Unbound' },
    ].map(model => ({ ...model, provider: 'fixture', protocols: ['openai-chat'] }));
    const { page, state, saved } = await fixture(st, { configuration: { models, editable: {
      providers: [{ id: 'fixture', baseUrl: 'https://example.invalid/v1', authMode: 'none', protocols: ['openai-chat'], models: ['model-alpha', 'model-beta', 'paused'] }],
      routingGroups: [group, { id: 'disabled', models: ['model-alpha'], routing: 'ordered', enabled: false },
        { id: 'paused', models: ['paused'], routing: 'ordered' }, { id: 'empty', models: [], routing: 'ordered' }],
    } } });
    const initial = saved();
    const invalid = ['model:missing', 'model:paused', 'model:unbound', 'group:missing', 'group:disabled', 'group:paused', 'group:empty', 'model:%GG'];
    const profiles = invalid.map((target, index) => ({ name: `Unavailable ${index}`, targetRefVersion: 1,
      matrix: { default: { implementer: 'model:model-alpha', reviewer: target }, clients: { codex: { planner: 'auto' } } } }));
    profiles.push({ name: 'Unsupported version', targetRefVersion: 2, matrix: { default: { implementer: 'model:model-alpha' }, clients: {} } },
      ...['auto', 'group:pool'].map(target => ({ name: `Missing literal ${target}`, matrix: { default: { implementer: target }, clients: {} } })));
    await page.goto(`${baseUrl}/routing/config`);
    await assign(page, '实现', /Beta/);
    await page.evaluate(profiles => localStorage.setItem('aios.profiles', JSON.stringify(profiles)), profiles);
    await openProfiles(page);
    for (const [index, profile] of profiles.entries()) {
      await applyProfile(page, index);
      await visible(page, page.getByText(/^方案未应用：/));
      assert.deepEqual(await readProfiles(page), profiles, profile.name);
      assert.deepEqual(saved(), initial, profile.name);
      assert.equal(state.writes.length, 0, profile.name);
    }
    await saveProfile(page, 'Unchanged draft');
    assert.deepEqual((await readProfiles(page)).at(-1), { name: 'Unchanged draft', targetRefVersion: 1,
      matrix: { default: { implementer: 'model:model-beta' }, clients: {} } }, 'failed application must neither partially apply valid entries nor drop invalid ones');
    await closeProfiles(page);
    assert.match(await assignmentRow(page, '实现').innerText(), /Beta/);
    assert.deepEqual(state.gatewayActions, []);
  });
}
