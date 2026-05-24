/* 中文注释：watchdog 信号采集只读取工作区、ContextDB 和进程状态，不做恢复决策。 */
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resolveContextDbRoot } from '../../aios/state-root.mjs';
import { MAX_SCAN_FILES, SKIP_DIRS } from './constants.mjs';
import {
  ageMinutesFromEpoch,
  normalizeNonNegativeInteger,
  normalizeText,
} from './shared.mjs';

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
    ? path.join(resolveContextDbRoot(normalizedRootDir, { preferLegacyExisting: true }), 'sessions', normalizedSessionId)
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

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function readGitCommitAgeMinutes(workspaceRoot, nowMs) {
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

export async function latestMtimeMs(rootPath, { maxFiles = MAX_SCAN_FILES } = {}) {
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

export function normalizePid(value) {
  const pid = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  return Math.floor(pid);
}

export function dedupePids(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [values])
    .map((value) => normalizePid(value))
    .filter((value) => value !== null)));
}

export function extractWorkerPids(source) {
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

export function isProcessAlive(pid) {
  const normalizedPid = normalizePid(pid);
  if (normalizedPid === null) return false;
  try {
    process.kill(normalizedPid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export function determineCpuState(workerPids = []) {
  const pids = dedupePids(workerPids);
  if (pids.length === 0) return 'unknown';
  return pids.some((pid) => isProcessAlive(pid)) ? 'active' : 'dead';
}

export async function readSessionPidFiles(sessionDir) {
  const pids = [];
  async function readPidFile(filePath) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      pids.push(...dedupePids(raw.split(/\s+/)));
    } catch {
      // 中文注释：pid 文件只是弱信号，读取失败时让其他信号继续参与决策。
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

export async function readLatestDispatchArtifact(artifactsDir) {
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

export function countBlockedJobs(dispatchArtifact) {
  const jobRuns = Array.isArray(dispatchArtifact?.dispatchRun?.jobRuns)
    ? dispatchArtifact.dispatchRun.jobRuns
    : Array.isArray(dispatchArtifact?.jobRuns)
      ? dispatchArtifact.jobRuns
      : [];
  return jobRuns.filter((job) => normalizeText(job?.status).toLowerCase() === 'blocked').length;
}

export async function countRollbackManifests(artifactsDir) {
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
