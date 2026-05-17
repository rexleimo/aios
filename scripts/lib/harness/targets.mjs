import targetsSpec from '../specs/harness-targets.json' with { type: 'json' };

export const HARNESS_TARGET_TYPES = ['gate', 'runbook', 'checklist', 'sample', 'blueprint'];

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeTargetType(value) {
  const normalized = normalizeText(value).toLowerCase();
  return HARNESS_TARGET_TYPES.includes(normalized) ? normalized : null;
}

function normalizeTargetsSpec(rawSpec) {
  if (!rawSpec || typeof rawSpec !== 'object') {
    throw new Error('Invalid harness-targets spec: expected an object');
  }

  const schemaVersion = Number.isFinite(rawSpec.schemaVersion) ? rawSpec.schemaVersion : 1;
  const targetsRaw = rawSpec.targets;
  if (!targetsRaw || typeof targetsRaw !== 'object') {
    throw new Error('Invalid harness-targets spec: targets missing');
  }

  const targets = {};
  for (const [targetId, definition] of Object.entries(targetsRaw)) {
    const id = normalizeText(targetId);
    if (!id) continue;
    const targetType = normalizeTargetType(definition?.targetType);
    if (!targetType) {
      throw new Error(`Invalid harness-targets spec: ${id}.targetType missing/invalid`);
    }

    const title = normalizeText(definition?.title);
    if (!title) {
      throw new Error(`Invalid harness-targets spec: ${id}.title missing`);
    }

    targets[id] = {
      targetId: id,
      targetType,
      title,
      description: normalizeText(definition?.description),
      nextCommand: normalizeText(definition?.nextCommand),
    };
  }

  return {
    schemaVersion,
    targets,
  };
}

const NORMALIZED_SPEC = normalizeTargetsSpec(targetsSpec);

export function getHarnessTarget(targetId) {
  const id = normalizeText(targetId);
  return id ? NORMALIZED_SPEC.targets[id] ?? null : null;
}

export function mustGetHarnessTarget(targetId) {
  const found = getHarnessTarget(targetId);
  if (!found) {
    throw new Error(`Unknown harness target: ${targetId}`);
  }
  return found;
}

export function listHarnessTargets({ targetType = '' } = {}) {
  const type = normalizeTargetType(targetType);
  const all = Object.values(NORMALIZED_SPEC.targets).map((item) => ({ ...item }));
  if (!type) return all;
  return all.filter((item) => item.targetType === type);
}

