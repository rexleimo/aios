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

if (actualMajor !== requiredMajor) {
  console.error(`[node-version] AIOS requires Node ${requiredMajor}.x LTS. Current runtime is ${process.version}.`);
  console.error(`Run: nvm install ${requiredMajor} && nvm use ${requiredMajor}`);
  process.exit(1);
}
