#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkGeneratedSkillsSync, syncGeneratedSkills } from './lib/skills/sync.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const options = {
    materializeTemp: false,
    targetRootDir: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--materialize-temp') {
      options.materializeTemp = true;
      continue;
    }
    if (arg === '--target-root') {
      options.targetRootDir = path.resolve(argv[index + 1] || '');
      index += 1;
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
let tempRoot = '';
try {
  if (options.materializeTemp) {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-skills-check-'));
    options.targetRootDir = tempRoot;
    await syncGeneratedSkills({
      rootDir,
      targetRootDir: options.targetRootDir,
      io: { log() {} },
      withLock: false,
    });
  }

  const result = await checkGeneratedSkillsSync({
    rootDir,
    targetRootDir: options.targetRootDir || rootDir,
    io: console,
  });
  if (!result.ok) {
    process.exitCode = 1;
  }
} finally {
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}
