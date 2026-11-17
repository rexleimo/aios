import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { build } from 'esbuild';
import { browserRuntime } from './gateway-fixture.mjs';
import { isolatedConsoleFacts } from './clients-resources/console-facts.mjs';

const ui = path.resolve(import.meta.dirname, '../../../../../apps/shell/ui');
const ageSelector = '#root .lucide-clock';
const harness = `
  import React, { StrictMode, useLayoutEffect } from 'react';
  import { ConsoleWorkspace } from './src/components/console/console-workspace';
  function CommitProbe() {
    useLayoutEffect(() => {
      if (window.firstCommit) return;
      const ageNode = document.querySelector(${JSON.stringify(ageSelector)}).parentElement;
      window.firstCommit = { text: ageNode.textContent, retained: ageNode === window.ssrAgeNode, at: Date.now() };
    }, []);
    return null;
  }
  const workspace = facts => <StrictMode><ConsoleWorkspace initialView="settings" facts={facts} /><CommitProbe /></StrictMode>;
`;
const options = {
  bundle: true, write: false, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'unused-next-navigation-boundary', setup(builder) {
    // Settings renders the real workspace/header, but must never invoke a Next-only action.
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'next/navigation', namespace: 'offline' }));
    builder.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({
      contents: 'export function useRouter() { throw new Error("Unexpected Next navigation in hydration test"); } export const useSearchParams = useRouter;', loader: 'js',
    }));
  } }],
};
const entry = contents => ({ contents, resolveDir: ui, sourcefile: 'console-hydration.tsx', loader: 'tsx' });
const [serverBundle, clientBundle] = await Promise.all([
  build({ ...options, platform: 'node', format: 'cjs', stdin: entry(`${harness}
    import { renderToString } from 'react-dom/server';
    export const render = facts => renderToString(workspace(facts));`) }),
  build({ ...options, platform: 'browser', format: 'iife', stdin: entry(`${harness}
    import { hydrateRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    let root;
    window.hydrateConsole = facts => { root = hydrateRoot(document.getElementById('root'), workspace(facts)); };
    window.replaceFacts = facts => flushSync(() => root.render(workspace(facts)));
    window.unmountConsole = () => flushSync(() => root.unmount());`) }),
]);
const serverModule = { exports: {} };
new Function('require', 'module', 'exports', serverBundle.outputFiles[0].text)(
  createRequire(path.join(ui, 'package.json')), serverModule, serverModule.exports,
);
let browser;
before(async () => {
  const runtime = await browserRuntime();
  assert.ok(runtime, 'real Chromium is required for SSR hydration coverage');
  browser = await runtime.chromium.launch({ executablePath: runtime.executablePath });
});
after(async () => { await browser?.close(); });

async function boundaryPage(t, name, initialAge, hydrationAge) {
  const errors = [];
  const consoleErrors = [];
  const unexpectedRequests = [];
  const samples = [];
  let snapshot;
  const server = http.createServer((request, response) => {
    if (request.url === '/favicon.ico') { response.writeHead(204).end(); return; }
    assert.equal(request.url, '/');
    const startedAt = Date.now();
    const facts = { ...isolatedConsoleFacts('/fixture'), generatedAt: new Date(startedAt - initialAge).toISOString() };
    const html = serverModule.exports.render(facts);
    snapshot = { startedAt, finishedAt: Date.now(), facts };
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html><head><title>Console hydration</title></head><body><div id="root">${html}</div></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  assert.notEqual(port, 3126);
  const baseUrl = `http://127.0.0.1:${port}`;
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) consoleErrors.push(message.text()); });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl && ['/', '/favicon.ico'].includes(url.pathname)) return route.continue();
    unexpectedRequests.push(route.request().url());
    return route.abort();
  });
  t.after(async () => {
    const client = await page.evaluate(() => ({ firstCommit: window.firstCommit, intervalEvents: window.intervalEvents }));
    if (process.env.AIOS_HYDRATION_ARTIFACT_DIR) {
      fs.mkdirSync(process.env.AIOS_HYDRATION_ARTIFACT_DIR, { recursive: true });
      fs.writeFileSync(path.join(process.env.AIOS_HYDRATION_ARTIFACT_DIR, `${name}.json`),
        JSON.stringify({ baseUrl, snapshot, ...client, samples, errors, consoleErrors, unexpectedRequests }, null, 2) + '\n');
    }
    await context.close();
    await new Promise(resolve => server.close(resolve));
    assert.deepEqual(errors, [], 'the real workspace must hydrate without browser pageerrors');
    assert.deepEqual(consoleErrors, [], 'no hydration warning or console error may be ignored');
    assert.deepEqual(unexpectedRequests, [], 'only the disposable loopback document may be requested');
  });
  await page.goto(baseUrl);
  const serverText = await page.locator(ageSelector).evaluate(icon => icon.parentElement.textContent);
  assert.ok(serverText.trim(), 'SSR must contain a collection-time label before any client code runs');
  assert.ok(snapshot.finishedAt - snapshot.startedAt < hydrationAge - initialAge, 'SSR must finish before the real age boundary');
  samples.push({ phase: 'SSR', text: serverText, at: snapshot.finishedAt });
  await page.evaluate(() => {
    window.ssrAgeNode = document.querySelector('#root .lucide-clock').parentElement;
    const set = window.setInterval.bind(window);
    const clear = window.clearInterval.bind(window);
    window.activeIntervals = new Map();
    window.intervalEvents = [];
    window.setInterval = (callback, delay, ...args) => {
      const id = set(callback, delay, ...args);
      window.activeIntervals.set(id, delay);
      window.intervalEvents.push({ action: 'set', id, delay });
      return id;
    };
    window.clearInterval = id => {
      window.activeIntervals.delete(id);
      window.intervalEvents.push({ action: 'clear', id });
      clear(id);
    };
  });
  // Delay hydration, not Date/timers: both server and browser clocks keep advancing normally.
  await page.waitForFunction(({ generatedAt, hydrationAge }) => Date.now() - Date.parse(generatedAt) >= hydrationAge,
    { generatedAt: snapshot.facts.generatedAt, hydrationAge });
  await page.addScriptTag({ content: clientBundle.outputFiles[0].text });
  await page.evaluate(facts => window.hydrateConsole(facts), snapshot.facts);
  await page.waitForFunction(() => window.firstCommit);
  const firstCommit = await page.evaluate(() => window.firstCommit);
  t.diagnostic(JSON.stringify({ name, generatedAt: snapshot.facts.generatedAt, serverText, firstCommit }));
  assert.deepEqual(errors, [], 'crossing a real age boundary must not cause React hydration recovery');
  assert.equal(firstCommit.text, serverText, 'the first client commit must exactly match SSR before passive effects');
  assert.equal(firstCommit.retained, true, 'hydration must reuse the server header, not replace it');
  assert.ok(firstCommit.at - Date.parse(snapshot.facts.generatedAt) >= hydrationAge);
  return { page, facts: snapshot.facts, samples };
}

async function accurateAge(page, facts, samples, phase) {
  await page.waitForFunction(({ generatedAt }) => {
    const labelAt = now => {
      const seconds = Math.max(0, Math.round((now - Date.parse(generatedAt)) / 1000));
      return seconds < 5 ? '刚刚采集' : seconds < 60 ? `数据 ${seconds}s 前` : `数据 ${Math.round(seconds / 60)}min 前`;
    };
    const text = document.querySelector('#root .lucide-clock').parentElement.textContent.trim();
    const now = Date.now();
    // A live one-second refresh can legitimately trail the current rounding boundary by one tick.
    return text === labelAt(now) || text === labelAt(now - 1000);
  }, { generatedAt: facts.generatedAt });
  const sample = await page.locator(ageSelector).evaluate(icon => ({ text: icon.parentElement.textContent.trim(), at: Date.now() }));
  samples.push({ phase, ...sample });
  return sample.text;
}

async function unmount(page) {
  assert.equal(await page.evaluate(() => window.activeIntervals.size), 1, 'StrictMode must leave only one live age timer');
  await page.evaluate(() => window.unmountConsole());
  assert.equal(await page.evaluate(() => window.activeIntervals.size), 0, 'unmount must clear the age timer');
}

test('Console header hydrates across a real rounded-minute boundary without replacing SSR', { timeout: 30_000 }, async t => {
  const { page, facts, samples } = await boundaryPage(t, 'minute-boundary', 87_000, 90_000);
  assert.equal(await accurateAge(page, facts, samples, 'mounted'), '数据 2min 前');
  await unmount(page);
});

test('Console age hydrates across seconds, keeps ticking, accepts fresh facts and cleans up', { timeout: 30_000 }, async t => {
  const { page, facts, samples } = await boundaryPage(t, 'seconds-boundary', 6_000, 9_000);
  const mounted = await accurateAge(page, facts, samples, 'mounted');
  await page.waitForFunction(previous => document.querySelector('#root .lucide-clock').parentElement.textContent.trim() !== previous, mounted);
  const ticked = await accurateAge(page, facts, samples, 'periodic');
  assert.notEqual(ticked, mounted, 'age must advance without a user event or a parent rerender');
  const updated = { ...facts, generatedAt: new Date(Date.now() - 25_000).toISOString() };
  await page.evaluate(facts => window.replaceFacts(facts), updated);
  assert.match(await accurateAge(page, updated, samples, 'fresh-facts'), /^数据 2\ds 前$/u);
  await unmount(page);
});
