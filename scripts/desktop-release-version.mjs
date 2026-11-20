#!/usr/bin/env node
// Desktop release: derive the single source of truth for the version from the
// git tag and stamp it into the three places the Tauri bundler reads. A tag of
// `desktop-v0.0.1` yields `0.0.1`. Fails closed on a malformed tag so a mistyped
// tag can never produce a mis-versioned installer.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
  // The lockfile is not eol-pinned in .gitattributes, so a Windows checkout
  // (core.autocrlf=true) gives CRLF — a literal "\n" match silently fails there
  // while working on macOS/Linux. Match either line ending, and preserve the
  // file's own ending in the replacement.
  const lockPattern = new RegExp(
    `(name = "aios-shell")(\\r?\\n)(version = "${oldConfVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}")`,
  );
  const lockMatch = lock.match(lockPattern);
  if (!lockMatch) {
    throw new Error(`Cargo.lock aios-shell version: expected version ${JSON.stringify(oldConfVersion)}`);
  }
  const lockNext = lock.replace(
    lockPattern,
    `$1$2version = "${version}"`,
  );
  writeFileSync(lockPath, lockNext);

  return { version, oldConfVersion, files: [confPath, cargoPath, lockPath] };
}

// Cross-platform main-module detection: on Windows process.argv[1] is a
// backslash path (D:\...\script.mjs), so string-concatenating `file://` never
// matches import.meta.url (file:///D:/.../script.mjs) and the CLI silently
// no-ops — which left the Windows 0.0.2 installers stamped 0.0.1.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
  const version = versionFromTag(tag);
  const result = stamp(version);
  console.log(`desktop version ${result.oldConfVersion} -> ${result.version} (from tag ${tag})`);
}
