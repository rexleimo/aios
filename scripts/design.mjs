#!/usr/bin/env node
// Generates this project's design and motion contracts from what the project
// actually contains, and leaves the decisions it cannot make visibly open.
//
// Three subcommands, because the three questions are different and mixing them
// produces a tool nobody trusts:
//
//   facts   what the project is (surfaces, framework, durations, tokens, gaps)
//   init    write MOTION.md and/or DESIGN.md from the shared sources plus those facts
//   check   do the written contracts still match the shared sources, and is every
//           decision answered
//
// `init` deliberately produces documents with TODO(decision) markers and exits 0.
// They are complete as structure and incomplete as decisions; `check` is what
// refuses to let that stand. A generator that guessed a palette would be writing
// a rule nobody chose.
//
// Usage:
//   node scripts/design.mjs facts [--root <dir>] [--json]
//   node scripts/design.mjs init  [--root <dir>] [--only motion|design|both] [--force] [--json]
//   node scripts/design.mjs check [--root <dir>] [--only motion|design|both] [--json]
// Exit: 0 success, 1 refused (existing file without --force, or a failing check),
// 2 usage error.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectFacts } from './lib/design-contract/facts.mjs';
import { renderContract, inspectRendered } from './lib/design-contract/render.mjs';
import { renderDesign } from './lib/design-contract/render-design.mjs';
import {
  readIfExists,
  universalPath,
  unresolvedPlaceholders,
  missingSections,
  compareRuleSets,
  REQUIRED_INSTANCE_SECTIONS,
  REQUIRED_DESIGN_SECTIONS,
} from './lib/design-contract/rules.mjs';

const INSTALL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KINDS = ['motion', 'design', 'both'];

function fail(message) {
  process.stderr.write(`[design] ${message}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    root: process.cwd(),
    json: false,
    force: false,
    contract: 'MOTION.md',
    designContract: 'DESIGN.md',
    only: 'both',
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const take = () => {
      const value = rest[++i];
      if (!value) fail(`${arg} needs a value`);
      return value;
    };
    if (arg === '--root') options.root = path.resolve(take());
    else if (arg === '--contract') options.contract = take();
    else if (arg === '--design-contract') options.designContract = take();
    else if (arg === '--only') options.only = take();
    else if (arg === '--json') options.json = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else fail(`unknown argument: ${arg}`);
  }
  if (!KINDS.includes(options.only)) fail('--only must be motion, design or both');
  return options;
}

const USAGE = [
  'usage:',
  '  node scripts/design.mjs facts [--root <dir>] [--json]',
  '  node scripts/design.mjs init  [--root <dir>] [--only motion|design|both] [--force] [--json]',
  '  node scripts/design.mjs check [--root <dir>] [--only motion|design|both] [--json]',
  '',
].join('\n');

function emit(options, payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function fileFor(kind, options) {
  return path.resolve(options.root, kind === 'motion' ? options.contract : options.designContract);
}

function requiredSectionsFor(kind) {
  // The motion contract has no Evidence Snapshot and the design contract has no
  // gate command, so one section list cannot judge both.
  return kind === 'motion' ? REQUIRED_INSTANCE_SECTIONS : REQUIRED_DESIGN_SECTIONS;
}

function runFacts(options) {
  if (!fs.existsSync(options.root)) fail(`--root does not exist: ${options.root}`);
  const facts = collectFacts({ rootDir: options.root });

  if (options.json) {
    emit(options, facts);
    return;
  }

  const tokens = facts.visual.tokenFiles.reduce((sum, file) => sum + file.tokenCount, 0);
  const lines = [
    `[design] ${options.root}`,
    `  git work tree: ${facts.gitWorkTree}`,
    `  tracked files: ${facts.trackedCount}`,
    `  UI surfaces:   ${facts.surfaces.length}`,
    `  framework:     ${facts.framework.frameworks.join(', ') || 'none detected (plain CSS/HTML)'}`,
    `  durations:     ${facts.motion.durations.map((d) => `${d.ms}ms×${d.count}`).join(', ') || 'none measured'}`,
    `  easings:       ${facts.motion.easings.map((e) => `${e.curve}×${e.count}`).join(', ') || 'none measured'}`,
    `  missing reduced-motion block: ${facts.motion.withoutReducedMotion.length} file(s)`,
    `  tokens:        ${tokens} across ${facts.visual.tokenFiles.length} file(s), ${facts.visual.themes.length} theme block(s)`,
    `  colours outside tokens: ${facts.visual.looseColorTotal}`,
  ];
  if (facts.projectExclusions.length) {
    lines.push(`  project exclusions: ${facts.projectExclusions.map((entry) => entry.prefix).join(', ')}`);
  }
  if (facts.unknown.length) lines.push(`  unknown:       ${facts.unknown.join('; ')}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

function runInit(options) {
  if (!fs.existsSync(options.root)) {
    // A missing target directory is a typo far more often than an intent, and a
    // raw ENOENT stack does not say which argument was wrong.
    fail(`--root does not exist: ${options.root}`);
  }

  // Two contracts, one measurement: MOTION.md owns time, DESIGN.md owns the
  // visual language, and generating them from separate scans would let the two
  // disagree about which files are in scope.
  const wanted = options.only === 'both' ? ['motion', 'design'] : [options.only];
  const targets = wanted.map((kind) => ({ kind, file: fileFor(kind, options) }));

  const conflicts = targets.filter((target) => readIfExists(target.file) !== null);
  if (conflicts.length && !options.force) {
    // Overwriting a contract silently is how a project loses the decisions its
    // own team wrote into it. Refusing and naming the flag is the safe default.
    for (const target of conflicts) process.stderr.write(`[design] REFUSED: ${target.file} already exists\n`);
    process.stderr.write('  pass --force to regenerate (this discards the decisions recorded in them)\n');
    process.exit(1);
  }

  const universalFile = universalPath(INSTALL_ROOT);
  const universal = readIfExists(universalFile);
  if (universal === null) fail(`shared rules missing at ${universalFile}`);

  const facts = collectFacts({ rootDir: options.root });
  const written = [];

  for (const target of targets) {
    const text = target.kind === 'motion' ? renderContract({ facts, universal }) : renderDesign({ facts });
    const structure = inspectRendered(text);
    const required = requiredSectionsFor(target.kind);
    fs.writeFileSync(target.file, text);
    written.push({
      kind: target.kind,
      file: target.file,
      replaced: conflicts.some((conflict) => conflict.file === target.file),
      sections: structure.sections,
      missingSections: missingSections(text, required),
      openDecisions: unresolvedPlaceholders(text),
    });
  }

  if (options.json) {
    emit(options, {
      written,
      facts: {
        surfaces: facts.surfaces.length,
        tracked: facts.trackedCount,
        unknown: facts.unknown,
        tokens: facts.visual.tokenFiles.reduce((sum, file) => sum + file.tokenCount, 0),
        looseColors: facts.visual.looseColorTotal,
      },
    });
    return;
  }

  for (const entry of written) {
    process.stdout.write(`[design] wrote ${entry.file}\n`);
    process.stdout.write(`  sections: ${entry.sections.length} (${entry.missingSections.length} missing)\n`);
    process.stdout.write(`  open decisions: ${entry.openDecisions.length} — these are marked TODO(decision) on purpose\n`);
  }
  const tokens = facts.visual.tokenFiles.reduce((sum, file) => sum + file.tokenCount, 0);
  process.stdout.write(`  surfaces measured: ${facts.surfaces.length} of ${facts.trackedCount} tracked files\n`);
  process.stdout.write(`  tokens: ${tokens}, colours outside tokens: ${facts.visual.looseColorTotal}\n`);

  // An uninspected project and an empty project look the same from here, and only
  // one of them may be described as scoped. Saying so is the difference between a
  // generated contract and a plausible one.
  if (facts.unknown.length) {
    process.stderr.write(`  NOT MEASURED: ${facts.unknown.join('; ')}\n`);
    if (facts.untracked) {
      process.stderr.write(`  ${facts.untracked} untracked file(s) are invisible to the file list; \`git add\` them and regenerate\n`);
    }
    process.stderr.write('  the scope sections above are therefore not evidence of what this project contains\n');
  }
  process.stdout.write('  next: answer the decisions, then run `node scripts/design.mjs check`\n');
}

function checkOne({ kind, file, universal }) {
  const instance = readIfExists(file);
  if (instance === null) return { kind, file, present: false, ok: false, absent: true };

  const sections = missingSections(instance, requiredSectionsFor(kind));
  const open = unresolvedPlaceholders(instance);

  // Only the motion contract restates a shared rule set. The design contract
  // shares a structure, and inventing a rule comparison for it would report every
  // project as drifted on day one.
  const rules = kind === 'motion' ? compareRuleSets({ universal, instance }) : null;
  const ok = sections.length === 0 && open.length === 0 && (rules ? rules.ok : true);

  return { kind, file, present: true, ok, sections, openDecisions: open, rules };
}

function reportOne(result) {
  if (result.absent) {
    process.stderr.write(`[design] ABSENT: ${result.file}\n`);
    return;
  }
  process.stdout.write(`[design] ${path.basename(result.file)} — ${result.ok ? 'faithful and answered' : 'not ready'}\n`);
  if (result.rules) {
    process.stdout.write(`  rules: ${result.rules.instanceCount} here, ${result.rules.universalCount} shared\n`);
    if (result.rules.missingFromInstance.length) {
      process.stderr.write(`  missing ${result.rules.missingFromInstance.length} shared rule(s):\n`);
      for (const rule of result.rules.missingFromInstance) process.stderr.write(`    ${rule}\n`);
    }
    if (result.rules.notInUniversal.length) {
      process.stderr.write(`  ${result.rules.notInUniversal.length} local rule(s) not in the shared set:\n`);
      for (const rule of result.rules.notInUniversal) process.stderr.write(`    ${rule}\n`);
      process.stderr.write('  either propose it upstream or record it as a project decision in 决策记录\n');
    }
  }
  if (result.sections.length) process.stderr.write(`  missing section(s): ${result.sections.join(', ')}\n`);
  if (result.openDecisions.length) {
    process.stderr.write(`  ${result.openDecisions.length} unresolved decision(s):\n`);
    for (const item of result.openDecisions) process.stderr.write(`    ${item.slice(0, 110)}\n`);
  }
}

function runCheck(options) {
  if (!fs.existsSync(options.root)) fail(`--root does not exist: ${options.root}`);
  const universal = readIfExists(universalPath(INSTALL_ROOT));
  if (universal === null) fail(`shared rules missing at ${universalPath(INSTALL_ROOT)}`);

  const wanted = options.only === 'both' ? ['motion', 'design'] : [options.only];
  const results = wanted
    .map((kind) => checkOne({ kind, file: fileFor(kind, options), universal }))
    // With no explicit `--only`, an absent contract is a project that never
    // adopted it, not a failure: a contract that does not exist makes no claim
    // that could be wrong. A project that adopted only one of the two must not
    // be reported as broken for the one it declined. `--only design` still
    // fails on absence, because there the absence contradicts the request.
    .filter((result) => options.only !== 'both' || !result.absent);
  if (!results.length) {
    process.stderr.write(`[design] ABSENT: neither ${options.contract} nor ${options.designContract} exists in ${options.root}\n`);
    process.stderr.write('  action: run `node scripts/design.mjs init`\n');
    process.exit(1);
  }
  const ok = results.every((result) => result.ok);

  if (options.json) {
    emit(options, { ok, contracts: results });
  } else {
    for (const result of results) reportOne(result);
  }
  process.exit(ok ? 0 : 1);
}

const options = parseArgs(process.argv.slice(2));
if (options.help || !options.command) {
  process.stdout.write(USAGE);
  process.exit(options.help ? 0 : 2);
}
if (options.command === 'facts') runFacts(options);
else if (options.command === 'init') runInit(options);
else if (options.command === 'check') runCheck(options);
else fail(`unknown command: ${options.command}\n${USAGE}`);
