import { clone } from '../shared.mjs';
import { POLICY_CHECKPOINT_DEFAULT_MAX_VERSIONS, POLICY_CHECKPOINT_SCHEMA_VERSION } from './constants.mjs';
import { normalizePolicyOpeMetrics } from './ope.mjs';

export function normalizeCheckpointPolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return clone(value);
}

// 纯函数：把用户或时间戳输入变成安全的版本号片段，避免写出非法路径。
export function sanitizePolicyVersionId(value = '') {
  return String(value || '').trim().replace(/[^a-zA-Z0-9._-]/g, '-');
}

// 纯函数：集中生成策略版本号，保证 latest/index/version 文件使用同一命名规则。
export function createPolicyVersionId({ savedAt, batchIndex = 0, updateCount = 0 }) {
  const stamp = String(savedAt || new Date().toISOString())
    .replace(/[-:]/g, '')
    .replace(/\.(\d{3})Z$/, '$1Z');
  return `b${String(Number(batchIndex || 0)).padStart(4, '0')}-u${String(Number(updateCount || 0)).padStart(6, '0')}-${stamp}`;
}

export function buildPolicyVersionPath(paths, versionId) {
  const safeVersionId = sanitizePolicyVersionId(versionId) || 'unknown';
  return `${paths.versionsDir}/orchestrator-bandit-policy.${safeVersionId}.json`;
}

export function createEmptyPolicyCheckpointIndex() {
  return {
    schema_version: POLICY_CHECKPOINT_SCHEMA_VERSION,
    latest_version_id: null,
    last_good_version_id: null,
    versions: [],
  };
}

// 纯函数：规范化策略索引，过滤缺少 version_id/file_path 的损坏记录。
export function normalizePolicyCheckpointIndex(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw
    : createEmptyPolicyCheckpointIndex();
  const versions = Array.isArray(source.versions)
    ? source.versions
      .map((entry) => {
        const versionId = sanitizePolicyVersionId(entry?.version_id || '');
        const filePath = typeof entry?.file_path === 'string' ? entry.file_path : '';
        if (!versionId || !filePath) return null;
        return {
          version_id: versionId,
          file_path: filePath,
          saved_at: typeof entry?.saved_at === 'string' ? entry.saved_at : null,
          update_count: Number(entry?.update_count || 0),
          batch_index: Number(entry?.batch_index || 0),
          active_checkpoint_id: entry?.active_checkpoint_id ? String(entry.active_checkpoint_id) : null,
          quality_status: entry?.quality_status === 'healthy' ? 'healthy' : 'degraded',
          quality_score: Number(entry?.quality_score || 0),
          ope: normalizePolicyOpeMetrics(entry?.ope || {}),
          stability_status: entry?.stability_status === 'critical'
            ? 'critical'
            : entry?.stability_status === 'warning'
              ? 'warning'
              : 'ok',
        };
      })
      .filter(Boolean)
    : [];

  const versionIds = new Set(versions.map((entry) => entry.version_id));
  const latestVersionId = sanitizePolicyVersionId(source.latest_version_id || '');
  const lastGoodVersionId = sanitizePolicyVersionId(source.last_good_version_id || '');
  return {
    schema_version: POLICY_CHECKPOINT_SCHEMA_VERSION,
    latest_version_id: versionIds.has(latestVersionId) ? latestVersionId : null,
    last_good_version_id: versionIds.has(lastGoodVersionId) ? lastGoodVersionId : null,
    versions,
  };
}

// 纯函数：用 epoch 与 holdout 信号评估策略版本质量，供 last-good 指针使用。
export function computePolicyQuality({
  epochOutcome = '',
  batchBetterCount = 0,
  batchWorseCount = 0,
  batchComparisonFailedCount = 0,
  holdoutOrchestratorStatus = '',
} = {}) {
  const better = Number(batchBetterCount || 0);
  const worse = Number(batchWorseCount || 0);
  const comparisonFailed = Number(batchComparisonFailedCount || 0);
  const normalizedEpochOutcome = String(epochOutcome || '').trim();
  const normalizedHoldout = String(holdoutOrchestratorStatus || '').trim().toLowerCase();
  const score = better - worse - comparisonFailed - (normalizedHoldout === 'failed' ? 1 : 0) - (normalizedEpochOutcome === 'rollback' ? 2 : 0);
  const healthy = normalizedEpochOutcome !== 'rollback'
    && comparisonFailed === 0
    && worse <= better
    && normalizedHoldout !== 'failed';
  return {
    quality_status: healthy ? 'healthy' : 'degraded',
    quality_score: score,
  };
}

export function sortPolicyVersions(versions = []) {
  return [...versions].sort((left, right) => String(left?.saved_at || '').localeCompare(String(right?.saved_at || '')));
}

export function findLastGoodVersionId(versions = []) {
  for (let index = versions.length - 1; index >= 0; index -= 1) {
    if (versions[index]?.quality_status === 'healthy') {
      return versions[index].version_id;
    }
  }
  return null;
}

// 纯函数：合并新版本并裁剪历史长度，集中维护 latest/last-good 指针。
export function updatePolicyCheckpointIndex({ currentIndex, nextEntry, maxVersions = POLICY_CHECKPOINT_DEFAULT_MAX_VERSIONS } = {}) {
  const maxCount = Number.isInteger(maxVersions) && maxVersions > 0 ? maxVersions : POLICY_CHECKPOINT_DEFAULT_MAX_VERSIONS;
  const merged = [
    ...(Array.isArray(currentIndex?.versions) ? currentIndex.versions : []).filter((entry) => entry?.version_id !== nextEntry.version_id),
    nextEntry,
  ];
  const retained = sortPolicyVersions(merged).slice(Math.max(0, merged.length - maxCount));
  const latestVersionId = retained.length > 0 ? retained[retained.length - 1].version_id : null;
  return {
    schema_version: POLICY_CHECKPOINT_SCHEMA_VERSION,
    latest_version_id: latestVersionId,
    last_good_version_id: findLastGoodVersionId(retained),
    versions: retained,
  };
}

// 纯函数：解析 resume 目标，支持 latest、last-good 和精确版本号。
export function resolvePolicyResumeVersionId(index, target = 'latest') {
  const normalized = String(target || 'latest').trim();
  if (!normalized || normalized === 'latest') {
    return index.latest_version_id;
  }
  if (normalized === 'last-good' || normalized === 'last_good') {
    return index.last_good_version_id || index.latest_version_id;
  }
  const exact = index.versions.find((entry) => entry.version_id === normalized);
  return exact ? exact.version_id : null;
}

// 纯函数：统一 checkpoint metadata 结构，读写路径都返回同一种报告对象。
export function buildPolicyCheckpointMetadata({
  checkpointPaths = {}, path = null, index_path: indexPath = null, versions_dir: versionsDir = null, ope_log_path: opeLogPath = null,
  loadStatus = 'cold_start', loadError = null, loadTarget = 'latest', loadedVersionId = null, loadedPath = null,
  loadedUpdateCount = 0, loadedBatchIndex = 0, loadedSavedAt = null, latestVersionId = null, lastGoodVersionId = null,
  availableVersions = 0, rollbackApplied = false, rollbackFromVersionId = null, saveStatus = 'not_written', savedVersionId = null,
  savedPath = null, savedUpdateCount = 0, savedBatchIndex = 0, savedAt = null, loadedOpe = null, savedOpe = null,
  rewardConfig = null, stability = null,
} = {}) {
  return {
    path: checkpointPaths.latestPath || path || null,
    index_path: checkpointPaths.indexPath || indexPath || null,
    versions_dir: checkpointPaths.versionsDir || versionsDir || null,
    ope_log_path: checkpointPaths.opeLogPath || opeLogPath || null,
    schema_version: POLICY_CHECKPOINT_SCHEMA_VERSION,
    load_status: loadStatus,
    load_error: loadError,
    load_target: loadTarget,
    loaded_version_id: loadedVersionId,
    loaded_path: loadedPath,
    loaded_update_count: Number(loadedUpdateCount || 0),
    loaded_batch_index: Number(loadedBatchIndex || 0),
    loaded_saved_at: loadedSavedAt,
    latest_version_id: latestVersionId,
    last_good_version_id: lastGoodVersionId,
    available_versions: Number(availableVersions || 0),
    rollback_applied: rollbackApplied === true,
    rollback_from_version_id: rollbackFromVersionId,
    save_status: saveStatus,
    saved_version_id: savedVersionId,
    saved_path: savedPath,
    saved_update_count: Number(savedUpdateCount || 0),
    saved_batch_index: Number(savedBatchIndex || 0),
    saved_at: savedAt,
    loaded_ope: loadedOpe ? clone(loadedOpe) : null,
    saved_ope: savedOpe ? clone(savedOpe) : null,
    reward_config: rewardConfig ? clone(rewardConfig) : null,
    stability: stability ? clone(stability) : null,
  };
}
