import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { build } from 'esbuild';
import { agentInventory, revision, skillInventory, skillReport } from './resources-fixtures.mjs';

const bundle = await build({ entryPoints: [path.resolve(import.meta.dirname, '../../../../../apps/shell/ui/src/components/console/resources/resource-client.ts')],
  bundle: true, write: false, platform: 'node', format: 'esm' });
const { canApplyPreview, readAgents, readSkills, ResourceReadError, runAgentDoctor, runSkillAction } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const request = { resource: 'skills', action: 'install', name: 'hello', kind: 'builtin', scope: 'global', clients: ['claude'] };
function mockFetch(t, data, { status = 200, wrapped = true } = {}) {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json(wrapped ? { ok: true, data } : data, { status });
  };
  t.after(() => { globalThis.fetch = previous; });
  return calls;
}

test('inventories preserve unknown loading status, ownership, provenance and blocked agent evidence', async t => {
  const calls = mockFetch(t, skillInventory);
  const skills = await readSkills();
  assert.equal(skills.skills[0].loaded, null);
  assert.equal(skills.skills[2].ownership, 'conflict');
  assert.equal(calls[0].url, '/api/manage?resource=skills');
  assert.equal(calls[0].init.cache, 'no-store');
});

test('agent doctor returns a blocked verdict as a real report, without clients or a live action', async t => {
  const calls = mockFetch(t, agentInventory);
  assert.deepEqual(await readAgents(), agentInventory);
  const report = await runAgentDoctor();
  assert.equal(report.strict.blocked, true);
  assert.equal(calls[0].url, '/api/manage?resource=agents');
  assert.deepEqual(JSON.parse(calls[1].init.body), { resource: 'agents', action: 'doctor' });
});

test('HTTP unsupported, command failure, malformed fields, and a genuinely empty list are distinct', async t => {
  await t.test('unsupported endpoint', async t => {
    mockFetch(t, { error: 'not supported' }, { status: 501, wrapped: false });
    await assert.rejects(readSkills(), error => error instanceof ResourceReadError && error.unsupported);
  });
  await t.test('command verdict error is not unsupported or empty', async t => {
    mockFetch(t, { ok: false, error: 'permission denied' });
    await assert.rejects(readSkills(), error => error.message === 'permission denied' && !error.unsupported);
  });
  await t.test('unknown schema is unsupported', async t => {
    mockFetch(t, { ...skillInventory, schema: 'skill.inventory.v99' });
    await assert.rejects(readSkills(), error => error.unsupported);
  });
  await t.test('malformed fields cannot become an empty array', async t => {
    mockFetch(t, { ...skillInventory, skills: null });
    await assert.rejects(readSkills(), error => /字段不完整/u.test(error.message) && !error.unsupported);
  });
  await t.test('a valid empty list remains empty', async t => {
    mockFetch(t, { ...skillInventory, skills: [], available: [] });
    assert.deepEqual((await readSkills()).skills, []);
  });
});

test('skill preview never confirms a write; apply sends only the returned preview revision and confirmation', async t => {
  const report = skillReport(request);
  const calls = mockFetch(t, report);
  assert.deepEqual(await runSkillAction(request), report);
  assert.deepEqual(JSON.parse(calls[0].init.body), { ...request, dryRun: true });
  // The apply response must also truthfully identify itself as a write, not a preview.
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return Response.json({ ok: true, data: skillReport(request, false) }); };
  await runSkillAction(request, report);
  assert.deepEqual(JSON.parse(calls[1].init.body), { ...request, dryRun: false, confirm: true, expectedRevision: revision });
});

test('failed, malformed, incomplete, stale or wrong-mode reports cannot authorize another write', async t => {
  const preview = skillReport(request);
  for (const patch of [{ ok: false }, { dryRun: false }, { revision: 'old' }, { schema: 'unknown' }, { results: [] }, { results: [{ status: 'conflict' }] }]) {
    assert.equal(canApplyPreview({ ...preview, ...patch }), false);
  }
  mockFetch(t, { ok: false, error: 'preview-stale', results: [] });
  const stale = await runSkillAction(request, preview);
  assert.equal(stale.error, 'preview-stale');
  await assert.rejects(runSkillAction(request, stale), /必须先取得/u);
});

test('a success transport cannot launder an invalid action mode or missing target result', async t => {
  for (const [label, patch] of [
    ['wrong action mode', { dryRun: false }],
    ['missing target results', { results: undefined }],
    ['empty target results', { results: [] }],
    ['malformed target results', { results: [{ status: 'installed' }] }],
  ]) await t.test(label, async t => {
    mockFetch(t, { ...skillReport(request), ...patch });
    await assert.rejects(runSkillAction(request), /模式不一致|落点结果/u);
  });
});
