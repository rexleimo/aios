#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  removeLegacyPiSkillRootInstalls,
  removeLegacySharedRootInstalls,
} from './lib/components/skills/doctor.mjs';
import { getAgentsHome } from './lib/platform/paths.mjs';
import { isDirectModuleInvocation } from './lib/platform/module-entry.mjs';

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  return `Usage: node scripts/prune-legacy-skill-copies.mjs [options]

Remove AIOS-managed skill copies left by older install layouts. Only directories
carrying AIOS install metadata are touched; user-owned skills are never removed.

  --agents-home <dir>   Shared agents home to prune (default: resolved AGENTS_HOME)
  --project-root <dir>  Project root whose legacy .pi/skills copies are pruned
  --dry-run             Preview the plan without deleting (default)
  --apply               Actually delete the AIOS-managed copies
  -h, --help            Show this help

Then re-run the installer so the current layout is restored:
  aios setup --components skills --client all

Examples:
  node scripts/prune-legacy-skill-copies.mjs --dry-run
  node scripts/prune-legacy-skill-copies.mjs --apply --project-root <PROJECT>`;
}

function parseArgs(argv) {
  let agentsHome = null;
  let projectRoot = SCRIPT_ROOT;
  let apply = false;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--agents-home' || arg === '--project-root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error(`${arg} requires a directory`);
      if (arg === '--agents-home') agentsHome = value;
      else projectRoot = value;
      index += 1;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`);
    throw new Error(`unexpected argument: ${arg}`);
  }

  if (dryRun && apply) throw new Error('--dry-run and --apply are mutually exclusive');

  return {
    agentsHome: agentsHome ? path.resolve(agentsHome) : getAgentsHome(),
    projectRoot: path.resolve(projectRoot),
    apply,
  };
}

export function pruneLegacySkillCopies(argv = process.argv.slice(2), deps = {}) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    (deps.io ?? console).log(usage());
    return { status: 'help' };
  }
  const io = deps.io ?? console;
  const { agentsHome, projectRoot, apply } = parsed;

  const shared = removeLegacySharedRootInstalls(agentsHome, { dryRun: !apply, io });
  // removeLegacyPiSkillRootInstalls 返回被处理的名字数组（与 collect 一致）。
  const piResult = removeLegacyPiSkillRootInstalls(projectRoot, { dryRun: !apply, io });
  const piNames = Array.isArray(piResult) ? piResult : (piResult?.removed ?? []);
  const piMissing = Array.isArray(piResult) ? [] : (piResult?.missing ?? []);
  io.log(`${apply ? '[ok] removed' : '[plan] preview'}: shared-root=${shared.removed.length} pi-skill-root=${piNames.length}`);
  if (shared.missing.length > 0 || piMissing.length > 0) {
    io.log(`[warn] entries disappeared during pruning: ${[...shared.missing, ...piMissing].join(', ')}`);
  }
  io.log('next: aios setup --components skills --client all');
  return { status: apply ? 'removed' : 'planned', shared, pi: piNames };
}

if (isDirectModuleInvocation(import.meta.url)) {
  try {
    pruneLegacySkillCopies();
  } catch (error) {
    console.error(error.message || String(error));
    process.exitCode = 1;
  }
}
