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

async function assertFileMissing(filePath, message = '') {
  await assert.rejects(
    () => stat(filePath),
    /ENOENT/,
    message || `expected file to be absent: ${filePath}`
  );
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
  await writeFixtureFile(rootDir, 'package.json', '{"name":"fixture-aios","type":"module","scripts":{"test:scripts":"node -e \\\"process.exit(0)\\\""}}\n');
  await writeFixtureFile(rootDir, 'package-lock.json', '{"name":"fixture-aios","lockfileVersion":3,"packages":{}}\n');
  await writeFixtureFile(rootDir, 'rex-harness/package.json', '{"name":"@rexleimo/rex-harness","version":"0.4.2"}\n');
  await writeFixtureFile(rootDir, 'rex-harness/src/index.mjs', 'export const fixtureRex = true;\n');
  await writeFixtureFile(rootDir, 'rex-harness/bin/rex-harness.mjs', '#!/usr/bin/env node\n');
  await writeFixtureFile(rootDir, 'rex-harness/skill-sources/rex-workflow/SKILL.md', '# rex workflow fixture\n');
  await writeFixtureFile(rootDir, 'README.md', '# README\n');
  await writeFixtureFile(rootDir, 'README-zh.md', '# README-ZH\n');
  await writeFixtureFile(rootDir, 'skills-lock.json', '{}\n');
  await writeFixtureFile(rootDir, 'config/skills-sync-manifest.json', '{"schemaVersion":1,"generatedRoots":{"codex":".codex/skills","claude":".claude/skills"},"skills":[],"legacyUnmanaged":[],"legacyReplaceable":[]}\n');
  await writeFixtureFile(rootDir, 'config/native-sync-manifest.json', '{"schemaVersion":1,"managedBy":"aios","markers":{"markdownBegin":"<!-- AIOS NATIVE BEGIN -->","markdownEnd":"<!-- AIOS NATIVE END -->"},"clients":{"codex":{"tier":"deep","metadataRoot":".codex","outputs":["AGENTS.md",".codex/agents",".codex/skills"]},"claude":{"tier":"deep","metadataRoot":".claude","outputs":["CLAUDE.md",".claude/settings.local.json",".claude/agents",".claude/skills"]},"gemini":{"tier":"compatibility","metadataRoot":".gemini","outputs":["GEMINI.md",".gemini/skills"]},"opencode":{"tier":"compatibility","metadataRoot":".opencode","outputs":["AGENTS.md",".opencode/skills"]}}}\n');
  await writeFixtureFile(rootDir, 'mcp-server/package.json', '{"name":"fixture-mcp","scripts":{"typecheck":"node -e \\\"process.exit(0)\\\"","test":"node -e \\\"process.exit(0)\\\"","build":"node -e \\\"process.exit(0)\\\""}}\n');
  await writeFixtureFile(rootDir, 'skill-sources/sample-skill/SKILL.md', '# canonical\n');
  await writeFixtureFile(rootDir, 'client-sources/native-base/gemini/project/AIOS.md', '# native gemini\n');
  // A stale ignored directory must never leak an obsolete workflow into a release archive.
  await writeFixtureFile(rootDir, 'scripts/lib/components/superpowers/legacy.mjs', 'export const legacy = true;\n');
  await cp(path.join(workspaceRoot, 'agent-sources'), path.join(rootDir, 'agent-sources'), { recursive: true });
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
  await writeFixtureFile(
    rootDir,
    'scripts/reconcile-rex-workflow-surface.mjs',
    await readFile(path.join(workspaceRoot, 'scripts', 'reconcile-rex-workflow-surface.mjs'), 'utf8'),
  );
  await writeFixtureFile(
    rootDir,
    'scripts/install-rex-client-projections.mjs',
    await readFile(path.join(workspaceRoot, 'scripts', 'install-rex-client-projections.mjs'), 'utf8'),
  );
  await writeFixtureFile(rootDir, 'scripts/check-skills-sync.mjs', checkSkillsSyncScript);
  await writeFixtureFile(rootDir, 'scripts/check-native-sync.mjs', checkNativeSyncScript);
  await writeFixtureFile(rootDir, 'scripts/aios.mjs', `
if (process.argv.slice(2).join(' ') !== 'skill verify-training --changed --base v1.2.2 --json') {
  process.exit(2);
}
process.stdout.write('{"status":"verified"}\\n');
`);
  await writeFixtureFile(rootDir, 'scripts/sync-native.mjs', "console.log('[ok] native sync');\n");
  await writeFixtureFile(rootDir, 'scripts/lib/fs/atomic-write.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'fs', 'atomic-write.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/skills/frontmatter.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'skills', 'frontmatter.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/agents/source-tree.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'agents', 'source-tree.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/agents/compat-export.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'agents', 'compat-export.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/agents/sync.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'agents', 'sync.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/agents/emitters/shared.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'agents', 'emitters', 'shared.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/agents/emitters/claude.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'agents', 'emitters', 'claude.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/agents/emitters/codex.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'agents', 'emitters', 'codex.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/agents/emitters/opencode.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'agents', 'emitters', 'opencode.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/agents/emitters/grok.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'agents', 'emitters', 'grok.mjs'), 'utf8'));
  await writeFixtureFile(rootDir, 'scripts/lib/harness/orchestrator-agents.mjs', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'harness', 'orchestrator-agents.mjs'), 'utf8'));
  await cp(path.join(workspaceRoot, 'scripts', 'lib', 'clients'), path.join(rootDir, 'scripts', 'lib', 'clients'), { recursive: true });
  await writeFixtureFile(rootDir, 'scripts/lib/specs/orchestrator-agents.json', await readFile(path.join(workspaceRoot, 'scripts', 'lib', 'specs', 'orchestrator-agents.json'), 'utf8'));

  // scripts/lib/agents/emitters/* 和 scripts/lib/ctx-agent-core/args.mjs 依赖 src/shared/ 下的公共工具。
  await cp(path.join(workspaceRoot, 'src', 'shared'), path.join(rootDir, 'src', 'shared'), { recursive: true });

  assertOk(run('git', ['init'], { cwd: rootDir }), 'git init failed');
  assertOk(run('git', ['config', 'user.email', 'fixture@example.com'], { cwd: rootDir }));
  assertOk(run('git', ['config', 'user.name', 'Fixture'], { cwd: rootDir }));
  assertOk(run('git', ['add', '-A'], { cwd: rootDir }));
  assertOk(run('git', ['commit', '-m', 'fixture'], { cwd: rootDir }));
  assertOk(run('git', ['commit', '--allow-empty', '-m', 'release base'], { cwd: rootDir }));
  assertOk(run('git', ['tag', 'v1.2.2', 'HEAD^'], { cwd: rootDir }));
}

test('package-release emits stable assets including the rex-harness planning kernel', async () => {
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
    path.join(extractDir, 'harness-cli', 'agent-sources', 'roles', 'rex-planner.md'),
    'harness-cli.tar.gz did not include markdown role cards'
  );
  await assertFileMissing(
    path.join(extractDir, 'harness-cli', 'agent-sources', 'roles', 'rex-planner.json'),
    'harness-cli.tar.gz should not include legacy JSON role cards'
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
  await assertFileExists(
    path.join(extractDir, 'harness-cli', 'rex-harness', 'src', 'index.mjs'),
    'harness-cli.tar.gz did not include rex-harness/src/index.mjs'
  );
  await assertFileExists(
    path.join(extractDir, 'harness-cli', 'rex-harness', 'skill-sources', 'rex-workflow', 'SKILL.md'),
    'harness-cli.tar.gz did not include rex-harness/skill-sources/rex-workflow/SKILL.md'
  );
  await assertFileExists(
    path.join(extractDir, 'harness-cli', 'scripts', 'reconcile-rex-workflow-surface.mjs'),
    'harness-cli.tar.gz did not include the Rex workflow reconciliation entrypoint'
  );
  await assertFileExists(
    path.join(extractDir, 'harness-cli', 'scripts', 'install-rex-client-projections.mjs'),
    'harness-cli.tar.gz did not include the global Rex client projection entrypoint'
  );
  for (const relativePath of [
    '.codex/skills',
    '.claude/skills',
    '.gemini/skills',
    '.agents/skills',
    '.opencode/skills',
    '.hermes/skills',
    '.grok/skills',
  ]) {
    await assertFileMissing(
      path.join(extractDir, 'harness-cli', relativePath),
      `harness-cli.tar.gz must not ship stale client skill projections: ${relativePath}`
    );
  }
  await assertFileMissing(
    path.join(extractDir, 'harness-cli', 'scripts', 'lib', 'components', 'superpowers', 'legacy.mjs'),
    'harness-cli.tar.gz must not ship retired Superpowers workflow code'
  );
  await assertFileMissing(
    path.join(extractDir, 'harness-cli', 'scripts', 'lib', 'components', 'superpowers'),
    'harness-cli.tar.gz must not ship a retired Superpowers workflow directory'
  );

  const zipExtractDir = await makeTemp('rex-release-assets-zip-extract-');
  assertOk(run('tar', ['-xf', path.join(outDir, 'harness-cli.zip'), '-C', zipExtractDir]));
  await assertFileExists(
    path.join(zipExtractDir, 'harness-cli', 'rex-harness', 'src', 'index.mjs'),
    'harness-cli.zip did not include rex-harness/src/index.mjs'
  );
  await assertFileExists(
    path.join(zipExtractDir, 'harness-cli', 'scripts', 'reconcile-rex-workflow-surface.mjs'),
    'harness-cli.zip did not include the Rex workflow reconciliation entrypoint'
  );
  await assertFileExists(
    path.join(zipExtractDir, 'harness-cli', 'scripts', 'install-rex-client-projections.mjs'),
    'harness-cli.zip did not include the global Rex client projection entrypoint'
  );
  await assertFileMissing(
    path.join(zipExtractDir, 'harness-cli', 'scripts', 'lib', 'components', 'superpowers', 'legacy.mjs'),
    'harness-cli.zip must not ship retired Superpowers workflow code'
  );
  await assertFileMissing(
    path.join(zipExtractDir, 'harness-cli', 'scripts', 'lib', 'components', 'superpowers'),
    'harness-cli.zip must not ship a retired Superpowers workflow directory'
  );
});

test('release scripts and CI require a materialized rex-harness submodule', async () => {
  const workspaceRoot = process.cwd();
  const shellScript = await readFile(path.join(workspaceRoot, 'scripts', 'package-release.sh'), 'utf8');
  const powershellScript = await readFile(path.join(workspaceRoot, 'scripts', 'package-release.ps1'), 'utf8');
  const preflightShell = await readFile(path.join(workspaceRoot, 'scripts', 'release-preflight.sh'), 'utf8');
  const initScript = await readFile(path.join(workspaceRoot, 'scripts', 'aios-init.mjs'), 'utf8');

  assert.match(shellScript, /rex-harness/u);
  assert.match(shellScript, /rm -f "\$OUT_DIR\/harness-cli\.zip"/u);
  assert.match(preflightShell, /describe --tags --abbrev=0 --match 'v\[0-9\]\*' HEAD\^/u);
  assert.match(powershellScript, /rex-harness/u);
  assert.match(initScript, /ensureAiosPlanningKernel/u);
  for (const workflowName of [
    'ci-main.yml',
    'codeql.yml',
    'contextdb-quality.yml',
    'pages.yml',
    'release-health-watch.yml',
    'release.yml',
    'windows-shell-smoke.yml',
  ]) {
    const workflow = await readFile(path.join(workspaceRoot, '.github', 'workflows', workflowName), 'utf8');
    assert.match(workflow, /submodules:\s+recursive/u, `${workflowName} must initialize rex-harness`);
  }
});

test('one-liner installers bootstrap root runtime dependencies for direct release installs', async () => {
  const workspaceRoot = process.cwd();
  const installSh = await readFile(path.join(workspaceRoot, 'scripts', 'aios-install.sh'), 'utf8');
  const installPs1 = await readFile(path.join(workspaceRoot, 'scripts', 'aios-install.ps1'), 'utf8');

  assert.match(installSh, /npm install --include=dev/);
  assert.match(installSh, /node_modules\/\.bin\/tsx/);
  assert.match(installPs1, /npm install --include=dev/);
  assert.match(installPs1, /node_modules\/\.bin\/tsx\.cmd/);
  assert.match(installSh, /reconcile-rex-workflow-surface\.mjs/);
  assert.match(installPs1, /reconcile-rex-workflow-surface\.mjs/);
  assert.match(installSh, /install-rex-client-projections\.mjs/);
  assert.match(installPs1, /install-rex-client-projections\.mjs/);
  assert.match(installSh, /--client all --scope global/);
  assert.match(installPs1, /--client", "all", "--scope", "global"/);
  assert.match(installSh, /workflow_reconcile_args=\(--root "\$AIOS_INSTALL_DIR"\)/);
  assert.doesNotMatch(installSh, /superpowers/iu);
  assert.doesNotMatch(installPs1, /superpowers/iu);
});

test('public release documentation describes ownership-safe Rex-only migration', async () => {
  const workspaceRoot = process.cwd();
  const [rootChangelog, migrationGuide, navigation, sidebar] = await Promise.all([
    readFile(path.join(workspaceRoot, 'CHANGELOG.md'), 'utf8'),
    readFile(path.join(workspaceRoot, 'docs-site', 'superpowers.md'), 'utf8'),
    readFile(path.join(workspaceRoot, 'mkdocs.yml'), 'utf8'),
    readFile(path.join(workspaceRoot, 'docs-site', 'overrides', 'partials', 'rex', 'docs-sidebar-links.html'), 'utf8'),
  ]);

  assert.match(migrationGuide, /`rex-harness`\s+is the only default software-engineering workflow/u);
  assert.match(migrationGuide, /aios update --adopt-legacy-superpowers/u);
  assert.match(migrationGuide, /without AIOS ownership proof is preserved and reported\s+as a conflict/u);
  for (const client of ['Codex', 'Claude', 'Gemini', 'OpenCode', 'Hermes', 'Grok', '.agents']) {
    assert.match(migrationGuide, new RegExp(client.replace('.', '\\.'), 'u'));
  }
  assert.doesNotMatch(migrationGuide, /Superpowers are reusable process playbooks/u);
  assert.match(rootChangelog, /Rex-only workflow migration/u);
  assert.match(navigation, /Rex Workflow Migration: superpowers\.md/u);
  assert.match(sidebar, /Rex Workflow Migration/u);

  const localizedAssertions = [
    ['changelog.md', /Rex-only workflow migration/u],
    [path.join('zh', 'changelog.md'), /Rex-only 工作流迁移/u],
    [path.join('ja', 'changelog.md'), /Rex-only ワークフロー移行/u],
    [path.join('ko', 'changelog.md'), /Rex-only 워크플로 마이그레이션/u],
  ];
  for (const [relativePath, expected] of localizedAssertions) {
    const changelog = await readFile(path.join(workspaceRoot, 'docs-site', relativePath), 'utf8');
    assert.match(changelog, expected, `${relativePath} is missing the Rex-only migration note`);
  }

  const localizedMigrationGuides = [
    [path.join('zh', 'superpowers.md'), /# Rex 工作流迁移/u],
    [path.join('ja', 'superpowers.md'), /# Rex ワークフロー移行/u],
    [path.join('ko', 'superpowers.md'), /# Rex 워크플로 마이그레이션/u],
  ];
  for (const [relativePath, expectedHeading] of localizedMigrationGuides) {
    const guide = await readFile(path.join(workspaceRoot, 'docs-site', relativePath), 'utf8');
    assert.match(guide, expectedHeading, `${relativePath} is missing its Rex migration heading`);
    assert.match(guide, /rex-harness/iu, `${relativePath} does not describe the Rex workflow`);
    assert.match(guide, /aios update --adopt-legacy-superpowers/u, `${relativePath} is missing explicit legacy cleanup guidance`);
  }
  for (const label of ['Rex 工作流迁移', 'Rex ワークフロー移行', 'Rex 워크플로 마이그레이션']) {
    assert.match(navigation, new RegExp(`Rex Workflow Migration:\\s*${label}`, 'u'));
  }
  assert.doesNotMatch(navigation, /^\s+Superpowers:/mu, 'localized navigation must not present Superpowers as an active route');

  const currentNoteSlices = [
    ['changelog.md', '## Docs And Workflow Notes', '## Official Release History'],
    [path.join('zh', 'changelog.md'), '## 文档与工作流说明', '## v3.6.0'],
    [path.join('ja', 'changelog.md'), '## ドキュメントと workflow のメモ', '## v3.6.0'],
    [path.join('ko', 'changelog.md'), '## 문서와 workflow 메모', '## v3.6.0'],
  ];
  for (const [relativePath, startHeading, endHeading] of currentNoteSlices) {
    const changelog = await readFile(path.join(workspaceRoot, 'docs-site', relativePath), 'utf8');
    const currentNotes = changelog.split(startHeading)[1]?.split(endHeading)[0];
    assert.ok(currentNotes, `${relativePath} is missing its current-notes section`);
    assert.doesNotMatch(currentNotes, /superpowers/iu, `${relativePath} still advertises Superpowers as a current capability`);
  }
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

test('Bash installer can use a local asset URL for install smoke tests', async () => {
  const workspaceRoot = process.cwd();
  const installSh = await readFile(path.join(workspaceRoot, 'scripts', 'aios-install.sh'), 'utf8');

  assert.match(installSh, /asset_url="\$\{AIOS_ASSET_URL:-https:\/\/github\.com\/\$\{AIOS_REPO\}\/releases\/latest\/download\/harness-cli\.tar\.gz\}"/u);
});

test('Bash installer isolates nested runtime and privacy paths from inherited host paths', async () => {
  const workspaceRoot = process.cwd();
  const rootDir = await makeTemp('rex-installer-nested-env-');
  const packageRoot = path.join(rootDir, 'package', 'harness-cli');
  const assetPath = path.join(rootDir, 'harness-cli.tar.gz');
  const installDir = path.join(rootDir, 'installed', 'harness-cli');

  await writeFixtureFile(
    packageRoot,
    'scripts/install-contextdb-shell.sh',
    '#!/usr/bin/env bash\nprintf "%s|%s|%s\\n" "$AIOS_ROOT_DIR" "$AIOS_ROOT" "$ROOTPATH" > "$(dirname "$0")/shell-env.txt"\n',
  );
  await writeFixtureFile(
    packageRoot,
    'scripts/install-privacy-guard.sh',
    '#!/usr/bin/env bash\nprintf "%s|%s|%s|%s\\n" "$AIOS_ROOT_DIR" "$AIOS_ROOT" "$ROOTPATH" "$REXCIL_HOME" > "$(dirname "$0")/privacy-env.txt"\n',
  );

  assertOk(run('tar', ['-czf', assetPath, '-C', path.join(rootDir, 'package'), 'harness-cli']));

  const result = run('bash', [path.join(workspaceRoot, 'scripts', 'aios-install.sh')], {
    env: {
      ...process.env,
      AIOS_ASSET_URL: `file://${assetPath}`,
      AIOS_INSTALL_DIR: installDir,
      AIOS_WRAP_MODE: 'off',
      AIOS_ROOT_DIR: '/unexpected/host/runtime',
      AIOS_ROOT: '/unexpected/host/runtime',
      ROOTPATH: '/unexpected/host/runtime',
      REXCIL_HOME: '',
    },
  });

  assertOk(result);
  assert.equal(
    await readFile(path.join(installDir, 'scripts', 'shell-env.txt'), 'utf8'),
    `${installDir}|${installDir}|${installDir}\n`,
  );
  assert.equal(
    await readFile(path.join(installDir, 'scripts', 'privacy-env.txt'), 'utf8'),
    `${installDir}|${installDir}|${installDir}|${path.dirname(installDir)}\n`,
  );
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
    `Get-Content -LiteralPath ${quotePowerShellSingle(path.join(workspaceRoot, 'scripts', 'aios-install.ps1'))} -Raw | Invoke-Expression`,
  ].join('; ');

  const result = run('powershell', ['-NoProfile', '-Command', command]);

  assertOk(result);
  assert.match(result.stdout, /\[ok\] Installed AIOS/);
});

test('PowerShell installer fails fast when native setup commands fail', async () => {
  const workspaceRoot = process.cwd();
  const installPs1 = await readFile(path.join(workspaceRoot, 'scripts', 'aios-install.ps1'), 'utf8');

  assert.match(installPs1, /function Invoke-Checked/);
  assert.match(installPs1, /\$previousErrorActionPreference = \$ErrorActionPreference/);
  assert.match(installPs1, /\$ErrorActionPreference = 'Continue'/);
  assert.match(installPs1, /Invoke-Checked -Command "npm" -Arguments @\("install", "--include=dev", "--engine-strict=false"\)/);
  assert.match(installPs1, /AIOS runtime deps install did not produce expected TUI runner/);
  assert.match(installPs1, /Invoke-Checked -Command "powershell" -Arguments @\("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", \$shellInstaller, "--mode", \$WrapMode, "--force"\)/);
  assert.match(installPs1, /Invoke-Checked -Command "powershell" -Arguments @\("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", \$privacyInstaller, "--enable"\)/);
});

test('one-liner installers do not auto-run client setup or native enhancements', async () => {
  const workspaceRoot = process.cwd();
  const installSh = await readFile(path.join(workspaceRoot, 'scripts', 'aios-install.sh'), 'utf8');
  const installPs1 = await readFile(path.join(workspaceRoot, 'scripts', 'aios-install.ps1'), 'utf8');

  assert.doesNotMatch(installSh, /setup --components skills,native,superpowers --client all --skip-doctor/);
  assert.doesNotMatch(installPs1, /setup --components skills,native,superpowers --client all --skip-doctor/);
  assert.doesNotMatch(installSh, /\bif is_disabled\b/);
  assert.doesNotMatch(installPs1, /\bTest-FirstSetupDisabled\b/);
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
  assert.match(ok.stdout, /TESTS:\s+root and MCP-server verification passed/);
  assert.match(ok.stdout, /TRAINING:\s+changed Skill evidence recomputed/);

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


test('release-preflight fails when generated orchestrator agent export drifts', async () => {
  const rootDir = await makeTemp('rex-release-preflight-agent-drift-');
  await seedFixtureRepo(rootDir, {
    checkSkillsSyncScript: "console.log('[ok] skills sync clean');\nprocess.exit(0);\n",
    checkNativeSyncScript: "console.log('[ok] native sync clean');\nprocess.exit(0);\n",
  });
  await writeFixtureFile(rootDir, 'scripts/lib/specs/orchestrator-agents.json', '{"schemaVersion":1,"roleMap":{},"agents":{}}\n');

  const result = process.platform === 'win32'
    ? runPowerShell('scripts/release-preflight.ps1', ['-Tag', 'v1.2.3'], { cwd: rootDir })
    : run('bash', ['scripts/release-preflight.sh', '--tag', 'v1.2.3'], { cwd: rootDir });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /agent export drift detected/i);
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
