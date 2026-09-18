import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { mkdtemp as makeTempDir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SCRIPT = path.resolve(process.cwd(), 'scripts/prune-legacy-skill-copies.mjs');

async function makeFixture() {
  const root = await makeTempDir(path.join(os.tmpdir(), 'aios-legacy-skill-prune-'));
  const agentsHome = path.join(root, 'agents-home');
  const projectRoot = path.join(root, 'project');
  const skillRoot = path.join(agentsHome, 'skills');
  await fs.promises.mkdir(skillRoot, { recursive: true });
  await fs.promises.mkdir(projectRoot, { recursive: true });

  const writeManagedSkill = async (dir, name) => {
    await fs.promises.mkdir(path.join(dir, name), { recursive: true });
    await fs.promises.writeFile(path.join(dir, name, 'SKILL.md'), `# ${name}\n`, 'utf8');
    await fs.promises.writeFile(path.join(dir, name, '.aios-skill-install.json'), JSON.stringify({
      schemaVersion: 1,
      managedBy: 'aios',
      kind: 'installed-skill',
      skillName: name,
      client: 'claude',
      scope: 'global',
      installMode: 'copy',
    }), 'utf8');
  };

  await writeManagedSkill(skillRoot, 'provider-a');
  await writeManagedSkill(path.join(projectRoot, '.pi', 'skills'), 'pi-only');
  // 用户自有目录（无 AIOS metadata）必须原样保留。
  await fs.promises.mkdir(path.join(skillRoot, 'user-owned'), { recursive: true });
  await fs.promises.writeFile(path.join(skillRoot, 'user-owned', 'SKILL.md'), '# user\n', 'utf8');

  return { agentsHome, projectRoot, skillRoot };
}

function run(args, env = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('legacy skill prune CLI previews managed copies without deleting anything', async () => {
  const { agentsHome, projectRoot, skillRoot } = await makeFixture();

  const result = run(
    ['--project-root', projectRoot, '--dry-run'],
    { AGENTS_HOME: agentsHome },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[plan\] would remove legacy shared-root skill: provider-a/u);
  assert.match(result.stdout, /pi-skill-root=1/u);
  assert.ok(!result.stdout.includes('user-owned'));
  await fs.promises.stat(path.join(skillRoot, 'provider-a'));
});

test('legacy skill prune CLI deletes only AIOS-managed copies when applied', async () => {
  const { agentsHome, projectRoot, skillRoot } = await makeFixture();

  const result = run(
    ['--project-root', projectRoot, '--apply'],
    { AGENTS_HOME: agentsHome },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[ok\] removed: shared-root=1 pi-skill-root=1/u);
  assert.equal(fs.existsSync(path.join(skillRoot, 'provider-a')), false);
  assert.equal(fs.existsSync(path.join(projectRoot, '.pi', 'skills', 'pi-only')), false);
  assert.equal(fs.existsSync(path.join(skillRoot, 'user-owned')), true);
});

test('legacy skill prune CLI keeps usage discoverable and rejects contradictory flags', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--apply/u);
  assert.match(help.stdout, /user-owned skills are never removed/u);

  const conflicting = run(['--dry-run', '--apply']);
  assert.equal(conflicting.status, 1);
  assert.match(conflicting.stderr, /mutually exclusive/u);
});
