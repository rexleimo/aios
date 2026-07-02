#!/usr/bin/env node
/**
 * scripts/lib/aios-init/compression-tools.mjs
 * 自动检测并安装社区 token 压缩工具 RTK + Caveman。
 * 全自动安装：用户按 y 确认后，自动下载、安装、验证、配置 PATH、初始化客户端。
 *
 * RTK: https://github.com/rtk-ai/rtk
 *   - Rust 二进制，通过 install.sh / brew / cargo / 预编译二进制安装
 *   - 支持 Claude Code / Codex / Gemini / Hermes 等客户端
 *   - rtk init -g 自动注册 hook 或 plugin
 *
 * Caveman: https://github.com/JuliusBrussee/caveman
 *   - Claude Code skill/插件，通过 install.sh / install.ps1 安装
 *   - 支持 Claude Code / Codex / Gemini / Cursor / Windsurf 等 30+ 客户端
 *   - 安装后通过 /caveman 命令触发
 */
import { execSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { platform, arch } from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const CAVEMAN_INSTALL_PS_URL = 'https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.ps1';
const CAVEMAN_INSTALL_SH_URL = 'https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.sh';

/* 中文注释：检测工具是否已安装 */
function isToolInstalled(toolName) {
  try {
    const result = spawnSync(toolName, ['--version'], {
      stdio: 'pipe',
      shell: process.platform === 'win32',
      timeout: 5000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/* 中文注释：检测当前环境是否为 WSL */
function isWSL() {
  if (process.platform !== 'linux') return false;
  try {
    return fs.readFileSync('/proc/version', 'utf-8').toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

/* 中文注释：检测命令是否可用 */
function hasCommand(cmd) {
  try {
    const result = spawnSync(cmd, ['--version'], {
      stdio: 'pipe',
      shell: process.platform === 'win32',
      timeout: 5000,
    });
    return result.status === 0 || result.error === undefined;
  } catch {
    return false;
  }
}

/* 中文注释：安装确认提示 */
const INSTALL_NOTICE = `
╔══════════════════════════════════════════════════════════╗
║  社区 Token 压缩工具安装确认                              ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  AIOS 原生拦截运行时已废弃，改为安装社区工具：           ║
║                                                          ║
║    • RTK (rtk-ai/rtk)                                    ║
║      Rust CLI 代理，压缩命令输出 60-90%                   ║
║      https://github.com/rtk-ai/rtk                       ║
║                                                          ║
║    • Caveman (JuliusBrussee/caveman)                     ║
║      Claude Code skill，压缩输出 token ~75%               ║
║      https://github.com/JuliusBrussee/caveman            ║
║                                                          ║
║  ⚠️  隐私：                                             ║
║  两者均本地运行，不发送数据到外部服务。                   ║
║  --yes-compression-tools 可跳过此确认（CI/无人值守）。   ║
║                                                          ║
║  安装过程：自动下载 → 安装 → 验证 → 配置 → 初始化客户端  ║
╚══════════════════════════════════════════════════════════╝
`;

/* 中文注释：交互式确认 */
function promptUser(question) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/* 中文注释：执行 shell 命令，返回是否成功 */
function runCommand(cmd, { timeout = 120000, shell } = {}) {
  try {
    execSync(cmd, {
      stdio: 'inherit',
      timeout,
      shell: shell || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'),
    });
    return true;
  } catch (e) {
    const reason = e.killed ? `timeout after ${timeout}ms` : (e.message || 'unknown');
    console.warn(`  [warn] command failed: ${cmd.split('\n')[0].slice(0, 80)}...`);
    console.warn(`  [warn] reason: ${reason}`);
    return false;
  }
}

/* 中文注释：获取 Windows 用户 PATH 中的目标目录 */
function getWindowsLocalBin() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return path.join(home, '.local', 'bin');
}

/* 中文注释：检测目录是否在 PATH 中 */
function isInPath(dir) {
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const pathDirs = (process.env.PATH || '').split(pathSep);
  const resolved = path.resolve(dir);
  return pathDirs.some(d => path.resolve(d) === resolved);
}

/* 中文注释：将目录添加到 Windows 用户 PATH（通过 setx） */
function addToWindowsUserPath(dir) {
  // 用 PowerShell 持久化添加到用户 PATH
  const psCmd = `[Environment]::SetEnvironmentVariable('PATH', [Environment]::GetEnvironmentVariable('PATH', 'User') + ';${dir}', 'User')`;
  return runCommand(psCmd, { timeout: 15000 });
}

/* 中文注释：安装 RTK — 按平台选择最佳安装方式 */
function installRTK() {
  const plat = platform();
  const isWin = plat === 'win32';
  const isMac = plat === 'darwin';
  const isLinux = plat === 'linux';
  const wsl = isWSL();

  // macOS: 优先 brew
  if (isMac && hasCommand('brew')) {
    console.log('  [1/4] brew install rtk...');
    if (runCommand('brew install rtk', { timeout: 180000 })) {
      return verifyRTK();
    }
    console.log('  brew failed, trying install.sh...');
  }

  // Linux / macOS / WSL: install.sh
  if (isLinux || isMac || wsl) {
    console.log('  [1/4] downloading and running RTK install.sh...');
    const cmd = 'curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh';
    if (runCommand(cmd, { timeout: 180000 })) {
      // install.sh 安装到 ~/.local/bin，可能需要加入 PATH
      const localBin = path.join(process.env.HOME || '', '.local', 'bin');
      if (!isInPath(localBin)) {
        console.log(`  [2/4] adding ${localBin} to PATH (current session)...`);
        process.env.PATH = `${localBin}:${process.env.PATH}`;
        // 提示用户持久化
        console.log(`  [hint] add to shell profile: export PATH="$HOME/.local/bin:$PATH"`);
      }
      return verifyRTK();
    }
  }

  // Windows: 下载预编译二进制并自动配置 PATH
  if (isWin) {
    console.log('  [1/4] downloading RTK pre-built binary for Windows...');
    const archStr = arch() === 'arm64' ? 'aarch64' : 'x86_64';
    if (archStr !== 'x86_64') {
      console.warn(`  [warn] unsupported Windows arch: ${arch()}`);
      return false;
    }
    const dest = getWindowsLocalBin();
    const psScript = `
      $ErrorActionPreference = 'Stop'
      $url = 'https://github.com/rtk-ai/rtk/releases/latest/download/rtk-x86_64-pc-windows-msvc.zip'
      $tmp = [System.IO.Path]::GetTempFileName() + '.zip'
      $dest = '${dest.replace(/\\/g, '\\\\')}'
      Write-Host "  downloading from $url..."
      Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
      New-Item -ItemType Directory -Force -Path $dest | Out-Null
      Write-Host "  extracting to $dest..."
      Expand-Archive -Path $tmp -DestinationPath $dest -Force
      Remove-Item $tmp -Force
      Write-Host "  rtk.exe -> $dest\\rtk.exe"
    `.trim();
    if (runCommand(psScript, { timeout: 180000 })) {
      // 自动配置 PATH
      if (!isInPath(dest)) {
        console.log(`  [2/4] adding ${dest} to user PATH...`);
        if (addToWindowsUserPath(dest)) {
          console.log('  [2/4] PATH updated (takes effect in new terminal)');
        }
        // 当前 session 也要可用
        process.env.PATH = `${dest};${process.env.PATH}`;
      }
      return verifyRTK();
    }
  }

  // 通用 fallback: cargo
  if (hasCommand('cargo')) {
    console.log('  [1/4] cargo install rtk (this may take a few minutes)...');
    if (runCommand('cargo install --git https://github.com/rtk-ai/rtk', { timeout: 600000 })) {
      return verifyRTK();
    }
  }

  console.warn('  [warn] all RTK install methods failed');
  console.warn('  manual: https://github.com/rtk-ai/rtk#installation');
  return false;
}

/* 中文注释：验证 RTK 安装是否成功 */
function verifyRTK() {
  console.log('  [3/4] verifying RTK installation...');
  // 刷新检测，考虑刚加入 PATH 的情况
  if (isToolInstalled('rtk')) {
    const version = spawnSync('rtk', ['--version'], {
      stdio: 'pipe', shell: process.platform === 'win32', timeout: 5000,
    });
    const ver = version.stdout?.toString().trim() || 'unknown';
    console.log(`  [3/4] RTK verified: ${ver}`);
    return true;
  }
  console.warn('  [3/4] RTK binary not found after install');
  console.warn('  [hint] may need to restart terminal or add to PATH manually');
  return false;
}

export function buildCavemanWindowsInstallCommand() {
  return `
    $ErrorActionPreference = 'Stop'
    $installer = Join-Path ([System.IO.Path]::GetTempPath()) ('caveman-install-' + [guid]::NewGuid().ToString('N') + '.ps1')
    try {
      Invoke-WebRequest -Uri '${CAVEMAN_INSTALL_PS_URL}' -OutFile $installer -UseBasicParsing
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
      Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue
    }
  `.trim();
}

function resolveAbsoluteEnvPath(env, name, fallback) {
  const value = String(env[name] || '').trim();
  return value && path.isAbsolute(value) ? value : fallback;
}

export function getCavemanVerificationPaths({
  home = process.env.USERPROFILE || process.env.HOME || '',
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  const xdgConfigHome = resolveAbsoluteEnvPath(env, 'XDG_CONFIG_HOME', path.join(home, '.config'));
  const claudeHome = resolveAbsoluteEnvPath(env, 'CLAUDE_HOME', path.join(home, '.claude'));
  const codexHome = resolveAbsoluteEnvPath(env, 'CODEX_HOME', path.join(home, '.codex'));
  const geminiHome = resolveAbsoluteEnvPath(env, 'GEMINI_HOME', path.join(home, '.gemini'));
  const opencodeHome = resolveAbsoluteEnvPath(env, 'OPENCODE_HOME', path.join(xdgConfigHome, 'opencode'));

  return [
    { label: 'Claude plugin cache', path: path.join(claudeHome, 'plugins', 'cache', 'caveman') },
    { label: 'Claude skill', path: path.join(claudeHome, 'skills', 'caveman') },
    { label: 'Codex skill', path: path.join(codexHome, 'skills', 'caveman') },
    { label: 'Gemini skill', path: path.join(geminiHome, 'skills', 'caveman') },
    { label: 'Opencode skill', path: path.join(opencodeHome, 'skills', 'caveman') },
    { label: 'repo shared skill', path: path.join(cwd, '.agents', 'skills', 'caveman') },
    { label: 'repo Codex skill', path: path.join(cwd, '.codex', 'skills', 'caveman') },
    { label: 'repo Claude skill', path: path.join(cwd, '.claude', 'skills', 'caveman') },
  ];
}

/* 中文注释：安装 Caveman */
function installCaveman() {
  const plat = platform();
  const isWin = plat === 'win32';

  if (isWin) {
    console.log('  [1/3] running Caveman install.ps1...');
    const psCmd = buildCavemanWindowsInstallCommand();
    if (runCommand(psCmd, { timeout: 180000 })) {
      return verifyCaveman();
    }
  } else {
    console.log('  [1/3] running Caveman install.sh...');
    const cmd = `curl -fsSL ${CAVEMAN_INSTALL_SH_URL} | bash`;
    if (runCommand(cmd, { timeout: 180000 })) {
      return verifyCaveman();
    }
  }

  console.warn('  [1/3] Caveman install failed');
  console.warn('  manual: https://github.com/JuliusBrussee/caveman#install');
  return false;
}

/* 中文注释：验证 Caveman 安装是否成功 */
function verifyCaveman() {
  console.log('  [2/3] verifying Caveman installation...');
  for (const check of getCavemanVerificationPaths()) {
    if (fs.existsSync(check.path)) {
      console.log(`  [2/3] Caveman verified (${check.label}): ${check.path}`);
      return true;
    }
  }
  console.warn('  [2/3] Caveman install marker not found in known paths');
  console.warn('  [hint] may need to restart terminal; check Claude plugins, ~/.config/opencode/skills, or repo .agents/skills');
  return false;
}


/* 中文注释：RTK 初始化 — 为检测到的客户端注册 hook/plugin */
export function buildRTKInitCommandForAgent(agent) {
  const RTK_AGENT_MAP = {
    claude: null,
    codex: '--codex',
    gemini: '--gemini',
    opencode: '--opencode',
    hermes: '--agent hermes',
  };
  const rtkFlag = RTK_AGENT_MAP[agent];
  if (rtkFlag === undefined) return null;
  return rtkFlag ? `rtk init -g ${rtkFlag}` : 'rtk init -g';
}

/* Initialize RTK hooks/plugins for detected clients. */
function initRTKForAgents(agents) {
  if (!isToolInstalled('rtk')) return;

  for (const agent of agents) {
    const cmd = buildRTKInitCommandForAgent(agent);
    if (!cmd) continue;
    console.log(`  [4/4] rtk init for ${agent}...`);
    runCommand(cmd, { timeout: 30000 });
  }
}


/**
 * 检测并安装 RTK + Caveman — 全自动
 * 用户确认后：下载 → 安装 → 验证 → 配置 PATH → 初始化客户端
 * @param {Object} options
 * @param {boolean} options.dryRun - 仅检测不安装
 * @param {boolean} options.yesCompressionTools - 跳过确认提示
 * @param {string[]} options.agents - 检测到的客户端列表，用于 rtk init
 * @returns {Promise<{rtk: string, caveman: string}>} 安装状态
 */
export async function ensureCompressionTools(options = {}) {
  const { dryRun = false, yesCompressionTools = false, agents = [] } = options;

  // === 检测阶段 ===
  const rtkInstalled = isToolInstalled('rtk');
  let cavemanInstalled = false;
  try {
    cavemanInstalled = getCavemanVerificationPaths().some((candidate) => fs.existsSync(candidate.path));
  } catch {
    // ignore
  }

  const result = {
    rtk: rtkInstalled ? 'installed' : 'missing',
    caveman: cavemanInstalled ? 'installed' : 'missing',
  };

  if (dryRun) {
    console.log(`  ? RTK: ${result.rtk}`);
    console.log(`  ? Caveman: ${result.caveman}`);
    console.log('    (dry-run: would auto-install after confirmation)');
    return result;
  }

  if (rtkInstalled && cavemanInstalled) {
    console.log('  RTK: installed');
    console.log('  Caveman: installed');
    if (agents.length > 0) {
      console.log('  ensuring rtk init for detected agents...');
      initRTKForAgents(agents);
    }
    return result;
  }

  // === 确认阶段 ===
  if (!yesCompressionTools) {
    console.log(INSTALL_NOTICE);
    const answer = await promptUser('是否自动安装 RTK + Caveman？(y/N) ');
    if (answer !== 'y' && answer !== 'yes') {
      console.log('  跳过压缩工具安装。');
      console.log('  手动安装:');
      console.log('    RTK:     https://github.com/rtk-ai/rtk#installation');
      console.log('    Caveman: https://github.com/JuliusBrussee/caveman#install');
      console.log('  或使用 --yes-compression-tools 自动确认。');
      return result;
    }
  }

  // === 安装阶段 ===
  if (!rtkInstalled) {
    console.log('');
    console.log('=== Installing RTK (rtk-ai/rtk) ===');
    console.log(`  platform: ${platform()} ${arch()}${isWSL() ? ' (WSL)' : ''}`);
    if (installRTK()) {
      result.rtk = 'installed';
      console.log('  RTK installed successfully.');
      if (agents.length > 0) {
        console.log('');
        console.log('=== Initializing RTK for detected agents ===');
        initRTKForAgents(agents);
      }
    } else {
      result.rtk = 'failed';
      console.warn('  RTK installation failed. See manual: https://github.com/rtk-ai/rtk#installation');
    }
  } else if (agents.length > 0) {
    console.log('  RTK already installed, ensuring init for detected agents...');
    initRTKForAgents(agents);
  }

  if (!cavemanInstalled) {
    console.log('');
    console.log('=== Installing Caveman (JuliusBrussee/caveman) ===');
    console.log(`  platform: ${platform()} ${arch()}`);
    if (installCaveman()) {
      result.caveman = 'installed';
      console.log('  Caveman installed successfully.');
      console.log('  activate with /caveman in Claude Code, or "talk like caveman"');
    } else {
      result.caveman = 'failed';
      console.warn('  Caveman installation failed. See manual: https://github.com/JuliusBrussee/caveman#install');
    }
  }

  // === 总结 ===
  console.log('');
  console.log('=== Compression Tools Summary ===');
  const rtkIcon = result.rtk === 'installed' ? '✓' : result.rtk === 'failed' ? '✗' : '?';
  const cavemanIcon = result.caveman === 'installed' ? '✓' : result.caveman === 'failed' ? '✗' : '?';
  console.log(`  ${rtkIcon} RTK: ${result.rtk}`);
  console.log(`  ${cavemanIcon} Caveman: ${result.caveman}`);
  if (result.rtk === 'failed' || result.caveman === 'failed') {
    console.log('  some tools failed to install — see manual links above');
  }
  if (result.rtk === 'installed' && result.caveman === 'installed') {
    console.log('  all compression tools ready. Restart your AI client to activate.');
  }

  return result;
}
