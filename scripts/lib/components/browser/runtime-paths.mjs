import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_CDP_SERVICE_PORT,
} from './constants.mjs';

export function resolveLocalBrowserMcpScript(rootDir) {
  return path.join(rootDir, 'scripts', 'run-local-browser-mcp.mjs');
}

export function resolvePythonCommand(platform = process.platform) {
  return platform === 'win32' ? 'python' : 'python3';
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

