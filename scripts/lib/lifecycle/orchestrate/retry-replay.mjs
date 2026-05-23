import { promises as fs } from 'node:fs';
import path from 'node:path';

import { contextDbRelativePath, resolveContextDbRoot } from '../../aios/state-root.mjs';

// 纯函数：把 job 状态归一到 retry-replay 关心的阻断/未知语义。
function normalizeJobRunStatus(rawValue = '') {
  const value = String(rawValue || '').trim().toLowerCase();
  if (value === 'blocked' || value === 'needs-input') return 'blocked';
  return value || 'unknown';
}

// 纯函数：集中识别 dispatch-run artifact 文件名，避免目录扫描逻辑散落正则。
function isDispatchArtifactFileName(fileName = '') {
  return /^dispatch-run-.*\.json$/i.test(String(fileName || '').trim());
}

// 纯函数：去重时保留原始顺序，用于 blocker/job/executor 等小列表。
function uniq(items = []) {
  return [...new Set(items)];
}

async function readJsonOptional(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function listDispatchArtifacts(rootDir, sessionId) {
  const artifactsDir = path.join(resolveContextDbRoot(rootDir, { preferLegacyExisting: true }), 'sessions', sessionId, 'artifacts');
  let entries = [];
  try {
    entries = await fs.readdir(artifactsDir, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && isDispatchArtifactFileName(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => String(right).localeCompare(String(left)))
    .map((name) => ({
      artifactPath: contextDbRelativePath(rootDir, 'sessions', sessionId, 'artifacts', name),
      artifactAbsPath: path.join(artifactsDir, name),
    }));
}

// 纯函数：把已完成 job 规整成可作为 replay 种子的依赖输出。
function normalizeSeedJobRun(rawJobRun = {}) {
  const jobId = String(rawJobRun?.jobId || '').trim();
  if (!jobId) {
    return null;
  }
  if (normalizeJobRunStatus(rawJobRun?.status) === 'blocked') {
    return null;
  }
  return {
    jobId,
    jobType: String(rawJobRun?.jobType || '').trim(),
    role: String(rawJobRun?.role || '').trim(),
    executor: String(rawJobRun?.executor || '').trim(),
    executorLabel: String(rawJobRun?.executorLabel || '').trim(),
    dependsOn: Array.isArray(rawJobRun?.dependsOn)
      ? rawJobRun.dependsOn.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    status: String(rawJobRun?.status || 'completed').trim() || 'completed',
    inputSummary: rawJobRun?.inputSummary && typeof rawJobRun.inputSummary === 'object'
      ? { ...rawJobRun.inputSummary }
      : { dependencyCount: 0, inputTypes: [] },
    output: rawJobRun?.output && typeof rawJobRun.output === 'object'
      ? { ...rawJobRun.output }
      : { outputType: 'handoff' },
  };
}

export async function loadLatestBlockedDispatchReplay(rootDir, sessionId) {
  const artifactFiles = await listDispatchArtifacts(rootDir, sessionId);
  for (const file of artifactFiles) {
    const artifact = await readJsonOptional(file.artifactAbsPath);
    const jobRuns = Array.isArray(artifact?.dispatchRun?.jobRuns) ? artifact.dispatchRun.jobRuns : [];
    const blockedJobIds = uniq(
      jobRuns
        .filter((jobRun) => normalizeJobRunStatus(jobRun?.status) === 'blocked')
        .map((jobRun) => String(jobRun?.jobId || '').trim())
        .filter(Boolean)
    );
    if (blockedJobIds.length === 0) {
      continue;
    }
    const seedJobRuns = jobRuns
      .map((jobRun) => normalizeSeedJobRun(jobRun))
      .filter(Boolean);
    return {
      artifactPath: file.artifactPath,
      blockedJobIds,
      seedJobRuns,
    };
  }
  return null;
}

// 纯函数：把 retry-blocked replay 收敛到新的 dispatch plan，保持依赖种子与 executor 注册表同步。
export function applyRetryBlockedDispatchPlan(dispatchPlan, retryReplay) {
  const blockedJobIds = Array.isArray(retryReplay?.blockedJobIds)
    ? retryReplay.blockedJobIds.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (blockedJobIds.length === 0) {
    return {
      dispatchPlan,
      replay: {
        enabled: false,
        reason: 'no-blocked-jobs',
      },
    };
  }

  const blockedSet = new Set(blockedJobIds);
  const replayJobs = Array.isArray(dispatchPlan?.jobs)
    ? dispatchPlan.jobs.filter((job) => blockedSet.has(String(job?.jobId || '').trim()))
    : [];
  if (replayJobs.length === 0) {
    return {
      dispatchPlan,
      replay: {
        enabled: false,
        reason: 'blocked-jobs-not-found-in-current-plan',
        blockedJobIds,
      },
    };
  }

  const replayJobIdSet = new Set(replayJobs.map((job) => String(job?.jobId || '').trim()).filter(Boolean));
  const replayQueueEntries = Array.isArray(dispatchPlan?.workItemQueue?.entries)
    ? dispatchPlan.workItemQueue.entries.filter((entry) => replayJobIdSet.has(String(entry?.jobId || '').trim()))
    : [];
  const replayExecutors = uniq(
    replayJobs
      .map((job) => String(job?.launchSpec?.executor || '').trim())
      .filter(Boolean)
  );
  const replayExecutorDetails = Array.isArray(dispatchPlan?.executorDetails)
    ? dispatchPlan.executorDetails.filter((item) => replayExecutors.includes(String(item?.id || '').trim()))
    : [];
  const replayExecutorRegistry = replayExecutorDetails.length > 0
    ? replayExecutorDetails.map((item) => item.id)
    : replayExecutors;
  const seedJobRuns = Array.isArray(retryReplay?.seedJobRuns)
    ? retryReplay.seedJobRuns
      .filter((jobRun) => !replayJobIdSet.has(String(jobRun?.jobId || '').trim()))
      .map((jobRun) => ({ ...jobRun }))
    : [];

  return {
    dispatchPlan: {
      ...dispatchPlan,
      notes: [
        ...(Array.isArray(dispatchPlan?.notes) ? dispatchPlan.notes : []),
        `Retry-blocked replay from ${retryReplay.artifactPath}: jobs=${replayJobs.length}, seedDeps=${seedJobRuns.length}.`,
      ],
      executorRegistry: replayExecutorRegistry,
      executorDetails: replayExecutorDetails,
      workItemQueue: {
        ...(dispatchPlan?.workItemQueue && typeof dispatchPlan.workItemQueue === 'object' ? dispatchPlan.workItemQueue : {}),
        enabled: replayQueueEntries.length > 0,
        entries: replayQueueEntries,
      },
      jobs: replayJobs,
      seedJobRuns,
    },
    replay: {
      enabled: true,
      artifactPath: retryReplay.artifactPath,
      blockedJobIds,
      replayJobIds: replayJobs.map((job) => job.jobId),
      seedJobIds: seedJobRuns.map((jobRun) => jobRun.jobId),
    },
  };
}
