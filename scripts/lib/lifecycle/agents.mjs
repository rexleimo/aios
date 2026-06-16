import { buildAgentCatalogue, renderAgentCatalogueText } from '../agents/catalogue.mjs';
import { runAgentsSmoke } from '../agents/smoke.mjs';

export async function runAgentsCommand(
  options = {},
  {
    rootDir = process.cwd(),
    stdout = process.stdout,
  } = {}
) {
  const subcommand = String(options.subcommand || 'doctor').trim().toLowerCase();
  if (!['doctor', 'list', 'smoke'].includes(subcommand)) {
    throw new Error('agents requires subcommand: doctor, list, or smoke');
  }
  if (subcommand === 'smoke') {
    const report = await runAgentsSmoke({ rootDir, dryRun: options.dryRun !== false });
    const json = options.json || options.format === 'json';
    stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderAgentsSmokeText(report));
    return { exitCode: report.missingRoles?.length ? 1 : 0, report };
  }
  const report = await buildAgentCatalogue({ rootDir });
  const json = options.json || options.format === 'json';
  stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderAgentCatalogueText(report));
  const blocked = subcommand === 'doctor' && report.strict.blocked;
  return { exitCode: blocked ? 1 : 0, report };
}

function renderAgentsSmokeText(report) {
  const lines = [
    `AIOS agents smoke ${report.dryRun ? 'dry-run' : 'record'} (${report.policy})`,
    `agents=${report.agents.length} missing=${report.missingRoles.length}`,
  ];
  for (const agent of report.agents) {
    lines.push(`- ${agent.agentId || agent.role}: ${agent.status}`);
  }
  return `${lines.join('\n')}\n`;
}
