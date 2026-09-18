import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchStableReleases,
  pickNewestStableRelease,
  resolveNewestStableRelease,
} from '../lib/lifecycle/release-lookup.mjs';

function fakeFetch(payload, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fn = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok,
      status,
      json: async () => payload,
    };
  };
  fn.calls = calls;
  return fn;
}

const RELEASE = (tag, extra = {}) => ({ tag_name: tag, draft: false, prerelease: false, ...extra });

test('pickNewestStableRelease: picks max semver, not creation order', () => {
  // GitHub 返回顺序按创建时间：v5.16.2 晚建排在前，但 v5.17.0 才是最新稳定版。
  const releases = [
    { tag: 'v5.16.2', version: '5.16.2', security: false },
    { tag: 'v5.17.0', version: '5.17.0', security: false },
    { tag: 'v5.15.0', version: '5.15.0', security: false },
  ];
  assert.equal(pickNewestStableRelease(releases).tag, 'v5.17.0');
});

test('pickNewestStableRelease: handles major/minor and empty lists', () => {
  const releases = [
    { tag: 'v5.17.0', version: '5.17.0' },
    { tag: 'v10.0.0', version: '10.0.0' },
    { tag: 'v5.9.0', version: '5.9.0' },
  ];
  assert.equal(pickNewestStableRelease(releases).tag, 'v10.0.0');
  assert.equal(pickNewestStableRelease([]), null);
  assert.equal(pickNewestStableRelease(undefined), null);
});

test('fetchStableReleases: filters drafts, prereleases, and non-semver tags', async () => {
  const fetchImpl = fakeFetch([
    RELEASE('v5.16.2'),
    RELEASE('v5.17.0'),
    { tag_name: 'v5.18.0-beta.1', draft: false, prerelease: true },
    { tag_name: 'v5.19.0', draft: true, prerelease: false },
    RELEASE('not-a-version'),
  ]);
  const releases = await fetchStableReleases({ repo: 'rexleimo/aios', fetchImpl });
  assert.deepEqual(releases.map((r) => r.tag), ['v5.16.2', 'v5.17.0']);
  assert.equal(fetchImpl.calls[0].url.includes('/releases?per_page=30'), true);
});

test('fetchStableReleases: propagates HTTP failures', async () => {
  const fetchImpl = fakeFetch([], { ok: false, status: 403 });
  await assert.rejects(
    () => fetchStableReleases({ fetchImpl }),
    /GitHub release lookup returned HTTP 403/u,
  );
});

test('resolveNewestStableRelease: end-to-end selection from API payload', async () => {
  const fetchImpl = fakeFetch([
    RELEASE('v5.16.2', { created_at: '2026-09-18T01:38:47Z' }),
    RELEASE('v5.17.0', { created_at: '2026-09-18T00:26:06Z' }),
    RELEASE('v5.15.0'),
  ]);
  const newest = await resolveNewestStableRelease({ fetchImpl });
  assert.equal(newest.tag, 'v5.17.0');
  assert.equal(newest.version, '5.17.0');
});
