import fs from 'node:fs/promises';
import path from 'node:path';

import { checkGeneratedSkillsSync } from '../skills/sync.mjs';
import { syncNativeEnhancements } from './sync.mjs';
import { readNativeSyncMetadata } from './install-metadata.mjs';
import { createNativeRepairSession, finalizeNativeRepairSession } from './repairs.mjs';
import { renderClaudeNativeOutputs } from './emitters/claude.mjs';
import { renderCodexNativeOutputs } from './emitters/codex.mjs';
import { renderGeminiNativeOutputs } from './emitters/gemini.mjs';
import { renderKiroNativeOutputs } from './emitters/kiro.mjs';
import { renderOpencodeNativeOutputs } from './emitters/opencode.mjs';
import {
  AIOS_NATIVE_JSON_KEY,
  hasManagedMarkdownBlock,
  parseJsonObject,
  wrapManagedMarkdown,
} from './emitters/shared.mjs';
import { buildNativeOutputPlan, loadNativeSyncManifest, resolveNativeClients } from './source-tree.mjs';

const EMITTERS = {
  codex: renderCodexNativeOutputs,
  claude: renderClaudeNativeOutputs,
  gemini: renderGeminiNativeOutputs,
  kiro: renderKiroNativeOutputs,
  opencode: renderOpencodeNativeOutputs,
};

async function readOptional(targetPath) {
  try {
    return await fs.readFile(targetPath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function buildIssue({ client, status = 'warn', message, fix }) {
  return {
    client,
    status,
    message: String(message || '').trim(),
    fix: String(fix || '').trim(),
    target: '',
  };
}

function buildFixCommand(client) {
  return `node scripts/aios.mjs update --components native --client ${client}`;
}

function formatOperationTarget(operation) {
  if (operation.kind === 'json-merge') {
    return `${operation.targetPath}#${AIOS_NATIVE_JSON_KEY}`;
  }
  if (operation.kind === 'json-merge-object') {
    return `${operation.targetPath}#${operation.targetKey}`;
  }
  return operation.targetPath;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSubsetObject(currentObject, fragment) {
  if (!isPlainObject(currentObject) || !isPlainObject(fragment)) {
    return false;
  }

  for (const [key, value] of Object.entries(fragment)) {
    const currentValue = currentObject[key];
    if (isPlainObject(value)) {
      if (!isSubsetObject(currentValue, value)) {
        return false;
      }
      continue;
    }
    if (JSON.stringify(currentValue) !== JSON.stringify(value)) {
      return false;
    }
  }

  return true;
}

function parseIssueTargetFromMessage(message = '') {
  const match = String(message || '').match(/^\[[^\]]+\]\s+([^\s].*)$/u);
  if (!match) {
    return '';
  }
  const candidate = String(match[1] || '').trim();
  if (!candidate) {
    return '';
  }
  const token = candidate.split(/\s+/u)[0];
  return token;
}

function withIssueTarget(issue, target) {
  return {
    ...issue,
    target: String(target || '').trim(),
  };
}

function collectPlannedFixTargets(reports = []) {
  const targets = new Set();
  for (const report of reports) {
    for (const issue of report.issues || []) {
      if (issue.target) {
        targets.add(issue.target);
      } else {
        const extracted = parseIssueTargetFromMessage(issue.message);
        if (extracted) {
          targets.add(extracted);
        }
      }
    }
  }
  return [...targets].sort((left, right) => left.localeCompare(right));
}

function printPathList(io, prefix, items = [], maxCount = 12) {
  const total = items.length;
  io.log(`${prefix} total=${total}`);
  const shown = items.slice(0, maxCount);
  for (const item of shown) {
    io.log(`${prefix} file=${item}`);
  }
  if (total > maxCount) {
    io.log(`${prefix} ... +${total - maxCount} more`);
  }
}

async function inspectOperation({ rootDir, client, operation, fixCommand, issues }) {
  const targetPath = path.join(rootDir, operation.targetPath);
  const current = await readOptional(targetPath);
  const operationTarget = formatOperationTarget(operation);

  if (operation.kind === 'markdown-block') {
    if (!current) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[missing] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
      return;
    }
    try {
      if (!hasManagedMarkdownBlock(current)) {
        issues.push(withIssueTarget(buildIssue({ client, message: `[unmanaged conflict] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
        return;
      }
    } catch {
      issues.push(withIssueTarget(buildIssue({ client, status: 'error', message: `[malformed] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
      return;
    }
    const expectedBlock = wrapManagedMarkdown(operation.content);
    if (!current.includes(expectedBlock)) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[drift] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
    }
    return;
  }

  if (operation.kind === 'managed-file') {
    if (!current) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[missing] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
      return;
    }
    try {
      if (!hasManagedMarkdownBlock(current)) {
        issues.push(withIssueTarget(buildIssue({ client, message: `[unmanaged conflict] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
        return;
      }
    } catch {
      issues.push(withIssueTarget(buildIssue({ client, status: 'error', message: `[malformed] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
      return;
    }
    if (current !== wrapManagedMarkdown(operation.content)) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[drift] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
    }
    return;
  }

  if (!current) {
    issues.push(withIssueTarget(buildIssue({ client, message: `[missing] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
    return;
  }

  if (operation.kind === 'json-merge-object') {
    let parsedObject;
    try {
      parsedObject = parseJsonObject(current, targetPath);
    } catch {
      issues.push(withIssueTarget(buildIssue({ client, status: 'error', message: `[invalid json] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
      return;
    }

    const currentNode = parsedObject[operation.targetKey];
    if (!isPlainObject(currentNode) || !isSubsetObject(currentNode, operation.content)) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[drift] ${operation.targetPath}#${operation.targetKey}`, fix: fixCommand }), operationTarget));
    }
    return;
  }

  let parsed;
  try {
    parsed = parseJsonObject(current, targetPath);
  } catch {
    issues.push(withIssueTarget(buildIssue({ client, status: 'error', message: `[invalid json] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
    return;
  }
  if (!(AIOS_NATIVE_JSON_KEY in parsed)) {
    issues.push(withIssueTarget(buildIssue({ client, message: `[missing] ${operation.targetPath}#${AIOS_NATIVE_JSON_KEY}`, fix: fixCommand }), operationTarget));
    return;
  }
  if (JSON.stringify(parsed[AIOS_NATIVE_JSON_KEY]) !== JSON.stringify(operation.content)) {
    issues.push(withIssueTarget(buildIssue({ client, message: `[drift] ${operation.targetPath}#${AIOS_NATIVE_JSON_KEY}`, fix: fixCommand }), operationTarget));
  }

  return;
}

async function inspectClient({ rootDir, manifest, client }) {
  const plan = buildNativeOutputPlan({ rootDir, manifest, client });
  const metadataPathRelative = path.relative(rootDir, plan.metadataPath) || plan.metadataPath;
  const rendered = EMITTERS[client]({ rootDir, manifest });
  const operationTargets = rendered.operations.map((operation) => formatOperationTarget(operation));
  const fixCommand = buildFixCommand(client);
  const issues = [];
  const metadata = readNativeSyncMetadata(plan.metadataRoot);
  let hasManagedFootprint = false;

  for (const operation of rendered.operations) {
    const targetPath = path.join(rootDir, operation.targetPath);
    const current = await readOptional(targetPath);
    if (!current) {
      continue;
    }
    if (operation.kind === 'json-merge') {
      try {
        const parsed = parseJsonObject(current, targetPath);
        if (AIOS_NATIVE_JSON_KEY in parsed) {
          hasManagedFootprint = true;
        }
      } catch {
        hasManagedFootprint = true;
      }
      continue;
    }
    if (operation.kind === 'json-merge-object') {
      try {
        const parsed = parseJsonObject(current, targetPath);
        if (isPlainObject(parsed[operation.targetKey])) {
          hasManagedFootprint = true;
        }
      } catch {
        hasManagedFootprint = true;
      }
      continue;
    }
    try {
      if (hasManagedMarkdownBlock(current)) {
        hasManagedFootprint = true;
      }
    } catch {
      hasManagedFootprint = true;
    }
  }

  for (const relativePath of plan.outputs) {
    if (relativePath === 'AGENTS.md' || relativePath === 'CLAUDE.md' || relativePath.endsWith('settings.local.json') || relativePath.endsWith('AIOS.md')) {
      continue;
    }
    if (await pathExists(path.join(rootDir, relativePath))) {
      hasManagedFootprint = true;
    }
  }

  if (!metadata) {
    if (!hasManagedFootprint) {
      return {
        client,
        tier: plan.tier,
        issues,
        details: {
          metadataPath: metadataPathRelative,
          metadataPresent: false,
          metadataGeneratedAt: '',
          expectedManagedTargets: [...rendered.managedTargets],
          metadataManagedTargets: [],
          operationTargets,
        },
      };
    }
    issues.push(withIssueTarget(buildIssue({ client, message: `[missing] ${metadataPathRelative}`, fix: fixCommand }), metadataPathRelative));
  } else {
    if (metadata.client !== client) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[drift] ${metadataPathRelative} client=${metadata.client}`, fix: fixCommand }), metadataPathRelative));
    }
    if (metadata.tier !== plan.tier) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[drift] ${metadataPathRelative} tier=${metadata.tier}`, fix: fixCommand }), metadataPathRelative));
    }
    if (JSON.stringify(metadata.managedTargets || []) !== JSON.stringify(rendered.managedTargets)) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[drift] ${metadataPathRelative} managedTargets`, fix: fixCommand }), metadataPathRelative));
    }
  }

  for (const operation of rendered.operations) {
    await inspectOperation({ rootDir, client, operation, fixCommand, issues });
  }

  const skillsResult = await checkGeneratedSkillsSync({
    rootDir,
    surfaces: [client],
    io: { log() {} },
  });
  if (!skillsResult.ok) {
    for (const issue of skillsResult.issues) {
      issues.push(withIssueTarget(buildIssue({ client, message: issue, fix: fixCommand }), parseIssueTargetFromMessage(issue)));
    }
  }

  if (client === 'codex' || client === 'claude' || client === 'kiro') {
    const agentRoot = path.join(rootDir, `.${client}`, 'agents');
    if (!(await pathExists(agentRoot))) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[missing] .${client}/agents`, fix: fixCommand }), `.${client}/agents`));
    }
  }

  return {
    client,
    tier: plan.tier,
    issues,
    details: {
      metadataPath: metadataPathRelative,
      metadataPresent: Boolean(metadata),
      metadataGeneratedAt: String(metadata?.generatedAt || ''),
      expectedManagedTargets: [...rendered.managedTargets],
      metadataManagedTargets: Array.isArray(metadata?.managedTargets) ? [...metadata.managedTargets] : [],
      operationTargets,
    },
  };
}

export async function checkNativeEnhancementsSync({ rootDir, client = 'all' } = {}) {
  const manifest = loadNativeSyncManifest(rootDir);
  const clients = resolveNativeClients(client);
  const reports = [];
  const issues = [];

  for (const currentClient of clients) {
    const report = await inspectClient({ rootDir, manifest, client: currentClient });
    reports.push(report);
    for (const issue of report.issues) {
      issues.push(`[${issue.client}] ${issue.message}`);
    }
  }

  return {
    ok: issues.length === 0,
    reports,
    issues,
  };
}

function printNativeReportDetails(report, io, verbose) {
  if (!verbose) {
    return;
  }
  const details = report.details || {};
  const metadataStatus = details.metadataPresent ? 'present' : 'missing';
  const generatedAt = details.metadataGeneratedAt ? ` generatedAt=${details.metadataGeneratedAt}` : '';
  io.log(`[info] native ${report.client} metadata=${details.metadataPath || '(unknown)'} ${metadataStatus}${generatedAt}`);
  io.log(`[info] native ${report.client} managedTargets(expected): ${(details.expectedManagedTargets || []).join(', ') || '(none)'}`);
  if (details.metadataPresent) {
    io.log(`[info] native ${report.client} managedTargets(recorded): ${(details.metadataManagedTargets || []).join(', ') || '(none)'}`);
  }
  io.log(`[info] native ${report.client} operations: ${(details.operationTargets || []).join(', ') || '(none)'}`);
}

export async function doctorNativeEnhancements({
  rootDir,
  client = 'all',
  verbose = false,
  fix = false,
  dryRun = false,
  io = console,
} = {}) {
  let result = await checkNativeEnhancementsSync({ rootDir, client });
  let autoFixErrors = 0;
  let effectiveWarnings = 0;
  let errors = 0;

  io.log('Native Enhancements Doctor');
  io.log('--------------------------');

  if (dryRun && !fix) {
    io.log('[warn] --dry-run is effective only with --fix');
  }

  if (fix) {
    const clientsToFix = result.reports
      .filter((report) => report.issues.length > 0)
      .map((report) => report.client);
    let repairSession = null;
    let repairFinalized = null;

    if (clientsToFix.length === 0) {
      io.log('[ok] native auto-fix: no actionable issues');
    } else {
      io.log('');
      io.log('Native Auto-Fix');
      io.log('---------------');
      if (!dryRun) {
        repairSession = await createNativeRepairSession({
          rootDir,
          clients: clientsToFix,
          reason: 'doctor-native-fix',
          dryRun: false,
        });
        io.log(`[repair] id=${repairSession.repairId}`);
        io.log(`[repair] manifest=${repairSession.manifestRelPath}`);
      }

      for (const targetClient of clientsToFix) {
        const fixCommand = buildFixCommand(targetClient);
        if (dryRun) {
          io.log(`[plan] native ${targetClient}: ${fixCommand}`);
          continue;
        }
        io.log(`[fix] native ${targetClient}: ${fixCommand}`);
        try {
          await syncNativeEnhancements({
            rootDir,
            client: targetClient,
            mode: 'install',
            repair: { force: true },
            io,
          });
          io.log(`[ok] native ${targetClient}: auto-fix applied`);
        } catch (error) {
          autoFixErrors += 1;
          const message = error instanceof Error ? error.message : String(error);
          io.log(`[error] native ${targetClient}: auto-fix failed (${message})`);
        }
      }
      if (!dryRun) {
        if (repairSession) {
          repairFinalized = await finalizeNativeRepairSession({
            rootDir,
            session: repairSession,
            status: autoFixErrors > 0 ? 'completed-with-errors' : 'completed',
            errorMessage: autoFixErrors > 0 ? `${autoFixErrors} auto-fix failures` : '',
          });
          io.log(`[repair] summary changed=${repairFinalized.summary.totalChanged} added=${repairFinalized.summary.added} updated=${repairFinalized.summary.updated} removed=${repairFinalized.summary.removed}`);
          const changed = (repairFinalized.changedEntries || []).map((entry) => `${entry.path} (${entry.change})`);
          printPathList(io, '[repair] changed', changed, 15);
          io.log(`[repair] rollback: node scripts/aios.mjs internal native rollback --repair-id ${repairFinalized.repairId}`);
        }
        result = await checkNativeEnhancementsSync({ rootDir, client });
      } else {
        const plannedTargets = collectPlannedFixTargets(result.reports.filter((report) => clientsToFix.includes(report.client)));
        printPathList(io, '[plan] native files', plannedTargets, 15);
      }
    }
  }

  for (const report of result.reports) {
    printNativeReportDetails(report, io, verbose);

    if (report.issues.length === 0) {
      io.log(`[ok] native ${report.client} tier=${report.tier}`);
      continue;
    }

    for (const issue of report.issues) {
      if (issue.status === 'error') {
        errors += 1;
      } else {
        effectiveWarnings += 1;
      }
      io.log(`[${issue.status}] native ${issue.client}: ${issue.message}`);
      if (issue.fix) {
        io.log(`  fix: ${issue.fix}`);
      }
    }
  }
  errors += autoFixErrors;

  return {
    ok: errors === 0 && effectiveWarnings === 0,
    effectiveWarnings,
    errors,
    issues: result.issues,
  };
}
