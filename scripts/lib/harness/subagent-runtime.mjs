import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import agentSpec from '../../../memory/specs/orchestrator-agents.json' with { type: 'json' };
import { runContextDbCli } from '../contextdb-cli.mjs';
import {
  buildClientModelArgs,
  buildModelRouterPromptSection,
  isModelRouterEnabled,
  normalizeModelRouting,
  recordModelDispatch,
} from '../model-router.mjs';
import { spawnCommand, spawnCommandWithInput, commandExists } from '../platform/process.mjs';
import { normalizeHandoffPayload, validateHandoffPayload } from './handoff.mjs';
import { normalizeOrchestratorAgentSpec } from './orchestrator-agents.mjs';
import { mergeParallelHandoffs } from './orchestrator.mjs';
import { buildPersonaOverlay } from '../memo/persona.mjs';
import { workspaceMemorySessionId, workspaceMemorySessionDir, workspaceMemoryMetaPath, workspaceMemoryPinnedPath } from '../memo/workspace-memory.mjs';
import { contextDbRelativePath } from '../aios/state-root.mjs';

export const SUBAGENT_CLIENT_ENV = 'AIOS_SUBAGENT_CLIENT';
export const SUBAGENT_CONCURRENCY_ENV = 'AIOS_SUBAGENT_CONCURRENCY';
export const SUBAGENT_TIMEOUT_MS_ENV = 'AIOS_SUBAGENT_TIMEOUT_MS';
export const SUBAGENT_CONTEXT_LIMIT_ENV = 'AIOS_SUBAGENT_CONTEXT_LIMIT';
export const SUBAGENT_CONTEXT_TOKEN_BUDGET_ENV = 'AIOS_SUBAGENT_CONTEXT_TOKEN_BUDGET';
export const SUBAGENT_CONTEXT_TOKEN_STRATEGY_ENV = 'AIOS_SUBAGENT_CONTEXT_TOKEN_STRATEGY';
export const SUBAGENT_UPSTREAM_MAX_ATTEMPTS_ENV = 'AIOS_SUBAGENT_UPSTREAM_MAX_ATTEMPTS';
export const SUBAGENT_UPSTREAM_BACKOFF_MS_ENV = 'AIOS_SUBAGENT_UPSTREAM_BACKOFF_MS';
export const SUBAGENT_PRE_MUTATION_SNAPSHOT_ENV = 'AIOS_SUBAGENT_PRE_MUTATION_SNAPSHOT';
export const SUBAGENT_CODEX_DISABLE_MCP_ENV = 'AIOS_SUBAGENT_CODEX_DISABLE_MCP';
export const SUBAGENT_CODEX_UNATTENDED_ENV = 'AIOS_SUBAGENT_CODEX_UNATTENDED';
export const SUBAGENT_CLAUDE_UNATTENDED_ENV = 'AIOS_SUBAGENT_CLAUDE_UNATTENDED';
export const SUBAGENT_GEMINI_UNATTENDED_ENV = 'AIOS_SUBAGENT_GEMINI_UNATTENDED';

const SUPPORTED_CLIENTS = new Set(['codex-cli', 'claude-code', 'gemini-cli', 'opencode-cli']);
const CLIENT_COMMAND = {
  'codex-cli': 'codex',
  'claude-code': 'claude',
  'gemini-cli': 'gemini',
  'opencode-cli': 'opencode',
};

const CODEX_OUTPUT_SCHEMA_REL = path.join('memory', 'specs', 'agent-handoff.schema.json');

function normalizeText(value) {
  return String(value ?? '').trim();
}

function clipText(value, maxLen = 8000) {
  const text = String(value ?? '');
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}\n...[truncated]`;
}

function normalizeOwnedPath(value = '') {
  return normalizeText(value)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

function toPosixPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/');
}

function normalizeWorkspaceRelativePath(value = '') {
  const normalized = normalizeOwnedPath(value);
  if (!normalized || normalized === '.') return '';
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) return '';
  return normalized;
}

function normalizeOwnedPathPrefixes(raw = []) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => normalizeOwnedPath(item))
    .filter((item) => item.length > 0 || item === '');
}

function isAllowedByOwnedPrefixes(filePath, prefixes = []) {
  if (!Array.isArray(prefixes) || prefixes.length === 0) {
    return false;
  }
  if (prefixes.some((prefix) => prefix === '')) {
    return true;
  }
  return prefixes.some((prefix) => {
    if (filePath === prefix) return true;
    return filePath.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
  });
}

function resolveOwnedPathPrefixes(phase = null, job = null) {
  const jobPrefixes = normalizeOwnedPathPrefixes(job?.launchSpec?.ownedPathPrefixes);
  if (jobPrefixes.length > 0) {
    return jobPrefixes;
  }
  return normalizeOwnedPathPrefixes(phase?.ownedPathPrefixes);
}

function evaluatePhaseFilePolicy(payload = {}, phase = null, job = null) {
  const filesTouched = Array.isArray(payload?.filesTouched)
    ? payload.filesTouched.map((item) => normalizeOwnedPath(item)).filter(Boolean)
    : [];
  if (filesTouched.length === 0) {
    return { ok: true, violations: [] };
  }

  const canEditFiles = phase?.canEditFiles === true;
  const ownedPathPrefixes = resolveOwnedPathPrefixes(phase, job);
  const violations = [];

  for (const filePath of filesTouched) {
    if (!canEditFiles) {
      violations.push(`${filePath} (role is read-only for this phase)`);
      continue;
    }
    if (ownedPathPrefixes.length === 0) {
      violations.push(`${filePath} (ownedPathPrefixes missing for editable phase)`);
      continue;
    }
    if (!isAllowedByOwnedPrefixes(filePath, ownedPathPrefixes)) {
      violations.push(`${filePath} (not under ownedPathPrefixes: ${ownedPathPrefixes.join(', ')})`);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

function summarizeFilePolicyViolation(violations = []) {
  if (!Array.isArray(violations) || violations.length === 0) {
    return 'File policy violation';
  }
  const preview = violations.slice(0, 3).join('; ');
  const remaining = violations.length > 3 ? `; +${violations.length - 3} more` : '';
  return `File policy violation: ${preview}${remaining}`;
}

function resolveRepoRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // scripts/lib/harness/subagent-runtime.mjs -> repo root is three levels up.
  return path.resolve(here, '..', '..', '..');
}

function safeFileSlug(value) {
  const text = normalizeText(value).toLowerCase();
  return text.replace(/[^a-z0-9._-]+/g, '_').slice(0, 120) || 'job';
}

function parsePositiveInt(raw, fallback) {
  const value = Number.parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseBooleanEnv(raw, fallback = false) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return fallback;
  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') return true;
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') return false;
  return fallback;
}

function buildCodexConfigArgs(env = process.env) {
  const disableMcpStartup = parseBooleanEnv(env?.[SUBAGENT_CODEX_DISABLE_MCP_ENV], true);
  if (!disableMcpStartup) {
    return [];
  }
  return ['-c', 'mcp_servers={}', '-c', 'features.rmcp_client=false'];
}

function buildCodexUnattendedArgs(env = process.env) {
  const enabled = parseBooleanEnv(env?.[SUBAGENT_CODEX_UNATTENDED_ENV], true);
  if (!enabled) {
    return [];
  }
  return ['--dangerously-bypass-approvals-and-sandbox'];
}

function buildClaudeUnattendedArgs(env = process.env) {
  const enabled = parseBooleanEnv(env?.[SUBAGENT_CLAUDE_UNATTENDED_ENV], true);
  if (!enabled) {
    return [];
  }
  return ['--dangerously-skip-permissions'];
}

function buildGeminiUnattendedArgs(env = process.env) {
  const enabled = parseBooleanEnv(env?.[SUBAGENT_GEMINI_UNATTENDED_ENV], true);
  if (!enabled) {
    return [];
  }
  return ['--yolo'];
}

function buildRoutedExtraArgs(clientId = '', modelRouting = null, env = process.env) {
  if (!isModelRouterEnabled(env)) return [];
  return buildClientModelArgs(clientId, modelRouting);
}

function resolveExecutionClientId(defaultClientId = '', modelRouting = null, env = process.env) {
  const route = normalizeModelRouting(modelRouting);
  if (isModelRouterEnabled(env) && route?.clientId) return route.clientId;
  return normalizeText(defaultClientId);
}

function recordPhaseModelDispatch({ rootDir, job, modelRouting, success, elapsedMs, description }) {
  const route = normalizeModelRouting(modelRouting);
  if (!route?.modelId || !rootDir) return;
  recordModelDispatch({
    workspaceRoot: rootDir,
    modelId: route.modelId,
    taskType: route.taskType,
    role: route.role || job?.role,
    success,
    latencyMs: elapsedMs,
    costEstimate: route.cost,
    description,
  });
}

function formatSnapshotTimestamp(ts = new Date()) {
  return ts.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

async function readPathState(absPath) {
  try {
    const details = await fs.lstat(absPath);
    if (details.isDirectory()) {
      return { exists: true, type: 'dir' };
    }
    return { exists: true, type: 'file' };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { exists: false, type: 'missing' };
    }
    throw error;
  }
}

async function copySnapshotTarget(sourceAbsPath, backupAbsPath, type) {
  if (type === 'dir') {
    await fs.cp(sourceAbsPath, backupAbsPath, { recursive: true, force: true, errorOnExist: false });
    return;
  }
  await fs.mkdir(path.dirname(backupAbsPath), { recursive: true });
  await fs.copyFile(sourceAbsPath, backupAbsPath);
}

function buildPreMutationRestoreHint(manifestPath, backupPath) {
  const manifest = normalizeText(manifestPath);
  const backup = normalizeText(backupPath);
  if (!manifest || !backup) return '';
  return `Restore manually from ${backup} using ${manifest} target metadata.`;
}

function resolveSnapshotDirectory({ sessionId, stamp, jobId }) {
  const slug = safeFileSlug(jobId || 'job');
  const dirName = `pre-mutation-${stamp}-${slug}`;
  if (sessionId) {
    return path.join('.aios', 'context-db', 'sessions', sessionId, 'artifacts', dirName);
  }
  return path.join('.aios', 'subagent-snapshots', dirName);
}

async function createPreMutationSnapshot({ rootDir, sessionId, job, phase, io }) {
  const rawTargets = resolveOwnedPathPrefixes(phase, job);
  const targets = [...new Set(rawTargets
    .map((item) => normalizeWorkspaceRelativePath(item))
    .filter(Boolean))];
  if (targets.length === 0) {
    return null;
  }

  const createdAt = new Date();
  const stamp = formatSnapshotTimestamp(createdAt);
  const snapshotRelDir = toPosixPath(resolveSnapshotDirectory({
    sessionId: normalizeText(sessionId),
    stamp,
    jobId: normalizeText(job?.jobId),
  }));
  const backupRelDir = toPosixPath(path.join(snapshotRelDir, 'backup'));
  const manifestRelPath = toPosixPath(path.join(snapshotRelDir, 'manifest.json'));
  const backupAbsDir = path.join(rootDir, backupRelDir);
  const manifestAbsPath = path.join(rootDir, manifestRelPath);

  await fs.mkdir(backupAbsDir, { recursive: true });
  const targetStates = [];
  for (const target of targets) {
    const sourceAbsPath = path.join(rootDir, target);
    const state = await readPathState(sourceAbsPath);
    targetStates.push({
      path: target,
      existed: state.exists,
      type: state.type,
    });
    if (state.exists) {
      const backupTargetPath = path.join(backupAbsDir, target);
      await copySnapshotTarget(sourceAbsPath, backupTargetPath, state.type);
    }
  }

  const manifest = {
    schemaVersion: 1,
    kind: 'orchestration.pre-mutation-snapshot',
    createdAt: createdAt.toISOString(),
    sessionId: normalizeText(sessionId),
    jobId: normalizeText(job?.jobId),
    phaseId: normalizeText(phase?.id),
    role: normalizeText(job?.role) || normalizeText(phase?.role),
    targets: targetStates,
    backupPath: backupRelDir,
    restoreHint: buildPreMutationRestoreHint(manifestRelPath, backupRelDir),
  };

  await fs.mkdir(path.dirname(manifestAbsPath), { recursive: true });
  await fs.writeFile(manifestAbsPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  io?.log?.(`[subagent-runtime] pre-mutation snapshot created job=${normalizeText(job?.jobId)} targets=${targets.length} manifest=${manifestRelPath}`);

  return {
    enabled: true,
    createdAt: manifest.createdAt,
    targetCount: targetStates.length,
    manifestPath: manifestRelPath,
    backupPath: backupRelDir,
    restoreHint: manifest.restoreHint,
  };
}

function withPreMutationSnapshot(jobRun, snapshot = null) {
  if (!snapshot || !jobRun || typeof jobRun !== 'object') {
    return jobRun;
  }
  return {
    ...jobRun,
    preMutationSnapshot: snapshot,
  };
}

function parseNonNegativeInt(raw, fallback) {
  const value = Number.parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function parseNonNegativeNumber(raw, fallback = 0) {
  const value = Number.parseFloat(String(raw ?? '').trim());
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeCostTelemetry(raw = {}) {
  const inputTokens = parseNonNegativeInt(raw?.inputTokens, 0);
  const outputTokens = parseNonNegativeInt(raw?.outputTokens, 0);
  let totalTokens = parseNonNegativeInt(raw?.totalTokens, 0);
  const usd = parseNonNegativeNumber(raw?.usd, 0);
  if (totalTokens === 0 && (inputTokens > 0 || outputTokens > 0)) {
    totalTokens = inputTokens + outputTokens;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    usd: Number(usd.toFixed(4)),
  };
}

function hasCostTelemetry(raw = {}) {
  const cost = normalizeCostTelemetry(raw);
  return cost.inputTokens > 0 || cost.outputTokens > 0 || cost.totalTokens > 0 || cost.usd > 0;
}

function mergeCostTelemetry(base = {}, next = {}) {
  const left = normalizeCostTelemetry(base);
  const right = normalizeCostTelemetry(next);
  return normalizeCostTelemetry({
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    usd: left.usd + right.usd,
  });
}

function pickFirstMatch(text, patterns = [], parser = Number.parseInt) {
  const source = String(text || '');
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (!match || !match[1]) continue;
    const value = parser(String(match[1]).trim(), 10);
    if (Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return 0;
}

function collectCostTelemetryFromText(rawText = '') {
  const text = String(rawText || '');
  return normalizeCostTelemetry({
    inputTokens: pickFirstMatch(text, [
      /\binput[\s_-]*tokens?\b\s*[:=]\s*(\d+)\b/i,
      /\bprompt[\s_-]*tokens?\b\s*[:=]\s*(\d+)\b/i,
    ], Number.parseInt),
    outputTokens: pickFirstMatch(text, [
      /\boutput[\s_-]*tokens?\b\s*[:=]\s*(\d+)\b/i,
      /\bcompletion[\s_-]*tokens?\b\s*[:=]\s*(\d+)\b/i,
    ], Number.parseInt),
    totalTokens: pickFirstMatch(text, [
      /\btotal[\s_-]*tokens?\b\s*[:=]\s*(\d+)\b/i,
    ], Number.parseInt),
    usd: pickFirstMatch(text, [
      /\busd\b\s*[:=]\s*\$?\s*([0-9]+(?:\.[0-9]+)?)\b/i,
      /\bcost\b\s*[:=]\s*\$?\s*([0-9]+(?:\.[0-9]+)?)\b/i,
    ], Number.parseFloat),
  });
}

function readUsageShape(source = {}) {
  if (!source || typeof source !== 'object') {
    return normalizeCostTelemetry();
  }
  return normalizeCostTelemetry({
    inputTokens: source.inputTokens ?? source.input_tokens ?? source.promptTokens ?? source.prompt_tokens,
    outputTokens: source.outputTokens ?? source.output_tokens ?? source.completionTokens ?? source.completion_tokens,
    totalTokens: source.totalTokens ?? source.total_tokens,
    usd: source.usd,
  });
}

function collectCostTelemetryFromJson(rawJson = null) {
  if (!rawJson || typeof rawJson !== 'object') {
    return normalizeCostTelemetry();
  }

  const usageCandidates = [
    rawJson,
    rawJson.usage,
    rawJson.usageMetadata,
    rawJson.tokenUsage,
    rawJson.metrics?.usage,
    rawJson.cost,
  ];

  let combined = normalizeCostTelemetry();
  for (const candidate of usageCandidates) {
    const next = readUsageShape(candidate);
    combined = normalizeCostTelemetry({
      inputTokens: Math.max(combined.inputTokens, next.inputTokens),
      outputTokens: Math.max(combined.outputTokens, next.outputTokens),
      totalTokens: Math.max(combined.totalTokens, next.totalTokens),
      usd: Math.max(combined.usd, next.usd),
    });
  }

  if (combined.usd === 0 && Number.isFinite(rawJson.costUsd)) {
    combined = normalizeCostTelemetry({
      ...combined,
      usd: Math.max(combined.usd, parseNonNegativeNumber(rawJson.costUsd, 0)),
    });
  }
  return combined;
}

function collectCostTelemetry({ rawText = '', rawJson = null } = {}) {
  const fromText = collectCostTelemetryFromText(rawText);
  const fromJson = collectCostTelemetryFromJson(rawJson);
  return normalizeCostTelemetry({
    inputTokens: Math.max(fromText.inputTokens, fromJson.inputTokens),
    outputTokens: Math.max(fromText.outputTokens, fromJson.outputTokens),
    totalTokens: Math.max(fromText.totalTokens, fromJson.totalTokens),
    usd: Math.max(fromText.usd, fromJson.usd),
  });
}

function detectSessionIdFromPlan(plan) {
  const overlay = plan?.learnEvalOverlay;
  const sessionId = normalizeText(overlay?.sourceSessionId || overlay?.sessionId || '');
  return sessionId || null;
}

async function loadContextPacket({ rootDir, sessionId, env, io }) {
  if (!sessionId) return { ok: false, contextText: '', contextPath: null, error: 'missing sessionId' };

  const limit = parsePositiveInt(env?.[SUBAGENT_CONTEXT_LIMIT_ENV], 30);
  const tokenBudgetRaw = String(env?.[SUBAGENT_CONTEXT_TOKEN_BUDGET_ENV] ?? '').trim();
  const tokenBudget = tokenBudgetRaw ? parseNonNegativeInt(tokenBudgetRaw, 0) : null;
  const tokenStrategyRaw = String(env?.[SUBAGENT_CONTEXT_TOKEN_STRATEGY_ENV] ?? '').trim().toLowerCase();
  const tokenStrategy = tokenStrategyRaw === 'legacy' || tokenStrategyRaw === 'balanced' || tokenStrategyRaw === 'aggressive'
    ? tokenStrategyRaw
    : '';
  const outRel = contextDbRelativePath(rootDir, 'exports', `${sessionId}-context.md`);

  try {
    const args = [
      'context:pack',
      '--workspace',
      rootDir,
      '--session',
      sessionId,
      '--limit',
      String(limit),
      '--out',
      outRel,
    ];
    if (tokenBudget && tokenBudget > 0) {
      args.push('--token-budget', String(tokenBudget));
    }
    if (tokenStrategy) {
      args.push('--token-strategy', tokenStrategy);
    }
    runContextDbCli(args, { cwd: rootDir });
    const absPath = path.join(rootDir, outRel);
    const contextText = await fs.readFile(absPath, 'utf8');
    return { ok: true, contextText: String(contextText || ''), contextPath: absPath, error: '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io?.log?.(`[subagent-runtime] context pack failed: ${message}`);
    return { ok: false, contextText: '', contextPath: null, error: message };
  }
}

async function loadRolePinnedMemory(role, rootDir) {
  const normalizedRole = normalizeText(role).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  if (!normalizedRole || !rootDir) return '';

  const space = `workspace-memory--${normalizedRole}`;
  const sessionId = workspaceMemorySessionId(space);
  const pinnedPath = workspaceMemoryPinnedPath(rootDir, sessionId);

  try {
    const content = await fs.readFile(pinnedPath, 'utf8');
    return String(content || '').trim();
  } catch {
    return '';
  }
}

async function appendJobFindingsToRoleMemory({ role, rootDir, jobId, taskTitle, findings, contextSummary }) {
  const normalizedRole = normalizeText(role).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  if (!normalizedRole || !rootDir) return;

  const space = `workspace-memory--${normalizedRole}`;
  const sessionId = workspaceMemorySessionId(space);
  const dir = workspaceMemorySessionDir(rootDir, sessionId);
  const metaPath = workspaceMemoryMetaPath(rootDir, sessionId);

  try {
    await fs.access(metaPath);
  } catch {
    try {
      await fs.mkdir(dir, { recursive: true });
      runContextDbCli([
        'init', '--workspace', rootDir,
      ]);
      runContextDbCli([
        'session:new', '--workspace', rootDir,
        '--agent', 'workspace-memory',
        '--project', path.basename(rootDir),
        '--goal', `Workspace memory space "${space}"`,
        '--session-id', sessionId,
        '--tags', `space:${space}`,
      ]);
    } catch { /* skip on session creation failure */ }
  }

  const findingsText = Array.isArray(findings) && findings.length > 0
    ? findings.slice(0, 3).map(f => `- ${normalizeText(f)}`).join('\n')
    : 'no findings reported';
  const memoText = `[${jobId || 'job'}] ${normalizeText(taskTitle)}: ${normalizeText(contextSummary || 'completed')}\n${findingsText}`;

  const turnId = `memo:${normalizedRole}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    runContextDbCli([
      'event:add', '--workspace', rootDir,
      '--session', sessionId,
      '--role', 'user',
      '--kind', 'memo',
      '--text', memoText.slice(0, 1400),
      '--turn-id', turnId,
      '--turn-type', 'side',
      '--environment', 'memo',
      '--hindsight-status', 'na',
      '--outcome', 'success',
    ]);
  } catch { /* skip event write on failure */ }

  const pinnedPath = workspaceMemoryPinnedPath(rootDir, sessionId);
  let existingPinned = '';
  try {
    existingPinned = await fs.readFile(pinnedPath, 'utf8');
  } catch { /* no existing pinned */ }
  const pinnedEntry = `- [${new Date().toISOString()}] ${jobId}: ${normalizeText(contextSummary || taskTitle)}`;
  const newPinned = existingPinned.trim()
    ? `${existingPinned.trim()}\n${pinnedEntry}`
    : `# ${normalizedRole} Role Memory\n\n${pinnedEntry}`;
  const clipped = newPinned.length > 5000
    ? newPinned.slice(newPinned.length - 4500)
    : newPinned;
  try {
    await fs.writeFile(pinnedPath, `${clipped.trim()}\n`, 'utf8');
  } catch { /* skip pinned write on failure */ }
}

function extractJsonCandidate(rawText = '') {
  const text = String(rawText || '').trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    // ignore and try extraction below
  }

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced && fenced[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // ignore
    }
  }

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const candidate = text.slice(first, last + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  return null;
}

function renderDependencyContext(dependencyRuns = []) {
  const handoffs = dependencyRuns
    .map((run) => run?.output?.payload)
    .filter(Boolean);
  if (handoffs.length === 0) {
    return '(none)';
  }
  return handoffs.map((payload, index) => `- upstream[${index + 1}]: ${JSON.stringify(payload)}`).join('\n');
}

function buildSystemPrompt({ agent, contextText, plan, job, phase, rootDir, env, rolePinnedMemory }) {
  const lines = [];
  if (agent?.systemPrompt) {
    lines.push(agent.systemPrompt);
  } else {
    lines.push('You are a role-based subagent for AIOS orchestrations.');
  }

  if (rootDir) {
    try {
      const personaOverlay = buildPersonaOverlay('persona', { workspaceRoot: rootDir, env });
      if (personaOverlay) { lines.push(''); lines.push(personaOverlay.trim()); }
    } catch { /* skip persona on error */ }
    try {
      const userOverlay = buildPersonaOverlay('user', { workspaceRoot: rootDir, env });
      if (userOverlay) { lines.push(''); lines.push(userOverlay.trim()); }
    } catch { /* skip user profile on error */ }
  }

  if (rolePinnedMemory) {
    lines.push('');
    lines.push('## Role Memory (Pinned)');
    lines.push('Key findings preserved from prior invocations of this role:');
    lines.push('');
    lines.push(rolePinnedMemory.trim());
  }

  lines.push('');
  lines.push('Output Contract');
  lines.push('Output a single JSON object (no surrounding text) that conforms to `memory/specs/agent-handoff.schema.json`.');
  lines.push('');
  lines.push('Required fields: schemaVersion, status, fromRole, toRole, taskTitle, contextSummary, findings, filesTouched, openQuestions, recommendations.');
  lines.push('Set schemaVersion=1. Always include array fields (empty arrays are OK).');
  lines.push(`Set fromRole=${normalizeText(job?.role) || 'unknown'} and toRole=${normalizeText(job?.launchSpec?.handoffTarget) || 'next-phase'}.`);
  lines.push('');

  if (contextText) {
    lines.push('Context Packet');
    lines.push(contextText.trim());
    lines.push('');
  }

  const modelRouterSection = buildModelRouterPromptSection(job?.launchSpec?.modelRouting);
  if (modelRouterSection) {
    lines.push(modelRouterSection);
    lines.push('Use the routed model/protocol for this job; record any mismatch as a blocker.');
    lines.push('');
  }

  const ownedPrefixes = resolveOwnedPathPrefixes(phase, job).join(', ');
  const workItemRefs = Array.isArray(job?.launchSpec?.workItemRefs)
    ? job.launchSpec.workItemRefs.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  lines.push('Runtime Notes');
  lines.push(`- jobId=${normalizeText(job?.jobId)}`);
  lines.push(`- taskTitle=${normalizeText(plan?.taskTitle)}`);
  if (normalizeText(plan?.contextSummary)) {
    lines.push(`- contextSummary=${normalizeText(plan?.contextSummary)}`);
  }
  if (workItemRefs.length > 0) {
    lines.push(`- workItemRefs=${workItemRefs.join(', ')}`);
  }
  if (normalizeText(ownedPrefixes)) {
    lines.push(`- ownedPathPrefixes=${ownedPrefixes}`);
  }
  lines.push('');

  return lines.join('\n');
}

function buildUserPrompt({ plan, job, phase, dependencyRuns }) {
  const lines = [];
  lines.push(`# Orchestration Phase`);
  lines.push(`jobId: ${normalizeText(job?.jobId)}`);
  lines.push(`role: ${normalizeText(job?.role)}`);
  lines.push(`taskTitle: ${normalizeText(plan?.taskTitle)}`);
  lines.push('');

  if (phase) {
    lines.push('## Responsibility');
    lines.push(`${normalizeText(phase.label)}: ${normalizeText(phase.responsibility)}`);
    lines.push('');

    lines.push('## Ownership');
    lines.push(normalizeText(phase.ownership) || '(none)');
    lines.push('');

    lines.push('## File Policy');
    lines.push(`canEditFiles: ${phase.canEditFiles === true ? 'true' : 'false'}`);
    lines.push(`ownedPathPrefixes: ${JSON.stringify(resolveOwnedPathPrefixes(phase, job))}`);
    lines.push('');
  }

  lines.push('## Upstream Handoffs');
  lines.push(renderDependencyContext(dependencyRuns));
  lines.push('');

  const workItemRefs = Array.isArray(job?.launchSpec?.workItemRefs)
    ? job.launchSpec.workItemRefs.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  if (workItemRefs.length > 0) {
    lines.push('## Decomposed Work Items');
    const workItemMap = new Map(
      (Array.isArray(plan?.workItems) ? plan.workItems : [])
        .map((item) => [normalizeText(item?.itemId), item])
        .filter(([id]) => id)
    );
    for (const itemId of workItemRefs) {
      const item = workItemMap.get(itemId);
      if (!item) {
        lines.push(`- ${itemId}`);
        continue;
      }
      const summary = normalizeText(item.summary) || normalizeText(item.title);
      lines.push(`- [${normalizeText(item.type) || 'general'}] ${itemId}: ${summary}`);
    }
    lines.push('');
  }

  lines.push('## Deliverable');
  lines.push('- Summarize concrete findings.');
  lines.push('- If you touched files, list them in `filesTouched` (relative paths).');
  lines.push('- If blocked or need input, set `status` to `blocked` or `needs-input` and explain in `openQuestions`.');
  lines.push('- Otherwise set `status` to `completed`.');
  lines.push('- If upstream handoffs do not clearly require code changes, return a no-op handoff instead of exploring indefinitely.');
  lines.push('- If the next step is manual, environment-specific, or external, report it in `openQuestions`/`recommendations` without waiting for it to happen.');
  lines.push('- Do not run broad verification commands unless you actually changed owned files.');
  lines.push('');
  lines.push('Output ONLY the JSON object.');
  lines.push('');

  return lines.join('\n');
}

function resolveAgentForJob(job, spec) {
  const agentId = normalizeText(job?.launchSpec?.agentRefId);
  if (!agentId) return null;
  return spec.agents[agentId] || null;
}

function isUnsupportedCodexFlagError(text, flags = []) {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;
  if (!/(unexpected argument|unknown option|unrecognized option|found argument|invalid option)/i.test(text)) {
    return false;
  }
  return flags.some((flag) => normalized.includes(String(flag).toLowerCase()));
}

function isCodexSchemaValidationError(text) {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;
  return normalized.includes('invalid_json_schema')
    || normalized.includes('text.format.schema');
}

function isCodexUpstreamError(text) {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;
  return normalized.includes('upstream_error')
    || normalized.includes('server_error');
}

function shouldRetryCodexResult(result, { exitCode, combinedText }) {
  if (!result || result.error || result.timedOut) {
    return false;
  }
  if (exitCode === 0) {
    return false;
  }
  return isCodexUpstreamError(combinedText);
}

function sleepMs(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Math.floor(ms)));
  });
}

async function runCodexExecWithRetry(command, args, { env, timeoutMs, cwd, input, io }) {
  const maxAttempts = parsePositiveInt(env?.[SUBAGENT_UPSTREAM_MAX_ATTEMPTS_ENV], 2);
  const baseBackoffMs = parsePositiveInt(env?.[SUBAGENT_UPSTREAM_BACKOFF_MS_ENV], 1200);
  let lastResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await spawnCommandWithInput(command, args, {
      env,
      timeoutMs,
      cwd: cwd || undefined,
      input,
    });
    lastResult = result;

    const exitCode = Number.isFinite(result.status) ? result.status : 1;
    const combinedText = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    if (!shouldRetryCodexResult(result, { exitCode, combinedText }) || attempt >= maxAttempts) {
      return { ...result, attempts: attempt };
    }

    const delayMs = Math.max(1, Math.floor(baseBackoffMs * Math.pow(2, attempt - 1)));
    io?.log?.(`[subagent-runtime] codex upstream_error retry attempt ${attempt + 1}/${maxAttempts} after ${delayMs}ms`);
    await sleepMs(delayMs);
  }

  return {
    ...(lastResult || { status: 1, stdout: '', stderr: '', error: null, timedOut: false }),
    attempts: maxAttempts,
  };
}

function attachAttemptMeta(result, payload) {
  const attempts = Number.isFinite(result?.attempts) ? Math.max(1, Math.floor(result.attempts)) : 0;
  if (attempts > 0) {
    return { ...payload, attempts };
  }
  return payload;
}

export async function runOneShot(clientId, { systemPrompt, userPrompt, timeoutMs, env, io = null, cwd = null, codexOutput = null, modelRouting = null }) {
  const command = CLIENT_COMMAND[clientId];
  if (!command) {
    return { exitCode: 1, stdout: '', stderr: '', error: `Unsupported subagent client: ${clientId}` };
  }

  if (!commandExists(command, { env })) {
    return { exitCode: 127, stdout: '', stderr: '', error: `Command not found: ${command}` };
  }

  const systemText = normalizeText(systemPrompt);
  const promptText = normalizeText(userPrompt);
  const routedExtraArgs = buildRoutedExtraArgs(clientId, modelRouting, env);

  let args = [];
  if (clientId === 'claude-code') {
    const claudeUnattendedArgs = buildClaudeUnattendedArgs(env);
    args = systemText
      ? [...routedExtraArgs, ...claudeUnattendedArgs, '--print', '--append-system-prompt', systemText, promptText]
      : [...routedExtraArgs, ...claudeUnattendedArgs, '--print', promptText];
  } else if (clientId === 'gemini-cli') {
    const geminiUnattendedArgs = buildGeminiUnattendedArgs(env);
    const fullPrompt = systemText
      ? `${systemText}\n\n## New User Request\n${promptText}`
      : promptText;
    args = [...routedExtraArgs, ...geminiUnattendedArgs, '-p', fullPrompt];
  } else if (clientId === 'opencode-cli') {
    const fullPrompt = systemText
      ? `${systemText}\n\n## New User Request\n${promptText}`
      : promptText;
    args = ['run', fullPrompt];
  } else {
    const fullPrompt = systemText
      ? `${systemText}\n\n## New User Request\n${promptText}`
      : promptText;
    const codexConfigArgs = buildCodexConfigArgs(env);
    const codexUnattendedArgs = buildCodexUnattendedArgs(env);

    const structuredFlags = [];
    if (codexOutput?.schemaPath) {
      structuredFlags.push('--output-schema', codexOutput.schemaPath);
    }
    if (codexOutput?.lastMessagePath) {
      structuredFlags.push('--output-last-message', codexOutput.lastMessagePath);
    }
    if (codexOutput?.color) {
      structuredFlags.push('--color', codexOutput.color);
    }

    if (structuredFlags.length > 0) {
      args = ['exec', ...codexUnattendedArgs, ...codexConfigArgs, ...routedExtraArgs, ...structuredFlags, '-'];
      const result = await runCodexExecWithRetry(command, args, { env, timeoutMs, cwd, input: fullPrompt, io });
      const combinedStdout = String(result.stdout || '');
      const combinedStderr = String(result.stderr || '');
      const exitCode = Number.isFinite(result.status) ? result.status : 1;

      if (result.error) {
        return attachAttemptMeta(result, {
          exitCode,
          stdout: combinedStdout,
          stderr: combinedStderr,
          error: result.error.message || String(result.error),
        });
      }

      if (result.timedOut) {
        return attachAttemptMeta(result, {
          exitCode: exitCode || 124,
          stdout: combinedStdout,
          stderr: combinedStderr,
          error: `Timed out after ${timeoutMs} ms`,
        });
      }

      if (exitCode !== 0) {
        const combined = `${combinedStdout}\n${combinedStderr}`.trim();
        const structuredFlags = ['--output-schema', '--output-last-message', '--color'];
        if (isUnsupportedCodexFlagError(combined, structuredFlags) || isCodexSchemaValidationError(combined)) {
          const fallbackArgs = ['exec', ...codexUnattendedArgs, ...codexConfigArgs, ...routedExtraArgs];
          if (codexOutput?.lastMessagePath) {
            fallbackArgs.push('--output-last-message', codexOutput.lastMessagePath);
          }
          if (codexOutput?.color) {
            fallbackArgs.push('--color', codexOutput.color);
          }
          fallbackArgs.push('-');

          const fallback = await runCodexExecWithRetry(command, fallbackArgs, { env, timeoutMs, cwd, input: fullPrompt, io });
          const fallbackStdout = String(fallback.stdout || '');
          const fallbackStderr = String(fallback.stderr || '');
          const fallbackExit = Number.isFinite(fallback.status) ? fallback.status : 1;
          if (fallback.error) {
            return attachAttemptMeta(fallback, {
              exitCode: fallbackExit,
              stdout: fallbackStdout,
              stderr: fallbackStderr,
              error: fallback.error.message || String(fallback.error),
            });
          }
          if (fallback.timedOut) {
            return attachAttemptMeta(fallback, {
              exitCode: fallbackExit || 124,
              stdout: fallbackStdout,
              stderr: fallbackStderr,
              error: `Timed out after ${timeoutMs} ms`,
            });
          }

          if (fallbackExit !== 0) {
            const fallbackCombined = `${fallbackStdout}\n${fallbackStderr}`.trim();
            const fallbackFlags = ['--output-last-message', '--color'];
            if (isUnsupportedCodexFlagError(fallbackCombined, fallbackFlags)) {
              const plainFallback = await runCodexExecWithRetry(command, ['exec', ...codexUnattendedArgs, ...codexConfigArgs, ...routedExtraArgs, '-'], { env, timeoutMs, cwd, input: fullPrompt, io });
              const plainStdout = String(plainFallback.stdout || '');
              const plainStderr = String(plainFallback.stderr || '');
              const plainExit = Number.isFinite(plainFallback.status) ? plainFallback.status : 1;
              if (plainFallback.error) {
                return attachAttemptMeta(plainFallback, {
                  exitCode: plainExit,
                  stdout: plainStdout,
                  stderr: plainStderr,
                  error: plainFallback.error.message || String(plainFallback.error),
                });
              }
              if (plainFallback.timedOut) {
                return attachAttemptMeta(plainFallback, {
                  exitCode: plainExit || 124,
                  stdout: plainStdout,
                  stderr: plainStderr,
                  error: `Timed out after ${timeoutMs} ms`,
                });
              }
              return attachAttemptMeta(plainFallback, {
                exitCode: plainExit,
                stdout: plainStdout,
                stderr: plainStderr,
                error: '',
              });
            }
          }
          return attachAttemptMeta(fallback, {
            exitCode: fallbackExit,
            stdout: fallbackStdout,
            stderr: fallbackStderr,
            error: '',
          });
        }
      }

      return attachAttemptMeta(result, {
        exitCode,
        stdout: combinedStdout,
        stderr: combinedStderr,
        error: '',
      });
    }

    args = ['exec', ...codexUnattendedArgs, ...codexConfigArgs, ...routedExtraArgs, '-'];
    const result = await runCodexExecWithRetry(command, args, { env, timeoutMs, cwd, input: fullPrompt, io });
    const combinedStdout = String(result.stdout || '');
    const combinedStderr = String(result.stderr || '');
    const exitCode = Number.isFinite(result.status) ? result.status : 1;

    if (result.error) {
      return attachAttemptMeta(result, {
        exitCode,
        stdout: combinedStdout,
        stderr: combinedStderr,
        error: result.error.message || String(result.error),
      });
    }
    if (result.timedOut) {
      return attachAttemptMeta(result, {
        exitCode: exitCode || 124,
        stdout: combinedStdout,
        stderr: combinedStderr,
        error: `Timed out after ${timeoutMs} ms`,
      });
    }

    return attachAttemptMeta(result, {
      exitCode,
      stdout: combinedStdout,
      stderr: combinedStderr,
      error: '',
    });
  }

  const result = await spawnCommand(command, args, { env, timeoutMs, cwd: cwd || undefined });
  const combinedStdout = String(result.stdout || '');
  const combinedStderr = String(result.stderr || '');
  const exitCode = Number.isFinite(result.status) ? result.status : 1;

  if (result.error) {
    return { exitCode, stdout: combinedStdout, stderr: combinedStderr, error: result.error.message || String(result.error) };
  }
  if (result.timedOut) {
    return { exitCode: exitCode || 124, stdout: combinedStdout, stderr: combinedStderr, error: `Timed out after ${timeoutMs} ms` };
  }

  return { exitCode, stdout: combinedStdout, stderr: combinedStderr, error: '' };
}

function buildBlockedJobRun(plan, job, dependencyRuns, {
  executorLabel,
  reason,
  elapsedMs = null,
  cost = null,
  rawOutput = '',
  attempts = 0,
}) {
  const modelRouting = normalizeModelRouting(job?.launchSpec?.modelRouting);
  const jobRun = {
    jobId: job.jobId,
    jobType: job.jobType,
    role: job.role,
    executor: normalizeText(job?.launchSpec?.executor) || 'unknown',
    executorLabel,
    dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
    status: 'blocked',
    ...(modelRouting ? { modelRouting } : {}),
    inputSummary: {
      dependencyCount: dependencyRuns.length,
      inputTypes: Array.isArray(job.launchSpec?.inputs) ? [...job.launchSpec.inputs] : [],
    },
    output: {
      outputType: job.launchSpec?.outputType || 'unknown',
      error: normalizeText(reason) || 'blocked',
      ...(normalizeText(rawOutput) ? { rawOutput: clipText(rawOutput) } : {}),
    },
  };
  if (Number.isFinite(elapsedMs) && elapsedMs >= 0) {
    jobRun.elapsedMs = Math.floor(elapsedMs);
  }
  if (hasCostTelemetry(cost)) {
    jobRun.cost = normalizeCostTelemetry(cost);
  }
  if (Number.isFinite(attempts) && attempts > 0) {
    jobRun.attempts = Math.max(0, Math.floor(attempts));
  }
  return jobRun;
}

function shouldAutoCompleteReadOnlyReviewPhase(job, dependencyRuns = []) {
  const role = normalizeText(job?.role);
  if (role !== 'reviewer' && role !== 'security-reviewer') {
    return false;
  }
  if (!Array.isArray(dependencyRuns) || dependencyRuns.length === 0) {
    return false;
  }
  return dependencyRuns.every((run) => {
    if (!run || run.status !== 'completed') {
      return false;
    }
    const payload = run?.output?.payload;
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    const filesTouched = Array.isArray(payload.filesTouched) ? payload.filesTouched : [];
    return filesTouched.length === 0;
  });
}

function buildAutoCompletedReadOnlyReviewRun(plan, job, dependencyRuns, { executorLabel }) {
  const role = normalizeText(job?.role) || 'reviewer';
  const handoffTarget = normalizeText(job?.launchSpec?.handoffTarget) || 'next-phase';
  const upstreamIds = dependencyRuns.map((run) => normalizeText(run?.jobId)).filter(Boolean);
  const contextSummary = 'Auto-completed no-op review: upstream handoffs touched no files.';
  const payload = normalizeHandoffPayload({
    status: 'completed',
    fromRole: role,
    toRole: handoffTarget,
    taskTitle: normalizeText(plan?.taskTitle) || 'orchestration-task',
    contextSummary,
    findings: [
      `Skipped model invocation because ${dependencyRuns.length} upstream handoff(s) reported no file changes.`,
      ...(upstreamIds.length > 0 ? [`Upstream jobs: ${upstreamIds.join(', ')}`] : []),
    ],
    filesTouched: [],
    openQuestions: [],
    recommendations: [],
  });

  const modelRouting = normalizeModelRouting(job?.launchSpec?.modelRouting);

  return {
    jobId: job.jobId,
    jobType: job.jobType,
    role,
    executor: normalizeText(job?.launchSpec?.executor) || 'unknown',
    executorLabel,
    dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
    status: 'completed',
    elapsedMs: 0,
    ...(modelRouting ? { modelRouting } : {}),
    inputSummary: {
      dependencyCount: dependencyRuns.length,
      inputTypes: Array.isArray(job.launchSpec?.inputs) ? [...job.launchSpec.inputs] : [],
    },
    output: {
      outputType: job.launchSpec?.outputType || 'handoff',
      payload,
      rawOutput: contextSummary,
    },
  };
}

function buildFailureReason({ baseReason, exitCode, rawCommandOutput }) {
  const normalizedBase = normalizeText(baseReason);
  const trimmedOutput = normalizeText(rawCommandOutput);
  if (!trimmedOutput) {
    return normalizedBase || `exit=${exitCode}`;
  }

  const firstLine = trimmedOutput
    .split(/\r?\n/u)
    .map((line) => normalizeText(line))
    .find((line) => line.length > 0) || '';

  if (!firstLine) {
    return normalizedBase || `exit=${exitCode}`;
  }

  if (normalizedBase.length > 0 && normalizedBase !== `exit=${exitCode}`) {
    return `${normalizedBase}; ${firstLine}`;
  }
  return `exit=${exitCode}; ${firstLine}`;
}

function normalizeSeededJobRun(rawJobRun = {}) {
  const jobId = normalizeText(rawJobRun?.jobId);
  if (!jobId) {
    return null;
  }
  const status = normalizeText(rawJobRun?.status).toLowerCase();
  if (status === 'blocked' || status === 'needs-input') {
    return null;
  }
  const output = rawJobRun?.output && typeof rawJobRun.output === 'object'
    ? { ...rawJobRun.output }
    : { outputType: 'handoff' };
  return {
    jobId,
    jobType: normalizeText(rawJobRun?.jobType) || 'phase',
    role: normalizeText(rawJobRun?.role) || 'seed',
    executor: normalizeText(rawJobRun?.executor) || 'seed',
    executorLabel: normalizeText(rawJobRun?.executorLabel) || normalizeText(rawJobRun?.executor) || 'seed',
    dependsOn: Array.isArray(rawJobRun?.dependsOn)
      ? rawJobRun.dependsOn.map((item) => normalizeText(item)).filter(Boolean)
      : [],
    status: status || 'completed',
    inputSummary: rawJobRun?.inputSummary && typeof rawJobRun.inputSummary === 'object'
      ? { ...rawJobRun.inputSummary }
      : {
        dependencyCount: 0,
        inputTypes: [],
      },
    output,
  };
}

async function executePhaseJob(plan, job, phase, dependencyRuns, {
  clientId,
  contextText,
  timeoutMs,
  env,
  io,
  agentSpecNormalized,
  executorLabel,
  dispatchPolicy,
  rootDir,
  codexTempDir,
}) {
  const agent = resolveAgentForJob(job, agentSpecNormalized);
  const role = normalizeText(job?.role);
  const rolePinnedMemory = await loadRolePinnedMemory(role, rootDir);
  const systemPrompt = buildSystemPrompt({ agent, contextText, plan, job, phase, rootDir, env, rolePinnedMemory });
  const userPrompt = buildUserPrompt({ plan, job, phase, dependencyRuns });

  const codexOutput = clientId === 'codex-cli' && codexTempDir && rootDir
    ? {
      schemaPath: path.join(rootDir, CODEX_OUTPUT_SCHEMA_REL),
      lastMessagePath: path.join(codexTempDir, `${safeFileSlug(job?.jobId)}.json`),
      color: 'never',
    }
    : null;

  const modelRouting = normalizeModelRouting(job?.launchSpec?.modelRouting);
  const executionClientId = resolveExecutionClientId(clientId, modelRouting, env);
  const startedAt = Date.now();
  const result = await runOneShot(executionClientId, {
    systemPrompt,
    userPrompt,
    timeoutMs,
    env,
    io,
    cwd: rootDir,
    codexOutput: executionClientId === 'codex-cli' ? codexOutput : null,
    modelRouting,
  });
  const elapsedMs = Date.now() - startedAt;

  const rawCommandOutput = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  let outputText = rawCommandOutput;
  if (codexOutput?.lastMessagePath) {
    try {
      const lastMessage = await fs.readFile(codexOutput.lastMessagePath, 'utf8');
      if (String(lastMessage || '').trim()) {
        outputText = String(lastMessage || '').trim();
      }
    } catch {
      // ignore missing last-message file and fall back to stdout/stderr extraction
    }
  }
  const rawJson = extractJsonCandidate(outputText);
  const costTelemetry = collectCostTelemetry({ rawText: rawCommandOutput, rawJson });
  const allowTimedOutHandoff = result.exitCode !== 0
    && /timed out/i.test(String(result.error || ''))
    && Boolean(rawJson);

  if (result.exitCode !== 0 && !allowTimedOutHandoff) {
    const attemptCount = Number.isFinite(result.attempts) ? Math.max(1, Math.floor(result.attempts)) : 1;
    const failureReason = buildFailureReason({
      baseReason: result.error || `exit=${result.exitCode}${attemptCount > 1 ? ` after ${attemptCount} attempts` : ''}`,
      exitCode: result.exitCode,
      rawCommandOutput,
    });
    io?.log?.(`[subagent-runtime] blocked ${job.jobId} reason=${failureReason}`);
    recordPhaseModelDispatch({ rootDir, job, modelRouting, success: false, elapsedMs, description: failureReason });
    return buildBlockedJobRun(plan, job, dependencyRuns, {
      executorLabel,
      reason: failureReason,
      elapsedMs,
      cost: costTelemetry,
      rawOutput: clipText(rawCommandOutput),
      attempts: attemptCount,
    });
  }
  if (allowTimedOutHandoff) {
    io?.log?.(`[subagent-runtime] continuing ${job.jobId} with last-message payload after timeout`);
  }

  if (!rawJson) {
    io?.log?.(`[subagent-runtime] blocked ${job.jobId} reason=Failed to parse JSON handoff from subagent output`);
    recordPhaseModelDispatch({ rootDir, job, modelRouting, success: false, elapsedMs, description: 'Failed to parse JSON handoff from subagent output' });
    return buildBlockedJobRun(plan, job, dependencyRuns, {
      executorLabel,
      reason: 'Failed to parse JSON handoff from subagent output',
      elapsedMs,
      cost: costTelemetry,
      rawOutput: clipText(rawCommandOutput),
      attempts: Number.isFinite(result.attempts) ? Math.max(1, Math.floor(result.attempts)) : 0,
    });
  }

  const normalizedPayload = normalizeHandoffPayload(rawJson);
  normalizedPayload.fromRole = normalizeText(job.role) || normalizedPayload.fromRole;
  normalizedPayload.toRole = normalizeText(job.launchSpec?.handoffTarget) || normalizedPayload.toRole;
  normalizedPayload.taskTitle = normalizeText(plan.taskTitle) || normalizedPayload.taskTitle;
  if (!normalizedPayload.contextSummary) {
    normalizedPayload.contextSummary = normalizeText(plan.contextSummary) || normalizeText(phase?.responsibility) || 'context missing';
  }

  const validation = validateHandoffPayload(normalizedPayload);
  if (!validation.ok) {
    io?.log?.(`[subagent-runtime] blocked ${job.jobId} reason=Invalid handoff payload`);
    recordPhaseModelDispatch({ rootDir, job, modelRouting, success: false, elapsedMs, description: 'Invalid handoff payload' });
    return buildBlockedJobRun(plan, job, dependencyRuns, {
      executorLabel,
      reason: `Invalid handoff payload: ${validation.errors.join('; ')}`,
      elapsedMs,
      cost: costTelemetry,
      rawOutput: clipText(outputText),
      attempts: Number.isFinite(result.attempts) ? Math.max(1, Math.floor(result.attempts)) : 0,
    });
  }

  const filePolicy = evaluatePhaseFilePolicy(validation.value, phase, job);
  if (!filePolicy.ok) {
    const reason = summarizeFilePolicyViolation(filePolicy.violations);
    io?.log?.(`[subagent-runtime] blocked ${job.jobId} reason=${reason}`);
    recordPhaseModelDispatch({ rootDir, job, modelRouting, success: false, elapsedMs, description: reason });
    return buildBlockedJobRun(plan, job, dependencyRuns, {
      executorLabel,
      reason,
      elapsedMs,
      cost: costTelemetry,
      rawOutput: clipText(outputText),
      attempts: Number.isFinite(result.attempts) ? Math.max(1, Math.floor(result.attempts)) : 0,
    });
  }

  const payloadStatus = validation.value.status;
  const jobStatus = payloadStatus === 'blocked' || payloadStatus === 'needs-input'
    ? 'blocked'
    : 'completed';

  const costNote = hasCostTelemetry(costTelemetry)
    ? ` tokens=${costTelemetry.totalTokens} usd=${costTelemetry.usd}`
    : '';
  io?.log?.(`[subagent-runtime] completed ${job.jobId} status=${payloadStatus} elapsedMs=${elapsedMs}${costNote}`);
  recordPhaseModelDispatch({
    rootDir,
    job,
    modelRouting,
    success: jobStatus === 'completed',
    elapsedMs,
    description: `${job.jobId} ${payloadStatus}`,
  });

  if (jobStatus === 'completed') {
    appendJobFindingsToRoleMemory({
      role: job.role,
      rootDir,
      jobId: job.jobId,
      taskTitle: plan.taskTitle,
      findings: validation.value.findings,
      contextSummary: validation.value.contextSummary,
    }).catch(() => { /* background best-effort */ });
  }

  return {
    jobId: job.jobId,
    jobType: job.jobType,
    role: job.role,
    executor: normalizeText(job?.launchSpec?.executor) || 'unknown',
    executorLabel,
    dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
    status: jobStatus,
    elapsedMs,
    ...(hasCostTelemetry(costTelemetry) ? { cost: costTelemetry } : {}),
    ...(modelRouting ? { modelRouting } : {}),
    ...(executionClientId && executionClientId !== clientId ? { routedClientId: executionClientId } : {}),
    ...(Number.isFinite(result.attempts) && result.attempts > 0 ? { attempts: Math.floor(result.attempts) } : {}),
    inputSummary: {
      dependencyCount: dependencyRuns.length,
      inputTypes: Array.isArray(job.launchSpec?.inputs) ? [...job.launchSpec.inputs] : [],
    },
    output: {
      outputType: job.launchSpec?.outputType || 'handoff',
      payload: validation.value,
      rawOutput: outputText.slice(0, 8000),
    },
  };
}

function executeMergeGateJob(plan, job, dependencyRuns, { executorLabel }) {
  const payloads = dependencyRuns.map((run) => run?.output?.payload).filter(Boolean);
  if (payloads.length !== dependencyRuns.length) {
    return buildBlockedJobRun(plan, job, dependencyRuns, {
      executorLabel,
      reason: 'Missing upstream handoff payloads; merge-gate cannot run',
    });
  }

  let mergeResult;
  try {
    mergeResult = mergeParallelHandoffs(payloads);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildBlockedJobRun(plan, job, dependencyRuns, { executorLabel, reason: message });
  }

  const payload = normalizeHandoffPayload({
    status: mergeResult.ok ? 'completed' : 'blocked',
    fromRole: 'merge-gate',
    toRole: 'complete',
    taskTitle: plan.taskTitle,
    contextSummary: mergeResult.ok
      ? `Merge gate passed for ${job.group}.`
      : `Merge gate blocked for ${job.group}.`,
    findings: mergeResult.mergedFindings,
    filesTouched: mergeResult.touchedFiles,
    recommendations: mergeResult.mergedRecommendations,
  });

  return {
    jobId: job.jobId,
    jobType: job.jobType,
    role: job.role,
    executor: normalizeText(job?.launchSpec?.executor) || 'unknown',
    executorLabel,
    dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
    status: mergeResult.ok ? 'completed' : 'blocked',
    inputSummary: {
      dependencyCount: dependencyRuns.length,
      inputTypes: Array.isArray(job.launchSpec?.inputs) ? [...job.launchSpec.inputs] : [],
    },
    output: {
      outputType: job.launchSpec?.outputType || 'merged-handoff',
      payload,
      mergeResult: {
        ok: mergeResult.ok,
        blockedCount: mergeResult.blocked.length,
        conflictCount: mergeResult.conflicts.length,
        touchedFiles: mergeResult.touchedFiles,
      },
    },
  };
}

export async function executeSubagentDispatchPlan(
  plan,
  dispatchPlan,
  { dispatchPolicy = null, io = console, env = process.env, rootDir: runtimeRootDir = null } = {}
) {
  const normalizedClient = normalizeText(env?.[SUBAGENT_CLIENT_ENV]).toLowerCase();
  const clientId = normalizedClient || '';
  if (!SUPPORTED_CLIENTS.has(clientId)) {
    const supportedHint = `Set ${SUBAGENT_CLIENT_ENV} to one of: codex-cli, claude-code, gemini-cli, opencode-cli.`;
    return {
      mode: 'live',
      ok: false,
      error: clientId
        ? `Unsupported ${SUBAGENT_CLIENT_ENV}: ${clientId}. ${supportedHint}`
        : `Missing ${SUBAGENT_CLIENT_ENV}. ${supportedHint}`,
      executorRegistry: Array.isArray(dispatchPlan?.executorRegistry) ? [...dispatchPlan.executorRegistry] : [],
      executorDetails: Array.isArray(dispatchPlan?.executorDetails) ? dispatchPlan.executorDetails.map((item) => ({ ...item })) : [],
      jobRuns: [],
      finalOutputs: [],
    };
  }

  const rootDir = normalizeText(runtimeRootDir) ? path.resolve(String(runtimeRootDir)) : resolveRepoRoot();
  const sessionId = detectSessionIdFromPlan(plan);
  const contextPacket = await loadContextPacket({ rootDir, sessionId, env, io });
  const contextText = contextPacket.ok ? contextPacket.contextText : '';

  const concurrency = parsePositiveInt(env?.[SUBAGENT_CONCURRENCY_ENV], 3);
  const timeoutMs = parsePositiveInt(env?.[SUBAGENT_TIMEOUT_MS_ENV], 10 * 60 * 1000);
  const preMutationSnapshotEnabled = parseBooleanEnv(env?.[SUBAGENT_PRE_MUTATION_SNAPSHOT_ENV], false);

  const jobs = Array.isArray(dispatchPlan?.jobs) ? dispatchPlan.jobs : [];
  const executorDetails = Array.isArray(dispatchPlan?.executorDetails)
    ? dispatchPlan.executorDetails.map((item) => ({ ...item }))
    : [];
  const executorRegistry = Array.isArray(dispatchPlan?.executorRegistry)
    ? [...dispatchPlan.executorRegistry]
    : executorDetails.map((item) => item.id);
  const executorLabels = new Map(executorDetails.map((item) => [String(item?.id || '').trim(), String(item?.label || '').trim()]).filter(([id]) => id));

  const agentSpecNormalized = normalizeOrchestratorAgentSpec(agentSpec);

  const codexTempDir = clientId === 'codex-cli'
    ? await fs.mkdtemp(path.join(os.tmpdir(), 'aios-codex-last-message-'))
    : null;

  const seedJobRuns = Array.isArray(dispatchPlan?.seedJobRuns)
    ? dispatchPlan.seedJobRuns.map((jobRun) => normalizeSeededJobRun(jobRun)).filter(Boolean)
    : [];

  const jobRunMap = new Map();
  for (const seedJobRun of seedJobRuns) {
    jobRunMap.set(seedJobRun.jobId, seedJobRun);
  }
  if (seedJobRuns.length > 0) {
    io?.log?.(`[subagent-runtime] seeded dependency runs=${seedJobRuns.length}`);
  }

  const pending = new Map(
    jobs
      .filter((job) => !jobRunMap.has(job.jobId))
      .map((job) => [job.jobId, job])
  );
  const running = new Map();

  const startJob = async (job) => {
    const dependencyRuns = Array.isArray(job.dependsOn)
      ? job.dependsOn.map((jobId) => jobRunMap.get(jobId)).filter(Boolean)
      : [];
    const executorId = normalizeText(job?.launchSpec?.executor) || 'unknown';
    const executorLabel = executorLabels.get(executorId) || executorId;

    if (dependencyRuns.some((run) => run.status === 'blocked')) {
      return buildBlockedJobRun(plan, job, dependencyRuns, { executorLabel, reason: 'Blocked by dependency' });
    }

    if (job.jobType === 'phase') {
      const phases = Array.isArray(plan?.phases) ? plan.phases : [];
      const phase = phases.find((item) => normalizeText(item?.id) === normalizeText(job.phaseId)) || null;
      if (!phase) {
        return buildBlockedJobRun(plan, job, dependencyRuns, { executorLabel, reason: `Unknown orchestration phase for job: ${job.jobId}` });
      }

      let preMutationSnapshot = null;
      if (preMutationSnapshotEnabled && phase.canEditFiles === true) {
        try {
          preMutationSnapshot = await createPreMutationSnapshot({
            rootDir,
            sessionId,
            job,
            phase,
            io,
          });
        } catch (error) {
          const reason = `pre-mutation snapshot failed: ${error instanceof Error ? error.message : String(error)}`;
          io?.log?.(`[subagent-runtime] blocked ${job.jobId} reason=${reason}`);
          return buildBlockedJobRun(plan, job, dependencyRuns, {
            executorLabel,
            reason,
          });
        }
      }

      if (shouldAutoCompleteReadOnlyReviewPhase(job, dependencyRuns)) {
        io?.log?.(`[subagent-runtime] auto-completed ${job.jobId} status=completed reason=no-upstream-file-changes`);
        return withPreMutationSnapshot(
          buildAutoCompletedReadOnlyReviewRun(plan, job, dependencyRuns, { executorLabel }),
          preMutationSnapshot
        );
      }
      const phaseJobRun = await executePhaseJob(plan, job, phase, dependencyRuns, {
        clientId,
        contextText,
        timeoutMs,
        env,
        io,
        agentSpecNormalized,
        executorLabel,
        dispatchPolicy,
        rootDir,
        codexTempDir,
      });
      return withPreMutationSnapshot(phaseJobRun, preMutationSnapshot);
    }

    if (job.jobType === 'merge-gate') {
      return executeMergeGateJob(plan, job, dependencyRuns, { executorLabel, dispatchPolicy });
    }

    return buildBlockedJobRun(plan, job, dependencyRuns, { executorLabel, reason: `Unsupported job type: ${job.jobType}` });
  };

  while (pending.size > 0 || running.size > 0) {
    let started = false;

    for (const [jobId, job] of pending) {
      if (running.size >= concurrency) {
        break;
      }

      const deps = Array.isArray(job.dependsOn) ? job.dependsOn : [];
      if (!deps.every((depId) => jobRunMap.has(depId))) {
        continue;
      }

      pending.delete(jobId);
      started = true;

      const promise = startJob(job).then((jobRun) => {
        jobRunMap.set(jobId, jobRun);
        running.delete(jobId);
        return jobRun;
      });
      running.set(jobId, promise);
    }

    if (running.size > 0) {
      await Promise.race(running.values());
      continue;
    }

    if (!started && pending.size > 0) {
      // Cycle or missing dependencies; mark remaining jobs blocked.
      break;
    }
  }

  for (const job of jobs) {
    if (jobRunMap.has(job.jobId)) {
      continue;
    }
    const deps = Array.isArray(job.dependsOn) ? job.dependsOn : [];
    const dependencyRuns = deps.map((jobId) => jobRunMap.get(jobId)).filter(Boolean);
    const executorId = normalizeText(job?.launchSpec?.executor) || 'unknown';
    const executorLabel = executorLabels.get(executorId) || executorId;
    jobRunMap.set(job.jobId, buildBlockedJobRun(plan, job, dependencyRuns, { executorLabel, reason: 'Unresolved job dependency cycle' }));
  }

  const jobRuns = jobs.map((job) => jobRunMap.get(job.jobId)).filter(Boolean);
  const totalCost = jobRuns.reduce(
    (acc, jobRun) => mergeCostTelemetry(acc, jobRun?.cost || null),
    normalizeCostTelemetry()
  );

  if (codexTempDir) {
    try {
      await fs.rm(codexTempDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }

  return {
    mode: 'live',
    ok: jobRuns.every((jobRun) => jobRun.status !== 'blocked'),
    executorRegistry,
    executorDetails,
    jobRuns,
    ...(hasCostTelemetry(totalCost) ? { cost: totalCost } : {}),
    finalOutputs: jobRuns
      .filter((jobRun) => jobRun.output?.outputType === 'merged-handoff' || jobRun.jobType === 'phase')
      .map((jobRun) => ({ jobId: jobRun.jobId, outputType: jobRun.output?.outputType || 'unknown' })),
  };
}
