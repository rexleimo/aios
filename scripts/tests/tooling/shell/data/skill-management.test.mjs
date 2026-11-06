import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listManagedSkills, manageSkill } from '../../../../lib/tooling/components/skills/lifecycle/management.mjs';

function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-skill-management-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source', 'hello');
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: hello\ndescription: A test skill\n---\nOriginal content\n');
  return { rootDir: root, projectRoot: path.join(root, 'project'), registryRoot: path.join(root, 'registry'),
    homeMap: { claude: path.join(root, 'claude'), pi: path.join(root, 'pi') }, source };
}

test('skill lifecycle: preview, distribute, conflict protection and selected removal', async (t) => {
  const options = sandbox(t);
  const input = { action: 'install', source: options.source, name: 'hello', clients: ['claude', 'pi'], scope: 'global' };
  const preview = await manageSkill({ ...input, dryRun: true }, options);
  assert.equal(preview.ok, true);
  assert.equal(fs.existsSync(options.registryRoot), false);
  assert.equal(fs.existsSync(options.homeMap.claude), false);
  const installed = await manageSkill(input, options);
  assert.equal(installed.ok, true);
  const target = path.join(options.homeMap.claude, 'skills', 'hello', 'SKILL.md');
  assert.match(fs.readFileSync(target, 'utf8'), /Original content/);
  const inventory = await listManagedSkills(options);
  assert.equal(inventory.clients.length, 10);
  assert.ok(inventory.skills.some(row => row.name === 'hello' && row.client === 'claude' && row.ownership === 'owned'));
  fs.appendFileSync(target, 'User changes\n');
  const changedBytes = fs.readFileSync(target);
  for (const action of ['sync', 'remove']) {
    const conflict = await manageSkill({ action, name: 'hello', kind: 'external', clients: ['claude'], scope: 'global' }, options);
    assert.equal(conflict.ok, false);
    assert.equal(conflict.results[0].status, 'conflict');
    assert.deepEqual(fs.readFileSync(target), changedBytes);
  }
  const removed = await manageSkill({ action: 'remove', name: 'hello', kind: 'external', clients: ['pi'], scope: 'global' }, options);
  assert.equal(removed.ok, true);
  assert.equal(fs.existsSync(path.join(options.homeMap.pi, 'skills', 'hello')), false);
  assert.equal(fs.existsSync(path.join(options.registryRoot, 'hello', 'SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(options.source, 'SKILL.md')), true);
});

test('unknown targets, traversal and unmanaged collisions fail without changing user data', async (t) => {
  const options = sandbox(t);
  await assert.rejects(manageSkill({ action: 'remove', name: '../outside', clients: ['claude'], scope: 'global' }, options));
  await assert.rejects(manageSkill({ action: 'install', source: options.source, clients: ['cline'], scope: 'global' }, options));
  const ownDir = path.join(options.homeMap.claude, 'skills', 'hello');
  fs.mkdirSync(ownDir, { recursive: true });
  fs.writeFileSync(path.join(ownDir, 'SKILL.md'), 'User owned');
  const result = await manageSkill({ action: 'install', source: options.source, clients: ['claude'], scope: 'global' }, options);
  assert.equal(result.ok, false);
  assert.equal(result.results[0].status, 'external');
  assert.equal(fs.readFileSync(path.join(ownDir, 'SKILL.md'), 'utf8'), 'User owned');
});
