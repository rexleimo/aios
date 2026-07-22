#!/usr/bin/env node

import { accessSync, constants, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = join(rootDir, 'packages', 'debug-hub');
const distDir = join(packageDir, 'dist');
const tscPath = join(packageDir, 'node_modules', 'typescript', 'bin', 'tsc');

try {
  accessSync(tscPath, constants.R_OK);
} catch {
  console.error(`Missing debug-hub build dependencies: ${tscPath}`);
  console.error(`Install them with: npm ci --prefix ${packageDir}`);
  process.exit(1);
}

rmSync(distDir, { recursive: true, force: true });
const result = spawnSync(process.execPath, [tscPath, '--project', join(packageDir, 'tsconfig.json')], {
  cwd: packageDir,
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

mkdirSync(distDir, { recursive: true });
copyFileSync(join(packageDir, 'src', 'ui.html'), join(distDir, 'ui.html'));
