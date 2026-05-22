import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { describe, it } from 'node:test';

const rootDir = path.resolve(import.meta.dirname, '..', '..');

describe('MCP Server Config — Platform Detection (static analysis)', () => {
  const browserSrc = fs.readFileSync(path.join(rootDir, 'scripts', 'lib', 'components', 'browser.mjs'), 'utf8');

  it('buildPreferredMcpServer uses resolveShellCommand for platform-aware shell', () => {
    assert.ok(browserSrc.includes('const shellCommand = resolveShellCommand()'),
      'buildPreferredMcpServer should call resolveShellCommand');
    assert.ok(browserSrc.includes('resolveShellCommand(platform'),
      'resolveShellCommand should accept platform param');
  });

  it('resolveShellCommand returns pwsh on win32, bash otherwise', () => {
    assert.ok(browserSrc.includes("? 'pwsh' : 'bash'"),
      'resolveShellCommand should have pwsh/bash ternary');
  });

  it('resolvePythonCommand returns python on win32, python3 otherwise', () => {
    assert.ok(browserSrc.includes("? 'python' : 'python3'"),
      'resolvePythonCommand should have python/python3 ternary');
  });

  it('resolveVenvPythonPath has Scripts for win32, bin for others', () => {
    assert.ok(browserSrc.includes("'Scripts'"),
      'resolveVenvPythonPath should reference Windows Scripts dir');
    assert.ok(browserSrc.includes("'bin'"),
      'resolveVenvPythonPath should reference POSIX bin dir');
  });

  it('pwsh args include -NoProfile -ExecutionPolicy Bypass -File', () => {
    assert.ok(browserSrc.includes('-NoProfile'),
      'pwsh args should include -NoProfile');
    assert.ok(browserSrc.includes('ExecutionPolicy'),
      'pwsh args should include -ExecutionPolicy Bypass');
  });

  it('resolveCdpServiceLayout has USERPROFILE fallback', () => {
    assert.ok(browserSrc.includes('process.env.USERPROFILE'),
      'resolveCdpServiceLayout should reference USERPROFILE');
  });

  it('doctorBrowserMcp uses resolveVenvPythonPath instead of hardcoded path', () => {
    assert.ok(browserSrc.includes('resolveVenvPythonPath(browserUseProjectDir)'),
      'doctorBrowserMcp should use resolveVenvPythonPath');
    assert.ok(!browserSrc.includes(".join(browserUseProjectDir, '.venv', 'bin', 'python')"),
      'doctorBrowserMcp should NOT hardcode .venv/bin/python');
  });

  it('doctorBrowserMcp uses resolveLauncherScript', () => {
    assert.ok(browserSrc.includes('resolveLauncherScript(rootDir)'),
      'doctorBrowserMcp should use resolveLauncherScript');
  });
});

describe('Launcher Script Files — Existence Check', () => {
  it('run-browser-use-mcp.sh exists', () => {
    const shPath = path.join(rootDir, 'scripts', 'run-browser-use-mcp.sh');
    assert.ok(fs.existsSync(shPath), `.sh launcher missing: ${shPath}`);
  });

  it('run-browser-use-mcp.ps1 exists', () => {
    const psPath = path.join(rootDir, 'scripts', 'run-browser-use-mcp.ps1');
    assert.ok(fs.existsSync(psPath), `.ps1 launcher missing: ${psPath}`);
  });

  it('.ps1 script has no macOS Keychain call', () => {
    const content = fs.readFileSync(path.join(rootDir, 'scripts', 'run-browser-use-mcp.ps1'), 'utf8');
    assert.ok(!content.includes('security find-generic-password'), '.ps1 should not call security CLI');
    assert.ok(content.includes('.venv'), '.ps1 should reference venv');
    assert.ok(content.includes('Scripts'), '.ps1 should reference Windows Scripts dir');
  });

  it('.sh script has uname guard for security', () => {
    const content = fs.readFileSync(path.join(rootDir, 'scripts', 'run-browser-use-mcp.sh'), 'utf8');
    assert.ok(content.includes('$(uname)'), '.sh should check uname');
    assert.ok(content.includes('not macOS'), '.sh should log skip message');
  });
});

describe('Browser Executable Paths — Multi-Platform (static analysis)', () => {
  const launcherSrc = fs.readFileSync(path.join(rootDir, 'mcp-server', 'src', 'browser', 'launcher.ts'), 'utf8');

  it('macOS has Brave and Arc candidates', () => {
    const macSection = launcherSrc.slice(
      launcherSrc.indexOf("platform === 'darwin'"),
      launcherSrc.indexOf("platform === 'win32'")
    );
    assert.ok(macSection.includes('Brave Browser'), 'missing Brave');
    assert.ok(macSection.includes('Arc.app'), 'missing Arc');
    assert.ok(macSection.includes('homebrew'), 'missing Homebrew path');
  });

  it('Windows has Brave and Chrome Canary', () => {
    const winSection = launcherSrc.slice(
      launcherSrc.indexOf("platform === 'win32'"),
      launcherSrc.indexOf("platform === 'linux'")
    );
    assert.ok(winSection.includes('BraveSoftware'), 'missing Brave');
    assert.ok(winSection.includes('Chrome SxS'), 'missing Chrome Canary');
  });

  it('Linux has Brave, Vivaldi, Flatpak', () => {
    const linuxSection = launcherSrc.slice(
      launcherSrc.indexOf("platform === 'linux'"),
      launcherSrc.lastIndexOf('return undefined')
    );
    assert.ok(linuxSection.includes('brave-browser'), 'missing Brave');
    assert.ok(linuxSection.includes('vivaldi'), 'missing Vivaldi');
    assert.ok(linuxSection.includes('flatpak'), 'missing Flatpak paths');
  });

  it('macOS browser candidates exist on current system', () => {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/opt/homebrew/bin/chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Arc.app/Contents/MacOS/Arc',
    ];
    const found = candidates.filter((c) => fs.existsSync(c));
    console.log(`  macOS browser scan: ${found.length}/${candidates.length} found`);
    if (found.length > 0) {
      console.log(`  Paths: ${found.join(', ')}`);
    } else {
      console.log('  No system browsers found (will use Playwright bundled chromium)');
    }
    // Not an assertion — just informational
    assert.ok(true);
  });
});

describe('REQUIRED: py/py3 — Cross-Platform Safety', () => {
  it('aios-cred.mjs uses platform-aware python resolution', () => {
    const content = fs.readFileSync(path.join(rootDir, 'scripts', 'aios-cred.mjs'), 'utf8');
    assert.ok(content.includes('resolvePython'), 'should have python resolution function');
    assert.ok(content.includes("platform === 'win32'"), 'should check platform');
    assert.ok(!content.includes("spawnSync('python3'"), 'should NOT hardcode python3');
    assert.ok(content.includes("'uv'"), 'should reference uv');
  });

  it('self-update.mjs uses USERPROFILE fallback', () => {
    const content = fs.readFileSync(path.join(rootDir, 'scripts', 'lib', 'lifecycle', 'self-update.mjs'), 'utf8');
    assert.ok(content.includes('USERPROFILE'), 'should reference USERPROFILE');
  });
});

describe('Shell Script Parity — MCP & ContextDB (static analysis)', () => {
  it('contextdb cli.ts has cross-platform browser open', () => {
    const content = fs.readFileSync(path.join(rootDir, 'mcp-server', 'src', 'contextdb', 'cli.ts'), 'utf8');
    assert.ok(content.includes("platform === 'darwin'"), 'should check darwin');
    assert.ok(content.includes("platform === 'win32'"), 'should check win32');
    assert.ok(content.includes('xdg-open'), 'should have Linux fallback');
  });

  it('shell.mjs buildPowerShellBlock exists alongside buildPosixBlock', () => {
    const content = fs.readFileSync(path.join(rootDir, 'scripts', 'lib', 'components', 'shell.mjs'), 'utf8');
    assert.ok(content.includes('buildPowerShellBlock'), 'should have PS block builder');
    assert.ok(content.includes('buildPosixBlock'), 'should have POSIX block builder');
  });
});

describe('Existing CI Smoke — Windows', () => {
  it('windows-shell-smoke.yml workflow exists', () => {
    const ciPath = path.join(rootDir, '.github', 'workflows', 'windows-shell-smoke.yml');
    assert.ok(fs.existsSync(ciPath), 'Windows CI workflow missing');
  });

  it('workflow tests shell install/uninstall on windows-latest', () => {
    const content = fs.readFileSync(
      path.join(rootDir, '.github', 'workflows', 'windows-shell-smoke.yml'), 'utf8'
    );
    assert.ok(content.includes('windows-latest'), 'should run on windows-latest');
    assert.ok(content.includes('install-contextdb-shell.ps1'), 'should test shell install');
    assert.ok(content.includes('uninstall-contextdb-shell.ps1'), 'should test shell uninstall');
  });
});
