import { buildDesiredHeadroomEntry, buildHeadroomMcpAddInvocation, buildHeadroomMcpRemoveInvocation } from './commands.mjs';
import { readHeadroomEntry, resolveHeadroomConfigTargets } from './config-readers.mjs';
import {
  classifyHeadroomOwnership,
  fingerprintHeadroomEntry,
  readHeadroomLedger,
  writeHeadroomLedger,
} from './ownership.mjs';

const MCP_RUNTIME_BY_AGENT = Object.freeze({
  gemini: 'gemini-cli',
  hermes: 'hermes-agent',
  grok: 'grok-build',
});
const REQUIRED_HEADROOM_TOOLS = Object.freeze(['headroom_compress', 'headroom_retrieve', 'headroom_stats']);

function hermesEntryUsable(entry) {
  if (!entry || entry.enabled !== true) return false;
  const tools = new Set(entry.tools || []);
  return REQUIRED_HEADROOM_TOOLS.every((name) => tools.has(name));
}

export async function inspectHeadroomMcpRegistration(options = {}) {
  const { runtimeId, projectRoot = process.cwd(), env = process.env, homeDir, profile = '', readFileImpl } = options;
  const targets = resolveHeadroomConfigTargets({ runtimeId, projectRoot, env, homeDir, profile });
  const [user, project] = await Promise.all([
    readHeadroomEntry(targets.user, { readFileImpl }),
    readHeadroomEntry(targets.project, { readFileImpl }),
  ]);
  return {
    actual: user.entry,
    configPath: user.target?.path || '',
    projectShadow: Boolean(project.entry),
    parseError: user.parseError || project.parseError || '',
  };
}

export async function ensureHeadroomMcpRegistration(options = {}) {
  const {
    runtimeId,
    headroomPath,
    mode = 'auto',
    consent = false,
    dryRun = false,
    profile = '',
    inspectImpl = inspectHeadroomMcpRegistration,
    runImpl,
    probeImpl = async () => ({ status: 'registered' }),
    readLedgerImpl = readHeadroomLedger,
    writeLedgerImpl = writeHeadroomLedger,
    now = () => new Date().toISOString(),
  } = options;

  if (!['auto', 'on', 'off'].includes(mode)) return { status: 'failed', reason: `invalid AIOS_HEADROOM_MCP=${mode}` };
  if (runtimeId === 'hermes-agent' && !options.isTTY) {
    return { status: 'pending-interactive', manual: buildHeadroomMcpAddInvocation({ runtimeId, headroomPath, profile }) };
  }

  const desired = buildDesiredHeadroomEntry(runtimeId, headroomPath);
  const ledger = await readLedgerImpl(options);
  const before = await inspectImpl({ ...options, runtimeId, desired, profile });
  if (before.parseError) return { status: 'failed', reason: `config-parse-failed: ${before.parseError}` };

  const ownership = classifyHeadroomOwnership({ actual: before.actual, desired, ledgerEntry: ledger.entries?.[runtimeId] });
  if (ownership.status === 'conflict') return { status: 'conflict', configPath: before.configPath, projectShadow: before.projectShadow === true };
  if (ownership.status === 'external') return { status: 'external', configPath: before.configPath, projectShadow: before.projectShadow === true };
  if (ownership.status === 'owned') return { status: 'registered', configPath: before.configPath, projectShadow: before.projectShadow === true };
  if (mode === 'off') return { status: 'disabled', reason: 'registration-disabled' };
  if (!consent) return { status: 'pending-consent' };

  const add = buildHeadroomMcpAddInvocation({ runtimeId, headroomPath, profile });
  if (dryRun) return { status: 'pending-smoke', planned: add, projectShadow: before.projectShadow === true };
  if (!runImpl) return { status: 'failed', reason: 'missing-runner' };

  const addResult = await runImpl(add.command, add.args, { stdio: 'inherit' });
  if (addResult.status !== 0) return { status: 'failed', reason: `mcp-add-exit-${addResult.status}` };

  const after = await inspectImpl({ ...options, runtimeId, desired, profile });
  const afterFingerprint = after.actual ? fingerprintHeadroomEntry(after.actual) : '';
  const desiredFingerprint = fingerprintHeadroomEntry(desired);
  if (afterFingerprint !== desiredFingerprint) return { status: 'failed', reason: 'post-add-fingerprint-mismatch' };
  if (runtimeId === 'hermes-agent' && !hermesEntryUsable(after.actual)) {
    return { status: 'failed', reason: 'hermes-tools-not-enabled' };
  }

  const timestamp = now();
  ledger.entries[runtimeId] = {
    runtimeId,
    profile: profile || null,
    configPath: after.configPath,
    command: desired.command,
    fingerprint: afterFingerprint,
    createdAt: timestamp,
    lastVerifiedAt: timestamp,
  };
  await writeLedgerImpl(ledger, options);

  const probe = await probeImpl(desired);
  if (probe.status !== 'pending-smoke' && probe.status !== 'verified' && probe.status !== 'registered') {
    const current = await inspectImpl({ ...options, runtimeId, desired, profile });
    const safeToRollback = current.actual && fingerprintHeadroomEntry(current.actual) === afterFingerprint;
    if (safeToRollback) {
      const remove = buildHeadroomMcpRemoveInvocation({ runtimeId, profile });
      await runImpl(remove.command, remove.args, { stdio: 'inherit' });
    }
    return { status: 'failed', reason: probe.reason || 'mcp-probe-failed', rolledBack: Boolean(safeToRollback) };
  }
  return { status: probe.status, configPath: after.configPath, projectShadow: after.projectShadow === true };
}

export async function removeOwnedHeadroomMcp(options = {}) {
  const { runtimeId, profile = '', isTTY = false, inspectImpl = inspectHeadroomMcpRegistration, runImpl, ledgerEntry } = options;
  if (runtimeId === 'hermes-agent' && !isTTY) {
    return { status: 'pending-interactive', manual: buildHeadroomMcpRemoveInvocation({ runtimeId, profile }) };
  }
  const current = await inspectImpl(options);
  if (!current.actual) return { status: 'not-found' };
  if (!ledgerEntry || fingerprintHeadroomEntry(current.actual) !== ledgerEntry.fingerprint) {
    return { status: 'conflict', reason: 'entry-changed-after-aios-registration' };
  }
  if (!runImpl) return { status: 'failed', reason: 'missing-runner' };
  const remove = buildHeadroomMcpRemoveInvocation({ runtimeId, profile });
  const removed = await runImpl(remove.command, remove.args, { stdio: 'inherit' });
  if (removed.status !== 0) return { status: 'failed', reason: `mcp-remove-exit-${removed.status}` };
  const after = await inspectImpl(options);
  return after.actual ? { status: 'failed', reason: 'post-remove-entry-still-present' } : { status: 'removed' };
}

export async function ensureHeadroomMcpRegistrations({ agents = [], ...options } = {}) {
  const detected = new Set(agents.map((agent) => MCP_RUNTIME_BY_AGENT[agent]).filter(Boolean));
  const statuses = {};
  for (const runtimeId of Object.values(MCP_RUNTIME_BY_AGENT)) {
    statuses[runtimeId] = detected.has(runtimeId)
      ? (await ensureHeadroomMcpRegistration({ ...options, runtimeId })).status
      : 'not-detected';
  }
  return statuses;
}
