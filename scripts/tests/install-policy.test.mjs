import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  matchGlob,
  globToRegExp,
  readInstallPolicy,
  normalizePolicy,
  checkPolicy,
  policyFilePath,
  policyDenialError,
  DEFAULT_POLICY,
} from '../lib/skills/install-policy.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

// ---------------------------------------------------------------------------
// matchGlob
// ---------------------------------------------------------------------------

test('matchGlob matches literal strings', () => {
  assert.equal(matchGlob('foo', 'foo'), true);
  assert.equal(matchGlob('foo', 'bar'), false);
  assert.equal(matchGlob('foo', 'foobar'), false);
});

test('matchGlob supports trailing * wildcard', () => {
  assert.equal(matchGlob('skill-sources/*', 'skill-sources/my-skill'), true);
  assert.equal(matchGlob('skill-sources/*', 'skill-sources/'), true);
  assert.equal(matchGlob('skill-sources/*', 'other/my-skill'), false);
});

test('matchGlob supports leading * wildcard', () => {
  assert.equal(matchGlob('*/experimental-*', 'foo/experimental-bar'), true);
  assert.equal(matchGlob('*/experimental-*', 'experimental-bar'), false);
});

test('matchGlob supports ? single char', () => {
  assert.equal(matchGlob('skill-?', 'skill-a'), true);
  assert.equal(matchGlob('skill-?', 'skill-ab'), false);
});

test('matchGlob does not cross path separators with *', () => {
  // * is [^/]*, so it must NOT match a slash
  assert.equal(matchGlob('a/*', 'a/b/c'), false);
  assert.equal(matchGlob('a/*', 'a/b'), true);
});

test('matchGlob escapes regex metacharacters in pattern', () => {
  assert.equal(matchGlob('super.power', 'super.power'), true);
  assert.equal(matchGlob('super.power', 'superXpower'), false);
  assert.equal(matchGlob('a+b', 'a+b'), true);
  assert.equal(matchGlob('a+b', 'aXXb'), false);
});

test('matchGlob returns false for non-string inputs', () => {
  assert.equal(matchGlob(null, 'foo'), false);
  assert.equal(matchGlob('foo', null), false);
  assert.equal(matchGlob(undefined, 'foo'), false);
});

test('globToRegExp returns anchored regex', () => {
  const re = globToRegExp('skill-sources/*');
  assert.ok(re instanceof RegExp);
  assert.equal(re.test('skill-sources/x'), true);
  assert.equal(re.test('xskill-sources/x'), false);
});

// ---------------------------------------------------------------------------
// normalizePolicy
// ---------------------------------------------------------------------------

test('normalizePolicy fills missing fields', () => {
  const p = normalizePolicy({});
  assert.deepEqual(p.allow, []);
  assert.deepEqual(p.deny, []);
  assert.equal(p.requireProvenance, false);
  assert.equal(p.version, 1);
});

test('normalizePolicy strips non-string allow/deny entries', () => {
  const p = normalizePolicy({ allow: ['ok', 5, null, 'good'], deny: ['no', true] });
  assert.deepEqual(p.allow, ['ok', 'good']);
  assert.deepEqual(p.deny, ['no']);
});

test('normalizePolicy coerces requireProvenance to boolean', () => {
  assert.equal(normalizePolicy({ requireProvenance: 1 }).requireProvenance, true);
  assert.equal(normalizePolicy({ requireProvenance: 0 }).requireProvenance, false);
  assert.equal(normalizePolicy({ requireProvenance: 'yes' }).requireProvenance, true);
});

test('normalizePolicy preserves numeric version', () => {
  assert.equal(normalizePolicy({ version: 2 }).version, 2);
  assert.equal(normalizePolicy({ version: '2' }).version, 1);
});

// ---------------------------------------------------------------------------
// readInstallPolicy
// ---------------------------------------------------------------------------

test('readInstallPolicy returns defaults when file missing', async () => {
  const rootDir = await makeTemp('aios-policy-missing-');
  const p = readInstallPolicy(rootDir);
  assert.deepEqual(p.allow, DEFAULT_POLICY.allow);
  assert.deepEqual(p.deny, DEFAULT_POLICY.deny);
  assert.equal(p.requireProvenance, DEFAULT_POLICY.requireProvenance);
});

test('readInstallPolicy returns defaults when file is corrupt JSON', async () => {
  const rootDir = await makeTemp('aios-policy-corrupt-');
  await mkdir(path.join(rootDir, '.aios'), { recursive: true });
  await writeFile(policyFilePath(rootDir), '{ not valid json', 'utf8');
  const p = readInstallPolicy(rootDir);
  assert.deepEqual(p.allow, DEFAULT_POLICY.allow);
  assert.equal(p.version, 1);
});

test('readInstallPolicy reads and normalizes a real policy file', async () => {
  const rootDir = await makeTemp('aios-policy-real-');
  await mkdir(path.join(rootDir, '.aios'), { recursive: true });
  await writeFile(
    policyFilePath(rootDir),
    JSON.stringify({
      allow: ['trusted/*'],
      deny: ['*/beta'],
      requireProvenance: true,
      version: 3,
    }),
    'utf8',
  );
  const p = readInstallPolicy(rootDir);
  assert.deepEqual(p.allow, ['trusted/*']);
  assert.deepEqual(p.deny, ['*/beta']);
  assert.equal(p.requireProvenance, true);
  assert.equal(p.version, 3);
});

test('policyFilePath resolves under .aios/', () => {
  assert.equal(policyFilePath('/tmp/foo'), path.join('/tmp/foo', '.aios', 'skill-install-policy.json'));
});

// ---------------------------------------------------------------------------
// checkPolicy
// ---------------------------------------------------------------------------

test('checkPolicy allows when name matches allow list and deny is empty', () => {
  const policy = { allow: ['skill-sources/*'], deny: [] };
  const result = checkPolicy('skill-sources/my-skill', policy);
  assert.equal(result.allowed, true);
});

test('checkPolicy denies when name matches deny list even if allow matches', () => {
  const policy = { allow: ['skill-sources/*'], deny: ['skill-sources/bad-*'] };
  const result = checkPolicy('skill-sources/bad-skill', policy);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /deny pattern/);
});

test('checkPolicy denies when name does not match any allow pattern', () => {
  const policy = { allow: ['skill-sources/*'], deny: [] };
  const result = checkPolicy('other/skill', policy);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /does not match any allow/);
});

test('checkPolicy allows everything when allow list is empty', () => {
  // An empty allow list means "no explicit allow required" = permissive
  const policy = { allow: [], deny: ['bad-*'] };
  assert.equal(checkPolicy('good-skill', policy).allowed, true);
  assert.equal(checkPolicy('bad-skill', policy).allowed, false);
});

test('checkPolicy respects requireProvenance', () => {
  const policy = { allow: ['skill-sources/*'], deny: [], requireProvenance: true };
  // Without provenance
  assert.equal(checkPolicy('skill-sources/x', policy).allowed, false);
  assert.match(checkPolicy('skill-sources/x', policy).reason, /provenance/);
  // With provenance
  assert.equal(checkPolicy('skill-sources/x', policy, { hasProvenance: true }).allowed, true);
});

test('checkPolicy requireProvenance false (default) does not require metadata', () => {
  const policy = { allow: ['skill-sources/*'], deny: [] };
  assert.equal(checkPolicy('skill-sources/x', policy).allowed, true);
});

test('checkPolicy returns false for empty skill name', () => {
  const result = checkPolicy('', { allow: [], deny: [] });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /empty/);
});

test('checkPolicy uses DEFAULT_POLICY when policy arg is omitted', () => {
  // DEFAULT_POLICY allows skill-sources/*
  const result = checkPolicy('skill-sources/anything');
  assert.equal(result.allowed, true);
});

test('checkPolicy deny takes precedence over provenance requirement', () => {
  const policy = { allow: ['*'], deny: ['bad'], requireProvenance: true };
  const result = checkPolicy('bad', policy, { hasProvenance: true });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /deny/);
});

// ---------------------------------------------------------------------------
// policyDenialError
// ---------------------------------------------------------------------------

test('policyDenialError produces an Error with code and skillName', () => {
  const err = policyDenialError('my-skill', 'matches deny pattern');
  assert.ok(err instanceof Error);
  assert.equal(err.code, 'AIOS_POLICY_DENIED');
  assert.equal(err.skillName, 'my-skill');
  assert.match(err.message, /my-skill/);
  assert.match(err.message, /policy/);
  assert.match(err.message, /propose/);
});
