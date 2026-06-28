#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkNativeEnhancementsSync } from './lib/native/doctor.mjs';
import { syncNativeEnhancements } from './lib/native/sync.mjs';
import { createCliParser } from '../src/shared/cli-parser.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const cli = createCliParser({
  name: 'check-native-sync',
  description: 'Check native enhancement sync status and optionally materialize to a temp directory',
  options: [
    ['--materialize-temp', 'Materialize install to a temp directory for comparison'],
    ['--target-root <path>', 'Override target root instead of current dir'],
  ],
});

const parsed = cli.parse(process.argv.slice(2));
if (parsed.help) {
  console.log(cli.program.helpInformation());
  process.exit(0);
}

const options = {
  materializeTemp: parsed.flags.materializeTemp === true,
  targetRootDir: parsed.flags.targetRoot || '',
};

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
