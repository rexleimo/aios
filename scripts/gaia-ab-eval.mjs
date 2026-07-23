#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

import { createCliParser } from '../src/shared/cli-parser.mjs';
import { buildGaiaAbDryRunSummary, parseGaiaAbManifest } from './lib/gaia-ab-eval/manifest.mjs';

const cli = createCliParser({
  name: 'gaia-ab-eval',
  description: 'GAIA A/B evaluator with an operator-gated live entry point',
  options: [
    ['--config <path>', 'Path to the GAIA A/B evaluation manifest'],
    ['--dry-run', 'Validate configuration without invoking a client'],
    ['--execute', 'Require the guarded production execution path'],
  ],
});

async function main() {
  const parsed = cli.parse(process.argv.slice(2));

  if (parsed.help) {
    console.log(cli.program.helpInformation());
    return;
  }

  if (parsed.flags.dryRun && parsed.flags.execute) {
    throw new Error('GAIA A/B evaluation accepts either --dry-run or --execute, not both');
  }
  if (!parsed.flags.dryRun && !parsed.flags.execute) {
    throw new Error('GAIA A/B evaluation requires --dry-run or --execute');
  }
  if (!parsed.flags.config) {
    throw new Error('GAIA A/B evaluation requires --config <path>');
  }
  if (parsed.flags.execute) {
    throw new Error('GAIA A/B --execute remains fail-closed until production client adapters are configured');
  }

  const manifest = parseGaiaAbManifest(await readFile(parsed.flags.config, 'utf8'));
  console.log(JSON.stringify(buildGaiaAbDryRunSummary(manifest), null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
