#!/usr/bin/env node
import path from 'node:path';

import { writeMixedSummary } from './lib/rl-mixed-v1/contextdb-summary.mjs';
import { runMixedCampaign, runMixedEvaluation } from './lib/rl-mixed-v1/run-orchestrator.mjs';
import { createCliParser } from '../src/shared/cli-parser.mjs';

const cli = createCliParser({
  name: 'rl-mixed-v1',
  description: 'RL Mixed V1 campaign and evaluation runner',
  subcommands: [
    {
      name: 'browser-only',
      description: 'Run browser-only campaign',
      options: [
        ['--dry-run', 'Dry run mode'],
        ['--batch-count <n>', 'Number of batches'],
        ['--initial-checkpoint <id>', 'Initial checkpoint id'],
      ],
    },
    {
      name: 'orchestrator-only',
      description: 'Run orchestrator-only campaign',
      options: [
        ['--dry-run', 'Dry run mode'],
        ['--batch-count <n>', 'Number of batches'],
        ['--initial-checkpoint <id>', 'Initial checkpoint id'],
      ],
    },
    {
      name: 'mixed',
      description: 'Run mixed campaign (shell + browser + orchestrator)',
      options: [
        ['--dry-run', 'Dry run mode'],
        ['--batch-count <n>', 'Number of batches'],
        ['--initial-checkpoint <id>', 'Initial checkpoint id'],
      ],
    },
    {
      name: 'mixed-resume',
      description: 'Resume a previous mixed campaign',
      options: [
        ['--dry-run', 'Dry run mode'],
        ['--batch-count <n>', 'Number of batches'],
        ['--initial-checkpoint <id>', 'Initial checkpoint id'],
      ],
    },
    {
      name: 'mixed-eval',
      description: 'Run mixed evaluation',
      options: [
        ['--window <n>', 'Evaluation window'],
        ['--json-output <path>', 'JSON output file path'],
      ],
    },
  ],
});

function resolveEnvironments(command) {
  if (command === 'browser-only') return ['browser'];
  if (command === 'orchestrator-only') return ['orchestrator'];
  return ['shell', 'browser', 'orchestrator'];
}

async function runCampaignCommand({ command, flags, rootDir }) {
  const mode = command === 'mixed-resume' ? 'mixed' : command;
  const result = await runMixedCampaign({
    rootDir,
    activeEnvironments: resolveEnvironments(command),
    batchTargetCount: Number(flags.batchCount || (flags.dryRun ? 1 : 3)),
    initialCheckpointId: flags.initialCheckpoint || 'ckpt-mixed-a',
    resume: command === 'mixed-resume',
    mode,
  });
  const runId = `rl-mixed-v1-${Date.now()}`;
  const summary = await writeMixedSummary({
    rootDir,
    runId,
    mode,
    result,
  });

  console.log(`mode=${command}`);
  console.log(`status=${result.status}`);
  console.log(`mixed_batch_count=${result.summary.mixed_batch_count}`);
  console.log(`summary_path=${summary.summaryPath}`);
}

async function main() {
  const rootDir = process.cwd();
  const parsed = cli.parse(process.argv.slice(2));

  if (parsed.help) {
    console.log(cli.program.helpInformation());
    return;
  }

  const command = parsed.command;
  if (!command) {
    console.log(cli.program.helpInformation());
    process.exitCode = 1;
    return;
  }

  const flags = parsed.flags;

  if (['browser-only', 'orchestrator-only', 'mixed', 'mixed-resume'].includes(command)) {
    await runCampaignCommand({ command, flags, rootDir });
    return;
  }

  if (command === 'mixed-eval') {
    const result = await runMixedEvaluation({
      rootDir,
      window: Number(flags.window || 30),
      jsonOutput: flags.jsonOutput || '',
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(cli.program.helpInformation());
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
