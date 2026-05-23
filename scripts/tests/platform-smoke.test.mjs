import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { describe, it } from 'node:test';

const rootDir = path.resolve(import.meta.dirname, '..', '..');

function readRepoSource(...segments) {
  return fs.readFileSync(path.join(rootDir, ...segments), 'utf8');
}

function countSourceLines(source) {
  const trimmed = String(source || '').trim();
  return trimmed ? trimmed.split(/\r?\n/u).length : 0;
}

describe('MCP Server Config - Platform Detection (static analysis)', () => {
  const browserFacadeSrc = readRepoSource('scripts', 'lib', 'components', 'browser.mjs');
  const browserRuntimePathsSrc = readRepoSource('scripts', 'lib', 'components', 'browser', 'runtime-paths.mjs');
  const browserMcpConfigSrc = readRepoSource('scripts', 'lib', 'components', 'browser', 'mcp-config.mjs');
  const browserCdpServiceSrc = readRepoSource('scripts', 'lib', 'components', 'browser', 'cdp-service.mjs');
  const browserDoctorSrc = readRepoSource('scripts', 'lib', 'components', 'browser', 'doctor.mjs');

  it('browser component entrypoint stays a thin facade over focused modules', () => {
    assert.equal(countSourceLines(browserFacadeSrc) <= 40, true,
      'browser.mjs should stay a facade and keep browser responsibilities under components/browser/*');
    assert.ok(browserFacadeSrc.includes("from './browser/mcp-config.mjs'"),
      'facade should re-export MCP config module');
    assert.ok(browserFacadeSrc.includes("from './browser/install.mjs'"),
      'facade should re-export install module');
    assert.ok(browserFacadeSrc.includes("from './browser/cdp-service.mjs'"),
      'facade should re-export CDP service module');
    assert.ok(browserFacadeSrc.includes("from './browser/doctor.mjs'"),
      'facade should re-export doctor module');
  });

  it('buildPreferredMcpServer uses resolveShellCommand for platform-aware shell', () => {
    assert.ok(browserMcpConfigSrc.includes('const shellCommand = resolveShellCommand()'),
      'buildPreferredMcpServer should call resolveShellCommand');
    assert.ok(browserRuntimePathsSrc.includes('resolveShellCommand(platform'),
      'resolveShellCommand should accept platform param');
  });

  it('resolveShellCommand returns pwsh on win32, bash otherwise', () => {
    assert.ok(browserRuntimePathsSrc.includes("? 'pwsh' : 'bash'"),
      'resolveShellCommand should have pwsh/bash ternary');
  });

  it('resolvePythonCommand returns python on win32, python3 otherwise', () => {
    assert.ok(browserRuntimePathsSrc.includes("? 'python' : 'python3'"),
      'resolvePythonCommand should have python/python3 ternary');
  });

  it('resolveVenvPythonPath has Scripts for win32, bin for others', () => {
    assert.ok(browserRuntimePathsSrc.includes("'Scripts'"),
      'resolveVenvPythonPath should reference Windows Scripts dir');
    assert.ok(browserRuntimePathsSrc.includes("'bin'"),
      'resolveVenvPythonPath should reference POSIX bin dir');
  });

  it('pwsh args include -NoProfile -ExecutionPolicy Bypass -File', () => {
    assert.ok(browserMcpConfigSrc.includes('-NoProfile'),
      'pwsh args should include -NoProfile');
    assert.ok(browserMcpConfigSrc.includes('ExecutionPolicy'),
      'pwsh args should include -ExecutionPolicy Bypass');
  });

  it('resolveCdpServiceLayout has USERPROFILE fallback', () => {
    assert.ok(browserCdpServiceSrc.includes('process.env.USERPROFILE'),
      'resolveCdpServiceLayout should reference USERPROFILE');
  });

  it('doctorBrowserMcp uses resolveVenvPythonPath instead of hardcoded path', () => {
    assert.ok(browserDoctorSrc.includes('resolveVenvPythonPath(browserUseProjectDir'),
      'doctorBrowserMcp should use resolveVenvPythonPath');
    assert.ok(!browserDoctorSrc.includes(".join(browserUseProjectDir, '.venv', 'bin', 'python')"),
      'doctorBrowserMcp should NOT hardcode .venv/bin/python');
  });

  it('doctorBrowserMcp uses resolveLauncherScript', () => {
    assert.ok(browserDoctorSrc.includes('resolveLauncherScript(rootDir'),
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

  it('self-update.mjs enables TLS 1.2 before Windows release installer request', () => {
    const content = fs.readFileSync(path.join(rootDir, 'scripts', 'lib', 'lifecycle', 'self-update.mjs'), 'utf8');
    const tlsIndex = content.indexOf('[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12');
    const installerIndex = content.indexOf('aios-install.ps1');

    assert.ok(tlsIndex >= 0, 'should enable TLS 1.2 for Windows PowerShell downloads');
    assert.ok(installerIndex >= 0 && tlsIndex < installerIndex, 'should set TLS before requesting installer');
  });

  it('dispatch starts TUI through local tsx cli instead of npx shell', () => {
    const content = fs.readFileSync(path.join(rootDir, 'scripts', 'lib', 'cli', 'dispatch.mjs'), 'utf8');
    assert.ok(content.includes("node_modules', 'tsx', 'dist', 'cli.mjs'"), 'should resolve local tsx cli');
    assert.ok(content.includes('spawnSync(process.execPath'), 'should launch local tsx with node');
    assert.ok(!content.includes('npx tsx'), 'should not depend on npx for TUI startup');
  });
});

describe('Shell Script Parity — MCP & ContextDB (static analysis)', () => {
  it('contextdb genealogy server has cross-platform browser open', () => {
    const content = fs.readFileSync(path.join(rootDir, 'mcp-server', 'src', 'contextdb', 'cli', 'genealogy-server.ts'), 'utf8');
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
