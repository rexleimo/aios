import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseConnectTarget } from '../../../lib/tooling/model-router/connect/targets.mjs';

test('gateway API validates canonical targets/revisions and forwards only after confirmation, matching port and live readiness', async (t) => {
  const route = new URL('../../../../apps/shell/ui/src/app/api/model-routing/gateway/route.ts', import.meta.url);
  const executable = stripTypeScriptTypes(fs.readFileSync(route, 'utf8'), { sourceUrl: route.href })
    .replace(/from '(\.[^']+)'/gu, (_match, specifier) => `from '${new URL(specifier, route).href}'`);
  const { POST } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-connect-api-'));
  const previousRoot = process.env.AIOS_PROJECT_ROOT, previousFetch = globalThis.fetch;
  let health = { ok: true, ready: true };
  globalThis.fetch = async (url) => {
    assert.equal(String(url), 'http://127.0.0.1:3127/health');
    return Response.json(health);
  };
  process.env.AIOS_PROJECT_ROOT = root;
  t.after(() => {
    if (previousRoot === undefined) delete process.env.AIOS_PROJECT_ROOT;
    else process.env.AIOS_PROJECT_ROOT = previousRoot;
    globalThis.fetch = previousFetch;
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.writeFileSync(path.join(root, 'scripts/aios.mjs'), `
import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync('calls.jsonl', JSON.stringify(args) + '\\n');
console.log(args[1] === 'gateway-status' ? fs.readFileSync('status.json', 'utf8') : JSON.stringify({ ok: true }));
`);
  const setStatus = (value) => fs.writeFileSync(path.join(root, 'status.json'), JSON.stringify(value));
  const calls = () => fs.existsSync(path.join(root, 'calls.jsonl')) ? fs.readFileSync(path.join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) : [];
  const post = async (extra) => {
    const response = await POST(new Request('http://localhost/api/model-routing/gateway', {
      method: 'POST', body: JSON.stringify({ action: 'connect', confirm: true, client: 'codex', port: 3127, ...extra }),
    }));
    return { status: response.status, body: await response.json() };
  };
  setStatus({ running: true, port: 3127 });
  const revision = 'a1'.repeat(32);
  for (const target of [undefined, 'aios-auto', 'auto', 'native', 'model:auto', 'model:group%3Ax', 'group:team%2Fone%20%25', 'model:%E6%A8%A1%E5%9E%8B', 'model:two%20words', 'model:x%2fy']) {
    const result = await post({ target, expectedRevision: revision, isolated: true });
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(result.body.ok, true);
    assert.deepEqual(calls().at(-1), ['model-router', 'connect', '--json', '--port', '3127', '--client', 'codex', '--target', parseConnectTarget(target).ref, '--expected-revision', revision, '--isolated']);
  }
  const before = calls();
  for (const target of [null, {}, [], true, '', 'raw-id', 'model:a/b', 'model:%61', 'group:', 'model:%', 'model:%00', 'model:%7F', `model:${'a'.repeat(513)}`, `model:${'%E6%A8%A1'.repeat(230)}`]) {
    const result = await post({ target });
    assert.equal(result.status, 400, JSON.stringify(target));
    assert.equal(result.body.error, 'invalid-target');
  }
  for (const expectedRevision of [undefined, null, true, [], '', 'A'.repeat(64), 'a'.repeat(63), 'x'.repeat(64), 'a'.repeat(65)]) {
    const result = await post({ expectedRevision });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'invalid-revision');
  }
  for (const extra of [{ port: null }, { port: '3127' }, { client: 'unknown' }, { port: 65536 }]) assert.equal((await post(extra)).status, 400);
  assert.equal((await post({ confirm: false, target: 'model:auto' })).status, 409);
  assert.deepEqual(calls(), before, 'all body validation and confirmation precedes every CLI invocation');
  for (const value of [{ running: false, port: 3127 }, { running: true, port: 8686 }]) {
    setStatus(value);
    assert.equal((await post({ target: 'model:auto', expectedRevision: revision })).body.error, 'gateway-changed');
    assert.equal(calls().at(-1)[1], 'gateway-status');
  }
  setStatus({ running: true, port: 3127 });
  health = { ok: true, ready: false };
  assert.equal((await post({ target: 'model:auto', expectedRevision: revision })).body.error, 'gateway-not-ready');
  assert.equal(calls().at(-1)[1], 'gateway-status');
  globalThis.fetch = async () => { throw new Error('intercepted readiness failure'); };
  assert.equal((await post({ target: 'model:auto', expectedRevision: revision })).body.error, 'gateway-not-ready');
  assert.equal(calls().at(-1)[1], 'gateway-status');
  assert.equal((await post({ action: 'disconnect' })).status, 200);
  assert.deepEqual(calls().at(-1), ['model-router', 'disconnect', '--json', '--client', 'codex']);
});
