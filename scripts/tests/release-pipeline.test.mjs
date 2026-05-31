import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

async function makeTemp(prefix) {
  const tempRoot = path.join(process.cwd(), 'temp');
  await mkdir(tempRoot, { recursive: true });
  return mkdtemp(path.join(tempRoot, prefix));
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

async function assertFileExists(filePath, message = '') {
  const fileStat = await stat(filePath);
  assert.equal(fileStat.isFile(), true, message || `expected file to exist: ${filePath}`);
}

function runPowerShell(scriptPath, args = [], options = {}) {
  return run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args], options);
}

function quotePowerShellSingle(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const windowsInstallerTest = process.platform === 'win32' ? test : test.skip;

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
  await writeFixtureFile(rootDir, 'config/native-sync-manifest.json', '{"schemaVersion":1,"managedBy":"aios","markers":{"markdownBegin":"<!-- AIOS NATIVE BEGIN -->","markdownEnd":"<!-- AIOS NATIVE END -->"},"clients":{"codex":{"tier":"deep","metadataRoot":".codex","outputs":["AGENTS.md",".codex/agents",".codex/skills"]},"claude":{"tier":"deep","metadataRoot":".claude","outputs":["CLAUDE.md",".claude/settings.local.json",".claude/agents",".claude/skills"]},"gemini":{"tier":"compatibility","metadataRoot":".gemini","outputs":["GEMINI.md",".gemini/skills"]},"opencode":{"tier":"compatibility","metadataRoot":".opencode","outputs":["AGENTS.md",".opencode/skills"]}}}\n');
  await writeFixtureFile(rootDir, 'mcp-server/package.json', '{"name":"fixture-mcp"}\n');
  await writeFixtureFile(rootDir, 'skill-sources/sample-skill/SKILL.md', '# canonical\n');
  await writeFixtureFile(rootDir, 'client-sources/native-base/gemini/project/AIOS.md', '# native gemini\n');
  await writeFixtureFile(rootDir, 'agent-sources/manifest.json', '{"schemaVersion":1,"generatedTargets":["claude","codex","opencode"]}\n');
  await writeFixtureFile(rootDir, 'agent-sources/roles/rex-planner.json', '{"schemaVersion":1,"id":"rex-planner","role":"planner","name":"rex-planner","description":"planner","tools":["Read"],"model":"sonnet","handoffTarget":"next-phase","systemPrompt":"plan"}\n');
  await writeFixtureFile(rootDir, 'agent-sources/roles/rex-implementer.json', '{"schemaVersion":1,"id":"rex-implementer","role":"implementer","name":"rex-implementer","description":"implement","tools":["Read","Edit"],"model":"sonnet","handoffTarget":"next-phase","systemPrompt":"implement"}\n');
  await writeFixtureFile(rootDir, 'agent-sources/roles/rex-reviewer.json', '{"schemaVersion":1,"id":"rex-reviewer","role":"reviewer","name":"rex-reviewer","description":"review","tools":["Read"],"model":"sonnet","handoffTarget":"merge-gate","systemPrompt":"review"}\n');
  await writeFixtureFile(rootDir, 'agent-sources/roles/rex-security-reviewer.json', '{"schemaVersion":1,"id":"rex-security-reviewer","role":"security-reviewer","name":"rex-security-reviewer","description":"security","tools":["Read"],"model":"sonnet","handoffTarget":"merge-gate","systemPrompt":"secure"}\n');
  await writeFixtureFile(rootDir, '.codex/skills/sample-skill/SKILL.md', '# codex\n');
  await writeFixtureFile(rootDir, '.codex/agents/rex.toml', '# codex agent\n');
  await writeFixtureFile(rootDir, '.claude/skills/sample-skill/SKILL.md', '# claude\n');
  await writeFixtureFile(rootDir, '.claude/agents/rex.md', '# claude agent\n');
  await writeFixtureFile(rootDir, '.agents/skills/sample-skill/SKILL.md', '# agents\n');

  await writeFixtureFile(rootDir, 'scripts/package-release.sh', await readFile(path.join(workspaceRoot, 'scripts', 'package-release.sh'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/package-release.ps1', await readFile(path.join(workspaceRoot, 'scripts', 'package-release.ps1'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/release-preflight.sh', await readFile(path.join(workspaceRoot, 'scripts', 'release-preflight.sh'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/release-preflight.ps1', await readFile(path.join(workspaceRoot, 'scripts', 'release-preflight.ps1'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/release-stable.sh', await readFile(path.join(workspaceRoot, 'scripts', 'release-stable.sh'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/release-stable.ps1', await readFile(path.join(workspaceRoot, 'scripts', 'release-stable.ps1'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/materialize-release-local-outputs.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'materialize-release-local-outputs.mjs'), 'utf8'));
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
  await writeFixtureFile(rootDir, 'scripts/lib/agents/emitters/opencode.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'agents', 'emitters', 'opencode.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/harness/orchestrator-agents.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'harness', 'orchestrator-agents.mjs'), 'utf8'));
  await cp(path.join(workspaceRoot, 'scripts', 'lib', 'clients'), path.join(rootDir, 'scripts', 'lib', 'clients'), { recursive: true });
  await writeFixtureFile(rootDir, 'scripts/lib/specs/orchestrator-agents.json', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'specs', 'orchestrator-agents.json'), 'utf8'));

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
  const result = process.platform === 'win32'
    ? runPowerShell('scripts/package-release.ps1', ['-Out', outDir], { cwd: rootDir })
    : run('bash', ['scripts/package-release.sh', '--out', outDir], { cwd: rootDir });

  assertOk(result);

  for (const fileName of ['aios-install.sh', 'aios-install.ps1', 'harness-cli.tar.gz', 'harness-cli.zip']) {
    const filePath = path.join(outDir, fileName);
    await assertFileExists(filePath, `${fileName} was not produced`);
  }

  const extractDir = await makeTemp('rex-release-assets-extract-');
  assertOk(run('tar', ['-xzf', path.join(outDir, 'harness-cli.tar.gz'), '-C', extractDir]));
  await assertFileExists(
    path.join(extractDir, 'harness-cli', 'skill-sources', 'sample-skill', 'SKILL.md'),
    'harness-cli.tar.gz did not include skill-sources/sample-skill/SKILL.md'
  );
  await assertFileExists(
    path.join(extractDir, 'harness-cli', 'agent-sources', 'manifest.json'),
    'harness-cli.tar.gz did not include agent-sources/manifest.json'
  );
  await assertFileExists(
    path.join(extractDir, 'harness-cli', 'scripts', 'lib', 'specs', 'orchestrator-agents.json'),
    'harness-cli.tar.gz did not include bundled runtime specs'
  );
  await assertFileExists(
    path.join(extractDir, 'harness-cli', 'client-sources', 'native-base', 'gemini', 'project', 'AIOS.md'),
    'harness-cli.tar.gz did not include client-sources/native-base/gemini/project/AIOS.md'
  );
  await assertFileExists(
    path.join(extractDir, 'harness-cli', 'package.json'),
    'harness-cli.tar.gz did not include root package.json for direct release installs'
  );
  await assertFileExists(
    path.join(extractDir, 'harness-cli', 'package-lock.json'),
    'harness-cli.tar.gz did not include root package-lock.json for direct release installs'
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

test('PowerShell installer enables TLS 1.2 before release asset downloads', async () => {
  const workspaceRoot = process.cwd();
  const installPs1 = await readFile(path.join(workspaceRoot, 'scripts', 'aios-install.ps1'), 'utf8');

  assert.match(installPs1, /\[Net\.SecurityProtocolType\]::Tls12/);
  assert.match(installPs1, /\nEnable-Tls12\s*\r?\n[\s\S]*Download-File -Url \$assetUrl/);
});

test('PowerShell installer can use a local asset URL for install smoke tests', async () => {
  const workspaceRoot = process.cwd();
  const installPs1 = await readFile(path.join(workspaceRoot, 'scripts', 'aios-install.ps1'), 'utf8');

  assert.match(installPs1, /AIOS_ASSET_URL/);
  assert.match(installPs1, /\$assetUrl = if \(\$AssetUrl\)/);
  assert.match(installPs1, /Copy-Item -LiteralPath \$localPath -Destination \$OutFile -Force/);
});

windowsInstallerTest('PowerShell installer smoke extracts local asset and installs shell wrapper', async () => {
  const workspaceRoot = process.cwd();
  const rootDir = await makeTemp('rex-installer-smoke-');
  const packageRoot = path.join(rootDir, 'package', 'harness-cli');
  const zipPath = path.join(rootDir, 'harness-cli.zip');
  const installDir = path.join(rootDir, 'install');

  await writeFixtureFile(packageRoot, 'package.json', '{"name":"installer-smoke","type":"module"}\n');
  await writeFixtureFile(packageRoot, 'node_modules/.bin/tsx.cmd', '@echo off\r\nexit /b 0\r\n');
  await writeFixtureFile(
    packageRoot,
    'scripts/aios.ps1',
    `Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$capture = Join-Path (Split-Path -Parent $PSScriptRoot) 'shell-capture.txt'
Set-Content -LiteralPath $capture -Value ($args -join "\`n") -Encoding utf8
exit 0
`
  );
  await writeFixtureFile(
    packageRoot,
    'scripts/install-contextdb-shell.ps1',
    await readFile(path.join(workspaceRoot, 'scripts', 'install-contextdb-shell.ps1'), 'utf8')
  );
  await writeFixtureFile(
    packageRoot,
    'scripts/lib/powershell/aios-internal-wrapper.ps1',
    await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'powershell', 'aios-internal-wrapper.ps1'), 'utf8')
  );

  const zipResult = run('powershell', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path ${quotePowerShellSingle(packageRoot)} -DestinationPath ${quotePowerShellSingle(zipPath)} -Force`,
  ]);
  assertOk(zipResult);

  const result = runPowerShell(path.join(workspaceRoot, 'scripts', 'aios-install.ps1'), ['-WrapMode', 'opt-in'], {
    env: {
      ...process.env,
      AIOS_ASSET_URL: zipPath,
      AIOS_INSTALL_DIR: installDir,
      AIOS_FIRST_SETUP: '0',
    },
  });

  assertOk(result);
  assert.match(result.stdout, /install PowerShell integration: .*--mode opt-in --force/);
  const captured = (await readFile(path.join(installDir, 'shell-capture.txt'), 'utf8')).replace(/^\uFEFF/u, '');
  assert.deepEqual(captured.split(/\r?\n/).filter(Boolean), ['internal', 'shell', 'install', '--mode', 'opt-in', '--force']);
});

windowsInstallerTest('PowerShell one-liner installer tolerates successful native stderr', async () => {
  const workspaceRoot = process.cwd();
  const rootDir = await makeTemp('rex-installer-iex-stderr-');
  const packageRoot = path.join(rootDir, 'package', 'harness-cli');
  const zipPath = path.join(rootDir, 'harness-cli.zip');
  const installDir = path.join(rootDir, 'install');
  const profilePath = path.join(rootDir, 'profile.ps1');

  await writeFixtureFile(packageRoot, 'package.json', '{"name":"installer-smoke","type":"module"}\n');
  await writeFixtureFile(packageRoot, 'node_modules/.bin/tsx.cmd', '@echo off\r\nexit /b 0\r\n');
  await writeFixtureFile(
    packageRoot,
    'scripts/aios.ps1',
    `Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
exit 0
`
  );
  await writeFixtureFile(
    packageRoot,
    'scripts/aios.mjs',
    `#!/usr/bin/env node
console.error("Cloning into 'fixture-superpowers'...");
process.exit(0);
`
  );
  await writeFixtureFile(
    packageRoot,
    'scripts/install-contextdb-shell.ps1',
    await readFile(path.join(workspaceRoot, 'scripts', 'install-contextdb-shell.ps1'), 'utf8')
  );
  await writeFixtureFile(
    packageRoot,
    'scripts/lib/powershell/aios-internal-wrapper.ps1',
    await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'powershell', 'aios-internal-wrapper.ps1'), 'utf8')
  );

  const zipResult = run('powershell', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path ${quotePowerShellSingle(packageRoot)} -DestinationPath ${quotePowerShellSingle(zipPath)} -Force`,
  ]);
  assertOk(zipResult);

  const command = [
    `$env:AIOS_ASSET_URL = ${quotePowerShellSingle(zipPath)}`,
    `$env:AIOS_INSTALL_DIR = ${quotePowerShellSingle(installDir)}`,
    `$env:AIOS_POWERSHELL_PROFILE = ${quotePowerShellSingle(profilePath)}`,
    `$env:AIOS_FIRST_SETUP = '1'`,
    `Get-Content -LiteralPath ${quotePowerShellSingle(path.join(workspaceRoot, 'scripts', 'aios-install.ps1'))} -Raw | Invoke-Expression`,
  ].join('; ');

  const result = run('powershell', ['-NoProfile', '-Command', command]);

  assertOk(result);
  assert.match(result.stderr, /Cloning into 'fixture-superpowers'/);
  assert.match(result.stdout, /\[ok\] Installed AIOS/);
});

test('PowerShell installer fails fast when native setup commands fail', async () => {
  const workspaceRoot = process.cwd();
  const installPs1 = await readFile(path.join(workspaceRoot, 'scripts', 'aios-install.ps1'), 'utf8');

  assert.match(installPs1, /function Invoke-Checked/);
  assert.match(installPs1, /\$previousErrorActionPreference = \$ErrorActionPreference/);
  assert.match(installPs1, /\$ErrorActionPreference = 'Continue'/);
  assert.match(installPs1, /Invoke-Checked -Command "npm" -Arguments @\("install", "--include=dev"\)/);
  assert.match(installPs1, /AIOS runtime deps install did not produce expected TUI runner/);
  assert.match(installPs1, /Invoke-Checked -Command "powershell" -Arguments @\("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", \$shellInstaller, "--mode", \$WrapMode, "--force"\)/);
  assert.match(installPs1, /Invoke-Checked -Command "powershell" -Arguments @\("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", \$privacyInstaller, "--enable"\)/);
  assert.match(installPs1, /Invoke-Checked -Command "node" -Arguments @\(\$aiosCli, "setup"/);
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

  const ok = process.platform === 'win32'
    ? runPowerShell('scripts/release-preflight.ps1', ['-Tag', 'v1.2.3'], { cwd: passingRoot })
    : run('bash', ['scripts/release-preflight.sh', '--tag', 'v1.2.3'], { cwd: passingRoot });
  assertOk(ok);
  assert.match(ok.stdout, /SKILLS:\s+generated roots match skill-sources\//);
  assert.match(ok.stdout, /NATIVE:\s+generated native outputs match client-sources\/native-base\//);
  assert.match(ok.stdout, /AGENTS:\s+export-only regeneration passed/);

  const failingRoot = await makeTemp('rex-release-preflight-fail-');
  await seedFixtureRepo(failingRoot, {
    checkSkillsSyncScript: "console.log('[ok] skills sync clean');\nprocess.exit(0);\n",
    checkNativeSyncScript: "console.error('[drift] AGENTS.md');\nprocess.exit(1);\n",
  });

  const drift = process.platform === 'win32'
    ? runPowerShell('scripts/release-preflight.ps1', ['-Tag', 'v1.2.3'], { cwd: failingRoot })
    : run('bash', ['scripts/release-preflight.sh', '--tag', 'v1.2.3'], { cwd: failingRoot });
  assert.notEqual(drift.status, 0);
  assert.match(`${drift.stderr}\n${drift.stdout}`, /native sync drift detected/i);
});

test('release-preflight materializes sync checks in a temporary target root', async () => {
  const rootDir = await makeTemp('rex-release-preflight-materialize-');
  const assertMaterializeArg = `
if (!process.argv.includes('--materialize-temp')) {
  console.error('missing --materialize-temp');
  process.exit(2);
}
console.log('[ok] materialize-temp');
`;
  await seedFixtureRepo(rootDir, {
    checkSkillsSyncScript: assertMaterializeArg,
    checkNativeSyncScript: assertMaterializeArg,
  });

  const result = process.platform === 'win32'
    ? runPowerShell('scripts/release-preflight.ps1', ['-Tag', 'v1.2.3'], { cwd: rootDir })
    : run('bash', ['scripts/release-preflight.sh', '--tag', 'v1.2.3'], { cwd: rootDir });

  assertOk(result);
});

test('release-stable.sh dry-run prints the exact tag from VERSION', async () => {
  const rootDir = await makeTemp('rex-release-stable-dry-run-');
  await seedFixtureRepo(rootDir, {
    checkSkillsSyncScript: "console.log('[ok] skills sync clean');\nprocess.exit(0);\n",
    checkNativeSyncScript: "console.log('[ok] native sync clean');\nprocess.exit(0);\n",
  });

  const result = process.platform === 'win32'
    ? runPowerShell('scripts/release-stable.ps1', ['-DryRun', '-AllowDirty'], { cwd: rootDir })
    : run('bash', ['scripts/release-stable.sh', '--dry-run', '--allow-dirty'], { cwd: rootDir });

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
