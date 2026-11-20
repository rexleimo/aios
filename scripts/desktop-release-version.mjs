#!/usr/bin/env node
// Desktop release: derive the single source of truth for the version from the
// git tag and stamp it into the three places the Tauri bundler reads. A tag of
// `desktop-v0.0.1` yields `0.0.1`. Fails closed on a malformed tag so a mistyped
// tag can never produce a mis-versioned installer.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const CONF = resolve(ROOT, 'apps/shell/src-tauri/tauri.conf.json');
const CARGO = resolve(ROOT, 'apps/shell/src-tauri/Cargo.toml');
const LOCK = resolve(ROOT, 'apps/shell/src-tauri/Cargo.lock');

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

export function versionFromTag(tag) {
  if (typeof tag !== 'string' || !tag.startsWith('desktop-v')) {
    throw new Error(`expected a desktop-v* tag, got ${JSON.stringify(tag)}`);
  }
  const version = tag.slice('desktop-v'.length);
  if (!SEMVER.test(version)) {
    throw new Error(`tag ${JSON.stringify(tag)} does not encode a semver (got ${JSON.stringify(version)})`);
  }
  return version;
}

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) {
    throw new Error(`${label}: expected to find ${JSON.stringify(from)}`);
  }
  return text.replace(from, to);
}

export function stamp(version, root = ROOT) {
  // Callers may pass an explicit root to stamp an isolated copy (tests); when
  // omitted, ROOT (the real worktree) is used. Passing a non-string root is a
  // programming error and is rejected rather than silently mis-resolving.
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error(`stamp root must be a non-empty path, got ${JSON.stringify(root)}`);
  }
  const confPath = resolve(root, 'apps/shell/src-tauri/tauri.conf.json');
  const cargoPath = resolve(root, 'apps/shell/src-tauri/Cargo.toml');
  const lockPath = resolve(root, 'apps/shell/src-tauri/Cargo.lock');

  const conf = JSON.parse(readFileSync(confPath, 'utf8'));
  const oldConfVersion = conf.version;
  conf.version = version;
  writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n');

  const cargo = readFileSync(cargoPath, 'utf8');
  const cargoNext = replaceOnce(
    cargo,
    `version = "${oldConfVersion}"`,
    `version = "${version}"`,
    'Cargo.toml [package].version',
  );
  writeFileSync(cargoPath, cargoNext);

  const lock = readFileSync(lockPath, 'utf8');
  const lockNext = replaceOnce(
    lock,
    `name = "aios-shell"\nversion = "${oldConfVersion}"`,
    `name = "aios-shell"\nversion = "${version}"`,
    'Cargo.lock aios-shell version',
  );
  writeFileSync(lockPath, lockNext);

  return { version, oldConfVersion, files: [confPath, cargoPath, lockPath] };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
  const version = versionFromTag(tag);
  const result = stamp(version);
  console.log(`desktop version ${result.oldConfVersion} -> ${result.version} (from tag ${tag})`);
}
