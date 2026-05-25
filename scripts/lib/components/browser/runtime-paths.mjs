import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BROWSER_USE_PROJECT_DIR_NAME,
  BROWSER_USE_REPO_DIR_NAME,
  DEFAULT_CDP_SERVICE_PORT,
} from './constants.mjs';
import { commandExists as defaultCommandExists } from '../../platform/process.mjs';

export function resolveLauncherScript(rootDir, platform = process.platform) {
  if (platform === 'win32') {
    return path.join(rootDir, 'scripts', 'run-browser-use-mcp.ps1');
  }
  return path.join(rootDir, 'scripts', 'run-browser-use-mcp.sh');
}

export function resolveShellCommand(platform = process.platform, runtime = {}) {
  if (platform !== 'win32') return 'bash';

  const exists = typeof runtime.commandExists === 'function'
    ? runtime.commandExists
    : (command) => defaultCommandExists(command, { platform });
  if (exists('pwsh')) return 'pwsh';
  if (exists('powershell')) return 'powershell';
  return 'pwsh';
}

export function resolvePythonCommand(platform = process.platform) {
  return platform === 'win32' ? 'python' : 'python3';
}

export function resolveVenvPythonPath(projectDir, platform = process.platform) {
  if (platform === 'win32') {
    return path.join(projectDir, '.venv', 'Scripts', 'python.exe');
  }
  return path.join(projectDir, '.venv', 'bin', 'python');
}

export function normalizeCdpPort(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CDP_SERVICE_PORT;
}

export function resolveDefaultCdpPort(rootDir) {
  const profileConfig = path.join(rootDir, 'config', 'browser-profiles.json');
  if (!fs.existsSync(profileConfig)) return DEFAULT_CDP_SERVICE_PORT;

  try {
    const parsed = JSON.parse(fs.readFileSync(profileConfig, 'utf8'));
    return normalizeCdpPort(parsed?.profiles?.default?.cdpPort);
  } catch {
    return DEFAULT_CDP_SERVICE_PORT;
  }
}

export function resolveDefaultCdpUrl(rootDir) {
  const profileConfig = path.join(rootDir, 'config', 'browser-profiles.json');
  if (!fs.existsSync(profileConfig)) {
    return `http://127.0.0.1:${DEFAULT_CDP_SERVICE_PORT}`;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(profileConfig, 'utf8'));
    const defaultProfile = parsed?.profiles?.default ?? {};
    const cdpUrl = String(defaultProfile.cdpUrl || '').trim();
    if (cdpUrl) return cdpUrl;
    const cdpPort = normalizeCdpPort(defaultProfile.cdpPort);
    return `http://127.0.0.1:${cdpPort}`;
  } catch {
    return `http://127.0.0.1:${DEFAULT_CDP_SERVICE_PORT}`;
  }
}

export function resolveUserPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw === '~') return os.homedir();
  if (raw.startsWith('~/') || raw.startsWith('~\\')) {
    return path.join(os.homedir(), raw.slice(2));
  }
  return path.resolve(raw);
}

export function uniquePaths(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const resolved = resolveUserPath(value);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

export function resolveBrowserUseRepoRoot(candidate) {
  const resolved = resolveUserPath(candidate);
  if (!resolved) return '';

  const absCandidate = path.resolve(resolved);
  if (fs.existsSync(path.join(absCandidate, BROWSER_USE_PROJECT_DIR_NAME, 'pyproject.toml'))) {
    return absCandidate;
  }

  if (
    path.basename(absCandidate) === BROWSER_USE_PROJECT_DIR_NAME &&
    fs.existsSync(path.join(absCandidate, 'pyproject.toml'))
  ) {
    const parent = path.dirname(absCandidate);
    if (fs.existsSync(path.join(parent, BROWSER_USE_PROJECT_DIR_NAME, 'pyproject.toml'))) {
      return parent;
    }
  }

  return '';
}

export function getBrowserUseRepoCandidates(rootDir, env = process.env) {
  return uniquePaths([
    env?.AIOS_BROWSER_USE_REPO,
    path.resolve(rootDir, '..', BROWSER_USE_REPO_DIR_NAME),
    path.resolve(rootDir, BROWSER_USE_REPO_DIR_NAME),
  ]);
}

export function findBrowserUseRepo(rootDir, env = process.env) {
  const candidates = getBrowserUseRepoCandidates(rootDir, env);

  for (const candidate of candidates) {
    const browserUseRepo = resolveBrowserUseRepoRoot(candidate);
    if (browserUseRepo) {
      return browserUseRepo;
    }
  }

  return '';
}

export function describeBrowserUseProjectPath(candidate) {
  const resolved = resolveUserPath(candidate);
  if (!resolved) return '';

  const absCandidate = path.resolve(resolved);
  if (fs.existsSync(path.join(absCandidate, BROWSER_USE_PROJECT_DIR_NAME, 'pyproject.toml'))) {
    return path.join(absCandidate, BROWSER_USE_PROJECT_DIR_NAME);
  }

  if (
    path.basename(absCandidate) === BROWSER_USE_PROJECT_DIR_NAME &&
    fs.existsSync(path.join(absCandidate, 'pyproject.toml'))
  ) {
    return absCandidate;
  }

  return path.join(absCandidate, BROWSER_USE_PROJECT_DIR_NAME);
}

export function isLegacyBrowserUseFallback(value) {
  const normalized = String(value || '').replace(/\\/gu, '/');
  const parts = normalized.split('/').filter(Boolean);
  return (
    parts.length >= 4 &&
    parts.at(-4) === 'Users' &&
    parts.at(-3) === 'molei' &&
    parts.at(-2) === 'codes' &&
    parts.at(-1) === BROWSER_USE_REPO_DIR_NAME
  ) || (
    parts.length >= 5 &&
    parts.at(-5) === 'Users' &&
    parts.at(-4) === 'molei' &&
    parts.at(-3) === 'codes' &&
    parts.at(-2) === BROWSER_USE_REPO_DIR_NAME &&
    parts.at(-1) === BROWSER_USE_PROJECT_DIR_NAME
  );
}

export function formatBrowserUseMissingMessage(rootDir, env = process.env) {
  const candidates = getBrowserUseRepoCandidates(rootDir, env);
  const checked = candidates.length > 0
    ? candidates.map((candidate) => `  - ${describeBrowserUseProjectPath(candidate)}`).join('\n')
    : '  - <none>';
  return (
    'browser-use MCP project not found.\n' +
    'Set AIOS_BROWSER_USE_REPO to your ai-browser-book repository path, or place ai-browser-book next to/in this repo.\n' +
    `Checked:\n${checked}`
  );
}
