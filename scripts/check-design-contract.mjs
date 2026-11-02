#!/usr/bin/env node
// Checks that a project's motion contract is a faithful instance of the shared
// rules, and that it answers the questions only the project can answer.
//
// Distinct from check-motion-contract.mjs, which reads the *code* the contract
// governs. This reads the contract itself, because a contract can be wrong in
// ways the code gate cannot see: a rule deleted, a rule rewritten, a section
// left as a placeholder, a scope naming a directory that no longer exists.
//
// Usage:
//   node scripts/check-design-contract.mjs [--root <dir>] [--json]
//   node scripts/check-design-contract.mjs --root <dir> --contract <path>
// Exit: 0 faithful and answered, 1 drifted or unanswered, 2 usage error.
//
// Run inside a project that adopted the rules, pass --root . (the universal
// source is resolved from this installation, not from the project).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareRuleSets,
  missingSections,
  readIfExists,
  unresolvedPlaceholders,
  universalPath,
} from './lib/design-contract/rules.mjs';

const INSTALL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  process.stderr.write(`[contract] ${message}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const options = { root: process.cwd(), json: false, contract: 'MOTION.md' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const take = () => {
      const value = argv[++i];
      if (!value) fail(`${arg} needs a value`);
      return value;
    };
    if (arg === '--root') options.root = path.resolve(take());
    else if (arg === '--contract') options.contract = take();
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write('usage: node scripts/check-design-contract.mjs [--root <dir>] [--contract <path>] [--json]\n');
      process.exit(0);
    } else fail(`unknown argument: ${arg}`);
  }
  return options;
}

export function checkContract({ root, contract, installRoot = INSTALL_ROOT }) {
  const contractFile = path.resolve(root, contract);
  const instance = readIfExists(contractFile);
  if (instance === null) {
    return {
      ok: false,
      status: 'absent',
      reason: `${contract} does not exist in ${root}`,
      action: 'run `aios design init` to generate it, or pass --contract with the file that holds your rules',
    };
  }

  const universalFile = universalPath(installRoot);
  const universal = readIfExists(universalFile);
  if (universal === null) {
    // Not "clean": without the shared rules there is nothing to compare against,
    // so the answer is "cannot judge", which is a failure of this installation.
    return { ok: false, status: 'no-universal', reason: `shared rules missing at ${universalFile}` };
  }

  const comparison = compareRuleSets({ universal, instance });
  const missing = missingSections(instance);
  const placeholders = unresolvedPlaceholders(instance);

  return {
    ok: comparison.ok && missing.length === 0 && placeholders.length === 0,
    status: 'checked',
    contract: contractFile,
    universal: universalFile,
    rules: comparison,
    missingSections: missing,
    unresolved: placeholders,
  };
}

function report(options) {
  const result = checkContract(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  }

  if (result.status === 'absent') {
    process.stderr.write(`[contract] ABSENT: ${result.reason}\n  action: ${result.action}\n`);
    process.exit(1);
  }
  if (result.status === 'no-universal') {
    process.stderr.write(`[contract] CANNOT JUDGE: ${result.reason}\n`);
    process.exit(1);
  }

  const { rules } = result;
  process.stdout.write(`[contract] ${path.basename(result.contract)} vs shared rules — ${result.ok ? 'faithful' : 'drifted'}\n`);
  process.stdout.write(`  rules: ${rules.instanceCount} in the contract, ${rules.universalCount} shared\n`);
  if (rules.missingFromInstance.length) {
    process.stderr.write(`  missing ${rules.missingFromInstance.length} shared rule(s) — deleted or reworded:\n`);
    for (const rule of rules.missingFromInstance) process.stderr.write(`    ${rule}\n`);
  }
  if (rules.notInUniversal.length) {
    process.stderr.write(`  ${rules.notInUniversal.length} rule(s) here that the shared set does not have:\n`);
    for (const rule of rules.notInUniversal) process.stderr.write(`    ${rule}\n`);
    process.stderr.write('  a local rule is allowed, but it has to be added to the shared set or declared as a project decision\n');
  }
  if (result.missingSections.length) {
    process.stderr.write(`  missing section(s): ${result.missingSections.join(', ')}\n`);
  }
  if (result.unresolved.length) {
    process.stderr.write(`  ${result.unresolved.length} unresolved decision(s):\n`);
    for (const item of result.unresolved) process.stderr.write(`    ${item}\n`);
  }
  process.exit(result.ok ? 0 : 1);
}

report(parseArgs(process.argv.slice(2)));
