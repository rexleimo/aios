import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { build } from 'esbuild';
import { browserRuntime } from './gateway-fixture.mjs';
import { isolatedConsoleFacts } from './clients-resources/console-facts.mjs';

const ui = path.resolve(import.meta.dirname, '../../../../../apps/shell/ui');
const publicDir = path.join(ui, 'public');
const staticAsset = /^\/(?:aios-mark\.png|icons\/[a-z0-9-]+\.(?:svg|png))$/u;
const assetTypes = Object.freeze({ '.png': 'image/png', '.svg': 'image/svg+xml' });
const pluginHtml = '<!doctype html><html><body><button id="count">0</button><script>document.querySelector("#count").addEventListener("click", () => { document.querySelector("#count").textContent = "1"; });</script></body></html>';
const harness = `
  import React from 'react';
  import { ConsoleWorkspace } from './src/components/console/console-workspace';
  import { I18nAppProvider } from './src/i18n/provider';
  const workspace = facts => (
    <I18nAppProvider initialLocale="zh-CN">
      <ConsoleWorkspace initialView="plugin:demo" facts={facts} />
    </I18nAppProvider>
  );
`;
const options = {
  bundle: true,
  write: false,
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'unused-next-navigation-boundary', setup(builder) {
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'next/navigation', namespace: 'offline' }));
    builder.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({
      contents: 'export function useRouter() { throw new Error("Unexpected Next navigation in plugin panel test"); } export const useSearchParams = useRouter;',
      loader: 'js',
    }));
  } }],
};
const entry = contents => ({ contents, resolveDir: ui, sourcefile: 'plugin-panel.tsx', loader: 'tsx' });
const [serverBundle, clientBundle] = await Promise.all([
  build({ ...options, platform: 'node', format: 'cjs', stdin: entry(`${harness}
    import { renderToString } from 'react-dom/server';
    export const render = facts => renderToString(workspace(facts));`) }),
  build({ ...options, platform: 'browser', format: 'iife', stdin: entry(`${harness}
    import { hydrateRoot } from 'react-dom/client';
    let root;
    window.hydrateConsole = facts => { root = hydrateRoot(document.getElementById('root'), workspace(facts)); };
    window.unmountConsole = () => root.unmount();`) }),
]);
const serverModule = { exports: {} };
new Function('require', 'module', 'exports', serverBundle.outputFiles[0].text)(
  createRequire(path.join(ui, 'package.json')),
  serverModule,
  serverModule.exports,
);

let browser;
before(async () => {
  const runtime = await browserRuntime();
  assert.ok(runtime, 'real Chromium is required for plugin panel behavior coverage');
  browser = await runtime.chromium.launch({ executablePath: runtime.executablePath });
});
after(async () => { await browser?.close(); });

function factsFor(uiContract) {
  const view = { id: 'plugin:demo', href: '/demo', label: 'Demo', title: 'Demo UI', source: 'demo-plugin' };
  if (uiContract !== undefined) view.ui = uiContract;
  return { ...isolatedConsoleFacts('/fixture'), pluginViews: [view], pluginFailures: [] };
}

async function openScenario(t, facts) {
  const errors = [];
  const unexpectedRequests = [];
  const server = http.createServer((request, response) => {
    if (request.url === '/favicon.ico') { response.writeHead(204).end(); return; }
    if (staticAsset.test(request.url)) {
      const asset = path.resolve(publicDir, `.${request.url}`);
      if (!asset.startsWith(publicDir + path.sep)) { response.writeHead(400).end(); return; }
      response.writeHead(200, { 'content-type': assetTypes[path.extname(asset)] ?? 'application/octet-stream' });
      response.end(readFileSync(asset));
      return;
    }
    assert.equal(request.url, '/');
    const html = serverModule.exports.render(facts);
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html><head><title>Plugin panel</title></head><body><div id="root">${html}</div></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ locale: 'zh-CN' });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl && (['/', '/favicon.ico'].includes(url.pathname) || staticAsset.test(url.pathname))) return route.continue();
    unexpectedRequests.push(route.request().url());
    return route.abort();
  });
  t.after(async () => {
    await page.evaluate(() => window.unmountConsole?.()).catch(() => {});
    await context.close();
    await new Promise(resolve => server.close(resolve));
    assert.deepEqual(errors, [], 'plugin panel must not raise browser pageerrors');
    assert.deepEqual(unexpectedRequests, [], 'inline plugin UI must not require external asset routes');
  });
  await page.goto(baseUrl);
  await page.addScriptTag({ content: clientBundle.outputFiles[0].text });
  await page.evaluate(facts => window.hydrateConsole(facts), facts);
  return page;
}

test('plugin panel renders real interactive HTML in an isolated iframe', { timeout: 30_000 }, async t => {
  const page = await openScenario(t, factsFor({ kind: 'html', html: pluginHtml }));
  const frame = page.frameLocator('iframe[title="Demo UI"]');
  await frame.locator('#count').click();
  assert.equal(await frame.locator('#count').textContent(), '1');
  const boundary = await page.locator('iframe[title="Demo UI"]').evaluate(element => {
    let hostAccess = 'accessible';
    try { void element.contentWindow.document.body; } catch { hostAccess = 'blocked'; }
    return { sandbox: element.getAttribute('sandbox'), hostAccess };
  });
  assert.deepEqual(boundary, { sandbox: 'allow-scripts', hostAccess: 'blocked' });
});

test('plugin panel shows a diagnostic error without rendering a broken iframe', { timeout: 30_000 }, async t => {
  const page = await openScenario(t, factsFor({ kind: 'html', error: 'UI missing: panel.html' }));
  assert.equal(await page.locator('iframe').count(), 0);
  assert.match(await page.locator('#console-content').innerText(), /UI missing: panel\.html/u);
});

test('legacy plugin panels keep the existing fallback card', { timeout: 30_000 }, async t => {
  const page = await openScenario(t, factsFor());
  assert.equal(await page.locator('iframe').count(), 0);
  assert.match(await page.locator('#console-content').innerText(), /Demo UI/u);
});
