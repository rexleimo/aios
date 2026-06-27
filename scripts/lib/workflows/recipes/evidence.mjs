// scripts/lib/workflows/recipes/evidence.mjs — 质量门证据验证函数
// 从 recipes.mjs 拆分：readJsonFile, isPassingStatus, hasEntries, validateGatePayload, evidenceForQualityGate 等

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { QUALITY_GATE_EVIDENCE } from './definitions.mjs';

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return null;
    return null;
  }
}

function isPassingStatus(value) {
  return ['pass', 'passed', 'verified'].includes(String(value || '').trim().toLowerCase());
}

function hasEntries(value) {
  return Array.isArray(value) && value.length > 0;
}

function hasCommandArtifactAndMetricRefs(payload = {}) {
  return hasEntries(payload.commandRefs || payload.commands)
    && hasEntries(payload.artifactRefs || payload.artifacts)
    && hasEntries(payload.metricRefs || payload.metrics);
}

async function findEvidenceManifests(rootPath) {
  const matches = [];
  async function walk(dirPath) {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return;
      throw error;
    }
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name === 'manifest.json') {
        matches.push(entryPath);
      }
    }
  }
  await walk(rootPath);
  return matches;
}

async function validateEvidenceManifest({ rootDir, evidenceRoot }) {
  const manifestFiles = await findEvidenceManifests(path.join(evidenceRoot, '.aios', 'evidence'));
  for (const filePath of manifestFiles) {
    const parsed = await readJsonFile(filePath);
    if (parsed && isPassingStatus(parsed.status || parsed.result) && hasCommandArtifactAndMetricRefs(parsed)) {
      return {
        status: 'verified',
        refs: [path.relative(rootDir, filePath)],
      };
    }
  }
  return {
    status: 'blocked',
    refs: [],
    missing: 'verified evidence manifest with command, artifact, and metric refs',
  };
}

function validateGatePayload(gate, payload) {
  if (!payload || typeof payload !== 'object') {
    return { status: 'blocked', missing: 'missing gate evidence JSON' };
  }
  if (payload.gate && payload.gate !== gate) {
    return { status: 'blocked', missing: 'gate evidence must match gate id' };
  }
  if (!isPassingStatus(payload.status || payload.result)) {
    return { status: 'blocked', missing: 'gate evidence status must pass' };
  }
  if (gate === 'security-review-pass') {
    const findings = payload.findings || {};
    const high = Number(findings.high ?? payload.highFindings ?? 0);
    const critical = Number(findings.critical ?? payload.criticalFindings ?? 0);
    if (high > 0 || critical > 0) {
      return { status: 'blocked', missing: 'security review has high or critical findings' };
    }
  }
  if (gate === 'ecc-borrowing-manifest-present') {
    if (!payload.borrowedPattern || !payload.aiosNativeReplacement) {
      return { status: 'blocked', missing: 'borrowedPattern and aiosNativeReplacement are required' };
    }
  }
  if (gate === 'projection-state-verified') {
    if (!payload.projectionHashes || Object.keys(payload.projectionHashes).length === 0 || !hasEntries(payload.provenanceRefs)) {
      return { status: 'blocked', missing: 'projection hashes and provenance refs are required' };
    }
  }
  if (gate === 'mcp-inventory-clean') {
    if (payload.forbiddenAliasesPresent === true || !Array.isArray(payload.staleAliases) || payload.staleAliases.length > 0) {
      return { status: 'blocked', missing: 'mcp inventory must explicitly report no stale RTK/Caveman aliases' };
    }
  }
  if (gate === 'interception-metrics-present') {
    const events = new Set(payload.metricEvents || []);
    if (!events.has('pre_send') || !events.has('post_receive') || Number(payload.savedBytes ?? payload.saved_bytes ?? 0) <= 0) {
      return { status: 'blocked', missing: 'interception metrics require pre_send, post_receive, and saved bytes' };
    }
  }
  return { status: 'verified', missing: '' };
}

async function evidenceForQualityGate(gate, { rootDir, evidenceRoot }) {
  const base = {
    gate,
    ...(QUALITY_GATE_EVIDENCE[gate] || {
      producer: 'merge-gate',
      artifactRefPattern: '.aios/evidence/**/manifest.json',
      validator: 'manual evidence review required',
    }),
  };

  if (gate === 'evidence-manifest-present') {
    return {
      ...base,
      ...(await validateEvidenceManifest({ rootDir, evidenceRoot })),
    };
  }

  const gatePath = path.join(evidenceRoot, '.aios', 'evidence', 'quality-gates', `${gate}.json`);
  const parsed = await readJsonFile(gatePath);
  const validation = validateGatePayload(gate, parsed);
  return {
    ...base,
    status: validation.status,
    refs: validation.status === 'verified' ? [path.relative(rootDir, gatePath)] : [],
    missing: validation.missing || '',
  };
}

async function evidenceForQualityGates(qualityGates = [], { rootDir, evidenceRoot }) {
  return Promise.all(qualityGates.map((gate) => evidenceForQualityGate(gate, { rootDir, evidenceRoot })));
}

export { evidenceForQualityGates, evidenceForQualityGate, validateGatePayload, validateEvidenceManifest, readJsonFile, isPassingStatus, hasEntries, hasCommandArtifactAndMetricRefs };
