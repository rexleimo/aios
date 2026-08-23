import { evaluateTrigger, recordSuccessfulRun, EVOLUTION_TRIGGER_DEFAULTS } from './evolution/trigger.mjs';
import { getEvolutionStatus } from './evolution/status.mjs';
import { runDream } from './dream/index.mjs';
import { importSessionCandidates } from './evolution/integration.mjs';

function configFromOptions(options = {}) {
  return {
    minCandidates: Number.isFinite(options.minCandidates) ? options.minCandidates : EVOLUTION_TRIGGER_DEFAULTS.minCandidates,
    cooldownHours: Number.isFinite(options.cooldownHours) ? options.cooldownHours : EVOLUTION_TRIGGER_DEFAULTS.cooldownHours,
  };
}

export async function runEvolutionCommand(options = {}, { rootDir, stdout = process.stdout, stderr = process.stderr } = {}) {
  const config = configFromOptions(options);
  if (options.subcommand === 'status') {
    const report = await getEvolutionStatus({ rootDir, config, format: options.json ? 'json' : 'human' });
    stdout.write(`${options.json ? JSON.stringify(report, null, 2) : report.rendered}\n`);
    return { exitCode: 0, report };
  }

  if (options.subcommand !== 'run') {
    stderr.write(`Unknown evolution subcommand: ${options.subcommand}\n`);
    return { exitCode: 1 };
  }

  const decision = await evaluateTrigger({ rootDir, config, force: 'manual' });
  const imported = await importSessionCandidates(rootDir, { dryRun: options.preview, logger: { log() {}, error() {} } });
  const dream = await runDream({ rootDir, mode: options.preview ? 'preview' : 'apply', spaces: ['default'] });
  if (!options.preview) await recordSuccessfulRun(rootDir);

  const result = {
    schemaVersion: 1,
    kind: 'evolution-run',
    checkOnly: false,
    mode: options.preview ? 'preview' : 'proposal-only',
    decision,
    imported,
    dream,
    promoted: false,
    reason: 'Consolidation writes proposals only; validation and promotion require explicit governance.',
  };
  stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return { exitCode: 0, result };
}
