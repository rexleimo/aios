import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { toModelBindings, toModelCatalog } from '../../../../../apps/shell/ui/src/lib/config/model-routing.mjs';
import { clientResourceState, handleClientResourceRequest } from './clients-resources/api-fixture.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');
let fixtureSequence = 0;

export async function browserRuntime() {
  for (const directory of ['node_modules/playwright-core', 'mcp-server/node_modules/playwright-core']) {
    const entry = path.join(ROOT, directory, 'index.js');
    if (fs.existsSync(entry)) {
      // A bare Windows absolute path is parsed as protocol "e:" by ESM; POSIX
      // absolute paths import fine, so use a file URL for both.
      const module = await import(pathToFileURL(entry).href);
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
  const { empty = false, configuration, clientResources, gatewayStatus = {}, connectionOverrides = {}, evidenceName, ...contextOptions } = options;
  const evidenceId = String(++fixtureSequence).padStart(3, '0');
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 1000 }, ...contextOptions });
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
    activeModel: '', clientDefaults: {}, customModels: [], matrix: { default: {}, clients: {} }, routingGroups: [],
    intentRouting: { enabled: false, classifierModel: '', intents: [] },
    ...configuration?.editable,
  };
  const state = { failSave: 0, failRead: false, refreshFailures: [], writes: [], refreshes: 0, gatewayActions: [], gatewayReads: 0, decisionReads: 0, unexpected: [], recent: [],
    ...clientResourceState(clientResources), gatewayStatus: structuredClone(gatewayStatus), connectionOverrides: structuredClone(connectionOverrides),
    catalogHash: '1'.padStart(64, '0'), catalogReads: 0,
    failGatewayRead: 0, failGatewayAction: 0, failGatewayVerdict: false, consoleReads: 0, consoleRefreshes: 0 };
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === new URL(baseUrl).origin && (request.isNavigationRequest() || url.searchParams.has('_rsc'))) state.consoleReads += 1;
    if (url.origin === new URL(baseUrl).origin && url.pathname === '/mcp' && request.headers().rsc === '1'
      && request.headers()['next-router-prefetch'] !== '1') state.consoleRefreshes += 1;
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(baseUrl).origin) return route.continue();
    state.unexpected.push(`external ${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort('blockedbyclient');
  });
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
    if (url.origin !== new URL(baseUrl).origin) {
      state.unexpected.push(`external API ${request.method()} ${url.origin}${url.pathname}`);
      return route.abort('blockedbyclient');
    }
    if (await handleClientResourceRequest({ request, url, respond, fail, state })) return;
    if (url.pathname === '/api/config/model-routing') {
      if (request.method() === 'GET') {
        state.catalogReads += 1;
        if (state.failRead) return fail({ error: 'fixture read unavailable' }, 503);
        const document = {
          providers: Object.fromEntries(editable.providers.map(provider => [provider.id, provider])),
          models: Object.fromEntries([...models, ...editable.customModels.map(model => ({ ...model, source: 'custom', cost: 'unknown' }))].map(model => [model.id, model])),
        };
        return respond({ editable, models: toModelCatalog(document), modelBindings: toModelBindings(document),
          hash: state.catalogHash, policyContext: configuration?.policyContext ?? { roleDefaults: empty ? {} : { implementer: { taskType: 'implementation', preferredModel: 'model-alpha' } }, routingRules: [] }, auto: ['planner', 'implementer', 'reviewer', 'security-reviewer', 'team-lead', 'team-member'].map(role => ({ role, autoModelId: empty ? '' : 'model-alpha', effectiveModelId: empty ? '' : 'model-alpha' })) });
      }
      assert.equal(request.method(), 'PUT');
      const body = request.postDataJSON();
      state.writes.push(body);
      if (state.failSave) return fail({ error: 'fixture save unavailable' }, state.failSave);
      assert.equal(body.expectedHash, state.catalogHash);
      editable = body.editable;
      revision += 1;
      state.catalogHash = revision.toString(16).padStart(64, '0');
      return respond({ ok: true, changed: ['clientRoleMatrix'], backup: '.aios/config-backups/fixture.json', hash: state.catalogHash });
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
        if (body.action === 'connect'
          && (!/^[a-f0-9]{64}$/u.test(body.expectedRevision || '') || body.expectedRevision !== state.catalogHash)) {
          return fail({ ok: false, error: 'fixture catalog revision changed; refresh targets and confirm again' }, 409);
        }
        if (body.action === 'disconnect') assert.equal(Object.hasOwn(body, 'expectedRevision'), false, 'safe disconnect does not depend on a target catalog revision');
        if (body.action === 'start') running = true;
        if (body.action === 'stop') running = false;
        if (body.action === 'disconnect') connected = false;
        if (['start', 'stop'].includes(body.action)) state.gatewayStatus.running = running;
        if (body.action === 'connect' || body.action === 'disconnect') {
          if (body.target) assert.match(body.target, /^(?:auto|native|model:.+|group:.+)$/u);
          state.connectionOverrides[body.client] = { ...state.connectionOverrides[body.client], connected: body.action === 'connect',
            ...(body.target ? { target: body.target, defaultTarget: body.target } : {}),
            readback: { status: body.action === 'connect' ? 'connected' : 'disconnected' },
            ownership: { status: body.action === 'connect' ? 'owned' : 'unowned' }, recovery: { status: body.action === 'connect' ? 'available' : 'none' } };
        }
        if (state.failGatewayAction) return fail({ ok: false, error: 'fixture gateway mutation uncertain after possible write' }, state.failGatewayAction);
        if (state.failGatewayVerdict) return respond({ ok: false, error: 'fixture gateway mutation uncertain after possible write' });
        return respond({ ok: true, result: { url: 'http://127.0.0.1:3127', stopped: body.action === 'stop', disconnected: body.action === 'disconnect' } });
      }
      assert.equal(request.method(), 'GET');
      state.gatewayReads += 1;
      if (state.failGatewayRead) return fail({ error: 'fixture gateway read unavailable' }, state.failGatewayRead);
      return respond({ running, managed: running, stale: false, pid: running ? 123 : null, port: 3127,
        ready: running && !empty, configuredModels: empty ? 0 : 2, readyModels: empty ? 0 : 2, configuredRevision: state.catalogHash,
        readiness: { ready: running && !empty, configuredModels: empty ? 0 : 2, readyModels: empty ? 0 : 2, code: empty ? 'NO_ROUTE_CONFIGURED' : undefined },
        url: 'http://127.0.0.1:3127', connected, ...state.gatewayStatus,
        clients: ['claude', 'codex', 'pi'].map(client => ({ client, connected: client === 'claude' && connected,
          target: 'auto', defaultTarget: 'auto', readback: { status: client === 'claude' && connected ? 'connected' : 'disconnected' },
          ownership: { status: client === 'claude' && connected ? 'owned' : 'unowned' }, recovery: { status: client === 'claude' && connected ? 'available' : 'none' },
          capabilities: { targets: true, native: { supported: client !== 'pi', reason: client === 'pi' ? 'fixture Pi has no safe native target mode' : '' } },
          launch: `${client} --fixture`, mode: 'inplace', artifactExists: false, ...state.connectionOverrides[client] })) });
    }
    if (url.pathname === '/api/model-routing/decisions') {
      assert.equal(request.method(), 'GET');
      state.decisionReads += 1;
      return respond({ exists: true, counters: { requests: state.recent.length, errors: 1, autoRouted: 1 }, recent: state.recent, byClient: { claude: 1, codex: 1, pi: 1 }, byModel: { 'model-alpha': 2, 'model-beta': 1 }, edges: [] });
    }
    state.unexpected.push(`${request.method()} ${url.pathname}`);
    return respond({ error: 'unexpected-test-api' }, 500);
  });
  return { page, context, state, errors, consoleMessages, saved: () => structuredClone(editable), async close() {
    const unmatchedHttpErrors = [...expectedResourceErrors];
    const unexpectedConsole = consoleMessages.filter(message => {
      // Only the exact resource errors caused by injected HTTP failures are expected.
      const status = message.type === 'error'
        ? message.text.match(/^Failed to load resource: the server responded with a status of (\d{3})(?: \([^)]*\))?$/u)?.[1]
        : undefined;
      const index = unmatchedHttpErrors.findIndex(failure => failure.url === message.location.url && String(failure.status) === status);
      if (index < 0) return true;
      unmatchedHttpErrors.splice(index, 1);
      return false;
    });
    try {
      if (process.env.AIOS_BROWSER_ARTIFACT_DIR) {
        const directory = path.resolve(process.env.AIOS_BROWSER_ARTIFACT_DIR);
        fs.mkdirSync(directory, { recursive: true });
        const name = (evidenceName || new URL(page.url()).pathname).replace(/[^a-zA-Z0-9-]+/gu, '-').slice(0, 110);
        const prefix = path.join(directory, `${evidenceId}-${name}`);
        fs.writeFileSync(`${prefix}.json`, `${JSON.stringify({ name: evidenceName, url: page.url(), viewport: page.viewportSize(),
          pageErrors: errors, consoleMessages, expectedHttpErrors: expectedResourceErrors, unexpectedConsole,
          unexpectedRequests: state.unexpected, catalogReads: state.catalogReads, gatewayActions: state.gatewayActions,
          clientActions: state.clientActions, mcpActions: state.mcpActions, mcpInstallRevisions: state.mcpInstallRevisions }, null, 2)}\n`);
        await page.screenshot({ path: `${prefix}.png`, fullPage: true, animations: 'disabled' });
      }
    } finally { await context.close(); }
    assert.deepEqual(state.unexpected, [], 'no API request may escape the fixture');
    assert.deepEqual(errors, [], 'the workspace must not throw browser errors');
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
