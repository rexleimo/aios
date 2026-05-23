// scripts/lib/tui-ink/runner.mjs
// This file is the entry point for the TUI, run via tsx for TypeScript support
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tsxCliPath = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const tuiPath = path.join(rootDir, 'scripts/lib/tui-ink/cli.tsx');

if (!existsSync(tsxCliPath)) {
  console.error(`[err] missing TUI runtime dependency: ${tsxCliPath}`);
  console.error('[hint] Reinstall AIOS, or run from the install root: npm install --include=dev');
  process.exit(1);
}

// Spawn tsx to run the TUI
const child = spawn(process.execPath, [tsxCliPath, tuiPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    AIOS_ROOT_DIR: rootDir,
  },
});

child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
