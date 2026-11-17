import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const ui = new URL('../../../../../apps/shell/ui/src/', import.meta.url);
const url = new URL('app/api/mcp/route.ts', ui);
let source = fs.readFileSync(url, 'utf8');
for (const specifier of ['../../../lib/data/mcp.mjs', '../../../lib/data/capability.mjs', './action-service.mjs', './preview-store.mjs']) {
  source = source.replace(JSON.stringify(specifier).replaceAll('"', "'"), JSON.stringify(new URL(specifier, url).href));
}
const { GET, POST, DELETE } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { sourceUrl: url.href })).toString('base64')}`);
const input = { action: 'add', client: 'claude', scope: 'home', name: 'aios-search', entry: { type: 'stdio', command: 'node', args: ['/fake/search.mjs'] } };
const secret = 'MCP_SENTINEL_NEVER_ECHO_123';
const revision = 'b'.repeat(64);
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-http-'));
  const keys = ['AIOS_PROJECT_ROOT', 'HOME', 'AIOS_HOME', 'DEEPSEEK_API_KEY'];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { AIOS_PROJECT_ROOT: root, HOME: root, AIOS_HOME: path.join(root, 'state'), DEEPSEEK_API_KEY: secret });
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.writeFileSync(path.join(root, 'scenario.json'), '{}');
  fs.writeFileSync(path.join(root, 'scripts', 'aios.mjs'), `
    import fs from 'node:fs'; import path from 'node:path';
    const root = process.env.AIOS_PROJECT_ROOT;
    const argv = process.argv.slice(2); const action = argv[1];
    const scenario = JSON.parse(fs.readFileSync(path.join(root, 'scenario.json'), 'utf8'));
    fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify({ argv, revision: process.env.AIOS_MCP_EXPECTED_REVISION }) + '\\n');
    if (action === 'list') {
      console.log(JSON.stringify({ schema: 'mcp.list.v1', landings: [{ clientId: 'claude', scope: 'home', writable: true, servers: [] }] }));
    } else {
      const dryRun = argv.includes('--dry-run');
      console.error(process.env.DEEPSEEK_API_KEY);
      console.log(JSON.stringify({ schema: 'mcp.action.v1', command: action, status: dryRun ? 'planned' : scenario.status || 'installed',
        dryRun, exitCode: scenario.payloadExit || 0, revision: ${JSON.stringify(revision)},
        classification: { status: dryRun ? 'absent' : 'owned' }, landing: { file: path.join(root, 'config.json') },
        detail: process.env.DEEPSEEK_API_KEY, message: process.env.DEEPSEEK_API_KEY }));
      process.exitCode = scenario.processExit || 0;
    }
  `);
  t.after(() => {
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, scenario: (body) => fs.writeFileSync(path.join(root, 'scenario.json'), JSON.stringify(body)),
    calls: () => fs.readFileSync(path.join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)) };
}
const request = (body, method = 'POST') => new Request('http://localhost/api/mcp', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
async function previewRequest() {
  const response = await POST(request({ ...input, dryRun: true }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  return { ...input, dryRun: false, confirm: true, previewId: body.preview.id };
}

test('real HTTP handlers spawn only the isolated fake CLI: preview, confirmed add, revision and replay rejection', async (t) => {
  const fx = fixture(t);
  assert.equal((await GET()).status, 200);
  const body = await previewRequest();
  const response = await POST(request(body));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.result.status, 'installed');
  assert.equal(result.refreshRequired, true);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
  const writes = fx.calls().filter((call) => call.argv[1] === 'add' && !call.argv.includes('--dry-run'));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].revision, revision);
  assert.equal((await POST(request(body))).status, 409);
  assert.equal(fs.existsSync(path.join(fx.root, 'config.json')), false);
  assert.equal(fs.existsSync(path.join(fx.root, 'state')), false);
});

test('DELETE revokes a pending preview and a missing confirmation consumes it', async (t) => {
  fixture(t);
  const cancelled = await previewRequest();
  assert.equal((await DELETE(request({ previewId: cancelled.previewId }, 'DELETE'))).status, 200);
  assert.equal((await POST(request(cancelled))).status, 409);
  const unconfirmed = await previewRequest();
  assert.equal((await POST(request({ ...unconfirmed, confirm: false }))).status, 409);
  assert.equal((await POST(request(unconfirmed))).status, 409);
});

test('HTTP 200 never turns a CLI conflict, payload rejection, or nonzero exit into success', async (t) => {
  const fx = fixture(t);
  for (const scenario of [{ status: 'conflict' }, { payloadExit: 1 }, { processExit: 1 }]) {
    fx.scenario({});
    const body = await previewRequest();
    fx.scenario(scenario);
    const response = await POST(request(body));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ok, false);
    assert.equal(result.refreshRequired, true);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
    assert.equal((await POST(request(body))).status, 409);
  }
});

test('HTTP input validation rejects nonobjects and all unconfirmed mutation verbs', async (t) => {
  fixture(t);
  assert.equal((await POST(request(null))).status, 400);
  assert.equal((await POST(request([]))).status, 400);
  for (const action of ['add', 'remove', 'adopt']) assert.equal((await POST(request({ ...input, action }))).status, 409);
});
