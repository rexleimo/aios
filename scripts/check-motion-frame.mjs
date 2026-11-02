#!/usr/bin/env node
// Films one page and reports frame-level motion defects.
//
// Usage: node scripts/check-motion-frame.mjs --page <path-or-url> [options]
//   --selector <css>      element to record (default: body)
//   --duration <ms>       recording window (default: 1200)
//   --width / --height    viewport (default 1280x800)
//   --browser <path>      Chrome/Edge binary (else AIOS_FILM_BROWSER, else search)
//   --json                machine-readable report on stdout
//   --out <file>          also write the report to a file
//   --root <dir>          repository root (default: cwd)
// Exit: 0 no findings, 1 findings, 2 usage error, 3 cannot film (no browser/core).

import path from 'node:path';
import { filmPage, writeJsonReport } from './lib/motion-contract/film.mjs';

function fail(message) {
  process.stderr.write(`[frame] ${message}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const options = { root: process.cwd(), selector: 'body', durationMs: 1200, width: 1280, height: 800, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const take = () => {
      const value = argv[++i];
      if (!value) fail(`${arg} needs a value`);
      return value;
    };
    if (arg === '--page') options.page = take();
    else if (arg === '--selector') options.selector = take();
    else if (arg === '--duration') options.durationMs = Number(take());
    else if (arg === '--width') options.width = Number(take());
    else if (arg === '--height') options.height = Number(take());
    else if (arg === '--browser') options.executablePath = take();
    else if (arg === '--out') options.out = take();
    else if (arg === '--root') options.root = path.resolve(take());
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write('usage: node scripts/check-motion-frame.mjs --page <path-or-url> [--selector <css>] [--json]\n');
      process.exit(0);
    } else fail(`unknown argument: ${arg}`);
  }
  if (!options.page) fail('--page is required: film one page at a time so the report names a single surface');
  if (!Number.isFinite(options.durationMs) || options.durationMs <= 0) fail('--duration must be a positive number of milliseconds');
  return options;
}

// Findings arrive as human strings from the upstream core, so the disposition
// is derived from the text it actually emits rather than from a parallel count.
function disposition(findings) {
  const snaps = findings.filter((line) => /^jump:/.test(line));
  const drifts = findings.filter((line) => /^drift:/.test(line));
  const anchors = findings.filter((line) => /^anchor drift:/.test(line));
  return { snaps, drifts, anchors };
}

const options = parseArgs(process.argv.slice(2));

let result;
try {
  result = await filmPage({ ...options, source: options.page });
} catch (error) {
  if (error.code === 'NO_PLAYWRIGHT') {
    process.stderr.write(`[frame] SKIP: ${error.message}\n`);
    process.exit(3);
  }
  process.stderr.write(`[frame] FAIL: ${error.message}\n`);
  process.exit(3);
}

const grouped = disposition(result.findings);
const ok = result.findings.length === 0;

if (options.out) await writeJsonReport(result, path.resolve(options.root, options.out));

if (options.json) {
  process.stdout.write(`${JSON.stringify({ ...result, disposition: grouped }, null, 2)}\n`);
} else {
  const label = ok ? 'clean' : `${result.findings.length} finding(s)`;
  process.stdout.write(
    `[frame] ${result.source} ${result.frames} frames over ${result.durationMs}ms — ${label}\n`,
  );
  for (const line of result.findings) process.stdout.write(`  ${line}\n`);
  if (result.recorderErrors.length) {
    // A recorder error is not a clean run: it means part of the page was not
    // measured, which is exactly the failure mode a green result would hide.
    process.stdout.write(`  recorder errors: ${result.recorderErrors.join(' | ')}\n`);
  }
  if (result.unreachableRequests) {
    process.stdout.write(
      `  ${result.unreachableRequests} same-origin request(s) unreachable from file:// — the page rendered without its data\n`,
    );
  }
  if (result.pageErrors.length) process.stdout.write(`  page errors: ${result.pageErrors.join(' | ')}\n`);
  if (ok && result.frames > 0 && result.measured.maxItems > 0) {
    process.stdout.write('  no snap (>2px in one frame while present before and after), no drift\n');
  }
  if (result.measured && result.measured.maxItems === 0) {
    // Nothing measured. Saying "clean" here would be the exact false green the
    // declaration gate produced on a 4px snap.
    process.stdout.write(`  measured nothing: the selector matched no visible element, so this is not a result\n`);
  }
}

// Clean requires all four: no findings, nothing thrown during recording, and a
// recorder that actually saw elements. Findings were reported above, so the exit
// code must agree with them — a run that prints a finding and exits 0 is the
// same false green as a gate that never looked.
const measured = (result.measured?.maxItems ?? 0) > 0;
process.exit(ok && result.recorderErrors.length === 0 && measured ? 0 : 1);
