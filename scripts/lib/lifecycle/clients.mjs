import { buildClientCapabilityReport } from '../clients/registry.mjs';
import { listSmokeClients, runClientSmoke } from '../clients/smoke.mjs';

function renderTextReport(report) {
  const lines = [
    `AIOS client capability doctor (${report.policy})`,
  ];
  if (report.nativeStrict?.enabled) {
    lines.push(`native-strict=${report.nativeStrict.ok ? 'pass' : 'fail'} shimDir=${report.nativeStrict.shimDir}`);
  }
  for (const client of report.clients) {
    lines.push(`- ${client.clientId} (${client.runtimeId}): ${client.status}`);
    lines.push(`  compression=${client.compressionCompliance.metric} entrypoint=${client.compressionCompliance.requiredEntrypoint} pre_send=required post_receive=required bypass=${client.compressionCompliance.uncontrolledHostOutputPolicy}`);
    if (report.nativeStrict?.enabled) {
      lines.push(`  nativeShim=installed:${client.nativeShim.installed ? 'yes' : 'no'} pathFront:${client.nativeShim.pathPrecedence ? 'yes' : 'no'} realClient:${client.nativeShim.realCommandAvailable ? 'yes' : 'no'}`);
    }
    if (client.reasons.length > 0) {
      lines.push(`  reasons: ${client.reasons.join('; ')}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function runClientsCommand(
  options = {},
  {
    rootDir = process.cwd(),
    env = process.env,
    stdout = process.stdout,
    listSmokeClientsImpl = listSmokeClients,
    runClientSmokeImpl = runClientSmoke,
  } = {}
) {
  const subcommand = String(options.subcommand || 'doctor').trim().toLowerCase();
  if (subcommand === 'smoke') {
    const available = listSmokeClientsImpl();
    const requested = String(options.client || available.join(','))
      .split(',').map((s) => s.trim()).filter(Boolean);
    const results = [];
    let skippedUnknown = 0;
    for (const client of requested) {
      if (!available.includes(client)) {
        stdout.write(`[clients] skip unknown smoke client: ${client}\n`);
        skippedUnknown += 1;
        continue;
      }
      const { evidence, evidencePath } = await runClientSmokeImpl(client, { rootDir });
      stdout.write(`[clients] smoke ${client}: ${evidence.status} (task exit ${evidence.taskExitCode}) -> ${evidencePath}\n`);
      results.push(evidence);
    }
    const allPassed = results.length > 0 && results.every((r) => r.status === 'pass');
    return { exitCode: skippedUnknown === 0 && allPassed ? 0 : 1, results, skippedUnknown };
  }
  if (subcommand !== 'doctor') {
    throw new Error('clients requires subcommand: doctor or smoke');
  }
  const report = await buildClientCapabilityReport({ rootDir, env, nativeStrict: Boolean(options.nativeStrict) });
  const json = options.json || options.format === 'json';
  stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderTextReport(report));
  return { exitCode: report.nativeStrict?.enabled && !report.nativeStrict.ok ? 1 : 0, report };
}
