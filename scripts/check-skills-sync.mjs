#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkGeneratedSkillsSync, syncGeneratedSkills } from './lib/skills/sync.mjs';
import { createCliParser } from '../src/shared/cli-parser.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const cli = createCliParser({
  name: 'check-skills-sync',
  description: 'Check generated skills sync status and optionally materialize to a temp directory',
  options: [
    ['--materialize-temp', 'Materialize install to a temp directory for comparison'],
    ['--target-root <path>', 'Override target root instead of current dir'],
  ],
});

const rawArgs = process.argv.slice(2);
const parsed = cli.parse(rawArgs);
if (parsed.help && rawArgs.some((arg) => arg === '--help' || arg === '-h')) {
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
