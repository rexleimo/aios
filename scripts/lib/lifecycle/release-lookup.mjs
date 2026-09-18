// 中文注释：GitHub 的 releases/latest 端点按"创建时间"返回最新 release，而不是按
// semver。补发旧版本（如 v5.16.2 晚于 v5.17.0 发布）会抢占 latest，导致
// `aios update` 拉到更低版本并降级安装。本模块统一改为：列出 stable releases，
// 按 semver 取最大值，并让调用方按精确 tag 拉取资产。
import { compareSemver, parseSemver } from './update-notice.mjs';

const DEFAULT_REPO = 'rexleimo/aios';

/**
 * Fetch non-draft, non-prerelease releases for a repo.
 *
 * @param {Object} [options]
 * @param {string} [options.repo] - GitHub "owner/repo"
 * @param {Function} [options.fetchImpl] - injectable fetch
 * @param {number} [options.perPage]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<Array<{tag: string, version: string, security: boolean}>>}
 */
export async function fetchStableReleases({
  repo = DEFAULT_REPO,
  fetchImpl = globalThis.fetch,
  perPage = 30,
  timeoutMs = 8000,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('release lookup requires fetch');
  }
  const response = await fetchImpl(
    `https://api.github.com/repos/${repo}/releases?per_page=${perPage}`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'aios-release-lookup',
      },
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  if (!response.ok) throw new Error(`GitHub release lookup returned HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload)) return [];
  return payload
    .filter((release) => release && !release.draft && !release.prerelease)
    .map((release) => ({
      tag: String(release.tag_name || '').trim(),
      version: String(release.tag_name || '').replace(/^v/u, '').trim(),
      security: Boolean(release.security_advisory || release.security),
    }))
    .filter((release) => release.tag && parseSemver(release.version));
}

/**
 * Pick the highest-semver release from a release list (NOT GitHub's
 * creation-ordered "latest" pointer).
 *
 * @param {Array<{tag: string, version: string, security: boolean}>} releases
 * @returns {{tag: string, version: string, security: boolean}|null}
 */
export function pickNewestStableRelease(releases) {
  let newest = null;
  for (const release of Array.isArray(releases) ? releases : []) {
    if (!newest) {
      newest = release;
      continue;
    }
    // compareSemver(current, latest): 'major' | 'minor' | 'patch' mean latest > current.
    const cmp = compareSemver(newest.version, release.version);
    if (cmp === 'major' || cmp === 'minor' || cmp === 'patch') newest = release;
  }
  return newest;
}

/**
 * Resolve the newest stable release for a repo in one shot.
 *
 * @param {Object} [options] - same as fetchStableReleases
 * @returns {Promise<{tag: string, version: string, security: boolean}|null>}
 */
export async function resolveNewestStableRelease(options = {}) {
  const releases = await fetchStableReleases(options);
  return pickNewestStableRelease(releases);
}
