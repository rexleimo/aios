import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function expandHome(inputPath, homeDir = os.homedir()) {
  if (!inputPath) return inputPath;
  if (inputPath === '~') return homeDir;
  if (inputPath.startsWith('~/')) return path.join(homeDir, inputPath.slice(2));
  return inputPath;
}

export function normalizeHomeDir(raw, fallback, homeDir = os.homedir()) {
  if (!raw) return fallback;
  const expanded = expandHome(String(raw), homeDir);
  if (!path.isAbsolute(expanded)) return fallback;
  return expanded;
}

export function resolveXdgConfigHome(env = process.env, homeDir = os.homedir()) {
  if (env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME)) {
    return env.XDG_CONFIG_HOME;
  }
  return path.join(homeDir, '.config');
}

export function getClientHomes(env = process.env, homeDir = os.homedir()) {
  const xdgConfigHome = resolveXdgConfigHome(env, homeDir);
  return {
    codex: normalizeHomeDir(env.CODEX_HOME, path.join(homeDir, '.codex'), homeDir),
    claude: normalizeHomeDir(env.CLAUDE_HOME, path.join(homeDir, '.claude'), homeDir),
    gemini: normalizeHomeDir(env.GEMINI_HOME, path.join(homeDir, '.gemini'), homeDir),
    opencode: normalizeHomeDir(env.OPENCODE_HOME, path.join(xdgConfigHome, 'opencode'), homeDir),
  };
}

export function resolveShellRcFile(env = process.env, homeDir = os.homedir()) {
  const zdotdir = env.ZDOTDIR && path.isAbsolute(env.ZDOTDIR) ? env.ZDOTDIR : homeDir;
  return path.join(zdotdir, '.zshrc');
}

export function resolvePowerShellProfilePaths(env = process.env, homeDir = os.homedir()) {
  if (env.AIOS_POWERSHELL_PROFILE && path.isAbsolute(env.AIOS_POWERSHELL_PROFILE)) {
    return [env.AIOS_POWERSHELL_PROFILE];
  }

  const documentsDir = path.join(homeDir, 'Documents');
  const candidates = [
    path.join(documentsDir, 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
    path.join(documentsDir, 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
  ];

  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

export function resolvePowerShellProfilePath(env = process.env, homeDir = os.homedir()) {
  const profiles = resolvePowerShellProfilePaths(env, homeDir);
  const existing = profiles.find((candidate) => fs.existsSync(candidate));
  return existing || profiles[0];
}

export function getAgentsHome(env = process.env, homeDir = os.homedir()) {
  return normalizeHomeDir(env.AGENTS_HOME, path.join(homeDir, '.agents'), homeDir);
}
