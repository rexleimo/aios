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
  const found = new Set();
  for (const match of text.matchAll(REFERENCE)) {
    const candidate = match[1].replace(/[.,)]+$/, '');
    const top = candidate.split('/')[0];
    if (!known.has(top)) continue;
    // A bare top-level name (`scripts`) is not a path claim about a file.
    if (!candidate.includes('/')) continue;
    // Dependencies are installed into the tree, not shipped in it: a contract
    // naming `mcp-server/node_modules/...` is describing a resolution order, not
    // claiming the archive carries the package.
    if (candidate.split('/').includes('node_modules')) continue;
    found.add(candidate);
  }
  return [...found].sort();
}

function main(options) {
  const subject = options.archiveDir ?? options.root;
  if (!fs.existsSync(subject)) fail(`not a directory: ${subject}`);

  const known = topLevelDirectories(subject);
  const rows = [];
  for (const contract of CONTRACTS) {
    const file = path.join(subject, contract);
    if (!fs.existsSync(file)) {
      rows.push({ contract, reference: contract, status: 'contract-missing' });
      continue;
    }
    for (const reference of referencesIn(file, known)) {
      // A reference into upstream material may be a directory with many files;
      // existence of the referenced path is the claim, not its contents.
      const resolved = path.join(subject, reference);
      rows.push({ contract, reference, status: fs.existsSync(resolved) ? 'present' : 'missing' });
    }
  }

  const missing = rows.filter((row) => row.status !== 'present');
  const result = {
    subject,
    mode: options.archiveDir ? 'archive' : 'repository',
    checked: rows.length,
    missing,
    ok: missing.length === 0,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`[contents] ${result.checked} path reference(s) in ${CONTRACTS.join(', ')} all resolve\n`);
  } else {
    process.stderr.write(`[contents] ${missing.length} reference(s) do not resolve in ${subject}\n`);
    for (const row of missing) {
      process.stderr.write(`  ${row.status === 'contract-missing' ? 'contract absent' : 'missing'}      ${row.contract} -> ${row.reference}\n`);
    }
    process.stderr.write('  a contract that names a path the artifact does not contain tells the user to run a command that cannot work\n');
  }
  process.exit(result.ok ? 0 : 1);
}

main(parseArgs(process.argv.slice(2)));
