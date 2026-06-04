import { buildClientCapabilityReport } from '../clients/registry.mjs';

function renderTextReport(report) {
  const lines = [
    `AIOS client capability doctor (${report.policy})`,
  ];
  for (const client of report.clients) {
    lines.push(`- ${client.clientId} (${client.runtimeId}): ${client.status}`);
    if (client.reasons.length > 0) {
      lines.push(`  reasons: ${client.reasons.join('; ')}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function runClientsCommand(options = {}, { rootDir = process.cwd(), stdout = process.stdout } = {}) {
  const subcommand = String(options.subcommand || 'doctor').trim().toLowerCase();
  if (subcommand !== 'doctor') {
    throw new Error('clients requires subcommand: doctor');
  }
  const report = await buildClientCapabilityReport({ rootDir });
  const json = options.json || options.format === 'json';
  stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderTextReport(report));
  return { exitCode: 0, report };
}

