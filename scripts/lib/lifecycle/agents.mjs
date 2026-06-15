import { buildAgentCatalogue, renderAgentCatalogueText } from '../agents/catalogue.mjs';

export async function runAgentsCommand(
  options = {},
  {
    rootDir = process.cwd(),
    stdout = process.stdout,
  } = {}
) {
  const subcommand = String(options.subcommand || 'doctor').trim().toLowerCase();
  if (!['doctor', 'list'].includes(subcommand)) {
    throw new Error('agents requires subcommand: doctor or list');
  }
  const report = await buildAgentCatalogue({ rootDir });
  const json = options.json || options.format === 'json';
  stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderAgentCatalogueText(report));
  const blocked = subcommand === 'doctor' && report.strict.blocked;
  return { exitCode: blocked ? 1 : 0, report };
}
