import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DEFAULT_STALE_THRESHOLD_MINUTES = 30;
const MAX_SCAN_FILES = 2000;
const SKIP_DIRS = new Set(['.git', 'node_modules', '.worktrees', 'dist', 'coverage']);

const IDLE_DEFAULTS = Object.freeze({
  checkIntervalSeconds: 30,
  idleThresholdSeconds: 120,
  maxNudgeCount: 3,
  nudgeMessage: 'You appear to be idle. Review your current task and continue working.',
});

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function ageMinutesFromEpoch(epochMs, nowMs) {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return null;
  const ageMs = Math.max(0, nowMs - epochMs);
  return Math.floor(ageMs / 60000);
}

function buildTeamResumeCommand(sessionId, provider = 'codex', workers = 2) {
  const normalizedSessionId = normalizeText(sessionId) || '<session-id>';
  return `node scripts/aios.mjs team --resume ${normalizedSessionId} --retry-blocked --provider ${provider} --workers ${workers} --dry-run`;
}

function buildRollbackCommand(sessionId) {
  const normalizedSessionId = normalizeText(sessionId) || '<session-id>';
  return `node scripts/aios.mjs snapshot-rollback --session ${normalizedSessionId} --dry-run`;
}

function normalizeUniqueTextArray(value) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map((item) => normalizeText(item)).filter(Boolean))];
}

export function buildWatchdogReadiness(recovery = {}) {
  const decision = normalizeText(recovery?.decision || 'observe').toLowerCase();
  const nextActions = normalizeUniqueTextArray(recovery?.nextActions);
  const reason = normalizeText(recovery?.reason);

  if (decision === 'observe') {
    return {
      verdict: 'ready',
      blockedReasons: [],
      warnings: [],
      nextActions,
      evidence: [],
    };
  }

  if (decision === 'retry' || decision === 'respawn') {
    return {
      verdict: 'warning',
      blockedReasons: [],
      warnings: normalizeUniqueTextArray([reason || 'watchdog recovery is recommended']),
      nextActions,
      evidence: [],
    };
  }

  // pause/rollback and any unknown decision are treated as blocked.
  return {
    verdict: 'blocked',
    blockedReasons: normalizeUniqueTextArray([decision || 'blocked']),
    warnings: normalizeUniqueTextArray([reason || 'watchdog recovery is blocked']),
    nextActions,
    evidence: [],
  };
}

export function decideWatchdogRecovery(signals = {}) {
  const staleThresholdMinutes = normalizeNumber(signals.staleThresholdMinutes, DEFAULT_STALE_THRESHOLD_MINUTES);
  const sessionId = normalizeText(signals.sessionId);
  const provider = normalizeText(signals.provider) || 'codex';
  const workers = normalizeNonNegativeInteger(signals.workers, 2) || 2;
  const normalizedSignals = {
    commitAgeMinutes: normalizeNumber(signals.commitAgeMinutes, null),
    fileActivityAgeMinutes: normalizeNumber(signals.fileActivityAgeMinutes, null),
    logAgeMinutes: normalizeNumber(signals.logAgeMinutes, null),
    cpuState: normalizeText(signals.cpuState) || 'unknown',
    blockedJobs: normalizeNonNegativeInteger(signals.blockedJobs, 0),
    rollbackArtifacts: normalizeNonNegativeInteger(signals.rollbackArtifacts, 0),
    paused: signals.paused === true,
  };

  if (normalizedSignals.paused) {
    return {
      decision: 'pause',
      reason: 'pause file is present; recovery actions are suspended',
      signals: normalizedSignals,
      nextActions: ['Remove the session .pause file to resume watchdog recovery.'],
    };
  }

  if (normalizedSignals.blockedJobs > 0 && normalizedSignals.rollbackArtifacts > 0) {
    return {
      decision: 'rollback',
      reason: 'blocked jobs have pre-mutation rollback artifacts available',
      signals: normalizedSignals,
      nextActions: [buildRollbackCommand(sessionId), buildTeamResumeCommand(sessionId, provider, workers)],
    };
  }

  if (normalizedSignals.blockedJobs > 0) {
    return {
      decision: 'retry',
      reason: 'blocked jobs detected without rollback artifacts',
      signals: normalizedSignals,
      nextActions: [buildTeamResumeCommand(sessionId, provider, workers)],
    };
  }

  const staleCommit = normalizedSignals.commitAgeMinutes === null || normalizedSignals.commitAgeMinutes >= staleThresholdMinutes;
  const staleFiles = normalizedSignals.fileActivityAgeMinutes === null || normalizedSignals.fileActivityAgeMinutes >= staleThresholdMinutes;
  const staleLogs = normalizedSignals.logAgeMinutes === null || normalizedSignals.logAgeMinutes >= staleThresholdMinutes;
  const deadProcess = normalizedSignals.cpuState === 'dead';

  if (staleCommit && staleFiles && staleLogs && deadProcess) {
    return {
      decision: 'respawn',
      reason: 'all worker activity signals are stale and the worker process is dead',
      signals: normalizedSignals,
      nextActions: [buildTeamResumeCommand(sessionId, provider, workers)],
    };
  }

  return {
    decision: 'observe',
    reason: 'worker activity signals are fresh or inconclusive',
    signals: normalizedSignals,
    nextActions: [],
  };
}

export async function collectWatchdogSignals({
  rootDir,
  sessionId = '',
  workspaceRoot = rootDir,
  nowMs = Date.now(),
  provider = 'codex',
  workers = 2,
} = {}) {
  const normalizedRootDir = path.resolve(rootDir || process.cwd());
  const normalizedSessionId = normalizeText(sessionId);
  const sessionDir = normalizedSessionId
    ? path.join(normalizedRootDir, 'memory', 'context-db', 'sessions', normalizedSessionId)
    : '';
  const artifactsDir = sessionDir ? path.join(sessionDir, 'artifacts') : '';
  const pausePath = sessionDir ? path.join(sessionDir, '.pause') : '';
  const dispatch = artifactsDir ? await readLatestDispatchArtifact(artifactsDir) : null;
  const latestWorkspaceMtime = await latestMtimeMs(path.resolve(workspaceRoot || normalizedRootDir), { maxFiles: MAX_SCAN_FILES });
  const latestLogMtime = sessionDir ? await latestMtimeMs(sessionDir, { maxFiles: MAX_SCAN_FILES }) : null;
  const rollbackArtifacts = artifactsDir ? await countRollbackManifests(artifactsDir) : 0;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const workerPids = dedupePids([
    ...extractWorkerPids(dispatch),
    ...extractWorkerPids(workers),
    ...(sessionDir ? await readSessionPidFiles(sessionDir) : []),
  ]);

  return {
    sessionId: normalizedSessionId,
    provider: normalizeText(provider) || 'codex',
    workers: normalizeNonNegativeInteger(workers, 2) || 2,
    paused: pausePath ? await fileExists(pausePath) : false,
    commitAgeMinutes: readGitCommitAgeMinutes(path.resolve(workspaceRoot || normalizedRootDir), now),
    fileActivityAgeMinutes: ageMinutesFromEpoch(latestWorkspaceMtime, now),
    logAgeMinutes: ageMinutesFromEpoch(latestLogMtime, now),
    cpuState: determineCpuState(workerPids),
    workerPids,
    blockedJobs: countBlockedJobs(dispatch),
    rollbackArtifacts,
  };
}

export async function buildTeamWatchdogState(options = {}, context = {}) {
  const rootDir = context.rootDir || process.cwd();
  const signals = await collectWatchdogSignals({
    rootDir,
    sessionId: options.sessionId || options.resumeSessionId,
    workspaceRoot: options.workspaceRoot || rootDir,
    nowMs: Number.isFinite(Number(context.nowMs)) ? Number(context.nowMs) : Number(context.nowFn?.() ?? Date.now()),
    provider: options.provider,
    workers: options.workers,
  });
  const recovery = decideWatchdogRecovery(signals);
  return {
    sessionId: signals.sessionId,
    ...recovery,
    readiness: buildWatchdogReadiness(recovery),
  };
}

export async function runTeamWatchdog(options = {}, { rootDir, io = console, nowFn = () => Date.now() } = {}) {
  const state = await buildTeamWatchdogState(options, { rootDir, nowFn });
  if (options.json === true) {
    io.log(JSON.stringify(state, null, 2));
  } else {
    io.log(formatWatchdogText(state));
  }
  return { exitCode: state.sessionId ? 0 : 1 };
}

function formatWatchdogText(state) {
  const lines = [
    `AIOS Team Watchdog: ${state.sessionId || '(no session)'}`,
    `Decision: ${state.decision}`,
    state.readiness?.verdict ? `Readiness: ${state.readiness.verdict}` : '',
    `Reason: ${state.reason}`,
  ];
  if (Array.isArray(state.nextActions) && state.nextActions.length > 0) {
    lines.push('Next actions:');
    for (const action of state.nextActions) {
      lines.push(`- ${action}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function readGitCommitAgeMinutes(workspaceRoot, nowMs) {
  try {
    const raw = execFileSync('git', ['log', '-1', '--format=%ct'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const seconds = Number.parseInt(raw, 10);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return ageMinutesFromEpoch(seconds * 1000, nowMs);
  } catch {
    return null;
  }
}

async function latestMtimeMs(rootPath, { maxFiles = MAX_SCAN_FILES } = {}) {
  let latest = null;
  let visited = 0;

  async function visit(currentPath) {
    if (visited >= maxFiles) return;
    let stat;
    try {
      stat = await fs.stat(currentPath);
    } catch {
      return;
    }
    visited += 1;
    if (latest === null || stat.mtimeMs > latest) latest = stat.mtimeMs;
    if (!stat.isDirectory()) return;
    const base = path.basename(currentPath);
    if (SKIP_DIRS.has(base)) return;
    let entries = [];
    try {
      entries = await fs.readdir(currentPath);
    } catch {
      return;
    }
    for (const entry of entries) {
      await visit(path.join(currentPath, entry));
      if (visited >= maxFiles) return;
    }
  }

  await visit(rootPath);
  return latest;
}

function normalizePid(value) {
  const pid = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  return Math.floor(pid);
}

function dedupePids(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [values])
    .map((value) => normalizePid(value))
    .filter((value) => value !== null)));
}

function extractWorkerPids(source) {
  const pids = [];

  function visit(value, depth = 0) {
    if (depth > 5 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value !== 'object') {
      if (depth > 0) {
        const pid = normalizePid(value);
        if (pid !== null) pids.push(pid);
      }
      return;
    }

    for (const key of ['pid', 'processId', 'processID', 'workerPid', 'childPid']) {
      const pid = normalizePid(value[key]);
      if (pid !== null) pids.push(pid);
    }
    for (const key of ['workerPids', 'pids', 'processes', 'workers', 'jobRuns']) {
      if (value[key] !== undefined) visit(value[key], depth + 1);
    }
    if (value.dispatchRun) visit(value.dispatchRun, depth + 1);
    if (value.process) visit(value.process, depth + 1);
    if (value.runtime) visit(value.runtime, depth + 1);
    if (value.worker) visit(value.worker, depth + 1);
    if (value.output) visit(value.output, depth + 1);
  }

  visit(source);
  return dedupePids(pids);
}

function isProcessAlive(pid) {
  const normalizedPid = normalizePid(pid);
  if (normalizedPid === null) return false;
  try {
    process.kill(normalizedPid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function determineCpuState(workerPids = []) {
  const pids = dedupePids(workerPids);
  if (pids.length === 0) return 'unknown';
  return pids.some((pid) => isProcessAlive(pid)) ? 'active' : 'dead';
}

async function readSessionPidFiles(sessionDir) {
  const pids = [];
  async function readPidFile(filePath) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      pids.push(...dedupePids(raw.split(/\s+/)));
    } catch {
      // Ignore stale or unreadable pid hints; other signals still drive the decision.
    }
  }

  async function visit(currentPath, depth = 0) {
    if (depth > 2) return;
    let entries = [];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'artifacts' || entry.name === 'workers' || entry.name === 'runtime') {
          await visit(entryPath, depth + 1);
        }
        continue;
      }
      if (entry.isFile() && (entry.name === '.pid' || entry.name === 'pid' || entry.name.endsWith('.pid'))) {
        await readPidFile(entryPath);
      }
    }
  }

  await visit(sessionDir);
  return dedupePids(pids);
}

async function readLatestDispatchArtifact(artifactsDir) {
  let entries = [];
  try {
    entries = await fs.readdir(artifactsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const candidates = entries
    .filter((entry) => entry.isFile() && /^dispatch-run-.*\.json$/i.test(entry.name))
    .map((entry) => path.join(artifactsDir, entry.name))
    .sort()
    .reverse();
  for (const candidate of candidates) {
    try {
      return JSON.parse(await fs.readFile(candidate, 'utf8'));
    } catch {
      continue;
    }
  }
  return null;
}

function countBlockedJobs(dispatchArtifact) {
  const jobRuns = Array.isArray(dispatchArtifact?.dispatchRun?.jobRuns)
    ? dispatchArtifact.dispatchRun.jobRuns
    : Array.isArray(dispatchArtifact?.jobRuns)
      ? dispatchArtifact.jobRuns
      : [];
  return jobRuns.filter((job) => normalizeText(job?.status).toLowerCase() === 'blocked').length;
}

async function countRollbackManifests(artifactsDir) {
  let count = 0;
  async function visit(currentPath) {
    let entries = [];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const childPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await visit(childPath);
      } else if (entry.isFile() && entry.name === 'manifest.json' && /pre-mutation/i.test(childPath)) {
        count += 1;
      }
    }
  }
  await visit(artifactsDir);
  return count;
}

// --- Todo Enforcer: idle detection + nudge ---

export function buildIdleDetector(options = {}) {
  const checkIntervalSeconds = normalizeNonNegativeInteger(options.checkIntervalSeconds, IDLE_DEFAULTS.checkIntervalSeconds);
  const idleThresholdSeconds = normalizeNonNegativeInteger(options.idleThresholdSeconds, IDLE_DEFAULTS.idleThresholdSeconds);
  const maxNudgeCount = normalizeNonNegativeInteger(options.maxNudgeCount, IDLE_DEFAULTS.maxNudgeCount);
  const nudgeMessage = normalizeText(options.nudgeMessage) || IDLE_DEFAULTS.nudgeMessage;
  return { checkIntervalSeconds, idleThresholdSeconds, maxNudgeCount, nudgeMessage };
}

export function detectIdleState(signals, idleConfig = IDLE_DEFAULTS) {
  const idleSeconds = idleConfig.idleThresholdSeconds || IDLE_DEFAULTS.idleThresholdSeconds;
  const idleThresholdMs = idleSeconds * 1000;
  const nowMs = Date.now();
  const commitAgeMs = (signals.commitAgeMinutes ?? Infinity) * 60000;
  const fileAgeMs = (signals.fileActivityAgeMinutes ?? Infinity) * 60000;
  const logAgeMs = (signals.logAgeMinutes ?? Infinity) * 60000;
  const isIdle = commitAgeMs >= idleThresholdMs && fileAgeMs >= idleThresholdMs && logAgeMs >= idleThresholdMs;
  const cpuActive = signals.cpuState === 'active';
  return {
    isIdle: isIdle && !cpuActive,
    idleSeconds: Math.min(commitAgeMs, fileAgeMs, logAgeMs) / 1000,
    thresholdSeconds: idleSeconds,
    signals: { commitAgeMs, fileAgeMs, logAgeMs, cpuActive },
  };
}

export function decideNudgeAction(idleState, nudgeCount = 0, config = IDLE_DEFAULTS) {
  const max = config.maxNudgeCount || IDLE_DEFAULTS.maxNudgeCount;
  if (!idleState.isIdle) {
    return { action: 'none', reason: 'agent is active', nudgeCount };
  }
  if (nudgeCount >= max) {
    return {
      action: 'blocked',
      reason: `agent idle after ${nudgeCount} nudges (max=${max}), escalating to blocked`,
      nudgeCount,
      message: `Agent has been idle for ${Math.round(idleState.idleSeconds)}s after ${nudgeCount} nudges. Operator intervention required.`,
    };
  }
  return {
    action: 'nudge',
    reason: `agent idle for ${Math.round(idleState.idleSeconds)}s (threshold=${idleState.thresholdSeconds}s), sending nudge ${nudgeCount + 1}/${max}`,
    nudgeCount: nudgeCount + 1,
    message: config.nudgeMessage || IDLE_DEFAULTS.nudgeMessage,
  };
}

export async function runTodoEnforcerLoop(options = {}, { rootDir, io = console } = {}) {
  const config = buildIdleDetector(options);
  const maxIterations = normalizeNonNegativeInteger(options.maxIterations, 100);
  let nudgeCount = normalizeNonNegativeInteger(options.initialNudgeCount, 0);
  const sessionId = normalizeText(options.sessionId);

  for (let i = 0; i < maxIterations; i++) {
    const signals = await collectWatchdogSignals({
      rootDir,
      sessionId,
      workspaceRoot: options.workspaceRoot || rootDir,
    });
    const idleState = detectIdleState(signals, config);
    const action = decideNudgeAction(idleState, nudgeCount, config);

    if (action.action === 'none') {
      nudgeCount = 0;
    } else if (action.action === 'nudge') {
      nudgeCount = action.nudgeCount;
      io.log(`[todo-enforcer] ${action.reason}`);
      io.log(`[todo-enforcer] nudge: ${action.message}`);
      // Write nudge event to ContextDB for agent to pick up
      try {
        const { runContextDbCli } = await import('../contextdb-cli.mjs');
        runContextDbCli([
          'event:add', '--workspace', rootDir || process.cwd(),
          '--session', sessionId || 'default',
          '--role', 'system', '--kind', 'enforcer.nudge',
          '--text', JSON.stringify({ message: action.message, nudgeCount, idleSeconds: idleState.idleSeconds }),
          '--turn-id', `enforcer-${Date.now().toString(36)}`,
        ]);
      } catch { /* best-effort */ }
    } else if (action.action === 'blocked') {
      io.log(`[todo-enforcer] ${action.reason}`);
      io.log(`[todo-enforcer] BLOCKED: ${action.message}`);
      return { exitCode: 2, action: 'blocked', nudgeCount, idleState };
    }

    const waitMs = (config.checkIntervalSeconds || IDLE_DEFAULTS.checkIntervalSeconds) * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  return { exitCode: 0, action: 'completed', nudgeCount };
}
