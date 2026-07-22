#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const installRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entrypoint = join(installRoot, 'packages', 'debug-hub', 'dist', 'cli.js');

if (!existsSync(entrypoint)) {
  console.error(`[debug-hub] bundled entrypoint not found: ${entrypoint}`);
  console.error('[debug-hub] rebuild the installed runtime with: npm --prefix packages/debug-hub run build');
  process.exit(1);
}

// Importing the entrypoint preserves process.argv, including --port overrides.
await import(pathToFileURL(entrypoint).href);
