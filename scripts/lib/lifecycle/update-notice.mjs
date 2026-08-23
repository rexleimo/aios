/**
 * AIOS version compatibility and update notice.
 *
 * Detects whether a compatible AIOS update exists and produces a
 * deduplicated, policy-gated notice. It NEVER installs anything:
 * "update_allowed" only means the policy permits entering the update
 * flow — actual installation still requires an explicit user command
 * or separate approval.
 *
 * States:
 *   up_to_date | update_available | update_allowed
 *   update_blocked | update_incompatible | update_check_failed
 *
 * Design rules:
 * - The latest-version lookup is injected (fetchLatest) so tests are
 *   deterministic and network failure degrades gracefully to
 *   update_check_failed without blocking the main workflow.
 * - Notice state is persisted so the same version is announced once;
 *   a new version re-notifies; security updates override dismissal.
 * - Dirty worktree / active task -> notice only, never execute update.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveMemoRoot } from '../aios/state-root.mjs';
import { atomicWriteText } from '../memo/storage/fs-io.mjs';

const NOTICE_STATE_FILE = 'update-notice.json';
const CHANNELS = new Set(['stable', 'beta', 'dev']);

export const UPDATE_STATES = Object.freeze({
  UP_TO_DATE: 'up_to_date',
  AVAILABLE: 'update_available',
  ALLOWED: 'update_allowed',
  BLOCKED: 'update_blocked',
  INCOMPATIBLE: 'update_incompatible',
  CHECK_FAILED: 'update_check_failed',
});

const DEFAULT_POLICY = Object.freeze({
  channel: 'stable',
  patch: 'notify',          // notify | notify_auto_install
  minor: 'notify_confirm',  // notify | notify_confirm
  major: 'notify_only',     // notify_only
  betaOptIn: false,         // beta/dev only noticed when channel opted in
  noticeCooldownHours: 24,
});

function noticeStatePath(rootDir, env = process.env) {
  return path.join(resolveMemoRoot(rootDir, { env }), 'update', NOTICE_STATE_FILE);
}

/**
 * Read persisted notice state (last notified/dismissed versions).
 */
export async function readNoticeState(rootDir, env = process.env) {
  try {
    return JSON.parse(await fs.readFile(noticeStatePath(rootDir, env), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { notifiedVersion: null, dismissedVersion: null, lastNotifiedAt: null, lastCheckAt: null };
    }
    throw error;
  }
}

async function writeNoticeState(rootDir, state, env = process.env) {
  const target = noticeStatePath(rootDir, env);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await atomicWriteText(target, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

/**
 * Read the current AIOS version from the VERSION file.
 */
export async function readCurrentVersion(aiosRoot, env = process.env) {
  const candidates = [
    path.join(aiosRoot, 'VERSION'),
    path.join(aiosRoot, '..', 'VERSION'),
  ];
  for (const file of candidates) {
    try {
      const raw = (await fs.readFile(file, 'utf8')).trim();
      if (/^\d+\.\d+\.\d+/u.test(raw)) return raw;
    } catch {
      // try next
    }
  }
  return '';
}

/**
 * Parse a semver string into { major, minor, patch, prerelease }.
 * Returns null when the string is not a valid semver.
 */
export function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/u.exec(String(version || '').trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  };
}

/**
 * Compare two semver objects.
 * Returns 'major' | 'minor' | 'patch' | 'equal' | 'older' describing
 * how `latest` relates to `current`.
 */
export function compareSemver(current, latest) {
  const c = parseSemver(current);
  const l = parseSemver(latest);
  if (!c || !l) return 'invalid';

  if (l.major > c.major) return 'major';
  if (l.major < c.major) return 'older';
  if (l.minor > c.minor) return 'minor';
  if (l.minor < c.minor) return 'older';
  if (l.patch > c.patch) return 'patch';
  if (l.patch < c.patch) return 'older';

  // Same x.y.z: a current prerelease is older than the release
  if (c.prerelease && !l.prerelease) return 'patch';
  return 'equal';
}

/**
 * Determine whether the version belongs to a non-stable channel.
 */
export function versionChannel(version) {
  const parsed = parseSemver(version);
  if (!parsed) return 'stable';
  const pre = parsed.prerelease.toLowerCase();
  if (pre.startsWith('beta')) return 'beta';
  if (pre.startsWith('dev') || pre.startsWith('alpha')) return 'dev';
  return 'stable';
}

/**
 * Decide the update policy action for a given bump kind and policy.
 *
 * Returns one of:
 *   'auto_install_eligible' - policy allows unattended install (patch only)
 *   'confirm'               - notice + explicit user confirmation needed
 *   'notify_only'           - notice only, never install
 */
export function resolveUpdateAction(bumpKind, policy = DEFAULT_POLICY) {
  if (bumpKind === 'major') return 'notify_only';
  if (bumpKind === 'minor') {
    return policy.minor === 'notify' ? 'notify_only' : 'confirm';
  }
  if (bumpKind === 'patch') {
    return policy.patch === 'notify_auto_install' ? 'auto_install_eligible' : 'notify_only';
  }
  return 'notify_only';
}

/**
 * Check for updates and produce the notice decision.
 *
 * @param {Object} options
 * @param {string} options.aiosRoot - AIOS installation root (has VERSION file)
 * @param {string} options.rootDir - Workspace root for persisted notice state
 * @param {Function} [options.fetchLatest] - async () => ({ version, security }) lookup; injectable
 * @param {Object} [options.policy] - override DEFAULT_POLICY
 * @param {Object} [options.workspace] - { dirty, activeTask } blockers
 * @param {boolean} [options.recordNotice] - persist notice state (default true)
 * @param {Date} [options.now] - clock injection for tests
 * @returns {Object} Notice decision
 */
export async function checkForUpdate({
  aiosRoot,
  rootDir,
  fetchLatest,
  policy = DEFAULT_POLICY,
  workspace = { dirty: false, activeTask: false },
  recordNotice = true,
  env = process.env,
  now = new Date(),
} = {}) {
  if (!aiosRoot) throw new Error('checkForUpdate requires aiosRoot');
  if (!rootDir) throw new Error('checkForUpdate requires rootDir');

  const currentVersion = await readCurrentVersion(aiosRoot, env);
  const state = await readNoticeState(rootDir, env);
  const base = {
    schemaVersion: 1,
    kind: 'aios-update-notice',
    currentVersion,
    latestVersion: null,
    channel: policy.channel || 'stable',
    bumpKind: null,
    status: UPDATE_STATES.UP_TO_DATE,
    action: 'none',
    security: false,
    shouldNotify: false,
    reason: '',
    checkedAt: now.toISOString(),
  };

  if (!currentVersion) {
    return { ...base, status: UPDATE_STATES.CHECK_FAILED, reason: 'current version unknown' };
  }

  // Fetch latest version; any failure degrades gracefully
  let latest;
  try {
    latest = typeof fetchLatest === 'function' ? await fetchLatest({ channel: base.channel }) : null;
  } catch (error) {
    return {
      ...base,
      status: UPDATE_STATES.CHECK_FAILED,
      reason: `update check failed: ${error.message}`,
    };
  }
  if (!latest || !latest.version) {
    return { ...base, status: UPDATE_STATES.CHECK_FAILED, reason: 'no latest version information' };
  }

  const latestVersion = String(latest.version).replace(/^v/u, '');
  const security = Boolean(latest.security);
  const bumpKind = compareSemver(currentVersion, latestVersion);
  const latestChannel = versionChannel(latestVersion);

  if (bumpKind === 'invalid') {
    return { ...base, latestVersion, status: UPDATE_STATES.CHECK_FAILED, reason: `unparseable latest version: ${latestVersion}` };
  }
  if (bumpKind === 'equal') {
    return { ...base, latestVersion, status: UPDATE_STATES.UP_TO_DATE, reason: 'already on the latest version' };
  }
  if (bumpKind === 'older') {
    return {
      ...base,
      latestVersion,
      status: UPDATE_STATES.INCOMPATIBLE,
      reason: `local version ${currentVersion} is newer than channel latest ${latestVersion}; check channel config`,
    };
  }

  // Non-stable channel gating
  if (latestChannel !== 'stable' && !(policy.betaOptIn && policy.channel === latestChannel)) {
    return {
      ...base,
      latestVersion,
      status: UPDATE_STATES.BLOCKED,
      reason: `latest is a ${latestChannel} build; opt in with channel=${latestChannel} to receive notices`,
    };
  }

  const action = resolveUpdateAction(bumpKind, policy);

  // Blockers force notice-only even when auto-install would be eligible
  const blockers = [];
  if (workspace.dirty) blockers.push('uncommitted changes in worktree');
  if (workspace.activeTask) blockers.push('an agent task is running');

  let status = UPDATE_STATES.ALLOWED;
  let finalAction = action;
  if (blockers.length > 0 && action === 'auto_install_eligible') {
    finalAction = 'notify_only';
    status = UPDATE_STATES.BLOCKED;
  }

  // Deduplication: same version notified recently -> suppress unless security
  const alreadyNotified = state.notifiedVersion === latestVersion;
  const dismissed = state.dismissedVersion === latestVersion;
  const cooldownMs = (policy.noticeCooldownHours ?? 24) * 60 * 60 * 1000;
  const withinCooldown = state.lastNotifiedAt
    ? (now.getTime() - new Date(state.lastNotifiedAt).getTime()) < cooldownMs
    : false;
  const suppressed = !security && (dismissed || (alreadyNotified && withinCooldown));

  const result = {
    ...base,
    latestVersion,
    bumpKind,
    security,
    status: suppressed ? UPDATE_STATES.AVAILABLE : status,
    action: suppressed ? 'none' : finalAction,
    shouldNotify: !suppressed,
    reason: suppressed
      ? (dismissed ? 'this version was dismissed previously' : 'already notified within cooldown')
      : `${bumpKind} update ${currentVersion} -> ${latestVersion}${security ? ' (security)' : ''}${blockers.length ? `; blocked: ${blockers.join(', ')}` : ''}`,
    blockers,
    notifiedVersion: state.notifiedVersion,
    dismissedVersion: state.dismissedVersion,
  };

  if (recordNotice && !suppressed) {
    await writeNoticeState(rootDir, {
      ...state,
      notifiedVersion: latestVersion,
      lastNotifiedAt: now.toISOString(),
      lastCheckAt: now.toISOString(),
    }, env);
  } else if (recordNotice) {
    await writeNoticeState(rootDir, { ...state, lastCheckAt: now.toISOString() }, env);
  }

  return result;
}

/**
 * Dismiss the notice for a specific version (security updates re-notify anyway).
 */
export async function dismissUpdateNotice(rootDir, version, env = process.env) {
  const state = await readNoticeState(rootDir, env);
  state.dismissedVersion = String(version || '').replace(/^v/u, '');
  state.dismissedAt = new Date().toISOString();
  return writeNoticeState(rootDir, state, env);
}

/**
 * Render a human-readable notice line for terminal output.
 */
export function renderUpdateNotice(notice) {
  if (!notice || !notice.shouldNotify) return '';
  const policyLabel = notice.action === 'auto_install_eligible'
    ? 'allowed (patch, auto-install eligible)'
    : notice.action === 'confirm'
      ? 'requires confirmation'
      : 'notice only';
  const securityTag = notice.security ? ' [SECURITY]' : '';
  return [
    `AIOS update available: ${notice.currentVersion} -> ${notice.latestVersion}${securityTag}`,
    `Policy: ${policyLabel}`,
    `Run \`aios update --check\` for details.`,
  ].join('\n');
}

export { DEFAULT_POLICY };
