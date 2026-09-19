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

// Qoder 有两个发行版家目录：国际版 ~/.qoder，CN 版 ~/.qoder-cn。判据必须是产品自己写的
// 标记，不能是"目录存在"——AIOS 误写 ~/.qoder 后只剩它自己的 settings.json 和 skills/，
// 用存在性判断会让错家目录永远自证为已安装。
const QODER_HOME_MARKERS = Object.freeze([
  '.qoder-app-status.json',
  path.join('entry', 'qodercn.cmd'),
  path.join('plugins', 'installed_plugins_v2.json'),
]);

export function resolveQoderHome({
  env = process.env,
  homeDir = os.homedir(),
  exists = (target) => fs.existsSync(target),
} = {}) {
  const fromEnv = normalizeHomeDir(env.QODER_HOME, '', homeDir);
  if (fromEnv) return fromEnv;
  const candidates = [path.join(homeDir, '.qoder-cn'), path.join(homeDir, '.qoder')];
  const installed = candidates.find((home) => (
    QODER_HOME_MARKERS.some((marker) => exists(path.join(home, marker)))
  ));
  // 两个都没标记时按国际版默认，保持未安装机器上的既有行为不变。
  return installed || candidates[1];
}

export function getClientHomes(env = process.env, homeDir = os.homedir()) {
  const xdgConfigHome = resolveXdgConfigHome(env, homeDir);
  return {
    codex: normalizeHomeDir(env.CODEX_HOME, path.join(homeDir, '.codex'), homeDir),
    claude: normalizeHomeDir(env.CLAUDE_HOME, path.join(homeDir, '.claude'), homeDir),
    gemini: normalizeHomeDir(env.GEMINI_HOME, path.join(homeDir, '.gemini'), homeDir),
    opencode: normalizeHomeDir(env.OPENCODE_HOME, path.join(xdgConfigHome, 'opencode'), homeDir),
    hermes: normalizeHomeDir(env.HERMES_HOME, path.join(homeDir, '.hermes'), homeDir),
    grok: normalizeHomeDir(env.GROK_HOME, path.join(homeDir, '.grok'), homeDir),
    workbuddy: normalizeHomeDir(env.WORKBUDDY_HOME, path.join(homeDir, '.workbuddy'), homeDir),
    pi: normalizeHomeDir(env.PI_CODING_AGENT_DIR, path.join(homeDir, '.pi', 'agent'), homeDir),
    zcode: normalizeHomeDir(env.ZCODE_HOME, path.join(homeDir, '.zcode'), homeDir),
    // Qoder CLI home: edition-aware — CN 发行版用 ~/.qoder-cn，国际版用 ~/.qoder。
    qoder: resolveQoderHome({ env, homeDir }),
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
