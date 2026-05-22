#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredMajor = Number.parseInt(readFileSync(path.join(repoRoot, '.nvmrc'), 'utf8').trim().replace(/^v/u, ''), 10);
const actualMajor = Number.parseInt(process.versions.node.split('.')[0] || '', 10);

if (!Number.isFinite(requiredMajor) || requiredMajor <= 0) {
  console.error('[node-version] Invalid .nvmrc; expected a Node major version such as 24.');
  process.exit(1);
}

if (actualMajor < requiredMajor) {
  console.error(`[node-version] AIOS requires Node >= ${requiredMajor}.x LTS. Current runtime is ${process.version}.`);
  const hint = process.platform === 'win32'
    ? `Install Node ${requiredMajor} via winget: winget install OpenJS.NodeJS.LTS`
    : `Use nvm: nvm install ${requiredMajor} && nvm use ${requiredMajor}`;
  console.error(hint);
  console.error('Tip: scripts/aios.sh --install-node (macOS/Linux)');
  process.exit(1);
}
