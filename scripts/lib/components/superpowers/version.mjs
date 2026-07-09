/**
 * Superpowers version policy for AIOS always-on planning.
 * v6.1+ includes lean using-superpowers bootstrap and Codex packaging fixes.
 */

import fs from 'node:fs';
import path from 'node:path';

import { captureCommand } from '../../platform/process.mjs';

/** Minimum recommended release for always-on planning + multi-client projection. */
export const MIN_SUPERPOWERS_VERSION = '6.1.0';

/**
 * Parse "v6.1.1" / "6.1.1" / "v6.1.1-2-gabc" → { major, minor, patch } or null.
 */
export function parseSemver(raw = '') {
  const text = String(raw || '').trim();
  const match = text.match(/v?(\d+)\.(\d+)\.(\d+)/i);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function formatSemver(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/**
 * @returns {-1|0|1|null} null if either side unparsable
 */
export function compareSemver(left, right) {
  const a = typeof left === 'string' ? parseSemver(left) : left;
  const b = typeof right === 'string' ? parseSemver(right) : right;
  if (!a || !b) return null;
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

export function isVersionAtLeast(raw, minimum = MIN_SUPERPOWERS_VERSION) {
  const cmp = compareSemver(raw, minimum);
  return cmp === 0 || cmp === 1;
}

/**
 * Read installed superpowers version from a git checkout.
 */
export function readSuperpowersVersion(superpowersDir, { fsModule = fs } = {}) {
  const base = {
    minimum: MIN_SUPERPOWERS_VERSION,
  };
  if (!superpowersDir) {
    return { ...base, version: null, source: 'missing-dir', raw: '', outdated: true };
  }

  const described = captureCommand('git', ['-C', superpowersDir, 'describe', '--tags', '--always']);
  if (described.status === 0 && described.stdout.trim()) {
    const raw = described.stdout.trim();
    const parsed = parseSemver(raw);
    return {
      ...base,
      version: parsed ? formatSemver(parsed) : null,
      source: 'git-describe',
      raw,
      outdated: parsed ? !isVersionAtLeast(parsed) : true,
    };
  }

  try {
    const pkgFile = path.join(superpowersDir, 'package.json');
    if (fsModule.existsSync(pkgFile)) {
      const pkg = JSON.parse(fsModule.readFileSync(pkgFile, 'utf8'));
      const raw = String(pkg.version || '');
      const parsed = parseSemver(raw);
      return {
        ...base,
        version: parsed ? formatSemver(parsed) : null,
        source: 'package.json',
        raw,
        outdated: parsed ? !isVersionAtLeast(parsed) : true,
      };
    }
  } catch {
    // ignore
  }

  return { ...base, version: null, source: 'unknown', raw: '', outdated: true };
}

/**
 * Attempt ff-only pull when origin is configured. Never throws.
 */
export function tryPullSuperpowers(superpowersDir, { io = console } = {}) {
  if (!superpowersDir) {
    return { pulled: false, reason: 'missing-dir' };
  }
  const remote = captureCommand('git', ['-C', superpowersDir, 'config', '--get', 'remote.origin.url']);
  if (remote.status !== 0 || !remote.stdout.trim()) {
    io.log?.('[note] superpowers has no origin remote; skip pull');
    return { pulled: false, reason: 'no-origin' };
  }
  const pull = captureCommand('git', ['-C', superpowersDir, 'pull', '--ff-only']);
  if (pull.status !== 0) {
    const detail = (pull.stderr || pull.stdout || '').trim().slice(0, 300);
    io.log?.(`[warn] superpowers git pull --ff-only failed${detail ? `: ${detail}` : ''}`);
    io.log?.('       Fix network/auth or run: node scripts/aios.mjs internal superpowers update --client all');
    return { pulled: false, reason: 'pull-failed', detail };
  }
  io.log?.(`[ok] superpowers updated via git pull --ff-only (${remote.stdout.trim()})`);
  return { pulled: true, reason: 'ok' };
}
