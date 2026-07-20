#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { installRexClientProjections } from './lib/rex-harness/client-projection.mjs';
import { isDirectModuleInvocation } from './lib/platform/module-entry.mjs';

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

export function parseRexClientProjectionArgs(argv = []) {
  const options = {
    rootDir: SCRIPT_ROOT,
    client: 'all',
    scope: 'global',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') {
      options.rootDir = path.resolve(optionValue(argv, index, argument));
      index += 1;
      continue;
    }
    if (argument === '--client') {
      options.client = optionValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--scope') {
      options.scope = optionValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === '-h' || argument === '--help') {
      options.help = true;
      continue;
    }
    throw new Error(`unknown option: ${argument}`);
  }

  return Object.freeze(options);
}

export async function installRexClientSkills(argv = process.argv.slice(2), deps = {}) {
  const options = parseRexClientProjectionArgs(argv);
  if (options.help) {
    (deps.io ?? console).log('Usage: node scripts/install-rex-client-projections.mjs [--root <AIOS_DIR>] [--client <client|all>] [--scope <global|project>]');
    return Object.freeze({ status: 'help' });
  }

  const installer = deps.installRexClientProjections ?? installRexClientProjections;
  return installer({
    rootDir: options.rootDir,
    projectRoot: options.rootDir,
    client: options.client,
    scope: options.scope,
    io: deps.io ?? console,
  });
}

if (isDirectModuleInvocation(import.meta.url)) {
  installRexClientSkills().catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  });
}
