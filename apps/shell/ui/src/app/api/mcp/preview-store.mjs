import { createHash, randomUUID } from 'node:crypto';

// Process-local, short-lived approvals fail closed after restart or on another worker.
// The digest includes the selected runtime and project, not just the form fields.
export function previewDigest(argv, context) {
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    return value;
  }
  const normalized = argv.filter((arg) => arg !== '--dry-run').map((arg, index, args) =>
    args[index - 1] === '--entry' ? JSON.stringify(canonical(JSON.parse(arg))) : arg);
  return createHash('sha256').update(JSON.stringify([context, normalized])).digest('hex');
}

export function createPreviewStore({ now = Date.now, ttlMs = 5 * 60_000, limit = 256 } = {}) {
  const entries = new Map();
  function prune() {
    for (const [id, entry] of entries) if (entry.expiresAt <= now()) entries.delete(id);
    while (entries.size >= limit) entries.delete(entries.keys().next().value);
  }
  return {
    issue(digest, revision) {
      prune();
      const id = randomUUID();
      const entry = { digest, revision, expiresAt: now() + ttlMs };
      entries.set(id, entry);
      return { id, expiresAt: entry.expiresAt };
    },
    consume(id) {
      const entry = entries.get(id);
      entries.delete(id);
      return entry && entry.expiresAt > now() ? entry : null;
    },
    revoke(id) { entries.delete(id); },
  };
}
