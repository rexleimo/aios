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
import { resolveClientCommandNames } from '../clients/registry.mjs';

const BEGIN_MARK = '# >>> contextdb-shell >>>';
const END_MARK = '# <<< contextdb-shell <<<';

function quotePosixSingle(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function quotePowerShellSingle(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildPosixBlock(rootDir, mode) {
  return `${BEGIN_MARK}\n# ContextDB transparent CLI wrappers (codex/claude/gemini/opencode)\nexport AIOS_ROOT_DIR=${quotePosixSingle(rootDir)}\nexport AIOS_ROOT="\${AIOS_ROOT_DIR}"\nexport ROOTPATH="\${AIOS_ROOT_DIR}"\nexport CTXDB_WRAP_MODE="\${CTXDB_WRAP_MODE:-${mode}}"\nif [[ -f "\$AIOS_ROOT_DIR/scripts/contextdb-shell.zsh" ]]; then\n  source "\$AIOS_ROOT_DIR/scripts/contextdb-shell.zsh"\nfi\n${END_MARK}\n`;
}

function buildPowerShellBlock(rootDir, mode) {
  return `${BEGIN_MARK}\n# ContextDB transparent CLI wrappers (codex/claude/gemini/opencode, PowerShell)\n$env:AIOS_ROOT_DIR = ${quotePowerShellSingle(rootDir)}\n$env:AIOS_ROOT = $env:AIOS_ROOT_DIR\n$env:ROOTPATH = $env:AIOS_ROOT_DIR\nif (-not $env:CTXDB_WRAP_MODE) { $env:CTXDB_WRAP_MODE = "${mode}" }\n$ctxShell = Join-Path $env:AIOS_ROOT_DIR "scripts/contextdb-shell.ps1"\nif (Test-Path $ctxShell) {\n  . $ctxShell\n}\n${END_MARK}\n`;
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
  const block = platform === 'win32' ? buildPowerShellBlock(rootDir, mode) : buildPosixBlock(rootDir, mode);
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
  return { status, targetFiles };
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

  return { status: removed > 0 ? 'removed' : 'missing', targetFiles };
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

  for (const command of resolveClientCommandNames('all')) {
    if (commandExists(command, { platform, env })) {
      io.log(`[ok] ${command} found in PATH`);
    } else {
      warn(`${command} not found in PATH`, { effective: false });
    }
  }

  return { warnings, effectiveWarnings, errors: 0 };
}
