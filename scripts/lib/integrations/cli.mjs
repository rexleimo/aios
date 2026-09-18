// scripts/lib/integrations/cli.mjs — `aios integration` 命令实现。
// 输出纪律：文本模式给人看（下一步做什么），JSON 模式给机器看（可断言）。
import { resolveIntegration, listIntegrations } from './registry.mjs';
import { addIntegration, removeIntegration } from './install.mjs';
import { runIntegrationDoctor } from './doctor.mjs';
import { resolveIntegrationClientOrder } from './clients.mjs';

const CLIENT_LABEL = Object.freeze({
  ok: 'registered',
  'already-registered': 'registered',
  planned: 'planned',
  absent: 'not registered',
  missing: 'missing (ledger says registered)',
  external: 'external (not written by AIOS)',
  conflict: 'conflict (modified after AIOS wrote it)',
  'client-missing': 'client not installed',
  unverified: 'unverified client',
  unsupported: 'unsupported',
  'pending-interactive': 'needs a terminal (run the printed command yourself)',
  'manual-step-required': 'manual step required',
  failed: 'failed',
  removed: 'removed',
  'not-found': 'not found',
  skipped: 'skipped',
});

function label(status) {
  return CLIENT_LABEL[status] || String(status);
}

function renderList(entries, { json }, stdout) {
  if (json) {
    stdout.write(`${JSON.stringify({ ok: true, integrations: entries }, null, 2)}\n`);
    return { exitCode: 0 };
  }
  if (entries.length === 0) {
    stdout.write('No vendor integrations are registered.\n');
    return { exitCode: 0 };
  }
  stdout.write('Vendor integrations:\n');
  for (const entry of entries) {
    stdout.write(`  ${entry.id}  ${entry.displayName}\n`);
    stdout.write(`      skill   ${entry.skill.repo}@${entry.skill.commit.slice(0, 12)} (${entry.skill.installName})\n`);
    stdout.write(`      mcp     ${entry.mcp.serverName} -> ${entry.mcp.url}\n`);
    stdout.write(`      docs    ${entry.docsIndex || entry.homepage}\n`);
    if (entry.env.length > 0) {
      stdout.write(`      env     ${entry.env.map((item) => item.name).join(', ')}\n`);
    }
  }
  return { exitCode: 0 };
}

function renderAdd(report, { json }, stdout) {
  if (json) {
    stdout.write(`${JSON.stringify({ ok: report.probe?.status === 'verified', report }, null, 2)}\n`);
    return { exitCode: report.probe?.status === 'verified' ? 0 : 1 };
  }
  stdout.write(`TypeSafe integration: ${report.displayName} (${report.vendor})${report.dryRun ? ' [dry-run]' : ''}\n`);
  stdout.write(`  docs MCP   ${report.serverName}\n`);

  if (report.skills) {
    const skill = report.skills;
    stdout.write(`  skill      ${skill.status} ${skill.commit ? `@${String(skill.commit).slice(0, 12)}` : ''} sha256=${String(skill.sha256 || '').slice(0, 12)}\n`);
    if (skill.status === 'refused') {
      stdout.write(`             refused: ${skill.reason} (${skill.catalogPath})\n`);
    }
  }
  for (const item of report.mcp) {
    stdout.write(`  ${item.client.padEnd(10)} ${label(item.status)}`);
    if (item.configPath) stdout.write(`  ${item.configPath}`);
    if (item.reason) stdout.write(`  (${item.reason})`);
    stdout.write('\n');
    if (item.invocation && item.status !== 'registered') {
      stdout.write(`             run: ${item.invocation}\n`);
    }    if (item.stderr) {
      stdout.write(`             stderr: ${item.stderr.replace(/\s+/gu, ' ').trim()}\n`);
    }
    if (item.configPath) {
      stdout.write(`             file: ${item.configPath}\n`);
    }
    if (item.snippet) {
      for (const line of JSON.stringify(item.snippet, null, 2).split('\n')) {
        stdout.write(`             ${line}\n`);
      }
    }
  }
  if (report.probe) {
    stdout.write(`  probe      ${report.probe.status}`);
    if (report.probe.latencyMs != null) stdout.write(` ${report.probe.latencyMs}ms`);
    if (report.probe.missingTools?.length) stdout.write(` missing tools: ${report.probe.missingTools.join(', ')}`);
    if (report.probe.reason) stdout.write(` (${report.probe.reason})`);
    stdout.write('\n');
  }
  if (report.ledgerPath) stdout.write(`  ledger     ${report.ledgerPath}\n`);
  return { exitCode: report.probe?.status === 'verified' ? 0 : 1 };
}

function renderDoctor(result, { json }, stdout) {
  if (json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return { exitCode: result.ok ? 0 : 1 };
  }
  stdout.write(`Integration doctor: ${result.displayName} (${result.vendor})\n`);
  stdout.write(`  docs MCP   ${result.probe.status}`);
  if (result.probe.latencyMs != null) stdout.write(` ${result.probe.latencyMs}ms`);
  if (result.probe.serverName) stdout.write(` server=${result.probe.serverName}`);
  if (result.probe.reason) stdout.write(` (${result.probe.reason})`);
  stdout.write('\n');
  if (result.probe.tools?.length) {
    stdout.write(`  tools      ${result.probe.tools.join(', ')}\n`);
  }
  stdout.write(`  skill      ${result.skill.status}`);
  if (result.skill.commit) stdout.write(` @${String(result.skill.commit).slice(0, 12)}`);
  if (result.skill.catalogPath) stdout.write(` ${result.skill.catalogPath}`);
  stdout.write('\n');
  for (const item of result.env) {
    stdout.write(`  env ${item.name.padEnd(18)} ${item.present ? 'set' : 'not set'}${item.required ? ' (required)' : ''}\n`);
  }
  stdout.write('  clients:\n');
  for (const item of result.clients) {
    stdout.write(`    ${item.client.padEnd(10)} ${label(item.status)}`);
    if (item.reason) stdout.write(`  (${item.reason})`);
    stdout.write('\n');
  }
  const s = result.summary;
  const parts = [
    `registered=${s.registered}`,
    `blocking=${s.blocking}`,
  ];
  if (s.clientMissing) parts.push(`client-missing=${s.clientMissing}`);
  if (s.manualStepRequired) parts.push(`manual-step-required=${s.manualStepRequired}`);
  if (s.pendingInteractive) parts.push(`pending-interactive=${s.pendingInteractive}`);
  stdout.write(`  summary    ${parts.join(' ')}\n`);
  return { exitCode: result.ok ? 0 : 1 };
}

function renderRemove(report, { json }, stdout) {
  if (json) {
    stdout.write(`${JSON.stringify({ ok: true, report }, null, 2)}\n`);
    return { exitCode: 0 };
  }
  stdout.write(`Removed integration: ${report.vendor}${report.dryRun ? ' [dry-run]' : ''}\n`);
  if (report.skill) stdout.write(`  skill      ${report.skill.status}\n`);
  for (const item of report.mcp) {
    stdout.write(`  ${item.client.padEnd(10)} ${label(item.status)}`);
    if (item.reason) stdout.write(`  (${item.reason})`);
    stdout.write('\n');
    if (item.stderr) stdout.write(`             stderr: ${item.stderr.replace(/\s+/gu, ' ').trim()}\n`);
  }
  return { exitCode: 0 };
}

export async function runIntegrationCommand(options = {}, { rootDir, projectRoot = rootDir, stdout = process.stdout } = {}) {
  const subcommand = String(options.subcommand || '').trim().toLowerCase();
  const json = options.json === true || options.format === 'json';

  if (!subcommand || subcommand === 'list') {
    return renderList(listIntegrations({ rootDir }), { json }, stdout);
  }

  if (!['add', 'doctor', 'remove'].includes(subcommand)) {
    throw new Error(`unknown integration subcommand "${subcommand}". Use: list, add, doctor, remove`);
  }

  const id = String(options.id || '').trim();
  if (!id) throw new Error(`aios integration ${subcommand} requires an integration id (for example: typesafe)`);
  const integration = resolveIntegration({ rootDir, id });
  const clients = Array.isArray(options.clients) ? options.clients : options.clients;

  if (subcommand === 'doctor') {
    const result = await runIntegrationDoctor({ rootDir, projectRoot, integration, clients: clients || 'all' });
    return renderDoctor(result, { json }, stdout);
  }

  if (subcommand === 'remove') {
    const report = await removeIntegration({
      rootDir,
      integration,
      clients: clients || 'all',
      scope: options.scope || 'global',
      dryRun: options.dryRun === true,
    });
    return renderRemove(report, { json }, stdout);
  }

  const report = await addIntegration({
    rootDir,
    projectRoot,
    integration,
    clients: clients || 'all',
    scope: options.scope || 'global',
    dryRun: options.dryRun === true,
    skipSkills: options.skipSkills === true,
    skipMcp: options.skipMcp === true,
  });
  return renderAdd(report, { json }, stdout);
}

export const INTEGRATION_HELP = Object.freeze({
  usage: [
    'aios integration list [--json]',
    'aios integration add <id> [--clients <list|all>] [--scope <global|project>] [--dry-run] [--skip-skills] [--skip-mcp] [--json]',
    'aios integration doctor <id> [--clients <list|all>] [--json]',
    'aios integration remove <id> [--clients <list|all>] [--scope <global|project>] [--dry-run] [--json]',
  ],
  knownClients: resolveIntegrationClientOrder(),
});
