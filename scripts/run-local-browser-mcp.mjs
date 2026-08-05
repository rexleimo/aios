#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const mcpServerDir = path.join(rootDir, 'mcp-server');
const projectNodeRunner = path.join(mcpServerDir, 'scripts', 'with-project-node.mjs');
const distEntry = path.join(mcpServerDir, 'dist', 'index.js');
const requiredDistEntries = [
  distEntry,
  path.join(mcpServerDir, 'dist', 'browser', 'index.js'),
  path.join(mcpServerDir, 'dist', 'browser', 'launcher.js'),
  path.join(mcpServerDir, 'dist', 'browser', 'profiles.js'),
  path.join(mcpServerDir, 'dist', 'browser', 'health.js'),
];
const sourceEntry = path.join(mcpServerDir, 'src', 'index.ts');
const tsxEntry = path.join(mcpServerDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function fail(message) {
  console.error(`[aios-browser] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(projectNodeRunner)) {
  fail(`project Node runner missing: ${projectNodeRunner}`);
}

let target;
let targetArgs = [];
if (requiredDistEntries.every((entry) => fs.existsSync(entry))) {
  target = distEntry;
} else if (fs.existsSync(sourceEntry) && fs.existsSync(tsxEntry)) {
  target = tsxEntry;
  targetArgs = [sourceEntry];
} else {
  fail(
    `browser MCP entry is unavailable. Build a complete ${path.join(mcpServerDir, 'dist')} tree or install mcp-server dependencies so ${tsxEntry} exists.`,
  );
}

const result = spawnSync(process.execPath, [projectNodeRunner, target, ...targetArgs], {
  cwd: rootDir,
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  fail(result.error.message || String(result.error));
}

process.exit(result.status ?? 1);
