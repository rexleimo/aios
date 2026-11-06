import { listManagedSkills, manageSkill } from './management.mjs';
import { resolveClientSelection } from '../../../../foundation/clients/registry.mjs';

export async function runSkillManagement(options, { rootDir, stdout = process.stdout } = {}) {
  const context = { rootDir, projectRoot: options.projectRoot || rootDir };
  try {
    const report = ['list', 'diagnose'].includes(options.subcommand)
      ? await listManagedSkills(context)
      : await manageSkill({ action: options.subcommand, name: options.name, source: options.source,
        kind: options.kind, clients: [...new Set(String(options.client).split(',').flatMap(id => resolveClientSelection(id)))],
        scope: options.scope, dryRun: options.dryRun, expectedRevision: options.expectedRevision }, context);
    if (options.json) stdout.write(`${JSON.stringify(report)}\n`);
    else if (report.skills) {
      for (const client of report.clients) stdout.write(`${client.id}: ${client.capabilities.join(', ')}\n`);
      for (const row of report.skills) stdout.write(`${row.client}/${row.scope}/${row.name}: ${row.ownership}${row.reason ? ` (${row.reason})` : ''}\n`);
      for (const warning of report.warnings) stdout.write(`warning: ${warning.reason}\n`);
    } else {
      for (const row of report.results) stdout.write(`${row.client}/${row.scope}/${row.name}: ${row.status}${report.dryRun ? ' [preview]' : ''}${row.reason ? ` (${row.reason})` : ''}${row.backup ? ` backup=${row.backup}` : ''}\n`);
      if (report.error) stdout.write(`${report.error}\n`);
    }
    return { exitCode: report.ok ? 0 : 1 };
  } catch (error) {
    stdout.write(`${options.json ? JSON.stringify({ ok: false, error: error.message }) : error.message}\n`);
    return { exitCode: 1 };
  }
}
