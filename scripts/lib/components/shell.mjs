import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { commandExists, runCommand } from '../platform/process.mjs';
import {
  ensureFile,
  readTextIfExists,
  stripManagedBlock,
  stripMatchingLines,
  writeText,
} from '../platform/fs.mjs';
import { resolvePowerShellProfilePaths, resolveShellRcFile } from '../platform/paths.mjs';
import {
  getClientRuntimeId,
  resolveClientCommandNames,
  resolveClientFromCommandName,
} from '../clients/registry.mjs';

const BEGIN_MARK = '# >>> contextdb-shell >>>';
const END_MARK = '# <<< contextdb-shell <<<';
const NATIVE_SHIM_MARK = 'AIOS_NATIVE_SHIM managed';

function quotePosixSingle(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function quotePowerShellSingle(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function quoteWindowsArg(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function buildPosixBlock(rootDir, mode, shimDir) {
  return `${BEGIN_MARK}\n# ContextDB transparent CLI wrappers (codex/claude/gemini/opencode)\nexport AIOS_ROOT_DIR=${quotePosixSingle(rootDir)}\nexport AIOS_ROOT="\${AIOS_ROOT_DIR}"\nexport ROOTPATH="\${AIOS_ROOT_DIR}"\nexport CTXDB_WRAP_MODE="\${CTXDB_WRAP_MODE:-${mode}}"\nexport AIOS_NATIVE_SHIM_DIR=${quotePosixSingle(shimDir)}\nif [ -n "\${ZSH_VERSION:-}" ]; then\n  _aios_path_tail=()\n  for _aios_path_entry in "\${path[@]}"; do\n    if [[ "\$_aios_path_entry" == "\$AIOS_NATIVE_SHIM_DIR" ]]; then\n      continue\n    fi\n    _aios_path_tail+=("\$_aios_path_entry")\n  done\n  path=("\$AIOS_NATIVE_SHIM_DIR" "\${_aios_path_tail[@]}")\n  export PATH\nelif [ -n "\$PATH" ]; then\n  _aios_path_old="\$PATH"\n  _aios_path_tail=""\n  _aios_path_ifs=\$IFS\n  IFS=:\n  for _aios_path_entry in \$_aios_path_old; do\n    case "\$_aios_path_entry" in\n      ""|"\$AIOS_NATIVE_SHIM_DIR") continue ;;\n    esac\n    if [ -z "\$_aios_path_tail" ]; then\n      _aios_path_tail="\$_aios_path_entry"\n    else\n      _aios_path_tail="\$_aios_path_tail:\$_aios_path_entry"\n    fi\n  done\n  IFS=\$_aios_path_ifs\n  export PATH="\$AIOS_NATIVE_SHIM_DIR\${_aios_path_tail:+:\$_aios_path_tail}"\nelse\n  export PATH="\$AIOS_NATIVE_SHIM_DIR"\nfi\nif [[ -f "\$AIOS_ROOT_DIR/scripts/contextdb-shell.zsh" ]]; then\n  source "\$AIOS_ROOT_DIR/scripts/contextdb-shell.zsh"\nfi\n${END_MARK}\n`;
}

function buildPowerShellBlock(rootDir, mode, shimDir) {
  return `${BEGIN_MARK}\n# ContextDB transparent CLI wrappers (codex/claude/gemini/opencode, PowerShell)\n$env:AIOS_ROOT_DIR = ${quotePowerShellSingle(rootDir)}\n$env:AIOS_ROOT = $env:AIOS_ROOT_DIR\n$env:ROOTPATH = $env:AIOS_ROOT_DIR\nif (-not $env:CTXDB_WRAP_MODE) { $env:CTXDB_WRAP_MODE = "${mode}" }\n$env:AIOS_NATIVE_SHIM_DIR = ${quotePowerShellSingle(shimDir)}\nif ($env:Path) {\n  $pathEntries = @($env:Path -split ';' | Where-Object { $_ -and $_ -ne $env:AIOS_NATIVE_SHIM_DIR })\n} else {\n  $pathEntries = @()\n}\n$env:Path = (@($env:AIOS_NATIVE_SHIM_DIR) + $pathEntries) -join ';'\n$ctxShell = Join-Path $env:AIOS_ROOT_DIR "scripts/contextdb-shell.ps1"\nif (Test-Path $ctxShell) {\n  . $ctxShell\n}\n${END_MARK}\n`;
}

function getShellPatterns(platform) {
  return platform === 'win32'
    ? [/^\.\s+.*scripts\/contextdb-shell\.ps1\s*$/u, /^# ContextDB transparent CLI wrappers \(codex\/claude\/gemini\/opencode, PowerShell\)$/u]
    : [/^source ".*\/scripts\/contextdb-shell\.zsh"$/u, /^# ContextDB transparent CLI wrappers \(codex\/claude\/gemini\/opencode\)$/u];
}

function resolveTargetFiles({ platform = process.platform, rcFile, env = process.env, homeDir = os.homedir() } = {}) {
  if (rcFile) {
    return [rcFile];
  }

  if (platform === 'win32') {
    return resolvePowerShellProfilePaths(env, homeDir);
  }

  return [resolveShellRcFile(env, homeDir)];
}

function resolveNativeShimDir({ homeDir = os.homedir() } = {}) {
  return path.join(homeDir, '.aios', 'bin');
}

function resolveNativeShimCommandNames() {
  return ['aios', ...resolveClientCommandNames('all')];
}

function envPathEntries(env = process.env) {
  const pathKey = Object.keys(env || {}).find((key) => key.toLowerCase() === 'path') || 'PATH';
  return String(env?.[pathKey] || '').split(path.delimiter).filter(Boolean);
}

function samePath(left, right, platform = process.platform) {
  const a = path.resolve(String(left || ''));
  const b = path.resolve(String(right || ''));
  return platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function buildPosixNativeShim({ rootDir, command, runtimeId }) {
  const quotedRoot = quotePosixSingle(rootDir);
  return `#!/usr/bin/env sh
# ${NATIVE_SHIM_MARK}: ${command}
_aios_root_baked=${quotedRoot}
if [ -f "\${AIOS_ROOT_DIR:-}/scripts/contextdb-shell-bridge.mjs" ]; then
  :
elif [ -f "$_aios_root_baked/scripts/contextdb-shell-bridge.mjs" ]; then
  AIOS_ROOT_DIR="$_aios_root_baked"
else
  for _aios_probe_dir in "$HOME/.rexcil/harness-cli" "$HOME/cool.cnb/rex-ai-boot"; do
    if [ -f "$_aios_probe_dir/scripts/contextdb-shell-bridge.mjs" ]; then
      AIOS_ROOT_DIR="$_aios_probe_dir"
      break
    fi
  done
fi
if [ ! -f "$AIOS_ROOT_DIR/scripts/contextdb-shell-bridge.mjs" ]; then
  _aios_real_bin=$(PATH=$(echo "$PATH" | sed "s|$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)||g" | sed 's|::\+|:|g') command -v -- "$(basename "$0")" 2>/dev/null || true)
  if [ -n "$_aios_real_bin" ] && [ "$_aios_real_bin" != "$0" ]; then
    exec "$_aios_real_bin" -- "$@"
  fi
  echo "[aios-shim] FATAL: cannot find contextdb-shell-bridge.mjs or real ${command}" >&2
  exit 127
fi
AIOS_ROOT=\${AIOS_ROOT:-\$AIOS_ROOT_DIR}
ROOTPATH=\${ROOTPATH:-\$AIOS_ROOT_DIR}
AIOS_NATIVE_SHIM_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export AIOS_ROOT_DIR AIOS_ROOT ROOTPATH AIOS_NATIVE_SHIM_DIR
exec node "$AIOS_ROOT_DIR/scripts/contextdb-shell-bridge.mjs" --agent ${quotePosixSingle(runtimeId)} --command ${quotePosixSingle(command)} -- "$@"
`;
}

function buildWindowsNativeShim({ rootDir, command, runtimeId }) {
  return `@echo off\r\nrem ${NATIVE_SHIM_MARK}: ${command}\r\nif "%AIOS_ROOT_DIR%"=="" set "AIOS_ROOT_DIR=${rootDir}"\r\nif not exist "%AIOS_ROOT_DIR%\\scripts\\contextdb-shell-bridge.mjs" (\r\n  if exist "${rootDir}\\scripts\\contextdb-shell-bridge.mjs" set "AIOS_ROOT_DIR=${rootDir}"\r\n)\r\nif not exist "%AIOS_ROOT_DIR%\\scripts\\contextdb-shell-bridge.mjs" (\r\n  where /q "${command}" 2>nul\r\n  if not errorlevel 1 (\r\n    for /f "tokens=*" %%i in ('where "${command}"') do set "_aios_real_bin=%%i"\r\n    if not "%_aios_real_bin%"=="%~f0" (\r\n      "%_aios_real_bin%" %*\r\n      exit /b %ERRORLEVEL%\r\n    )\r\n  )\r\n  echo [aios-shim] FATAL: cannot find contextdb-shell-bridge.mjs or real ${command} 1>&2\r\n  exit /b 127\r\n)\r\nif "%AIOS_ROOT%"=="" set "AIOS_ROOT=%AIOS_ROOT_DIR%"\r\nif "%ROOTPATH%"=="" set "ROOTPATH=%AIOS_ROOT_DIR%"\r\nset "AIOS_NATIVE_SHIM_DIR=%~dp0"\r\nnode "%AIOS_ROOT_DIR%\\scripts\\contextdb-shell-bridge.mjs" --agent ${quoteWindowsArg(runtimeId)} --command ${quoteWindowsArg(command)} -- %*\r\nexit /b %ERRORLEVEL%\r\n`;
}

function buildPosixAiosLauncher({ rootDir }) {
  const quotedRoot = quotePosixSingle(rootDir);
  return `#!/usr/bin/env sh
# ${NATIVE_SHIM_MARK}: aios
_aios_root_baked=${quotedRoot}
if [ -f "\${AIOS_ROOT_DIR:-}/scripts/aios.sh" ]; then
  :
elif [ -f "$_aios_root_baked/scripts/aios.sh" ]; then
  AIOS_ROOT_DIR="$_aios_root_baked"
else
  for _aios_probe_dir in "$HOME/.rexcil/harness-cli" "$HOME/cool.cnb/rex-ai-boot"; do
    if [ -f "$_aios_probe_dir/scripts/aios.sh" ]; then
      AIOS_ROOT_DIR="$_aios_probe_dir"
      break
    fi
  done
fi
if [ ! -f "\${AIOS_ROOT_DIR:-}/scripts/aios.sh" ]; then
  echo "[aios] FATAL: cannot find scripts/aios.sh for the managed AIOS runtime" >&2
  exit 127
fi
AIOS_ROOT="$AIOS_ROOT_DIR"
ROOTPATH="$AIOS_ROOT_DIR"
AIOS_NATIVE_SHIM_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export AIOS_ROOT_DIR AIOS_ROOT ROOTPATH AIOS_NATIVE_SHIM_DIR
exec "$AIOS_ROOT_DIR/scripts/aios.sh" "$@"
`;
}

function buildWindowsAiosLauncher({ rootDir }) {
  return `@echo off\r\nrem ${NATIVE_SHIM_MARK}: aios\r\nif not exist "%AIOS_ROOT_DIR%\\scripts\\aios.mjs" set "AIOS_ROOT_DIR=${rootDir}"\r\nif not exist "%AIOS_ROOT_DIR%\\scripts\\aios.mjs" (\r\n  echo [aios] FATAL: cannot find scripts\\aios.mjs for the managed AIOS runtime 1>&2\r\n  exit /b 127\r\n)\r\nset "AIOS_ROOT=%AIOS_ROOT_DIR%"\r\nset "ROOTPATH=%AIOS_ROOT_DIR%"\r\nset "AIOS_NATIVE_SHIM_DIR=%~dp0"\r\nnode "%AIOS_ROOT_DIR%\\scripts\\aios.mjs" %*\r\nexit /b %ERRORLEVEL%\r\n`;
}

function buildNativeShim({ rootDir, platform, command }) {
  if (command === 'aios') {
    return platform === 'win32'
      ? buildWindowsAiosLauncher({ rootDir })
      : buildPosixAiosLauncher({ rootDir });
  }

  const client = resolveClientFromCommandName(command);
  const runtimeId = getClientRuntimeId(client);
  return platform === 'win32'
    ? buildWindowsNativeShim({ rootDir, command, runtimeId })
    : buildPosixNativeShim({ rootDir, command, runtimeId });
}

function installNativeShims({ rootDir, platform = process.platform, homeDir = os.homedir() } = {}) {
  const shimDir = resolveNativeShimDir({ homeDir });
  fs.mkdirSync(shimDir, { recursive: true });
  const targets = resolveNativeShimCommandNames().map((command) => {
    const fileName = platform === 'win32' ? `${command}.cmd` : command;
    return { command, targetPath: path.join(shimDir, fileName) };
  });
  const conflicts = targets.filter(({ targetPath }) => {
    if (!fs.existsSync(targetPath)) return false;
    const content = readTextIfExists(targetPath);
    return !content.includes(NATIVE_SHIM_MARK);
  });
  if (conflicts.length > 0) {
    const files = conflicts.map((item) => item.targetPath).join(', ');
    throw new Error(`Refusing to overwrite unmanaged native shim(s): ${files}`);
  }
  for (const { command, targetPath } of targets) {
    const content = buildNativeShim({ rootDir, platform, command });
    fs.writeFileSync(targetPath, content, 'utf8');
    if (platform !== 'win32') fs.chmodSync(targetPath, 0o755);
  }
  return shimDir;
}

function uninstallNativeShims({ platform = process.platform, homeDir = os.homedir() } = {}) {
  const shimDir = resolveNativeShimDir({ homeDir });
  for (const command of resolveNativeShimCommandNames()) {
    const fileName = platform === 'win32' ? `${command}.cmd` : command;
    const targetPath = path.join(shimDir, fileName);
    const content = readTextIfExists(targetPath);
    if (content?.includes(NATIVE_SHIM_MARK)) {
      fs.rmSync(targetPath, { force: true });
    }
  }
  return shimDir;
}

function ensureContextDbRuntime({ rootDir, platform = process.platform, env = process.env, io = console, commandRunner = runCommand } = {}) {
  const mcpDir = path.join(rootDir, 'mcp-server');
  const packageJson = path.join(mcpDir, 'package.json');
  const compiledCli = path.join(mcpDir, 'dist', 'contextdb', 'cli.js');

  if (!fs.existsSync(packageJson)) {
    throw new Error(`mcp-server package.json not found: ${packageJson}`);
  }

  const hasCompiledCli = fs.existsSync(compiledCli);
  const tsxBin = platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const tsxPath = path.join(mcpDir, 'node_modules', '.bin', tsxBin);
  const hasTsx = fs.existsSync(tsxPath);

  if (hasCompiledCli && hasTsx) {
    io.log(`[ok] ContextDB runtime ready: ${mcpDir}`);
    return { status: 'reused', mcpDir };
  }

  if (!hasTsx) {
    io.log(`+ (cd ${mcpDir} && npm install)`);
    commandRunner('npm', ['install'], { cwd: mcpDir, env, platform });
  }

  if (!hasCompiledCli) {
    io.log(`+ (cd ${mcpDir} && npm run build)`);
    try {
      commandRunner('npm', ['run', 'build'], { cwd: mcpDir, env, platform });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      io.log(`[warn] npm run build failed: ${reason}`);
      io.log(`[warn] ContextDB will use slower npm-run mode. Run 'cd ${mcpDir} && npm run build' manually to fix.`);
    }
  }

  return { status: 'installed', mcpDir };
}

export async function installPrivacyGuard({ rootDir, enable = true, disable = false, mode = '', io = console } = {}) {
  const scriptPath = path.join(rootDir, 'scripts', 'privacy-guard.mjs');
  const args = [scriptPath, 'init'];
  if (enable && !disable) {
    args.push('--enable');
  }
  if (disable) {
    args.push('--disable');
  }
  if (mode) {
    args.push('--mode', mode);
  }
  io.log(`+ ${process.execPath} ${args.join(' ')}`);
  runCommand(process.execPath, args);
}

export async function installContextDbShell({
  rootDir,
  mode = 'opt-in',
  force = false,
  platform = process.platform,
  rcFile,
  env = process.env,
  homeDir = os.homedir(),
  io = console,
  commandRunner = runCommand,
} = {}) {
  ensureContextDbRuntime({ rootDir, platform, env, io, commandRunner });

  const targetFiles = resolveTargetFiles({ platform, rcFile, env, homeDir });
  const patterns = getShellPatterns(platform);
  const shimDir = installNativeShims({ rootDir, platform, homeDir });
  const block = platform === 'win32' ? buildPowerShellBlock(rootDir, mode, shimDir) : buildPosixBlock(rootDir, mode, shimDir);
  const statuses = [];

  for (const targetFile of targetFiles) {
    ensureFile(targetFile);

    let content = readTextIfExists(targetFile);
    if (content.includes(BEGIN_MARK) && !force) {
      io.log(`Already installed (${BEGIN_MARK}) in ${targetFile}. Use --force to update.`);
      statuses.push('reused');
      continue;
    }

    if (content.includes(BEGIN_MARK)) {
      content = stripManagedBlock(content, BEGIN_MARK, END_MARK);
    }

    content = stripMatchingLines(content, patterns).trimEnd();
    const nextContent = `${content}${content ? '\n\n' : ''}${block}`;
    writeText(targetFile, nextContent);

    io.log(`Installed into ${targetFile}`);
    statuses.push('installed');
  }

  io.log(`Default wrap mode: ${mode}`);
  const status = statuses.some((item) => item === 'installed') ? 'installed' : 'reused';
  return { status, targetFiles, shimDir };
}

export async function uninstallContextDbShell({
  platform = process.platform,
  rcFile,
  env = process.env,
  homeDir = os.homedir(),
  io = console,
} = {}) {
  const targetFiles = resolveTargetFiles({ platform, rcFile, env, homeDir });
  const patterns = getShellPatterns(platform);
  const shimDir = uninstallNativeShims({ platform, homeDir });
  let removed = 0;

  for (const targetFile of targetFiles) {
    const content = readTextIfExists(targetFile);
    if (!content) {
      io.log(`No shell config found at ${targetFile}`);
      continue;
    }

    const stripped = stripMatchingLines(stripManagedBlock(content, BEGIN_MARK, END_MARK), patterns).trimEnd();
    writeText(targetFile, stripped ? `${stripped}\n` : '');
    io.log(`Removed managed shell block from ${targetFile}`);
    removed += 1;
  }

  return { status: removed > 0 ? 'removed' : 'missing', targetFiles, shimDir };
}

export async function doctorContextDbShell({
  rootDir,
  platform = process.platform,
  rcFile,
  env = process.env,
  homeDir = os.homedir(),
  io = console,
} = {}) {
  const targetFiles = resolveTargetFiles({ platform, rcFile, env, homeDir });
  let warnings = 0;
  let effectiveWarnings = 0;

  const warn = (message, { effective = true } = {}) => {
    warnings += 1;
    if (effective) effectiveWarnings += 1;
    io.log(`[warn] ${message}`);
  };

  io.log('ContextDB Shell Doctor');
  io.log('----------------------');

  for (const targetFile of targetFiles) {
    io.log(`RC file: ${targetFile}`);
    const content = readTextIfExists(targetFile);
    if (!content) {
      warn(`rc file not found: ${targetFile}`);
    } else if (content.includes(BEGIN_MARK)) {
      io.log(`[ok] contextdb managed block found in ${targetFile}`);
    } else {
      warn(`contextdb managed block not found in ${targetFile}`);
    }
  }

  io.log(`AIOS_ROOT_DIR: ${env.AIOS_ROOT_DIR || '<unset>'}`);
  io.log(`AIOS_ROOT: ${env.AIOS_ROOT || '<unset>'}`);
  io.log(`ROOTPATH (legacy): ${env.ROOTPATH || '<unset>'}`);
  io.log(`CTXDB_WRAP_MODE: ${env.CTXDB_WRAP_MODE || '<unset>'}`);
  io.log(`AIOS_NATIVE_SHIM_DIR: ${env.AIOS_NATIVE_SHIM_DIR || '<unset>'}`);
  io.log(`CODEX_HOME: ${env.CODEX_HOME || '<unset>'}`);

  if (env.CODEX_HOME) {
    if (!path.isAbsolute(env.CODEX_HOME)) {
      warn(`CODEX_HOME is relative (${env.CODEX_HOME}); wrappers resolve it against current working directory at runtime`);
    } else {
      io.log('[ok] CODEX_HOME looks valid');
    }
  }

  if (rootDir) {
    const mcpDir = path.join(rootDir, 'mcp-server');
    const tsxBin = platform === 'win32' ? 'tsx.cmd' : 'tsx';
    const tsxPath = path.join(mcpDir, 'node_modules', '.bin', tsxBin);
    if (fs.existsSync(tsxPath)) {
      io.log(`[ok] ContextDB runtime ready: ${mcpDir}`);
    } else {
      warn(`ContextDB runtime missing at ${mcpDir}. Run shell setup again or: cd ${mcpDir}; npm install`);
    }
  }

  for (const command of resolveNativeShimCommandNames()) {
    if (commandExists(command, { platform, env })) {
      io.log(`[ok] ${command} found in PATH`);
    } else {
      warn(`${command} not found in PATH`, { effective: false });
    }
  }

  const shimDir = resolveNativeShimDir({ homeDir });
  const entries = envPathEntries(env);
  if (!entries.some((entry) => samePath(entry, shimDir, platform))) {
    warn(`native shim dir not found in PATH: ${shimDir}`);
  } else if (!samePath(entries[0], shimDir, platform)) {
    warn(`native shim dir is in PATH but not first: ${shimDir}`);
  } else {
    io.log(`[ok] native shim dir is first in PATH: ${shimDir}`);
  }

  for (const command of resolveNativeShimCommandNames()) {
    const fileName = platform === 'win32' ? `${command}.cmd` : command;
    const shimPath = path.join(shimDir, fileName);
    const content = readTextIfExists(shimPath);
    if (content?.includes(NATIVE_SHIM_MARK)) {
      io.log(`[ok] native shim installed: ${shimPath}`);
    } else {
      warn(`native shim missing: ${shimPath}`);
    }
  }

  return { warnings, effectiveWarnings, errors: 0 };
}
