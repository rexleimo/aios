#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkNativeEnhancementsSync } from './lib/native/doctor.mjs';
import { syncNativeEnhancements } from './lib/native/sync.mjs';

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
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-native-check-'));
    options.targetRootDir = tempRoot;
    await syncNativeEnhancements({
      rootDir,
      targetRootDir: options.targetRootDir,
      client: 'all',
      mode: 'install',
      io: { log() {} },
      withLock: false,
    });
  }

  const result = await checkNativeEnhancementsSync({
    rootDir,
    targetRootDir: options.targetRootDir || rootDir,
    client: 'all',
  });

  if (!result.ok) {
    for (const issue of result.issues) {
      console.error(issue);
    }
    process.exitCode = 1;
  } else {
    console.log('[ok] native sync clean');
  }
} finally {
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}
