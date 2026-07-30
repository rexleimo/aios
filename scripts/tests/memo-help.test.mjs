import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { parseArgs } from '../lib/cli/parse-args.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const aiosCli = path.join(repoRoot, 'scripts', 'aios.mjs');

function runAios(args) {
  return spawnSync(process.execPath, [aiosCli, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function assertHelp(args) {
  const result = runAios(args);
  assert.equal(result.status, 0, `${args.join(' ')} exited with stderr:\n${result.stderr}`);
  assert.equal(result.stderr, '');
  assert.notEqual(result.stdout.trim(), '');
  return result.stdout;
}

function assertNoHiddenStorageTerms(stdout) {
  const hiddenTerms = [
    /\baios memory\b/i,
    /\bdriver\b/i,
    /\bshare\b/i,
    /\bfile-stream\b/i,
    /\brefresh\b/i,
    /\bspace list\b/i,
    /\bmemo list\b/i,
    /\blist \[--limit N\]/,
  ];
  for (const term of hiddenTerms) {
    assert.doesNotMatch(stdout, term);
  }
}

test('parseArgs preserves memo help path tokens for nested help routing', () => {
  const parsed = parseArgs(['memo', 'storage', 'status', '--help']);
  assert.equal(parsed.mode, 'help');
  assert.equal(parsed.command, 'memo');
  assert.deepEqual(parsed.options.argv, ['storage', 'status']);
});

test('memo help exposes approved storage entry and hides compatibility commands', () => {
  const stdout = assertHelp(['memo', '--help']);
  assert.match(stdout, /Usage:\n\s+node scripts\/aios\.mjs memo <subcommand> \[options\]/);
  assert.match(stdout, /\bstorage\b/);
  assertNoHiddenStorageTerms(stdout);
});

test('memo storage help lists approved storage commands', () => {
  const stdout = assertHelp(['memo', 'storage', '--help']);
  assert.match(stdout, /Usage:\n\s+node scripts\/aios\.mjs memo storage <subcommand>/);
  assert.match(stdout, /\bstatus\b/);
  assert.match(stdout, /\buse split\b/);
  assert.match(stdout, /\buse file\b/);
  assert.match(stdout, /\brebuild\b/);
  assert.match(stdout, /\bdoctor\b/);
  assert.match(stdout, /\brepair-locks\b/);
  assertNoHiddenStorageTerms(stdout);
});

test('memo storage status help prints status-specific usage', () => {
  const stdout = assertHelp(['memo', 'storage', 'status', '--help']);
  assert.match(stdout, /Usage:\n\s+node scripts\/aios\.mjs memo storage status/);
  assert.match(stdout, /Show active memo storage/);
});

test('memo storage use help prints use-specific usage', () => {
  const stdout = assertHelp(['memo', 'storage', 'use', '--help']);
  assert.match(stdout, /Usage:\n\s+node scripts\/aios\.mjs memo storage use <split\|file>/);
  assert.match(stdout, /Switch active memo storage/);
});

test('memo storage rebuild help prints full-rebuild usage', () => {
  const stdout = assertHelp(['memo', 'storage', 'rebuild', '--help']);
  assert.match(stdout, /Usage:\n\s+node scripts\/aios\.mjs memo storage rebuild/);
  assert.match(stdout, /full rebuild/i);
  assert.match(stdout, /without rewriting canonical memo records/i);
  assertNoHiddenStorageTerms(stdout);
});

test('memo storage doctor help prints doctor-specific usage', () => {
  const stdout = assertHelp(['memo', 'storage', 'doctor', '--help']);
  assert.match(stdout, /Usage:\n\s+node scripts\/aios\.mjs memo storage doctor/);
  assert.match(stdout, /Check memo storage health/);
});

test('memo storage repair-locks help explains its safe recovery boundary', () => {
  const stdout = assertHelp(['memo', 'storage', 'repair-locks', '--help']);
  assert.match(stdout, /Usage:\n\s+node scripts\/aios\.mjs memo storage repair-locks/);
  assert.match(stdout, /Quarantine memo locks/);
  assert.match(stdout, /Live or malformed locks remain untouched/);
});
