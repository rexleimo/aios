#!/usr/bin/env node
// Refuses to publish an archive whose own contracts point at paths the archive
// does not contain.
//
// Why this exists: the same allowlist shipped two defects in a row. 7.0.1 sent
// MOTION.md's findings but not MOTION.md itself, and the next release sent
// MOTION.md pointing at vendor/ while vendor/ stayed home. Both were found by
// hand, by downloading the artifact and running the shipped test. A gate that
// only runs inside the repository cannot see an omission from the archive,
// because every path it checks exists there.
//
// Usage: node scripts/check-release-contents.mjs [--archive-dir <dir>] [--root <dir>] [--json]
//   Verifies an already-extracted directory when --archive-dir is given
//   (that is the only mode that proves the real artifact).
// Exit: 0 every reference resolves, 1 a reference is missing, 2 usage error.

import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  process.stderr.write(`[contents] ${message}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const options = { root: process.cwd(), json: false, archiveDir: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const take = () => {
      const value = argv[++i];
      if (!value) fail(`${arg} needs a value`);
      return value;
    };
    if (arg === '--root') options.root = path.resolve(take());
    else if (arg === '--archive-dir') options.archiveDir = path.resolve(take());
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write('usage: node scripts/check-release-contents.mjs [--archive-dir <dir>] [--root <dir>] [--json]\n');
      process.exit(0);
    } else fail(`unknown argument: ${arg}`);
  }
  return options;
}

// Contracts whose prose names repository paths that the archive has to satisfy.
// Kept short on purpose: this is not a link checker over every document, it is
// the list of files whose whole job is to be followed by an agent at runtime.
const CONTRACTS = ['MOTION.md', 'DESIGN.md'];

// Absolute-path-looking references inside backticks: `vendor/stageshow/...`,
// `scripts/foo.mjs`. Deliberately conservative - it only trusts a reference
// that starts with a known top-level directory, so prose like `npm run x` and
// placeholders like `config/<name>.json` are ignored rather than guessed at.
const REFERENCE = /`([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]*)`/g;

// A domain is a citation, not a path claim. `github.com/owner/repo` inside
// backticks names where something came from; treating it as a missing tree was
// the first thing the strict rule got wrong.
const DOMAIN_LIKE = /^[a-z0-9-]+\.[a-z]{2,}\//i;

function topLevelDirectories(root) {
  return new Set(
    fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name),
  );
}

function referencesIn(file, known) {
  const text = fs.readFileSync(file, 'utf8');
  const found = new Map();
  for (const match of text.matchAll(REFERENCE)) {
    const candidate = match[1].replace(/[.,)]+$/, '');
    // A bare top-level name (`scripts`) is not a path claim about a file.
    if (!candidate.includes('/')) continue;
    // Dependencies are installed into the tree, not shipped in it: a contract
    // naming `mcp-server/node_modules/...` is describing a resolution order, not
    // claiming the archive carries the package.
    if (candidate.split('/').includes('node_modules')) continue;
    if (DOMAIN_LIKE.test(candidate)) continue;
    found.set(candidate, known.has(candidate.split('/')[0]) ? 'in-tree' : 'tree-absent');
  }
  return [...found.entries()].map(([reference, top]) => ({ reference, top })).sort((a, b) => a.reference.localeCompare(b.reference));
}

/**
 * Trees the contracts may name but the archive does not carry, each with a
 * reason. An unexplained entry is an error rather than a skip: silently honouring
 * it would hide exactly what this gate exists to catch.
 */
function notShipped(subject) {
  const file = path.join(subject, 'config', 'release-contents.json');
  if (!fs.existsSync(file)) {
    // The declaration lives in config/, which every archive carries. Its absence
    // means every tree the contracts name must be present - the strict reading.
    return { entries: [], error: null };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { entries: [], error: `config/release-contents.json is not valid JSON: ${error.message}` };
  }
  // Two kinds of not-in-the-archive, because they need different fixes if they
  // are wrong: a tree this repository owns but does not ship, and a path that
  // belongs to the upstream project. Both need a reason.
  const entries = Array.isArray(parsed.notShipped) ? parsed.notShipped : [];
  const upstream = Array.isArray(parsed.upstream) ? parsed.upstream : [];
  const all = [...entries, ...upstream];
  const unreasoned = all.filter((entry) => !entry.why).map((entry) => entry.prefix ?? '(no prefix)');
  if (unreasoned.length) {
    return { entries: all.filter((entry) => entry.why), error: `exclusion without a reason: ${unreasoned.join(', ')}` };
  }
  return { entries: all, error: null };
}

function main(options) {
  const subject = options.archiveDir ?? options.root;
  if (!fs.existsSync(subject)) fail(`not a directory: ${subject}`);

  const known = topLevelDirectories(subject);
  const declaration = notShipped(subject);
  const rows = [];
  for (const contract of CONTRACTS) {
    const file = path.join(subject, contract);
    if (!fs.existsSync(file)) {
      rows.push({ contract, reference: contract, status: 'contract-missing' });
      continue;
    }
    for (const { reference, top } of referencesIn(file, known)) {
      // A reference whose whole top-level tree is absent used to be skipped here.
      // That skipped the very defect this file was written for: move `vendor/`
      // out of the archive and `vendor/stageshow/MANIFEST.json` disappeared from
      // the report instead of failing it. A tree is either declared as
      // deliberately not shipped, or its absence is a missing tree.
      if (top === 'tree-absent') {
        const declared = declaration.entries.find((entry) => entry.prefix && reference.startsWith(entry.prefix));
        rows.push({
          contract,
          reference,
          status: declared ? 'repo-only' : 'tree-missing',
          ...(declared ? { why: declared.why } : {}),
        });
        continue;
      }
      // A reference into upstream material may be a directory with many files;
      // existence of the referenced path is the claim, not its contents.
      const resolved = path.join(subject, reference);
      rows.push({ contract, reference, status: fs.existsSync(resolved) ? 'present' : 'missing' });
    }
  }

  const missing = rows.filter((row) => row.status !== 'present' && row.status !== 'repo-only');
  const repoOnly = rows.filter((row) => row.status === 'repo-only');
  const result = {
    subject,
    mode: options.archiveDir ? 'archive' : 'repository',
    checked: rows.length,
    present: rows.length - missing.length - repoOnly.length,
    repoOnly: repoOnly.map((row) => row.reference),
    missing,
    declarationError: declaration.error,
    ok: missing.length === 0 && declaration.error === null,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    if (declaration.error) {
      process.stderr.write(`[contents] config/release-contents.json: ${declaration.error}\n`);
      process.stderr.write('  an exclusion without a reason hides a missing tree; write down why it is not shipped\n');
    }
    if (result.ok) {
      const suffix = repoOnly.length ? `, ${repoOnly.length} declared not-shipped` : '';
      process.stdout.write(`[contents] ${result.present} path reference(s) in ${CONTRACTS.join(', ')} resolve in the artifact${suffix}\n`);
    } else if (missing.length) {
      process.stderr.write(`[contents] ${missing.length} reference(s) do not resolve in ${subject}\n`);
      for (const row of missing) {
        const verb = row.status === 'contract-missing' ? 'contract absent' : row.status === 'tree-missing' ? 'tree absent   ' : 'missing       ';
        process.stderr.write(`  ${verb} ${row.contract} -> ${row.reference}\n`);
      }
      process.stderr.write('  a contract that names a path the artifact does not contain tells the user to run a command that cannot work\n');
      if (missing.some((row) => row.status === 'tree-missing')) {
        process.stderr.write('  if the tree is deliberately not shipped, declare it in config/release-contents.json with a reason\n');
      }
    }
  }
  process.exit(result.ok ? 0 : 1);
}

main(parseArgs(process.argv.slice(2)));
