import assert from 'node:assert/strict';
import { cp, lstat, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  installContextDbShell,
  uninstallContextDbShell,
} from '../lib/components/shell.mjs';
import {
  doctorContextDbSkills,
  installContextDbSkills,
  uninstallContextDbSkills,
} from '../lib/components/skills.mjs';
import {
  installOrchestratorAgents,
  uninstallOrchestratorAgents,
} from '../lib/components/agents.mjs';
import { installBrowserMcp, migrateBrowserMcpConfig } from '../lib/components/browser.mjs';
import { syncClaudeSkillPermissions } from '../lib/components/superpowers.mjs';
import {
  commandExists,
  getCommandSpawnSpec,
} from '../lib/platform/process.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function makeFakeWindowsNodeInstall({ withNpxCli = true } = {}) {
  const rootDir = await makeTemp('aios-node-install-');
  const binDir = path.join(rootDir, 'bin');
  const npmBinDir = path.join(rootDir, 'lib', 'node_modules', 'npm', 'bin');
  const execPath = path.join(binDir, 'node.exe');
  const npmCli = path.join(npmBinDir, 'npm-cli.js');
  const npxCli = path.join(npmBinDir, 'npx-cli.js');

  await mkdir(npmBinDir, { recursive: true });
  await mkdir(binDir, { recursive: true });
  await writeFile(execPath, '', 'utf8');
  await writeFile(npmCli, '', 'utf8');
  if (withNpxCli) {
    await writeFile(npxCli, '', 'utf8');
  }

  return { execPath, npmCli, npxCli };
}

async function makeFakeWindowsAgentLauncher(command, scriptRelativePath) {
  const rootDir = await makeTemp(`aios-win-${command}-launcher-`);
  const binDir = path.join(rootDir, 'bin');
  const execPath = path.join(binDir, 'node.exe');
  const scriptPath = path.join(binDir, ...String(scriptRelativePath).split('/'));
  const launcherPath = path.join(binDir, `${command}.cmd`);
  const windowsRelPath = String(scriptRelativePath).split('/').join('\\');

  await mkdir(path.dirname(scriptPath), { recursive: true });
  await mkdir(binDir, { recursive: true });
  await writeFile(execPath, '', 'utf8');
  await writeFile(scriptPath, '', 'utf8');
  await writeFile(
    launcherPath,
    `@ECHO off\r\n"%~dp0\\node.exe" "%~dp0\\${windowsRelPath}" %*\r\n`,
    'utf8'
  );

  return { binDir, execPath, scriptPath, launcherPath };
}

async function makeFakeMcpServer(rootDir) {
  const mcpDir = path.join(rootDir, 'mcp-server');
  await mkdir(mcpDir, { recursive: true });
  await writeFile(path.join(mcpDir, 'package.json'), '{"name":"fake-mcp"}\n', 'utf8');
  return mcpDir;
}

async function writeSkillsCatalog(rootDir, skills) {
  const configDir = path.join(rootDir, 'config');
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(configDir, 'skills-catalog.json'), JSON.stringify({
    version: 1,
    skills,
  }, null, 2), 'utf8');
}

async function writeSuperpowersSkill(codexHome, skillName) {
  const skillDir = path.join(codexHome, 'superpowers', 'skills', skillName);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), `# ${skillName}\n`, 'utf8');
}

async function copyCanonicalAgentSource(rootDir) {
  await cp(path.join(process.cwd(), 'agent-sources'), path.join(rootDir, 'agent-sources'), {
    recursive: true,
  });
}

test('shell install writes managed block and uninstall removes it', async () => {
  const rootDir = await makeTemp('aios-shell-root-');
  const rcFile = path.join(rootDir, '.zshrc');
  await writeFile(rcFile, '# existing\n', 'utf8');
  await makeFakeMcpServer(rootDir);

  const calls = [];
  const commandRunner = (command, args, options) => {
    calls.push({ command, args, options });
  };

  await installContextDbShell({ rootDir, rcFile, mode: 'repo-only', platform: 'darwin', commandRunner });
  const installed = await readFile(rcFile, 'utf8');
  assert.match(installed, /# >>> contextdb-shell >>>/);
  assert.match(installed, /CTXDB_WRAP_MODE:-repo-only/);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, 'npm');
  assert.deepEqual(calls[0].args, ['install']);
  assert.equal(calls[1].command, 'npm');
  assert.deepEqual(calls[1].args, ['run', 'build']);

  await uninstallContextDbShell({ rcFile, platform: 'darwin' });
  const removed = await readFile(rcFile, 'utf8');
  assert.doesNotMatch(removed, /# >>> contextdb-shell >>>/);
});

test('windows shell install writes managed block to both PowerShell profiles', async () => {
  const rootDir = await makeTemp('aios-shell-win-root-');
  const homeDir = await makeTemp('aios-shell-win-home-');
  await makeFakeMcpServer(rootDir);

  const calls = [];
  const commandRunner = (command, args, options) => {
    calls.push({ command, args, options });
  };

  await installContextDbShell({ rootDir, platform: 'win32', homeDir, commandRunner });

  const pwshProfile = path.join(homeDir, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1');
  const winPsProfile = path.join(homeDir, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1');
  const pwshContent = await readFile(pwshProfile, 'utf8');
  const winPsContent = await readFile(winPsProfile, 'utf8');

  assert.match(pwshContent, /# >>> contextdb-shell >>>/);
  assert.match(winPsContent, /# >>> contextdb-shell >>>/);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, 'npm');
  assert.deepEqual(calls[0].args, ['install']);
  assert.equal(calls[1].command, 'npm');
  assert.deepEqual(calls[1].args, ['run', 'build']);

  await uninstallContextDbShell({ platform: 'win32', homeDir });
  assert.doesNotMatch(await readFile(pwshProfile, 'utf8'), /# >>> contextdb-shell >>>/);
  assert.doesNotMatch(await readFile(winPsProfile, 'utf8'), /# >>> contextdb-shell >>>/);
});

test('windows shell uninstall removes managed block from BOM-prefixed PowerShell profiles', async () => {
  const homeDir = await makeTemp('aios-shell-win-bom-home-');
  const pwshProfile = path.join(homeDir, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1');
  const winPsProfile = path.join(homeDir, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1');
  const managedBlock = [
    '\uFEFF# >>> contextdb-shell >>>',
    '# ContextDB transparent CLI wrappers (codex/claude/gemini/opencode, PowerShell)',
    'if (-not $env:ROOTPATH) { $env:ROOTPATH = "C:\\repo" }',
    '$ctxShell = Join-Path $env:ROOTPATH "scripts/contextdb-shell.ps1"',
    'if (Test-Path $ctxShell) {',
    '  . $ctxShell',
    '}',
    '# <<< contextdb-shell <<<',
    '',
  ].join('\r\n');

  await mkdir(path.dirname(pwshProfile), { recursive: true });
  await mkdir(path.dirname(winPsProfile), { recursive: true });
  await writeFile(pwshProfile, managedBlock, 'utf8');
  await writeFile(winPsProfile, `${managedBlock}Write-Host "keep"\r\n`, 'utf8');

  await uninstallContextDbShell({ platform: 'win32', homeDir });

  assert.doesNotMatch(await readFile(pwshProfile, 'utf8'), /# >>> contextdb-shell >>>/);
  assert.equal(await readFile(pwshProfile, 'utf8'), '');
  assert.doesNotMatch(await readFile(winPsProfile, 'utf8'), /# >>> contextdb-shell >>>/);
  assert.equal(await readFile(winPsProfile, 'utf8'), 'Write-Host "keep"\n');
});

test('shell install reuses existing ContextDB runtime without reinstall', async () => {
  const rootDir = await makeTemp('aios-shell-runtime-root-');
  const rcFile = path.join(rootDir, '.zshrc');
  const mcpDir = await makeFakeMcpServer(rootDir);
  const compiledCli = path.join(mcpDir, 'dist', 'contextdb', 'cli.js');
  const tsxPath = path.join(mcpDir, 'node_modules', '.bin', 'tsx');
  await mkdir(path.dirname(compiledCli), { recursive: true });
  await mkdir(path.dirname(tsxPath), { recursive: true });
  await writeFile(compiledCli, '', 'utf8');
  await writeFile(tsxPath, '', 'utf8');

  let called = false;
  const commandRunner = () => {
    called = true;
  };

  await installContextDbShell({ rootDir, rcFile, platform: 'darwin', commandRunner });
  assert.equal(called, false);
});

test('skills install copies repo-managed skills by default and uninstall removes them', async () => {
  const rootDir = await makeTemp('aios-skills-root-');
  const codexSkillDir = path.join(rootDir, 'skill-sources', 'sample-skill');
  await mkdir(codexSkillDir, { recursive: true });
  await writeFile(path.join(codexSkillDir, 'SKILL.md'), '# sample\n', 'utf8');
  await writeSkillsCatalog(rootDir, [
    {
      name: 'sample-skill',
      description: 'sample',
      source: 'skill-sources/sample-skill',
      clients: ['codex'],
      scopes: ['global'],
      defaultInstall: { global: true, project: false },
      tags: ['sample'],
    },
  ]);

  const codexHome = await makeTemp('aios-skills-home-');
  await installContextDbSkills({
    rootDir,
    client: 'codex',
    homeMap: { codex: codexHome },
  });

  const installPath = path.join(codexHome, 'skills', 'sample-skill');
  const body = await readFile(path.join(installPath, 'SKILL.md'), 'utf8');
  assert.match(body, /sample/);
  assert.equal((await lstat(installPath)).isSymbolicLink(), false);
  assert.match(await readFile(path.join(installPath, '.aios-skill-install.json'), 'utf8'), /"installMode": "copy"/);

  await uninstallContextDbSkills({
    rootDir,
    client: 'codex',
    homeMap: { codex: codexHome },
  });

  let missing = false;
  try {
    await readFile(path.join(installPath, 'SKILL.md'), 'utf8');
  } catch {
    missing = true;
  }
  assert.equal(missing, true);
});

test('syncClaudeSkillPermissions adds missing Skill(...) allowlist entries for project settings', async () => {
  const rootDir = await makeTemp('aios-superpowers-perms-project-root-');
  const codexHome = await makeTemp('aios-superpowers-perms-project-codex-home-');
  const claudeHome = await makeTemp('aios-superpowers-perms-project-claude-home-');
  const projectSettingsPath = path.join(rootDir, '.claude', 'settings.local.json');

  await writeSuperpowersSkill(codexHome, 'writing-plans');
  await writeSuperpowersSkill(codexHome, 'systematic-debugging');
  await mkdir(path.dirname(projectSettingsPath), { recursive: true });
  await writeFile(projectSettingsPath, `${JSON.stringify({
    permissions: {
      allow: ['Bash(git:*)', 'Skill(writing-plans)'],
    },
  }, null, 2)}\n`, 'utf8');

  const result = await syncClaudeSkillPermissions({
    rootDir,
    includeGlobal: false,
    includeProject: true,
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      CLAUDE_HOME: claudeHome,
    },
    io: { log: () => {} },
  });

  const updated = JSON.parse(await readFile(projectSettingsPath, 'utf8'));
  assert.equal(result.errors, 0);
  assert.equal(updated.permissions.allow.includes('Bash(git:*)'), true);
  assert.equal(updated.permissions.allow.includes('Skill(writing-plans)'), true);
  assert.equal(updated.permissions.allow.includes('Skill(systematic-debugging)'), true);
  assert.equal(updated.permissions.allow.includes('Skill(aios-long-running-harness)'), true);
});

test('syncClaudeSkillPermissions can seed global Claude settings when requested', async () => {
  const codexHome = await makeTemp('aios-superpowers-perms-global-codex-home-');
  const claudeHome = await makeTemp('aios-superpowers-perms-global-claude-home-');
  const globalSettingsPath = path.join(claudeHome, 'settings.local.json');

  await writeSuperpowersSkill(codexHome, 'dispatching-parallel-agents');
  await writeSuperpowersSkill(codexHome, 'subagent-driven-development');

  const result = await syncClaudeSkillPermissions({
    includeGlobal: true,
    includeProject: false,
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      CLAUDE_HOME: claudeHome,
    },
    io: { log: () => {} },
  });

  const seeded = JSON.parse(await readFile(globalSettingsPath, 'utf8'));
  assert.equal(result.errors, 0);
  assert.equal(Array.isArray(seeded.permissions.allow), true);
  assert.equal(seeded.permissions.allow.includes('Skill(dispatching-parallel-agents)'), true);
  assert.equal(seeded.permissions.allow.includes('Skill(subagent-driven-development)'), true);
});

test('browser installer runtime files do not embed author machine paths', async () => {
  const workspaceRoot = process.cwd();
  const files = [
    'scripts/run-browser-use-mcp.sh',
    'scripts/browser-use-bootstrap.py',
    'scripts/lib/components/browser.mjs',
  ];

  for (const relativePath of files) {
    const content = await readFile(path.join(workspaceRoot, relativePath), 'utf8');
    assert.doesNotMatch(content, /\/Users\/molei\/codes\//u, `${relativePath} contains an author machine path`);
    assert.doesNotMatch(content, /\/Users\/rex\/cool\.cnb\//u, `${relativePath} contains an author machine path`);
  }
});

test('browser mcp-migrate omits unresolved browser-use repo instead of writing author path', async () => {
  const rootDir = await makeTemp('aios-browser-migrate-portable-root-');
  const scriptsDir = path.join(rootDir, 'scripts');
  const configDir = path.join(rootDir, 'config');

  await mkdir(scriptsDir, { recursive: true });
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(scriptsDir, 'run-browser-use-mcp.sh'), '#!/usr/bin/env bash\n', 'utf8');
  await writeFile(path.join(scriptsDir, 'browser-use-bootstrap.py'), 'print("ok")\n', 'utf8');
  await writeFile(path.join(configDir, 'browser-profiles.json'), JSON.stringify({
    profiles: {
      default: { cdpPort: 9222 },
    },
  }, null, 2), 'utf8');

  await migrateBrowserMcpConfig({
    rootDir,
    io: { log: () => {} },
    clientHomes: {},
  });

  const raw = await readFile(path.join(rootDir, '.mcp.json'), 'utf8');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.mcpServers['puppeteer-stealth'].env.AIOS_BROWSER_USE_REPO, undefined);
  assert.doesNotMatch(raw, /\/Users\/molei\/codes\//u);
  assert.doesNotMatch(raw, /\/Users\/rex\/cool\.cnb\//u);
});

test('browser install missing external runtime reports portable repo-relative candidates', async () => {
  const rootDir = await makeTemp('aios-browser-install-portable-root-');
  const scriptsDir = path.join(rootDir, 'scripts');
  await mkdir(scriptsDir, { recursive: true });
  await writeFile(path.join(scriptsDir, 'run-browser-use-mcp.sh'), '#!/usr/bin/env bash\n', 'utf8');
  await writeFile(path.join(scriptsDir, 'browser-use-bootstrap.py'), 'print("ok")\n', 'utf8');

  const previous = process.env.AIOS_BROWSER_USE_REPO;
  delete process.env.AIOS_BROWSER_USE_REPO;
  try {
    await assert.rejects(
      () => installBrowserMcp({
        rootDir,
        skipPlaywrightInstall: true,
        io: { log: () => {} },
      }),
      (error) => {
        const message = error instanceof Error ? error.message : String(error);
        const escapedRoot = rootDir.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
        assert.match(message, /Set AIOS_BROWSER_USE_REPO/u);
        assert.match(message, new RegExp(`${escapedRoot}.*ai-browser-book`, 'u'));
        assert.doesNotMatch(message, /\/Users\/molei\/codes\//u);
        assert.doesNotMatch(message, /\/Users\/rex\/cool\.cnb\//u);
        return true;
      }
    );
  } finally {
    if (previous === undefined) delete process.env.AIOS_BROWSER_USE_REPO;
    else process.env.AIOS_BROWSER_USE_REPO = previous;
  }
});

test('browser mcp-migrate updates local and client mcp json configs', async () => {
  const rootDir = await makeTemp('aios-browser-migrate-root-');
  const scriptsDir = path.join(rootDir, 'scripts');
  const mcpServerDir = path.join(rootDir, 'mcp-server');
  const configDir = path.join(rootDir, 'config');
  const codexHome = await makeTemp('aios-browser-migrate-codex-');
  const claudeHome = await makeTemp('aios-browser-migrate-claude-');
  const geminiHome = await makeTemp('aios-browser-migrate-gemini-');
  const opencodeHome = await makeTemp('aios-browser-migrate-opencode-');

  await mkdir(scriptsDir, { recursive: true });
  await mkdir(mcpServerDir, { recursive: true });
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(scriptsDir, 'run-browser-use-mcp.sh'), '#!/usr/bin/env bash\n', 'utf8');
  await writeFile(path.join(scriptsDir, 'browser-use-bootstrap.py'), 'print("ok")\n', 'utf8');
  await writeFile(path.join(configDir, 'browser-profiles.json'), JSON.stringify({
    profiles: {
      default: { cdpPort: 9333 },
    },
  }, null, 2), 'utf8');

  const legacyConfig = {
    mcpServers: {
      'puppeteer-stealth': {
        command: 'node',
        args: ['/legacy/dist/index.js'],
        env: { KEEP_ME: '1' },
      },
      'playwright-browser-mcp': {
        command: 'node',
        args: ['/legacy/dist/index.js'],
      },
    },
  };

  await writeFile(path.join(rootDir, '.mcp.json'), `${JSON.stringify(legacyConfig, null, 2)}\n`, 'utf8');
  await writeFile(path.join(mcpServerDir, '.mcp.json'), `${JSON.stringify(legacyConfig, null, 2)}\n`, 'utf8');
  await mkdir(claudeHome, { recursive: true });
  await writeFile(path.join(claudeHome, 'mcp.json'), `${JSON.stringify(legacyConfig, null, 2)}\n`, 'utf8');

  const logs = [];
  const result = await migrateBrowserMcpConfig({
    rootDir,
    io: { log: (line) => logs.push(String(line)) },
    clientHomes: {
      codex: codexHome,
      claude: claudeHome,
      gemini: geminiHome,
      opencode: opencodeHome,
    },
  });

  assert.equal(result.errors, 0);
  assert.equal(result.created >= 0, true);
  assert.equal(result.updated >= 3, true);

  const rootMcp = JSON.parse(await readFile(path.join(rootDir, '.mcp.json'), 'utf8'));
  assert.equal(rootMcp.mcpServers['puppeteer-stealth'].command, 'bash');
  assert.deepEqual(rootMcp.mcpServers['puppeteer-stealth'].args, [path.join(rootDir, 'scripts', 'run-browser-use-mcp.sh')]);
  assert.equal(rootMcp.mcpServers['puppeteer-stealth'].env.KEEP_ME, '1');
  assert.equal(rootMcp.mcpServers['puppeteer-stealth'].env.BROWSER_USE_CDP_URL, 'http://127.0.0.1:9333');
  assert.equal(rootMcp.mcpServers['playwright-browser-mcp'], undefined);

  const claudeMcp = JSON.parse(await readFile(path.join(claudeHome, 'mcp.json'), 'utf8'));
  assert.equal(claudeMcp.mcpServers['puppeteer-stealth'].command, 'bash');
  assert.equal(claudeMcp.mcpServers['playwright-browser-mcp'], undefined);
  assert.match(logs.join('\n'), /mcp-migrate summary:/);
});

test('browser mcp-migrate --dry-run does not modify files', async () => {
  const rootDir = await makeTemp('aios-browser-migrate-dry-run-root-');
  const scriptsDir = path.join(rootDir, 'scripts');
  const configDir = path.join(rootDir, 'config');

  await mkdir(scriptsDir, { recursive: true });
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(scriptsDir, 'run-browser-use-mcp.sh'), '#!/usr/bin/env bash\n', 'utf8');
  await writeFile(path.join(scriptsDir, 'browser-use-bootstrap.py'), 'print("ok")\n', 'utf8');
  await writeFile(path.join(configDir, 'browser-profiles.json'), JSON.stringify({
    profiles: {
      default: { cdpPort: 9222 },
    },
  }, null, 2), 'utf8');

  const before = JSON.stringify({
    mcpServers: {
      'puppeteer-stealth': { command: 'node', args: ['/old.js'] },
    },
  }, null, 2) + '\n';

  const localMcpPath = path.join(rootDir, '.mcp.json');
  await writeFile(localMcpPath, before, 'utf8');

  const result = await migrateBrowserMcpConfig({ rootDir, dryRun: true, clientHomes: {} });
  const after = await readFile(localMcpPath, 'utf8');
  assert.equal(after, before);
  assert.equal(result.dryRun, true);
  assert.equal(result.updated + result.created >= 1, true);
});

test('windows npm resolves to the bundled npm cli script', async () => {
  const { execPath, npmCli } = await makeFakeWindowsNodeInstall();
  const spec = getCommandSpawnSpec('npm', ['install'], { platform: 'win32', execPath });

  assert.equal(commandExists('npm', { platform: 'win32', execPath }), true);
  assert.equal(spec.command, execPath);
  assert.deepEqual(spec.args, [npmCli, 'install']);
});

test('windows npx falls back to npm exec when npx cli is absent', async () => {
  const { execPath, npmCli } = await makeFakeWindowsNodeInstall({ withNpxCli: false });
  const spec = getCommandSpawnSpec('npx', ['playwright', 'install', 'chromium'], { platform: 'win32', execPath });

  assert.equal(commandExists('npx', { platform: 'win32', execPath }), true);
  assert.equal(spec.command, execPath);
  assert.deepEqual(spec.args, [npmCli, 'exec', '--', 'playwright', 'install', 'chromium']);
});

test('windows codex resolves npm-style cmd launcher to direct node execution', async () => {
  const { binDir, execPath, scriptPath } = await makeFakeWindowsAgentLauncher(
    'codex',
    'node_modules/@openai/codex/bin/codex.js'
  );

  const spec = getCommandSpawnSpec('codex', ['--version'], {
    platform: 'win32',
    execPath,
    env: { PATH: binDir, PATHEXT: '.EXE;.CMD' },
  });

  assert.equal(spec.command, execPath);
  assert.deepEqual(spec.args, [scriptPath, '--version']);
  assert.equal(spec.shell, false);
});

test('windows codex avoids shell when a native executable is available', async () => {
  const binDir = await makeTemp('aios-win-codex-exe-path-');
  await writeFile(path.join(binDir, 'codex.exe'), '', 'utf8');

  const spec = getCommandSpawnSpec('codex', ['--version'], {
    platform: 'win32',
    env: { PATH: binDir, PATHEXT: '.EXE;.CMD' },
  });

  assert.equal(spec.shell, false);
});

test('windows codex falls back to shell when cmd launcher entrypoint is not resolvable', async () => {
  const binDir = await makeTemp('aios-win-codex-shell-fallback-path-');
  await writeFile(path.join(binDir, 'codex.cmd'), '@ECHO off\r\nREM unresolved wrapper\r\n', 'utf8');

  const spec = getCommandSpawnSpec('codex', ['--version'], {
    platform: 'win32',
    env: { PATH: binDir, PATHEXT: '.EXE;.CMD' },
  });

  assert.equal(spec.command, 'codex');
  assert.deepEqual(spec.args, ['--version']);
  assert.equal(spec.shell, true);
});

test('windows claude, gemini, and opencode resolve npm-style cmd launchers to direct node execution', async () => {
  const claude = await makeFakeWindowsAgentLauncher(
    'claude',
    'node_modules/@anthropic-ai/claude-code/cli.js'
  );
  const gemini = await makeFakeWindowsAgentLauncher(
    'gemini',
    'node_modules/@google/gemini-cli/bin/gemini.js'
  );
  const opencode = await makeFakeWindowsAgentLauncher(
    'opencode',
    'node_modules/opencode-ai/dist/index.js'
  );

  const claudeSpec = getCommandSpawnSpec('claude', ['--version'], {
    platform: 'win32',
    execPath: claude.execPath,
    env: { PATH: claude.binDir, PATHEXT: '.EXE;.CMD' },
  });
  const geminiSpec = getCommandSpawnSpec('gemini', ['--version'], {
    platform: 'win32',
    execPath: gemini.execPath,
    env: { PATH: gemini.binDir, PATHEXT: '.EXE;.CMD' },
  });
  const opencodeSpec = getCommandSpawnSpec('opencode', ['--version'], {
    platform: 'win32',
    execPath: opencode.execPath,
    env: { PATH: opencode.binDir, PATHEXT: '.EXE;.CMD' },
  });

  assert.equal(claudeSpec.command, claude.execPath);
  assert.deepEqual(claudeSpec.args, [claude.scriptPath, '--version']);
  assert.equal(claudeSpec.shell, false);

  assert.equal(geminiSpec.command, gemini.execPath);
  assert.deepEqual(geminiSpec.args, [gemini.scriptPath, '--version']);
  assert.equal(geminiSpec.shell, false);

  assert.equal(opencodeSpec.command, opencode.execPath);
  assert.deepEqual(opencodeSpec.args, [opencode.scriptPath, '--version']);
  assert.equal(opencodeSpec.shell, false);
});


test('skills doctor warns on non-discoverable repo skill roots', async () => {
  const rootDir = await makeTemp('aios-skills-doctor-root-');
  const badSkillDir = path.join(rootDir, '.baoyu-skills', 'wrong-skill');
  const sampleSkillDir = path.join(rootDir, '.codex', 'skills', 'sample-skill');
  await mkdir(badSkillDir, { recursive: true });
  await mkdir(sampleSkillDir, { recursive: true });
  await writeFile(path.join(badSkillDir, 'SKILL.md'), '# wrong\n', 'utf8');
  await writeFile(path.join(sampleSkillDir, 'SKILL.md'), '# sample\n', 'utf8');
  await writeSkillsCatalog(rootDir, [
    {
      name: 'sample-skill',
      description: 'sample',
      source: '.codex/skills/sample-skill',
      clients: ['codex'],
      scopes: ['global'],
      defaultInstall: { global: true, project: false },
      tags: ['sample'],
    },
  ]);

  const logs = [];
  const io = { log: (line) => logs.push(String(line)) };
  const result = await doctorContextDbSkills({
    rootDir,
    client: 'codex',
    homeMap: { codex: await makeTemp('aios-skills-home-') },
    io,
  });

  assert.equal(result.warnings >= 1, true);
  assert.equal(logs.some((line) => line.includes('non-discoverable skill root .baoyu-skills')), true);
  assert.equal(logs.some((line) => line.includes('.baoyu-skills/wrong-skill/SKILL.md')), true);
});

test('agents install maps gemini to both compatibility targets and uninstall removes managed files only', async () => {
  const rootDir = await makeTemp('aios-agents-root-');
  await copyCanonicalAgentSource(rootDir);
  const claudeDir = path.join(rootDir, '.claude', 'agents');
  const codexDir = path.join(rootDir, '.codex', 'agents');
  await mkdir(claudeDir, { recursive: true });
  await mkdir(codexDir, { recursive: true });

  await writeFile(path.join(claudeDir, 'notes.md'), 'manual\n', 'utf8');

  const logs = [];
  const io = { log: (line) => logs.push(String(line)) };

  await installOrchestratorAgents({ rootDir, client: 'gemini', io });

  assert.match(await readFile(path.join(claudeDir, 'rex-planner.md'), 'utf8'), /AIOS-GENERATED/);
  assert.match(await readFile(path.join(codexDir, 'rex-planner.md'), 'utf8'), /AIOS-GENERATED/);

  await uninstallOrchestratorAgents({ rootDir, client: 'all', io });
  assert.equal(await readFile(path.join(claudeDir, 'notes.md'), 'utf8'), 'manual\n');

  let claudeMissing = false;
  try {
    await readFile(path.join(claudeDir, 'rex-planner.md'), 'utf8');
  } catch {
    claudeMissing = true;
  }
  assert.equal(claudeMissing, true);

  let codexMissing = false;
  try {
    await readFile(path.join(codexDir, 'rex-planner.md'), 'utf8');
  } catch {
    codexMissing = true;
  }
  assert.equal(codexMissing, true);
});

test('agents install fails on unmanaged conflicts before writing other targets', async () => {
  const rootDir = await makeTemp('aios-agents-conflict-root-');
  await copyCanonicalAgentSource(rootDir);
  const claudeDir = path.join(rootDir, '.claude', 'agents');
  const codexDir = path.join(rootDir, '.codex', 'agents');
  await mkdir(claudeDir, { recursive: true });
  await mkdir(codexDir, { recursive: true });
  await writeFile(path.join(claudeDir, 'rex-planner.md'), 'manual\n', 'utf8');

  await assert.rejects(
    () => installOrchestratorAgents({ rootDir, client: 'all', io: { log() {} } }),
    /unmanaged conflict/i
  );

  assert.equal(await readFile(path.join(claudeDir, 'rex-planner.md'), 'utf8'), 'manual\n');
  await assert.rejects(() => readFile(path.join(codexDir, 'rex-planner.md'), 'utf8'));
});
