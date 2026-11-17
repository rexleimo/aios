import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const url = new URL('../../../../../apps/shell/ui/src/components/console/flows/mcp-install-flow.ts', import.meta.url);
const source = stripTypeScriptTypes(fs.readFileSync(url, 'utf8'), { sourceUrl: url.href });
const { createMcpInstallFlow } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const input = { client: 'claude', scope: 'home', name: 'aios-search', entry: { type: 'stdio', command: 'node', args: ['/fake/search.mjs'] } };
const preview = { ok: true, exitCode: 0, preview: { id: 'one', expiresAt: 600_000 },
  result: { schema: 'mcp.action.v1', command: 'add', status: 'planned', dryRun: true, exitCode: 0, classification: { status: 'absent' } } };
const installed = { ok: true, exitCode: 0, result: { ...preview.result, dryRun: false, status: 'installed' } };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
function fixture({ send: custom, now = () => 0 } = {}) {
  const calls = [];
  let refreshes = 0;
  const flow = createMcpInstallFlow({ now, refresh: () => { refreshes += 1; },
    send: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url, method: options.method, body });
      if (custom) return custom(body, options);
      return response(options.method === 'DELETE' ? { ok: true } : body.dryRun ? preview : installed);
    },
  });
  return { flow, calls, refreshes: () => refreshes };
}

test('safe preview plus fresh explicit consent is the only path to a real add request', async () => {
  const { flow, calls, refreshes } = fixture();
  flow.approve(true);
  await flow.install();
  assert.equal(calls.length, 0);
  await flow.preview(input);
  assert.equal(flow.canInstall(), false);
  assert.equal(Object.hasOwn(calls[0].body, 'confirm'), false);
  assert.equal(calls[0].body.dryRun, true);
  flow.approve(true);
  assert.equal(flow.canInstall(), true);
  await flow.install();
  assert.deepEqual(calls[1].body, { ...input, action: 'add', dryRun: false, confirm: true, previewId: 'one' });
  assert.equal(Object.hasOwn(calls[1].body.entry, 'env'), false);
  assert.equal(flow.snapshot().phase, 'done');
  assert.equal(flow.snapshot().consent, false);
  assert.equal(flow.canInstall(), false);
  await flow.install();
  assert.equal(calls.length, 2);
  assert.equal(refreshes(), 1);
});

test('back/edit/cancel invalidate consent, revoke the preview and require another preview', async () => {
  const { flow, calls } = fixture();
  await flow.preview(input);
  flow.approve(true);
  flow.invalidate();
  assert.equal(flow.snapshot().consent, false);
  assert.equal(flow.snapshot().preview, null);
  assert.equal(calls.at(-1).method, 'DELETE');
  assert.deepEqual(calls.at(-1).body, { previewId: 'one' });
  await flow.install();
  assert.equal(calls.filter((call) => call.body.confirm).length, 0);
  await flow.preview({ ...input, name: 'edited' });
  assert.equal(flow.canInstall(), false);
});

test('late preview after cancellation or editing is revoked, never promoted to approvable state', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const { flow, calls } = fixture({ send: (_, options) => options.method === 'DELETE' ? response({ ok: true }) : pending });
  const work = flow.preview(input);
  flow.invalidate();
  resolve(response(preview));
  await work;
  assert.equal(flow.snapshot().phase, 'idle');
  assert.equal(flow.snapshot().preview, null);
  assert.equal(flow.canInstall(), false);
  assert.equal(calls.at(-1).method, 'DELETE');
});

for (const [label, body, status] of [
  ['HTTP 200 ok:false', { ...preview, ok: false }, 200],
  ['HTTP error', preview, 409],
  ['external ownership', { ...preview, result: { ...preview.result, classification: { status: 'external' } } }, 200],
  ['CLI rejection', { ...preview, result: { ...preview.result, status: 'conflict' } }, 200],
  ['expired preview', { ...preview, preview: { id: 'expired', expiresAt: 0 } }, 200],
]) test(`failed preview never permits consent: ${label}`, async () => {
  const { flow, calls } = fixture({ send: (_, options) => response(options.method === 'DELETE' ? { ok: true } : body, status) });
  await flow.preview(input);
  flow.approve(true);
  assert.equal(flow.snapshot().phase, 'failed');
  assert.equal(flow.snapshot().consent, false);
  assert.equal(flow.canInstall(), false);
  await flow.install();
  assert.equal(calls.filter((call) => call.body.confirm).length, 0);
});

test('HTTP 200 ok:false during installation reports failure, refreshes, and cannot retry old consent', async () => {
  const { flow, calls, refreshes } = fixture({ send: (body) => response(body.dryRun ? preview
    : { ...installed, ok: false, result: { ...installed.result, status: 'stale-preview' } }) });
  await flow.preview(input);
  flow.approve(true);
  await flow.install();
  assert.equal(flow.snapshot().phase, 'failed');
  assert.equal(flow.snapshot().error, 'stale-preview');
  assert.equal(flow.snapshot().consent, false);
  await flow.install();
  assert.equal(calls.filter((call) => call.body.confirm).length, 1);
  assert.equal(refreshes(), 1);
});

test('uncertain transport failure refreshes inventory and requires fresh preview/consent', async () => {
  const { flow, refreshes } = fixture({ send: (body) => {
    if (!body.dryRun) throw new Error('connection lost after commit');
    return response(preview);
  } });
  await flow.preview(input);
  flow.approve(true);
  await flow.install();
  assert.equal(flow.snapshot().phase, 'failed');
  assert.match(flow.snapshot().error, /unknown/);
  assert.equal(flow.snapshot().consent, false);
  assert.equal(flow.canInstall(), false);
  assert.equal(refreshes(), 1);
});

test('unmount during an in-flight write still reconciles inventory without displaying late success', async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const { flow, refreshes } = fixture({ send: (body) => body.dryRun ? response(preview) : pending });
  await flow.preview(input);
  flow.approve(true);
  const work = flow.install();
  flow.dispose();
  finish(response(installed));
  await work;
  assert.equal(flow.snapshot().phase, 'idle');
  assert.equal(refreshes(), 1);
});

test('a double click starts at most one real write', async () => {
  const { flow, calls } = fixture();
  await flow.preview(input);
  flow.approve(true);
  await Promise.all([flow.install(), flow.install()]);
  assert.equal(calls.filter((call) => call.body.confirm).length, 1);
});

test('expiry notification revokes the preview and immediately clears already-granted consent', async () => {
  const { flow, calls } = fixture();
  await flow.preview(input);
  flow.approve(true);
  flow.expire();
  assert.equal(flow.snapshot().phase, 'failed');
  assert.equal(flow.snapshot().consent, false);
  assert.equal(flow.snapshot().preview, null);
  assert.match(flow.snapshot().error, /expired/);
  assert.equal(calls.at(-1).method, 'DELETE');
  await flow.install();
  assert.equal(calls.filter((call) => call.body.confirm).length, 0);
});

test('expiry is checked again at submit even if the browser timer has not fired', async () => {
  let now = 0;
  const { flow, calls } = fixture({ now: () => now });
  await flow.preview(input);
  flow.approve(true);
  now = preview.preview.expiresAt;
  assert.equal(flow.canInstall(), false);
  await flow.install();
  assert.equal(flow.snapshot().phase, 'failed');
  assert.equal(flow.snapshot().consent, false);
  assert.equal(calls.at(-1).method, 'DELETE');
  assert.equal(calls.filter((call) => call.body.confirm).length, 0);
});
