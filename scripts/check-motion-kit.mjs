#!/usr/bin/env node
// Answers one question with an exit code: is the vendored motion material
// present, unmodified, and does it cover what a surface needs?
//
// The point is that an agent must never infer "the kit is available" from a
// prompt or from a directory it half-remembers. Presence is a claim in
// MANIFEST.json, and this script compares that claim against the bytes on disk.
//
// Usage: node scripts/check-motion-kit.mjs [--root <dir>] [--json]
// Exit: 0 verified, 1 missing/modified/extra, 2 usage error.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const VENDOR_DIR = path.join('vendor', 'stageshow');
const MANIFEST = 'MANIFEST.json';

function fail(message) {
  process.stderr.write(`[vendor] ${message}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const options = { root: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root') {
      const value = argv[++i];
      if (!value) fail('--root needs a directory');
      options.root = path.resolve(value);
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write('usage: node scripts/check-motion-kit.mjs [--root <dir>] [--json]\n');
      process.exit(0);
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function hashOf(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
}

// Every file under the vendor directory, relative and slash-normalized, so the
// comparison does not depend on the platform that produced the manifest.
function listVendored(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return found.sort();
}

function compare(declared, actual, dir) {
  const missing = [];
  const modified = [];
  for (const [relative, entry] of Object.entries(declared)) {
    if (!actual.includes(relative)) {
      missing.push(relative);
      continue;
    }
    const digest = hashOf(path.join(dir, relative));
    if (digest !== entry.sha256) modified.push({ path: relative, expected: entry.sha256, actual: digest });
  }
  // The manifest itself is written by the vendoring step, so it is not in the
  // list of declared files even though it lives in the directory.
  const extra = actual.filter((file) => !declared[file] && file !== MANIFEST);
  return { missing, modified, extra };
}

function report(options) {
  const dir = path.join(options.root, VENDOR_DIR);
  const manifestPath = path.join(dir, MANIFEST);

  if (!fs.existsSync(manifestPath)) {
    return {
      ok: false,
      status: 'absent',
      reason: fs.existsSync(dir)
        ? `${VENDOR_DIR}/${MANIFEST} is missing: the directory exists but nothing pins what it should contain`
        : `${VENDOR_DIR} does not exist: the motion material is not installed`,
      action: 're-vendor from the recorded upstream commit, or run without the vendor-gated checks',
    };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const actual = listVendored(dir);
  const diff = compare(manifest.files, actual, dir);
  const intact = diff.missing.length === 0 && diff.modified.length === 0 && diff.extra.length === 0;

  return {
    ok: intact,
    status: intact ? 'verified' : 'damaged',
    source: manifest.source,
    commit: manifest.commit,
    license: manifest.license,
    files: { declared: Object.keys(manifest.files).length, present: actual.length - 1 },
    diff,
    // The parts that were deliberately left upstream. Reporting them is the
    // difference between "installed" and "installed everything it ships":
    // an agent that assumes the kit is here would write components it cannot
    // render.
    notVendored: manifest.notVendored ?? [],
  };
}

const options = parseArgs(process.argv.slice(2));
const result = report(options);

if (options.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (result.ok) {
  process.stdout.write(`[vendor] stageshow ${result.commit.slice(0, 7)} ${result.license} — verified\n`);
  process.stdout.write(`  files: ${result.files.declared} declared, all match their recorded hash\n`);
  for (const part of result.notVendored) {
    process.stdout.write(`  not vendored: ${part.part} (${part.size}) — ${part.reason}\n`);
  }
  process.stdout.write(`  references: ${VENDOR_DIR}/references (${result.files.declared - 5} spec documents)\n`);
} else {
  process.stderr.write(`[vendor] ${result.status.toUpperCase()}: ${result.reason ?? 'files do not match MANIFEST.json'}\n`);
  for (const file of result.diff?.missing ?? []) process.stderr.write(`  missing:  ${file}\n`);
  for (const file of result.diff?.modified ?? []) process.stderr.write(`  modified: ${file.path} (expected ${file.expected}, found ${file.actual})\n`);
  for (const file of result.diff?.extra ?? []) process.stderr.write(`  extra:    ${file}\n`);
  if (result.action) process.stderr.write(`  action:   ${result.action}\n`);
  process.stderr.write('  an unverified vendor tree is not evidence: restore it or record why it changed\n');
}

process.exit(result.ok ? 0 : 1);
