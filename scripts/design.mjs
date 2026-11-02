#!/usr/bin/env node
// Generates this project's motion contract from what the project actually
// contains, and leaves the decisions it cannot make visibly open.
//
// Three subcommands, because the three questions are different and mixing them
// produces a tool nobody trusts:
//
//   facts   what the project is (surfaces, frameworks, durations, gaps)
//   init    write MOTION.md from the shared rules plus those facts
//   check   does the written contract still match the shared rules, and is
//           every decision answered
//
// `init` deliberately produces a document with TODO(decision) markers and exits
// 0. The contract is complete as a structure and incomplete as a decision; the
// `check` step is what refuses to let that stand. A generator that guessed the
// palette would be writing a rule nobody chose.
//
// Usage:
//   node scripts/design.mjs facts  [--root <dir>] [--json]
//   node scripts/design.mjs init   [--root <dir>] [--force] [--json]
//   node scripts/design.mjs check  [--root <dir>] [--contract <path>] [--json]
// Exit: 0 success, 1 refused (existing file without --force, or a failing
// check), 2 usage error.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFacts } from './lib/design-contract/facts.mjs';
import { renderContract, inspectRendered } from './lib/design-contract/render.mjs';
import { readIfExists, universalPath, unresolvedPlaceholders, missingSections, compareRuleSets } from './lib/design-contract/rules.mjs';

const INSTALL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  process.stderr.write(`[design] ${message}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, root: process.cwd(), json: false, force: false, contract: 'MOTION.md' };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const take = () => {
      const value = rest[++i];
      if (!value) fail(`${arg} needs a value`);
      return value;
    };
    if (arg === '--root') options.root = path.resolve(take());
    else if (arg === '--contract') options.contract = take();
    else if (arg === '--json') options.json = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else fail(`unknown argument: ${arg}`);
  }
  return options;
}

const USAGE = `usage:
  node scripts/design.mjs facts [--root <dir>] [--json]
  node scripts/design.mjs init  [--root <dir>] [--force] [--json]
  node scripts/design.mjs check [--root <dir>] [--contract <path>] [--json]
`;

function emit(options, payload, text) {
  process.stdout.write(options.json ? `${JSON.stringify(payload, null, 2)}\n` : text);
}

function runFacts(options) {
  if (!fs.existsSync(options.root)) fail(`--root does not exist: ${options.root}`);
  const facts = collectFacts({ rootDir: options.root });
  if (options.json) return emit(options, facts);
  const lines = [
    `[design] ${options.root}`,
    `  git work tree: ${facts.gitWorkTree}`,
    `  tracked files: ${facts.trackedCount}`,
    `  UI surfaces:   ${facts.surfaces.length}`,
    `  framework:     ${facts.framework.frameworks.join(', ') || 'none detected (plain CSS/HTML)'}`,
    `  durations:     ${facts.motion.durations.map((d) => `${d.ms}ms×${d.count}`).join(', ') || 'none measured'}`,
    `  easings:       ${facts.motion.easings.map((e) => e.curve).join(', ') || 'none measured'}`,
    `  missing reduced-motion block: ${facts.motion.withoutReducedMotion.length} file(s)`,
  ];
  if (facts.unknown.length) lines.push(`  unknown:       ${facts.unknown.join('; ')}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

function runInit(options) {
  if (!fs.existsSync(options.root)) {
    // A missing target directory is a typo far more often than an intent, and a
    // raw ENOENT stack does not say which argument was wrong.
    fail(`--root does not exist: ${options.root}`);
  }
  const target = path.resolve(options.root, options.contract);
  const existing = readIfExists(target);
  if (existing !== null && !options.force) {
    // Overwriting a contract silently is how a project loses the decisions its
    // own team wrote into it. Refusing and naming the flag is the safe default.
    process.stderr.write(`[design] REFUSED: ${target} already exists\n`);
    process.stderr.write('  pass --force to regenerate (this discards the decisions recorded in it)\n');
    process.exit(1);
  }

  const universalFile = universalPath(INSTALL_ROOT);
  const universal = readIfExists(universalFile);
  if (universal === null) fail(`shared rules missing at ${universalFile}`);

  const facts = collectFacts({ rootDir: options.root });
  const text = renderContract({ facts, universal });
  const structure = inspectRendered(text);
  const open = unresolvedPlaceholders(text);

  fs.writeFileSync(target, text);

  if (options.json) {
    return emit(options, {
      written: target,
      replaced: existing !== null,
      sections: structure.sections,
      missingSections: structure.missingSections,
      openDecisions: open,
      facts: { surfaces: facts.surfaces.length, tracked: facts.trackedCount },
    });
  }
  process.stdout.write(`[design] wrote ${target}\n`);
  process.stdout.write(`  sections: ${structure.sections.length} (${structure.missingSections.length} missing)\n`);
  process.stdout.write(`  surfaces measured: ${facts.surfaces.length} of ${facts.trackedCount} tracked files\n`);
  // An uninspected project and an empty project look the same from here, and
  // only one of them may be described as scoped. Saying so is the difference
  // between a generated contract and a plausible one.
  if (facts.unknown.length) {
    process.stderr.write(`  NOT MEASURED: ${facts.unknown.join('; ')}\n`);
    if (facts.untracked) {
      process.stderr.write(`  ${facts.untracked} untracked file(s) are invisible to the file list; \`git add\` them and regenerate\n`);
    }
    process.stderr.write('  the scope section above is therefore not evidence of what this project contains\n');
  }
  process.stdout.write(`  open decisions: ${open.length} — these are marked TODO(decision) on purpose\n`);
  process.stdout.write('  next: answer them, then run `node scripts/design.mjs check`\n');
}

function runCheck(options) {
  if (!fs.existsSync(options.root)) fail(`--root does not exist: ${options.root}`);
  const contractFile = path.resolve(options.root, options.contract);
  const instance = readIfExists(contractFile);
  if (instance === null) {
    process.stderr.write(`[design] ABSENT: ${contractFile}\n  action: run \`node scripts/design.mjs init\`\n`);
    process.exit(1);
  }
  const universal = readIfExists(universalPath(INSTALL_ROOT));
  if (universal === null) fail(`shared rules missing at ${universalPath(INSTALL_ROOT)}`);

  const rules = compareRuleSets({ universal, instance });
  const sections = missingSections(instance);
  const open = unresolvedPlaceholders(instance);
  const ok = rules.ok && sections.length === 0 && open.length === 0;

  if (options.json) {
    emit(options, { ok, contract: contractFile, rules, missingSections: sections, openDecisions: open });
    process.exit(ok ? 0 : 1);
  }

  process.stdout.write(`[design] ${path.basename(contractFile)} — ${ok ? 'faithful and answered' : 'not ready'}\n`);
  process.stdout.write(`  rules: ${rules.instanceCount} here, ${rules.universalCount} shared\n`);
  if (rules.missingFromInstance.length) {
    process.stderr.write(`  missing ${rules.missingFromInstance.length} shared rule(s):\n`);
    for (const rule of rules.missingFromInstance) process.stderr.write(`    ${rule}\n`);
  }
  if (rules.notInUniversal.length) {
    process.stderr.write(`  ${rules.notInUniversal.length} local rule(s) not in the shared set:\n`);
    for (const rule of rules.notInUniversal) process.stderr.write(`    ${rule}\n`);
    process.stderr.write('  either propose it upstream or record it as a project decision in 决策记录\n');
  }
  if (sections.length) process.stderr.write(`  missing section(s): ${sections.join(', ')}\n`);
  if (open.length) {
    process.stderr.write(`  ${open.length} unresolved decision(s):\n`);
    for (const item of open) process.stderr.write(`    ${item.slice(0, 110)}\n`);
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
