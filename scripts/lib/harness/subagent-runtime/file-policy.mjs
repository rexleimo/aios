import { normalizeOwnedPath } from './text.mjs';

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

export function resolveOwnedPathPrefixes(phase = null, job = null) {
  const jobPrefixes = normalizeOwnedPathPrefixes(job?.launchSpec?.ownedPathPrefixes);
  if (jobPrefixes.length > 0) {
    return jobPrefixes;
  }
  return normalizeOwnedPathPrefixes(phase?.ownedPathPrefixes);
}

// 纯函数：用 phase/job 的所有权配置校验 filesTouched，不读取磁盘、不修改 payload。
export function evaluatePhaseFilePolicy(payload = {}, phase = null, job = null) {
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

export function summarizeFilePolicyViolation(violations = []) {
  if (!Array.isArray(violations) || violations.length === 0) {
    return 'File policy violation';
  }
  const preview = violations.slice(0, 3).join('; ');
  const remaining = violations.length > 3 ? `; +${violations.length - 3} more` : '';
  return `File policy violation: ${preview}${remaining}`;
}
