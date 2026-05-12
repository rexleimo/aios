import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeFixtureFile(rootDir, relativePath, content) {
  const filePath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
}

function assertOk(result, message = '') {
  assert.equal(result.status, 0, message || result.stderr || result.stdout);
}

async function seedFixtureRepo(rootDir, {
  checkSkillsSyncScript = 'process.exit(0);\n',
  checkNativeSyncScript = 'process.exit(0);\n',
} = {}) {
  const workspaceRoot = process.cwd();

  await writeFixtureFile(rootDir, 'AGENTS.md', '# fixture\n');
  await writeFixtureFile(rootDir, 'CHANGELOG.md', '## [1.2.3] - 2026-03-17\n');
  await writeFixtureFile(rootDir, 'VERSION', '1.2.3\n');
  await writeFixtureFile(rootDir, 'package.json', '{"name":"fixture-aios","type":"module","dependencies":{"ink":"^4.4.1"},"devDependencies":{"tsx":"^4.21.0"}}\n');
  await writeFixtureFile(rootDir, 'package-lock.json', '{"name":"fixture-aios","lockfileVersion":3,"packages":{}}\n');
  await writeFixtureFile(rootDir, 'README.md', '# README\n');
  await writeFixtureFile(rootDir, 'README-zh.md', '# README-ZH\n');
  await writeFixtureFile(rootDir, 'skills-lock.json', '{}\n');
  await writeFixtureFile(rootDir, 'config/skills-catalog.json', '{"version":1,"skills":[]}\n');
  await writeFixtureFile(rootDir, 'config/native-sync-manifest.json', '{"schemaVersion":1,"managedBy":"aios","markers":{"markdownBegin":"<!-- AIOS NATIVE BEGIN -->","markdownEnd":"<!-- AIOS NATIVE END -->"},"clients":{"codex":{"tier":"deep","metadataRoot":".codex","outputs":["AGENTS.md",".codex/agents",".codex/skills"]},"claude":{"tier":"deep","metadataRoot":".claude","outputs":["CLAUDE.md",".claude/settings.local.json",".claude/agents",".claude/skills"]},"gemini":{"tier":"compatibility","metadataRoot":".gemini","outputs":[".gemini/AIOS.md",".gemini/skills"]},"opencode":{"tier":"compatibility","metadataRoot":".opencode","outputs":[".opencode/AIOS.md",".opencode/skills"]}}}\n');
  await writeFixtureFile(rootDir, 'mcp-server/package.json', '{"name":"fixture-mcp"}\n');
  await writeFixtureFile(rootDir, 'memory/README.md', '# memory\n');
  await writeFixtureFile(rootDir, 'skill-sources/sample-skill/SKILL.md', '# canonical\n');
  await writeFixtureFile(rootDir, 'client-sources/native-base/gemini/project/AIOS.md', '# native gemini\n');
  await writeFixtureFile(rootDir, 'memory/specs/orchestrator-agents.json', '{}\n');
  await writeFixtureFile(rootDir, 'agent-sources/manifest.json', '{"schemaVersion":1,"generatedTargets":["claude","codex"]}\n');
  await writeFixtureFile(rootDir, 'agent-sources/roles/rex-planner.json', '{"schemaVersion":1,"id":"rex-planner","role":"planner","name":"rex-planner","description":"planner","tools":["Read"],"model":"sonnet","handoffTarget":"next-phase","systemPrompt":"plan"}\n');
  await writeFixtureFile(rootDir, 'agent-sources/roles/rex-implementer.json', '{"schemaVersion":1,"id":"rex-implementer","role":"implementer","name":"rex-implementer","description":"implement","tools":["Read","Edit"],"model":"sonnet","handoffTarget":"next-phase","systemPrompt":"implement"}\n');
  await writeFixtureFile(rootDir, 'agent-sources/roles/rex-reviewer.json', '{"schemaVersion":1,"id":"rex-reviewer","role":"reviewer","name":"rex-reviewer","description":"review","tools":["Read"],"model":"sonnet","handoffTarget":"merge-gate","systemPrompt":"review"}\n');
  await writeFixtureFile(rootDir, 'agent-sources/roles/rex-security-reviewer.json', '{"schemaVersion":1,"id":"rex-security-reviewer","role":"security-reviewer","name":"rex-security-reviewer","description":"security","tools":["Read"],"model":"sonnet","handoffTarget":"merge-gate","systemPrompt":"secure"}\n');
  await writeFixtureFile(rootDir, '.codex/skills/sample-skill/SKILL.md', '# codex\n');
  await writeFixtureFile(rootDir, '.codex/agents/rex.md', '# codex agent\n');
  await writeFixtureFile(rootDir, '.claude/skills/sample-skill/SKILL.md', '# claude\n');
  await writeFixtureFile(rootDir, '.claude/agents/rex.md', '# claude agent\n');
  await writeFixtureFile(rootDir, '.agents/skills/sample-skill/SKILL.md', '# agents\n');

  await writeFixtureFile(rootDir, 'scripts/package-release.sh', await readFile(path.join(workspaceRoot, 'scripts', 'package-release.sh'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/package-release.ps1', await readFile(path.join(workspaceRoot, 'scripts', 'package-release.ps1'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/release-preflight.sh', await readFile(path.join(workspaceRoot, 'scripts', 'release-preflight.sh'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/release-stable.sh', await readFile(path.join(workspaceRoot, 'scripts', 'release-stable.sh'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/generate-orchestrator-agents.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'generate-orchestrator-agents.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/aios-install.sh', '#!/usr/bin/env bash\n');
  await writeFixtureFile(rootDir, 'scripts/aios-install.ps1', "Write-Host 'fixture'\n");
  await writeFixtureFile(rootDir, 'scripts/check-skills-sync.mjs', checkSkillsSyncScript);
  await writeFixtureFile(rootDir, 'scripts/check-native-sync.mjs', checkNativeSyncScript);
  await writeFixtureFile(rootDir, 'scripts/sync-native.mjs', "console.log('[ok] native sync');\n");
  await writeFixtureFile(rootDir, 'scripts/lib/fs/atomic-write.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'fs', 'atomic-write.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/agents/source-tree.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'agents', 'source-tree.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/agents/compat-export.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'agents', 'compat-export.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/agents/sync.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'agents', 'sync.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/agents/emitters/shared.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'agents', 'emitters', 'shared.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/agents/emitters/claude.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'agents', 'emitters', 'claude.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/agents/emitters/codex.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'agents', 'emitters', 'codex.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/harness/orchestrator-agents.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'harness', 'orchestrator-agents.mjs'), 'utf8'));

  assertOk(run('git', ['init'], { cwd: rootDir }), 'git init failed');
  assertOk(run('git', ['config', 'user.email', 'fixture@example.com'], { cwd: rootDir }));
  assertOk(run('git', ['config', 'user.name', 'Fixture'], { cwd: rootDir }));
  assertOk(run('git', ['add', '-A'], { cwd: rootDir }));
  assertOk(run('git', ['commit', '-m', 'fixture'], { cwd: rootDir }));
}

test('package-release.sh emits stable assets that include native, skill, and agent assets', async () => {
  const rootDir = await makeTemp('rex-release-assets-fixture-');
  await seedFixtureRepo(rootDir);

  const outDir = await makeTemp('rex-release-assets-out-');
  const result = run('bash', ['scripts/package-release.sh', '--out', outDir], {
    cwd: rootDir,
  });

  assertOk(result);

  for (const fileName of ['aios-install.sh', 'aios-install.ps1', 'rex-cli.tar.gz', 'rex-cli.zip']) {
    const filePath = path.join(outDir, fileName);
    assertOk(run('test', ['-f', filePath]), `${fileName} was not produced`);
  }

  const extractDir = await makeTemp('rex-release-assets-extract-');
  assertOk(run('tar', ['-xzf', path.join(outDir, 'rex-cli.tar.gz'), '-C', extractDir]));
  assertOk(
    run('test', ['-f', path.join(extractDir, 'rex-cli', 'skill-sources', 'sample-skill', 'SKILL.md')]),
    'rex-cli.tar.gz did not include skill-sources/sample-skill/SKILL.md'
  );
  assertOk(
    run('test', ['-f', path.join(extractDir, 'rex-cli', 'agent-sources', 'manifest.json')]),
    'rex-cli.tar.gz did not include agent-sources/manifest.json'
  );
  assertOk(
    run('test', ['-f', path.join(extractDir, 'rex-cli', 'client-sources', 'native-base', 'gemini', 'project', 'AIOS.md')]),
    'rex-cli.tar.gz did not include client-sources/native-base/gemini/project/AIOS.md'
  );
  assertOk(
    run('test', ['-f', path.join(extractDir, 'rex-cli', 'package.json')]),
    'rex-cli.tar.gz did not include root package.json for direct release installs'
  );
  assertOk(
    run('test', ['-f', path.join(extractDir, 'rex-cli', 'package-lock.json')]),
    'rex-cli.tar.gz did not include root package-lock.json for direct release installs'
  );
});

test('one-liner installers bootstrap root runtime dependencies for direct release installs', async () => {
  const workspaceRoot = process.cwd();
  const installSh = await readFile(path.join(workspaceRoot, 'scripts', 'aios-install.sh'), 'utf8');
  const installPs1 = await readFile(path.join(workspaceRoot, 'scripts', 'aios-install.ps1'), 'utf8');

  assert.match(installSh, /npm install --include=dev/);
  assert.match(installSh, /node_modules\/\.bin\/tsx/);
  assert.match(installPs1, /npm install --include=dev/);
  assert.match(installPs1, /node_modules\/\.bin\/tsx\.cmd/);
});

test('one-liner installers perform first-run core setup before suggesting doctor', async () => {
  const workspaceRoot = process.cwd();
  const installSh = await readFile(path.join(workspaceRoot, 'scripts', 'aios-install.sh'), 'utf8');
  const installPs1 = await readFile(path.join(workspaceRoot, 'scripts', 'aios-install.ps1'), 'utf8');

  assert.match(installSh, /setup --components skills,native,superpowers --client all --skip-doctor/);
  assert.match(installPs1, /setup --components skills,native,superpowers --client all --skip-doctor/);
  assert.doesNotMatch(installSh, /setup --components [^\n]*browser/);
  assert.doesNotMatch(installPs1, /setup --components [^\n]*browser/);
});

test('release-preflight.sh validates matching tag, VERSION, changelog, and native/skills sync state', async () => {
  const passingRoot = await makeTemp('rex-release-preflight-pass-');
  await seedFixtureRepo(passingRoot, {
    checkSkillsSyncScript: "console.log('[ok] skills sync clean');\nprocess.exit(0);\n",
    checkNativeSyncScript: "console.log('[ok] native sync clean');\nprocess.exit(0);\n",
  });

  const ok = run('bash', ['scripts/release-preflight.sh', '--tag', 'v1.2.3'], {
    cwd: passingRoot,
  });
  assertOk(ok);
  assert.match(ok.stdout, /SKILLS:\s+generated roots match skill-sources\//);
  assert.match(ok.stdout, /NATIVE:\s+generated native outputs match client-sources\/native-base\//);
  assert.match(ok.stdout, /AGENTS:\s+export-only regeneration passed/);

  const failingRoot = await makeTemp('rex-release-preflight-fail-');
  await seedFixtureRepo(failingRoot, {
    checkSkillsSyncScript: "console.log('[ok] skills sync clean');\nprocess.exit(0);\n",
    checkNativeSyncScript: "console.error('[drift] AGENTS.md');\nprocess.exit(1);\n",
  });

  const drift = run('bash', ['scripts/release-preflight.sh', '--tag', 'v1.2.3'], {
    cwd: failingRoot,
  });
  assert.notEqual(drift.status, 0);
  assert.match(`${drift.stderr}\n${drift.stdout}`, /native sync drift detected/i);
});

test('release-stable.sh dry-run prints the exact tag from VERSION', () => {
  const result = run('bash', ['scripts/release-stable.sh', '--dry-run', '--allow-dirty'], {
    cwd: process.cwd(),
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Tag:\s+v\d+\.\d+\.\d+/);
  assert.match(result.stdout, /git tag v\d+\.\d+\.\d+/);
});

test('materialize-release-local-outputs creates ignored Claude settings without clobbering user keys', async () => {
  const rootDir = await makeTemp('rex-release-local-outputs-');
  const workspaceRoot = process.cwd();

  await writeFixtureFile(rootDir, 'client-sources/native-base/claude/project/settings.local.json', JSON.stringify({
    hooks: {
      SessionStart: ['node scripts/aios.mjs doctor --native'],
    },
  }, null, 2));
  await writeFixtureFile(rootDir, '.claude/settings.local.json', JSON.stringify({
    permissions: {
      allow: ['Bash(git:*)'],
    },
  }, null, 2));
  await writeFixtureFile(
    rootDir,
    'scripts/materialize-release-local-outputs.mjs',
    await readFile(path.join(workspaceRoot, 'scripts', 'materialize-release-local-outputs.mjs'), 'utf8')
  );

  const result = run('node', ['scripts/materialize-release-local-outputs.mjs'], { cwd: rootDir });

  assertOk(result);
  const settings = JSON.parse(await readFile(path.join(rootDir, '.claude/settings.local.json'), 'utf8'));
  assert.deepEqual(settings.permissions.allow, ['Bash(git:*)']);
  assert.deepEqual(settings.aiosNative.hooks.SessionStart, ['node scripts/aios.mjs doctor --native']);
});
