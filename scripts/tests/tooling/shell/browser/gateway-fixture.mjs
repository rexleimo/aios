import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { toModelBindings, toModelCatalog } from '../../../../../apps/shell/ui/src/lib/config/model-routing.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');

export async function browserRuntime() {
  for (const directory of ['node_modules/playwright-core', 'mcp-server/node_modules/playwright-core']) {
    const entry = path.join(ROOT, directory, 'index.js');
    if (fs.existsSync(entry)) {
      const module = await import(entry);
      const { chromium } = module.default || module;
      const executablePath = process.env.AIOS_FILM_BROWSER || [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome', '/usr/bin/chromium',
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
      ].find(file => fs.existsSync(file));
      return executablePath ? { chromium, executablePath } : null;
    }
  }
  return null;
}

export async function gatewayFixture(browser, baseUrl, token, options = {}) {
  const { empty = false, configuration, ...contextOptions } = options;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...contextOptions });
  await context.addCookies([{ name: 'aios_ui_token', value: token, url: baseUrl, httpOnly: true, sameSite: 'Strict' }]);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  const consoleMessages = [];
  const expectedResourceErrors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleMessages.push({ type: message.type(), text: message.text(), location: message.location() });
    }
  });
  const models = configuration?.models ?? (empty ? [] : [
    { id: 'model-alpha', label: 'Alpha', protocols: ['openai-chat'], provider: 'fixture', source: 'curated', cost: 'low' },
    { id: 'model-beta', label: 'Beta', protocols: ['openai-chat'], provider: 'fixture', source: 'discovered', cost: 'low' },
  ]);
  let editable = {
    providers: empty ? [] : [{ id: 'fixture', baseUrl: 'https://example.invalid/v1', apiKeyEnv: 'env:FIXTURE_KEY', authMode: 'required', models: ['model-alpha'], protocols: ['openai-chat'] }],
    customModels: [], matrix: { default: {}, clients: {} }, routingGroups: [],
    intentRouting: { enabled: false, classifierModel: '', intents: [] },
    ...configuration?.editable,
  };
  const state = { failSave: 0, failRead: false, refreshFailures: [], writes: [], refreshes: 0, gatewayActions: [], gatewayReads: 0, decisionReads: 0, unexpected: [], recent: [] };
  let revision = 1;
  let running = empty;
  let connected = !empty;
  state.recent = empty ? [] : [
    { recordKey: 'fixture-1', at: '2026-11-15T08:00:00Z', clientId: 'claude', modelId: 'model-alpha', role: 'implementer', status: 200 },
    { recordKey: 'fixture-2', at: '2026-11-15T07:59:00Z', clientId: 'codex', modelId: 'model-beta', intent: 'review', status: 502, error: 'fixture upstream unavailable' },
    { recordKey: 'fixture-3', at: '2026-11-15T07:58:00Z', clientId: 'pi', modelId: 'model-alpha' },
  ];
  // Every browser API request is intercepted. Unknown routes fail closed, especially writes.
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const fail = (body, status) => {
      expectedResourceErrors.push({ url: request.url(), status });
      return respond(body, status);
    };
    if (url.pathname === '/api/config/model-routing') {
      if (request.method() === 'GET') {
        if (state.failRead) return fail({ error: 'fixture read unavailable' }, 503);
        const document = {
          providers: Object.fromEntries(editable.providers.map(provider => [provider.id, provider])),
          models: Object.fromEntries([...models, ...editable.customModels.map(model => ({ ...model, source: 'custom', cost: 'unknown' }))].map(model => [model.id, model])),
        };
        return respond({ editable, models: toModelCatalog(document), modelBindings: toModelBindings(document),
          hash: `revision-${revision}`, auto: ['planner', 'implementer', 'reviewer', 'security-reviewer', 'team-lead', 'team-member'].map(role => ({ role, autoModelId: empty ? '' : 'model-alpha', effectiveModelId: empty ? '' : 'model-alpha' })) });
      }
      assert.equal(request.method(), 'PUT');
      const body = request.postDataJSON();
      state.writes.push(body);
      if (state.failSave) return fail({ error: 'fixture save unavailable' }, state.failSave);
      assert.equal(body.expectedHash, `revision-${revision}`);
      editable = body.editable;
      revision += 1;
      return respond({ ok: true, changed: ['clientRoleMatrix'], backup: '.aios/config-backups/fixture.json', hash: `revision-${revision}` });
    }
    if (url.pathname === '/api/model-routing/models') {
      assert.equal(request.method(), 'POST');
      assert.deepEqual(request.postDataJSON(), { confirm: true });
      state.refreshes += 1;
      return respond({ ok: true, result: { discovered: 2, added: 0, enriched: 0, total: 2, providers: state.refreshFailures } });
    }
    if (url.pathname === '/api/model-routing/gateway') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        assert.equal(body.confirm, true);
        if (body.action === 'start' || body.action === 'connect') assert.equal(body.port, 3127, 'the actual nondefault port must be forwarded');
        state.gatewayActions.push(body);
        if (body.action === 'start') running = true;
        if (body.action === 'stop') running = false;
        if (body.action === 'disconnect') connected = false;
        return respond({ ok: true, result: { url: 'http://127.0.0.1:3127', stopped: body.action === 'stop', disconnected: body.action === 'disconnect' } });
      }
      state.gatewayReads += 1;
      return respond({ running, managed: running, stale: false, pid: running ? 123 : null, port: 3127,
        ready: running && !empty, configuredModels: empty ? 0 : 2, readyModels: empty ? 0 : 2,
        readiness: { ready: running && !empty, configuredModels: empty ? 0 : 2, readyModels: empty ? 0 : 2, code: empty ? 'NO_ROUTE_CONFIGURED' : undefined },
        url: 'http://127.0.0.1:3127', connected, clients: ['claude', 'codex', 'pi'].map(client => ({ client, connected: client === 'claude' && connected, launch: `${client} --fixture`, mode: 'inplace', artifactExists: false })) });
    }
    if (url.pathname === '/api/model-routing/decisions') {
      state.decisionReads += 1;
      return respond({ exists: true, counters: { requests: state.recent.length, errors: 1, autoRouted: 1 }, recent: state.recent, byClient: { claude: 1, codex: 1, pi: 1 }, byModel: { 'model-alpha': 2, 'model-beta': 1 }, edges: [] });
    }
    state.unexpected.push(`${request.method()} ${url.pathname}`);
    return respond({ error: 'unexpected-test-api' }, 500);
  });
  return { page, context, state, errors, consoleMessages, saved: () => structuredClone(editable), async close() {
    await context.close();
    assert.deepEqual(state.unexpected, [], 'no API request may escape the fixture');
    assert.deepEqual(errors, [], 'the workspace must not throw browser errors');
    const unexpectedConsole = consoleMessages.filter(message => {
      // Only the exact resource errors caused by injected HTTP failures are expected.
      const status = message.type === 'error'
        ? message.text.match(/^Failed to load resource: the server responded with a status of (\d{3})(?: \([^)]*\))?$/u)?.[1]
        : undefined;
      const index = expectedResourceErrors.findIndex(failure => failure.url === message.location.url && String(failure.status) === status);
      if (index < 0) return true;
      expectedResourceErrors.splice(index, 1);
      return false;
    });
    assert.deepEqual(unexpectedConsole, [], 'the workspace must not emit console errors or warnings, including hydration warnings');
  } };
}

export async function choose(page, label, option) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option }).click();
}

export async function visible(page, locator) {
  await locator.waitFor({ state: 'visible' });
  assert.equal(await locator.isVisible(), true);
}

export async function noPageOverflow(page) {
  const layout = await page.evaluate(() => ({
    width: window.innerWidth, document: document.documentElement.scrollWidth,
    outside: [...document.querySelectorAll('body *')].filter(element => element.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 12).map(element => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right, parent: element.parentElement?.outerHTML.slice(0, 700) })),
  }));
  assert.ok(layout.document <= layout.width, `only tables may scroll horizontally, not the document: ${page.url()} ${JSON.stringify(layout)}`);
}
