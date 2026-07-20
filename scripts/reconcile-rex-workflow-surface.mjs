#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareRexWorkflowSurface } from './lib/workflows/rex-workflow-surface-lifecycle.mjs';
import { isDirectModuleInvocation } from './lib/platform/module-entry.mjs';

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  return `Usage: node scripts/reconcile-rex-workflow-surface.mjs [options]

Reconcile Rex-only workflow projections for an installed AIOS runtime.

Options:
  --root <dir>                 AIOS runtime directory (default: this installation)
  --dry-run                    Preview recognized workflow-surface changes without writing
  --adopt-legacy-superpowers   Explicitly adopt and remove recognized AIOS legacy Superpowers projections
  -h, --help                   Show this help

Safe cleanup preview:
  node scripts/reconcile-rex-workflow-surface.mjs \\
    --root <AIOS_ROOT> \\
    --dry-run \\
    --adopt-legacy-superpowers`;
}

function parseArgs(argv) {
  let rootDir = SCRIPT_ROOT;
  let dryRun = false;
  let adoptLegacySuperpowers = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('--root requires an AIOS runtime directory');
      }
      rootDir = value;
      index += 1;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--adopt-legacy-superpowers') {
      adoptLegacySuperpowers = true;
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`);
    throw new Error(`unexpected argument: ${arg}`);
  }

  return {
    rootDir: path.resolve(rootDir),
    dryRun,
    adoptLegacySuperpowers,
  };
}

export async function reconcileInstalledRexWorkflowSurface(argv = process.argv.slice(2), deps = {}) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    (deps.io ?? console).log(usage());
    return { status: 'help' };
  }
  const { rootDir, dryRun, adoptLegacySuperpowers } = parsed;
  const result = await (deps.prepareRexWorkflowSurface ?? prepareRexWorkflowSurface)({
    rootDir,
    fix: !dryRun,
    dryRun,
    adoptLegacySuperpowers,
    io: deps.io ?? console,
  });
  if (result.runtime && !result.rex.ready) {
    throw new Error(`rex-harness is required for AIOS intelligent planning: ${result.rex.fixHint}`);
  }
  return result;
}

if (isDirectModuleInvocation(import.meta.url)) {
  reconcileInstalledRexWorkflowSurface().catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  });
}
