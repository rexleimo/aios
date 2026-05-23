export function normalizeText(value) {
  return String(value ?? '').trim();
}

export function clipText(value, maxLen = 8000) {
  const text = String(value ?? '');
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}\n...[truncated]`;
}

export function normalizeOwnedPath(value = '') {
  return normalizeText(value)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

export function toPosixPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/');
}

// 纯函数：只允许工作区相对路径，防止子任务用 ../ 逃逸自己的文件边界。
export function normalizeWorkspaceRelativePath(value = '') {
  const normalized = normalizeOwnedPath(value);
  if (!normalized || normalized === '.') return '';
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) return '';
  return normalized;
}

export function safeFileSlug(value) {
  const text = normalizeText(value).toLowerCase();
  return text.replace(/[^a-z0-9._-]+/g, '_').slice(0, 120) || 'job';
}

export function parsePositiveInt(raw, fallback) {
  const value = Number.parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function parseBooleanEnv(raw, fallback = false) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return fallback;
  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') return true;
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') return false;
  return fallback;
}
