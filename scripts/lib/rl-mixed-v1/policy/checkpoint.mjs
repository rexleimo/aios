import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { clone } from '../shared.mjs';
import {
  POLICY_CHECKPOINT_DEFAULT_MAX_VERSIONS,
  POLICY_CHECKPOINT_FILE,
  POLICY_CHECKPOINT_INDEX_FILE,
  POLICY_CHECKPOINT_OPE_LOG_FILE,
  POLICY_CHECKPOINT_SCHEMA_VERSION,
  POLICY_CHECKPOINT_VERSIONS_DIR,
} from './constants.mjs';
import { readJsonObject } from './io.mjs';
import {
  buildPolicyCheckpointMetadata,
  buildPolicyVersionPath,
  computePolicyQuality,
  createEmptyPolicyCheckpointIndex,
  createPolicyVersionId,
  normalizeCheckpointPolicy,
  normalizePolicyCheckpointIndex,
  resolvePolicyResumeVersionId,
  sanitizePolicyVersionId,
  updatePolicyCheckpointIndex,
} from './index.mjs';
import { normalizePolicyOpeMetrics } from './ope.mjs';

export async function ensureNamespaceRoot(rootDir, namespace) {
  const baseDir = path.join(rootDir, 'experiments', namespace);
  await mkdir(baseDir, { recursive: true });
  return baseDir;
}

// 纯函数：集中计算策略 checkpoint 相关路径，避免各调用点手写文件名。
export function buildPolicyCheckpointPaths(baseDir) {
  const checkpointsDir = path.join(baseDir, 'checkpoints');
  return {
    latestPath: path.join(checkpointsDir, POLICY_CHECKPOINT_FILE),
    indexPath: path.join(checkpointsDir, POLICY_CHECKPOINT_INDEX_FILE),
    versionsDir: path.join(checkpointsDir, POLICY_CHECKPOINT_VERSIONS_DIR),
    opeLogPath: path.join(checkpointsDir, POLICY_CHECKPOINT_OPE_LOG_FILE),
  };
}

function extractPolicyPayloadDetails(payload = {}) {
  const loadedOpe = payload?.ope && typeof payload.ope === 'object' && !Array.isArray(payload.ope) ? payload.ope : null;
  const rewardConfig = payload?.reward_config && typeof payload.reward_config === 'object' && !Array.isArray(payload.reward_config)
    ? payload.reward_config
    : null;
  const stability = payload?.stability && typeof payload.stability === 'object' && !Array.isArray(payload.stability)
    ? payload.stability
    : null;
  return { loadedOpe, rewardConfig, stability };
}

function buildLoadedPolicyResult({ checkpointPaths, payload, entry = null, index, resumeTarget, loadedPath }) {
  const details = extractPolicyPayloadDetails(payload);
  const payloadVersionId = sanitizePolicyVersionId(payload.version_id || '');
  const loadedVersionId = entry?.version_id || payloadVersionId || null;
  return {
    status: 'loaded',
    metadata: buildPolicyCheckpointMetadata({
      checkpointPaths,
      loadStatus: 'loaded',
      loadTarget: resumeTarget,
      loadedVersionId,
      loadedPath,
      loadedUpdateCount: Number(payload.update_count || payload.active_policy?.contextualBandit?.updateCount || 0),
      loadedBatchIndex: Number(payload.batch_index || 0),
      loadedSavedAt: typeof payload.saved_at === 'string' ? payload.saved_at : null,
      latestVersionId: index.latest_version_id || payloadVersionId || null,
      lastGoodVersionId: index.last_good_version_id,
      availableVersions: index.versions.length,
      rollbackApplied: resumeTarget === 'last-good' && index.latest_version_id && index.latest_version_id !== loadedVersionId,
      rollbackFromVersionId: resumeTarget === 'last-good' ? index.latest_version_id : null,
      loadedOpe: details.loadedOpe,
      rewardConfig: details.rewardConfig,
      stability: details.stability,
    }),
    activePolicy: normalizeCheckpointPolicy(payload.active_policy),
    referencePolicy: normalizeCheckpointPolicy(payload.reference_policy),
    ope: details.loadedOpe ? normalizePolicyOpeMetrics(details.loadedOpe.active_policy || details.loadedOpe) : null,
    rewardConfig: details.rewardConfig ? clone(details.rewardConfig) : null,
    stability: details.stability ? clone(details.stability) : null,
  };
}

export async function loadPolicyCheckpoint({ checkpointPaths, resumeTarget = 'latest' } = {}) {
  const indexRaw = await readJsonObject(checkpointPaths.indexPath);
  const index = indexRaw.status === 'ok' ? normalizePolicyCheckpointIndex(indexRaw.value) : createEmptyPolicyCheckpointIndex();
  const selectedVersionId = resolvePolicyResumeVersionId(index, resumeTarget);
  const selectedEntry = selectedVersionId ? index.versions.find((entry) => entry.version_id === selectedVersionId) || null : null;

  if (selectedEntry) {
    const versionRaw = await readJsonObject(selectedEntry.file_path);
    if (versionRaw.status === 'ok') {
      return buildLoadedPolicyResult({
        checkpointPaths,
        payload: versionRaw.value,
        entry: selectedEntry,
        index,
        resumeTarget,
        loadedPath: selectedEntry.file_path,
      });
    }
    return buildMissingPolicyResult({ checkpointPaths, index, resumeTarget, entry: selectedEntry, raw: versionRaw });
  }

  if (String(resumeTarget || 'latest').trim() !== 'latest' && String(resumeTarget || '').trim().length > 0) {
    return buildTargetMissingPolicyResult({ checkpointPaths, index, resumeTarget });
  }

  const latestRaw = await readJsonObject(checkpointPaths.latestPath);
  if (latestRaw.status === 'ok') {
    return buildLoadedPolicyResult({
      checkpointPaths,
      payload: latestRaw.value,
      index,
      resumeTarget,
      loadedPath: checkpointPaths.latestPath,
    });
  }
  return buildMissingPolicyResult({ checkpointPaths, index, resumeTarget, raw: latestRaw });
}

function buildTargetMissingPolicyResult({ checkpointPaths, index, resumeTarget }) {
  return {
    status: 'missing',
    metadata: buildPolicyCheckpointMetadata({
      checkpointPaths,
      loadStatus: 'missing',
      loadTarget: resumeTarget,
      loadError: `policy checkpoint target not found: ${resumeTarget}`,
      latestVersionId: index.latest_version_id,
      lastGoodVersionId: index.last_good_version_id,
      availableVersions: index.versions.length,
    }),
    activePolicy: null,
    referencePolicy: null,
  };
}

function buildMissingPolicyResult({ checkpointPaths, index, resumeTarget, entry = null, raw }) {
  const loadStatus = raw.status === 'missing' ? 'missing' : 'corrupt';
  return {
    status: loadStatus,
    metadata: buildPolicyCheckpointMetadata({
      checkpointPaths,
      loadStatus,
      loadTarget: resumeTarget,
      loadError: raw.status === 'missing' ? null : (raw.error?.message || 'failed to read policy checkpoint'),
      loadedVersionId: entry?.version_id || null,
      loadedPath: entry?.file_path || null,
      latestVersionId: index.latest_version_id,
      lastGoodVersionId: index.last_good_version_id,
      availableVersions: index.versions.length,
    }),
    activePolicy: null,
    referencePolicy: null,
  };
}

function normalizePersistOpe(ope) {
  return ope && typeof ope === 'object' && !Array.isArray(ope)
    ? {
      window_size: Number(ope.window_size || 0),
      active_policy: normalizePolicyOpeMetrics(ope.active_policy || {}),
      reference_policy: normalizePolicyOpeMetrics(ope.reference_policy || {}),
      dr_lift_vs_reference: Number(ope.dr_lift_vs_reference || 0),
    }
    : null;
}

export async function persistPolicyCheckpoint({
  checkpointPaths,
  activePolicy,
  referencePolicy,
  rewardConfig = null,
  ope = null,
  stability = null,
  updateCount = 0,
  batchIndex = 0,
  activeCheckpointId = null,
  qualityContext = {},
  maxVersions = POLICY_CHECKPOINT_DEFAULT_MAX_VERSIONS,
}) {
  const savedAt = new Date().toISOString();
  const versionId = createPolicyVersionId({ savedAt, batchIndex, updateCount });
  const versionPath = buildPolicyVersionPath(checkpointPaths, versionId);
  const quality = computePolicyQuality(qualityContext);
  const normalizedOpe = normalizePersistOpe(ope);
  const normalizedRewardConfig = rewardConfig && typeof rewardConfig === 'object' && !Array.isArray(rewardConfig) ? clone(rewardConfig) : null;
  const normalizedStability = stability && typeof stability === 'object' && !Array.isArray(stability) ? clone(stability) : null;
  const stabilityStatus = normalizedStability?.has_critical === true
    ? 'critical'
    : Array.isArray(normalizedStability?.alerts) && normalizedStability.alerts.length > 0 ? 'warning' : 'ok';
  const payload = {
    schema_version: POLICY_CHECKPOINT_SCHEMA_VERSION,
    version_id: versionId,
    saved_at: savedAt,
    update_count: Number(updateCount || 0),
    batch_index: Number(batchIndex || 0),
    active_checkpoint_id: activeCheckpointId ? String(activeCheckpointId) : null,
    quality_status: quality.quality_status,
    quality_score: quality.quality_score,
    ope: normalizedOpe,
    reward_config: normalizedRewardConfig,
    stability: normalizedStability,
    active_policy: normalizeCheckpointPolicy(activePolicy),
    reference_policy: normalizeCheckpointPolicy(referencePolicy),
  };
  await mkdir(path.dirname(checkpointPaths.latestPath), { recursive: true });
  await mkdir(checkpointPaths.versionsDir, { recursive: true });
  await writeFile(checkpointPaths.latestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await writeFile(versionPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const indexRaw = await readJsonObject(checkpointPaths.indexPath);
  const currentIndex = indexRaw.status === 'ok' ? normalizePolicyCheckpointIndex(indexRaw.value) : createEmptyPolicyCheckpointIndex();
  const nextEntry = {
    version_id: versionId,
    file_path: versionPath,
    saved_at: savedAt,
    update_count: Number(updateCount || 0),
    batch_index: Number(batchIndex || 0),
    active_checkpoint_id: activeCheckpointId ? String(activeCheckpointId) : null,
    quality_status: quality.quality_status,
    quality_score: quality.quality_score,
    ope: normalizedOpe ? normalizePolicyOpeMetrics(normalizedOpe.active_policy || {}) : normalizePolicyOpeMetrics({}),
    stability_status: stabilityStatus,
  };
  const nextIndex = updatePolicyCheckpointIndex({ currentIndex, nextEntry, maxVersions });
  await writeFile(checkpointPaths.indexPath, `${JSON.stringify(nextIndex, null, 2)}\n`, 'utf8');

  return {
    payload,
    index: nextIndex,
    versionEntry: nextEntry,
    metadata: {
      save_status: 'written',
      saved_version_id: nextEntry.version_id,
      saved_path: nextEntry.file_path,
      saved_update_count: nextEntry.update_count,
      saved_batch_index: nextEntry.batch_index,
      saved_at: nextEntry.saved_at,
      latest_version_id: nextIndex.latest_version_id,
      last_good_version_id: nextIndex.last_good_version_id,
      available_versions: nextIndex.versions.length,
      saved_ope: normalizedOpe,
      reward_config: normalizedRewardConfig,
      stability: normalizedStability,
    },
  };
}
