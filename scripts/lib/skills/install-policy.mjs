/**
 * Operator install policy for skills
 *
 * Pure functions — no side effects beyond reading the policy file. Reads
 * `.aios/skill-install-policy.json` from the project root and decides
 * whether a given skill name is allowed to be installed/applied.
 *
 * Policy schema (globs use simple `star` and `?`, no `star-star` or braces):
 *   allow:             e.g. skill-sources/<star>, superpowers/<star>
 *   deny:              e.g. <star>/experimental-<star>
 *   requireProvenance: boolean
 *   version:           number
 *
 * Decision order:
 *   1. Deny patterns are checked first — a match forbids installation.
 *   2. Allow patterns are checked next — a match permits installation.
 *   3. If no allow patterns match, installation is denied by default
 *      (deny-by-default when an explicit allow list is present).
 *   4. If `requireProvenance` is true, the caller must supply `provenance`
 *      metadata or installation is denied regardless of name matching.
 */
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default permissive policy used when no policy file is present. */
export const DEFAULT_POLICY = Object.freeze({
  allow: ['skill-sources/*', 'superpowers/*'],
  deny: [],
  requireProvenance: false,
  version: 1,
});

/** Policy file name relative to the project root (.aios/). */
export const POLICY_REL_PATH = path.join('.aios', 'skill-install-policy.json');

// ---------------------------------------------------------------------------
// Glob matching
// ---------------------------------------------------------------------------

/**
 * Convert a simple glob pattern (supporting `*` and `?`, no `**` and no brace
 * expansion) into a RegExp anchored to the whole string.
 *
 * @param {string} pattern
 * @returns {RegExp}
 */
export function globToRegExp(pattern) {
  const escaped = String(pattern).split('').map((ch) => {
    if (ch === '*') return '[^/]*';
    if (ch === '?') return '[^/]';
    // Escape regex metacharacters
    return /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
  }).join('');
  return new RegExp(`^${escaped}$`);
}

/**
 * Match a string against a simple glob pattern (`*` and `?` only).
 *
 * @param {string} pattern
 * @param {string} str
 * @returns {boolean}
 */
export function matchGlob(pattern, str) {
  if (typeof pattern !== 'string' || typeof str !== 'string') return false;
  return globToRegExp(pattern).test(str);
}

/**
 * Test whether `str` matches ANY of the provided glob patterns.
 *
 * @param {string[]} patterns
 * @param {string} str
 * @returns {boolean}
 */
function matchesAny(patterns, str) {
  if (!Array.isArray(patterns)) return false;
  return patterns.some((p) => matchGlob(p, str));
}

// ---------------------------------------------------------------------------
// Policy reading
// ---------------------------------------------------------------------------

/**
 * Resolve the absolute path to the policy file for a given project root.
 *
 * @param {string} rootDir
 * @returns {string}
 */
export function policyFilePath(rootDir) {
  return path.join(rootDir, POLICY_REL_PATH);
}

/**
 * Read `.aios/skill-install-policy.json`, returning the default permissive
 * policy when the file is missing or unparseable.
 *
 * @param {string} rootDir
 * @returns {object} policy object (always has allow/deny/requireProvenance/version)
 */
export function readInstallPolicy(rootDir) {
  const policyFile = policyFilePath(rootDir);
  if (!fs.existsSync(policyFile)) {
    return { ...DEFAULT_POLICY, allow: [...DEFAULT_POLICY.allow], deny: [...DEFAULT_POLICY.deny] };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
  } catch {
    // Corrupt policy — fall back to defaults so a bad file can't brick the CLI.
    return { ...DEFAULT_POLICY, allow: [...DEFAULT_POLICY.allow], deny: [...DEFAULT_POLICY.deny] };
  }
  return normalizePolicy(parsed);
}

/**
 * Coerce a raw parsed object into a well-formed policy with all fields.
 *
 * @param {object} raw
 * @returns {object}
 */
export function normalizePolicy(raw = {}) {
  const allow = Array.isArray(raw.allow) ? raw.allow.filter((p) => typeof p === 'string') : [];
  const deny = Array.isArray(raw.deny) ? raw.deny.filter((p) => typeof p === 'string') : [];
  const requireProvenance = Boolean(raw.requireProvenance);
  const version = typeof raw.version === 'number' ? raw.version : 1;
  return { allow, deny, requireProvenance, version };
}

// ---------------------------------------------------------------------------
// Policy decisions
// ---------------------------------------------------------------------------

/**
 * Decide whether a skill may be installed under the given policy.
 *
 * @param {string} skillName
 * @param {object} policy
 * @param {object} [opts]
 * @param {boolean} [opts.hasProvenance] — whether the proposal carries provenance metadata
 * @returns {{ allowed: boolean, reason: string }}
 */
export function checkPolicy(skillName, policy = DEFAULT_POLICY, opts = {}) {
  if (typeof skillName !== 'string' || skillName.length === 0) {
    return { allowed: false, reason: 'skill name is empty' };
  }

  const normalized = normalizePolicy(policy);

  // 1. Deny list wins — explicit deny always blocks.
  if (matchesAny(normalized.deny, skillName)) {
    return {
      allowed: false,
      reason: `skill "${skillName}" matches a deny pattern in the install policy`,
    };
  }

  // 2. Allow list — must match at least one allow pattern when an allow list is present.
  if (normalized.allow.length > 0 && !matchesAny(normalized.allow, skillName)) {
    return {
      allowed: false,
      reason: `skill "${skillName}" does not match any allow pattern in the install policy`,
    };
  }

  // 3. Provenance requirement.
  if (normalized.requireProvenance && !opts.hasProvenance) {
    return {
      allowed: false,
      reason: `install policy requires provenance metadata for skill "${skillName}" but none was provided`,
    };
  }

  return { allowed: true, reason: 'allowed by install policy' };
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

/**
 * Build the standard denial error used by the skill workshop when a proposal
 * is blocked by policy. Includes a remediation hint.
 *
 * @param {string} skillName
 * @param {string} reason
 * @returns {Error}
 */
export function policyDenialError(skillName, reason) {
  const err = new Error(
    `[policy] skill "${skillName}" cannot be applied: ${reason}. ` +
      `Use \`aios skill propose\` to submit it for operator review, ` +
      `or edit \`.aios/skill-install-policy.json\` to adjust the allow/deny lists.`,
  );
  err.code = 'AIOS_POLICY_DENIED';
  err.skillName = skillName;
  return err;
}
