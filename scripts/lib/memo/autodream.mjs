#!/usr/bin/env node
/**
 * Auto-dream CLI (Phase A: manual)
 *
 * Usage:
 *   node scripts/lib/memo/autodream.mjs --root <path> [--mode preview|apply] [--space <name>]...
 *
 *   --root <path>   Required. Workspace root directory.
 *   --mode          Either 'preview' (default) or 'apply'.
 *   --space         Can be repeated to specify multiple spaces. Default: ['default']
 *
 * Example:
 *   node scripts/lib/memo/autodream.mjs --root /tmp/my-workspace --mode preview
 *   node scripts/lib/memo/autodream.mjs --root /tmp/my-workspace --mode apply --space default --space project_shared
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream';
import { stdin as input, stdout as output, stderr as err } from 'node:process';

import { runDream } from '../lifecycle/dream/index.mjs';

// Simple argument parser
function parseArgs(args) {
  const opts = {
    rootDir: null,
    mode: 'preview',
    spaces: ['default'],
  };
  let i = 2; // skip 'node' and script path
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--root' || arg === '-r') {
      if (i + 1 >= args.length) {
        console.error('Error: --root requires a value');
        process.exit(1);
      }
      opts.rootDir = args[++i];
    } else if (arg === '--mode' || arg === '-m') {
      if (i + 1 >= args.length) {
        console.error('Error: --mode requires a value');
        process.exit(1);
      }
      const val = args[++i];
      if (val !== 'preview' && val !== 'apply') {
        console.error('Error: --mode must be either "preview" or "apply"');
        process.exit(1);
      }
      opts.mode = val;
    } else if (arg === '--space' || arg === '-s') {
      if (i + 1 >= args.length) {
        console.error('Error: --space requires a value');
        process.exit(1);
      }
      opts.spaces.push(args[++i]);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node ${path.basename(process.argv[1])} --root <path> [--mode preview|apply] [--space <name>]...

Options:
  --root <path>, -r <path>   Workspace root directory (required)
  --mode <mode>, -m <mode>   'preview' or 'apply' (default: preview)
  --space <name>, -s <name>  Can be repeated to specify multiple spaces. Default: ['default']
  --help, -h                 Show this help
`);
      process.exit(0);
    } else {
      console.error(`Error: unknown argument ${arg}`);
      process.exit(1);
    }
    i++;
  }
  if (!opts.rootDir) {
    console.error('Error: --root is required');
    process.exit(1);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);
  try {
    const result = await runDream({
      rootDir: opts.rootDir,
      mode: opts.mode,
      spaces: opts.spaces,
    });
    // Output JSON
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});