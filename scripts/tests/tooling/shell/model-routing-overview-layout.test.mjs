import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { browserRuntime, noPageOverflow } from './browser/gateway-fixture.mjs';

const ui = path.resolve(import.meta.dirname, '../../../../apps/shell/ui');
const configPath = '/api/config/model-routing';
const gatewayPath = '/api/model-routing/gateway';
const decisionsPath = '/api/model-routing/decisions';
const clientsPath = '/api/clients';

async function workspaceAssets() {
  const { build } = await import('esbuild');
  const require = createRequire(path.join(ui, 'package.json'));
  const { default: postcss } = await import(require.resolve('postcss'));
  const { default: tailwind } = await import(require.resolve('@tailwindcss/postcss'));
  const stylesheet = path.join(ui, 'src/app/globals.css');
  const [bundle, css] = await Promise.all([
    build({
      stdin: { contents: `import { createElement } from 'react';
        import { createRoot } from 'react-dom/client';
        import { GatewayWorkspace } from './src/components/console/gateway-workspace';
        const root = createRoot(document.getElementById('root'));
        root.render(createElement(GatewayWorkspace, { active: true, navigate() {}, facts: {
          clients: ['claude', 'codex', 'pi'].map(clientId => ({ clientId, installed: true }))
        } }));`, resolveDir: ui, sourcefile: 'overview-layout-fixture.tsx' },
      bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"test"' },
      plugins: [{ name: 'offline-navigation', setup(build) {
        build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
        build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export function useSearchParams() { return new URLSearchParams(); }' }));
      } }],
    }),
    postcss([tailwind({ base: ui })]).process(fs.readFileSync(stylesheet, 'utf8'), { from: stylesheet }),
  ]);
  return { js: bundle.outputFiles[0].text, css: css.css };
}

function responses({ configured = false, running = true, managed = true, stale = false, connected = false, code, failed = false } = {}) {
  const models = configured ? [{ id: 'local/model', label: 'Local model', source: 'discovered', provider: 'local', protocols: ['openai-chat'] }] : [];
  return {
    [configPath]: { ok: !failed, body: failed ? { error: 'Offline registry read failed' } : {
      hash: 'a1'.repeat(32), models, modelBindings: models,
      editable: {
        providers: configured ? [{ id: 'local', baseUrl: 'http://provider.invalid/v1', apiKeyEnv: '', authMode: 'none', endpointStyle: 'standard', protocols: ['openai-chat'], models: [] }] : [],
        customModels: [], matrix: { default: configured ? { implementer: 'local/model' } : {}, clients: {} },
        routingGroups: [], intentRouting: { enabled: false, classifierModel: '', intents: [] },
      },
      auto: [],
    } },
    [gatewayPath]: { ok: !failed, body: failed ? { error: 'Offline gateway read failed' } : {
      running, managed, stale, connected, pid: running ? 12345 : null, port: 49171, url: 'http://127.0.0.1:49171',
      ready: running && configured && !code, configuredRevision: 'a1'.repeat(32), configuredModelCount: models.length,
      configuredModels: models.length, readyModels: configured && !code ? 1 : 0,
      code: code || (configured ? undefined : 'NO_ROUTE_CONFIGURED'),
      clients: ['claude', 'codex', 'pi'].map(client => ({ client, connected: client === 'claude' && connected, launch: `${client} --offline`, artifactExists: false, mode: 'inplace' })),
    } },
    [decisionsPath]: { ok: true, body: {
      exists: configured, counters: { requests: configured ? 1234 : 0, errors: 0, autoRouted: configured ? 12 : 0 },
      byClient: configured ? { claude: 1234 } : {},
      recent: configured ? [{ at: '2026-11-15T08:00:00Z', clientId: 'claude', modelId: 'local/model', role: 'implementer' }] : [],
    } },
    [clientsPath]: { ok: !failed, body: failed ? { error: 'Offline client read failed' } : {
      clients: ['claude', 'codex', 'pi'].map(id => ({ id, installed: true, version: '1.0.0', revision: 'fixture', update: { supported: false, reason: 'offline fixture' } })),
    } },
  };
}

async function installDeferredReads(page) {
  await page.evaluate(() => {
    window.offlineReads = [];
    window.unexpectedRequests = [];
    const results = new Map();
    const pending = [];
    window.fetch = async (input, init = {}) => {
      const pathname = new URL(String(input), 'http://fixture.invalid').pathname;
      if (init.method && init.method !== 'GET' || !['/api/config/model-routing', '/api/model-routing/gateway', '/api/model-routing/decisions', '/api/clients'].includes(pathname)) {
        window.unexpectedRequests.push(`${init.method || 'GET'} ${pathname}`);
        throw new Error('Request outside offline layout fixture');
      }
      window.offlineReads.push(pathname);
      const result = results.get(pathname) || await new Promise(resolve => pending.push({ pathname, resolve }));
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return { ok: result.ok, json: async () => structuredClone(result.body) };
    };
    window.releaseRead = (pathname, result) => {
      results.set(pathname, result);
      for (const item of pending.filter(item => item.pathname === pathname)) item.resolve(result);
    };
  });
}

async function layout(page) {
  return page.evaluate(() => {
    const exact = text => [...document.querySelectorAll('h2, h3, span, summary')].find(element => element.textContent === text);
    const rect = element => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const badge = [...document.querySelectorAll('span')].find(element => element.textContent.startsWith('运行时就绪：'));
    const gateway = exact('本地网关').closest('section');
    // compact overview renders a one-line client summary, not the full client table.
    const clients = exact('客户端与模型')?.closest('section') || null;
    const result = {
      gateway: rect(gateway),
      connection: rect(exact('接入客户端').closest('section')),
      readiness: rect(badge),
      runtime: rect(badge.closest('section')),
      access: rect(gateway.parentElement.nextElementSibling),
      decisions: rect(exact('决策日志').closest('section')),
      clients: rect(clients),
      manual: rect(exact('手动接入（隔离模式，不碰真实配置）')),
    };
    if (clients) [...clients.querySelectorAll('li')].forEach((element, index) => { result[`client-${index}`] = rect(element); });
    for (const label of ['日志内请求', '含意图记录', '错误记录']) {
      const element = exact(label);
      result[label] = rect(element);
      result[`${label}-value`] = rect(element.previousElementSibling);
    }
    return result;
  });
}

function assertStable(before, after, phase) {
  for (const key of Object.keys(before)) {
    // Optional slots (e.g. the compact-mode client table) may be absent in both phases.
    if (!before[key] && !after[key]) continue;
    assert.ok(before[key] && after[key], `${phase}: ${key} appeared/disappeared between reads`);
    for (const dimension of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(before[key][dimension] - after[key][dimension]) <= 1,
        `${phase}: ${key}.${dimension} moved from ${before[key][dimension]} to ${after[key][dimension]}; ${JSON.stringify({ before, after })}`);
    }
  }
}

test('overview reserves real loading slots while deferred registry, health and log reads resolve', async (t) => {
  const runtime = await browserRuntime();
  if (!runtime) return t.skip('Chrome/Playwright is unavailable');
  const assets = await workspaceAssets();
  assert.match(assets.css, /min-height/u, 'use the real generated application stylesheet');
  const browser = await runtime.chromium.launch({ executablePath: runtime.executablePath });
  t.after(() => browser.close());
  const scenarios = [
    ['empty', {}],
    ['configured', { configured: true }],
    ['external-credentials-missing', { configured: true, managed: false, code: 'PROVIDER_CREDENTIALS_MISSING' }],
    ['stale-connected', { running: false, stale: true, connected: true }],
    ['failed', { failed: true }],
  ];
  for (const width of [1440, 390]) for (const [name, options] of scenarios) {
    await t.test(`${width}px ${name}`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      const requests = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
      try {
        await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div class="ml-[68px] min-w-0 md:ml-[212px]"><main id="root" class="mx-auto max-w-[1440px] px-4 py-7 lg:px-8 lg:py-9"></main></div>');
        await page.addStyleTag({ content: assets.css });
        await installDeferredReads(page);
        await page.addScriptTag({ content: assets.js });
        await page.waitForFunction(() => window.offlineReads.length >= 4);
        const initial = await layout(page);
        await noPageOverflow(page);
        assert.match(await page.locator('#root').innerText(), /尚未读取/u, 'loading must not claim a loaded state');
        const payloads = responses(options);
        const order = width === 1440 ? [configPath, gatewayPath, decisionsPath, clientsPath] : [gatewayPath, decisionsPath, configPath, clientsPath];
        for (const pathname of order) {
          await page.evaluate(([pathname, result]) => window.releaseRead(pathname, result), [pathname, payloads[pathname]]);
          // Flush the state commit, not a timed wait that could hide an intermediate jump.
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          assertStable(initial, await layout(page), `${name} ${pathname}`);
          await noPageOverflow(page);
        }
        const text = await page.locator('#root').innerText();
        if (options.failed) assert.match(text, /读取失败/u);
        // Model-access count is stated in the runtime-ready panel (compact overview).
        else assert.match(text, options.configured ? /1 个显式绑定模型/u : /0 个显式绑定模型|尚未读取/u);
        // magpie 式：模型选择器即接入入口，没有单独开关。未接入时显示「断开并还原配置」选项。
        const pickers = page.getByRole('combobox', { name: /接入模型$/u });
        assert.equal(await pickers.count(), 3, 'one model picker per connectable client');
        for (const picker of await pickers.all()) {
          const label = await picker.innerText();
          if (label.includes('断开并还原配置')) {
            assert.equal(await picker.isDisabled(), !payloads[gatewayPath].body.ready, 'model picker blocked until gateway ready');
          } else {
            assert.equal(await picker.isDisabled(), false, 'connected client can change model or disconnect');
          }
        }
        if (options.connected) {
          assert.match(await page.getByRole('combobox', { name: 'Claude Code 接入模型' }).innerText(), /AIOS Auto/u);
        }

        // Setup guide: three steps always present; exactly one "下一步" once status is known.
        const steps = page.getByRole('list', { name: '接入步骤' });
        assert.equal(await steps.getByRole('listitem').count(), 3, 'the three-step guide is always present');
        // compact overview: one-line client summary, no full client×model table.
        assert.equal(await page.getByText('客户端与模型', { exact: true }).count(), 0, 'the heavy client table is collapsed on the gateway overview');
        assert.match(text, /最近请求涉及/u, 'a compact one-line client summary is shown instead');
        assert.equal(await page.getByText('下一步', { exact: true }).count(), options.failed ? 0 : 1,
          'one next step is marked only after status resolves');
        assert.match(text, options.failed ? /正在读取网关状态/u : /还差一步就能开始用/u, 'headline reflects the real read state');
        const artifacts = process.env.AIOS_GATEWAY_TEST_ARTIFACTS;
        if (artifacts) {
          fs.mkdirSync(artifacts, { recursive: true });
          await page.screenshot({ path: path.join(artifacts, `overview-layout-${name}-${width}.png`), fullPage: true });
        }
        assert.deepEqual(await page.evaluate(() => window.unexpectedRequests), []);
        assert.deepEqual(requests, [], 'no network request may leave the offline fixture');
        assert.deepEqual(errors, []);
      } finally {
        await page.close();
      }
    });
  }
});
