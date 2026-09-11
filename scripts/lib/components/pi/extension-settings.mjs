// scripts/lib/components/pi/extension-settings.mjs — Pi extension registration.
// Pi discovers extensions from settings.json `extensions` path arrays
// (global ~/.pi/agent/settings.json, project .pi/settings.json).
// AIOS init points Pi at the bundled extension entry so `aios init
// --agent pi` governs the plugin surface instead of leaving it manual.
import fs from 'node:fs';
import path from 'node:path';

export function resolvePiSettingsPath(piHome) {
  return path.join(piHome, 'settings.json');
}

export function resolveBundledPiExtensionPath(aiosRoot) {
  return path.join(aiosRoot, 'packages', 'aios-pi', 'extensions', 'aios.ts');
}

function readSettingsObject(settingsPath) {
  let raw;
  try {
    raw = fs.readFileSync(settingsPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`invalid Pi settings JSON (refusing to clobber): ${settingsPath}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`invalid Pi settings shape (refusing to clobber): ${settingsPath}`);
  }
  return parsed;
}

function normalizedExtensions(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '')) : [];
}

// Idempotent: adds extensionPath to settings.json `extensions` unless present.
// Never touches other keys. dryRun previews without writing.
export function ensurePiExtensionRegistered({ settingsPath, extensionPath, dryRun = false, io = null } = {}) {
  if (!settingsPath || !extensionPath) {
    throw new Error('ensurePiExtensionRegistered requires settingsPath and extensionPath');
  }
  const current = readSettingsObject(settingsPath);
  const extensions = normalizedExtensions(current.extensions);
  if (extensions.includes(extensionPath)) {
    return { settingsPath, action: 'present', extensions };
  }
  const next = [...extensions, extensionPath];
  if (dryRun) {
    io?.log?.(`[plan] would register Pi extension in ${settingsPath}`);
    return { settingsPath, action: 'would-add', extensions: next };
  }
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify({ ...current, extensions: next }, null, 2)}\n`, 'utf8');
  return { settingsPath, action: 'added', extensions: next };
}
