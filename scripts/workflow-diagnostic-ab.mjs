#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { createCliParser } from '../src/shared/cli-parser.mjs';
import { buildWorkflowDiagnosticDryRun, parseWorkflowDiagnosticManifest } from './lib/workflow-diagnostic/manifest.mjs';

const execFileAsync = promisify(execFile);

const cli = createCliParser({
  name: 'workflow-diagnostic-ab',
  description: 'No-browser workflow-guidance A/B diagnostic',
  options: [
    ['--config <path>', 'Path to a local diagnostic manifest'],
    ['--dry-run', 'Validate policies and task integrity without invoking a client'],
  ],
});

async function readCommittedPolicy(ref) {
  const { stdout } = await execFileAsync('git', ['show', ref], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  return stdout;
}

async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (parsed.help) {
    console.log(cli.program.helpInformation());
    return;
  }
  if (!parsed.flags.dryRun) {
    throw new Error('workflow diagnostic requires --dry-run');
  }
  if (!parsed.flags.config) {
    throw new Error('workflow diagnostic requires --config <path>');
  }

  const manifest = parseWorkflowDiagnosticManifest(await readFile(parsed.flags.config, 'utf8'));
  const summary = await buildWorkflowDiagnosticDryRun(manifest, {
    readTaskManifest: (taskPath) => readFile(taskPath, 'utf8'),
    readPolicySource: readCommittedPolicy,
  });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
