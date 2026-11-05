// Memory entries as the page shows them: parsed, identified, and safe to act on.
//
// `aios memo search` prints text, one entry per line:
//
//   - [2026-11-05T00:55:13.620Z] (memo:default:20261105005513620-2268c479): text…
//
// The console needs the id to act on an entry, so the line is parsed here rather than
// rendered as a blob: a blob is what made the page unreadable and unclickable in the first
// place. The event id is also the only thing an action accepts, which keeps the write path
// from inventing its own addressing.
export const EVENT_ID_PATTERN = /^memo:[a-z0-9-]+:[0-9]{17}-[0-9a-f]{8}$/u;

/** @typedef {{ id: string, at: string, text: string }} MemoEntry */

/**
 * @param {string} output
 * @returns {MemoEntry[]}
 */
export function parseMemoEntries(output) {
  const entries = [];
  for (const line of String(output).split('\n')) {
    const match = line.match(/^-\s*\[([^\]]+)\]\s*\(([^)]+)\):\s*([\s\S]*)$/u);
    if (!match) continue;
    const [, at, id, text] = match;
    if (!EVENT_ID_PATTERN.test(id.trim())) continue;
    entries.push({ at: at.trim(), id: id.trim(), text: text.trim() });
  }
  return entries;
}

export function isEventId(value) {
  return typeof value === 'string' && EVENT_ID_PATTERN.test(value.trim());
}

/** The actions the memory page may run, with the argv each maps to. No free text in ids. */
export const MEMORY_ACTIONS = Object.freeze({
  'memo.useful': {
    label: '这条有用',
    detail: '记一次召回反馈（aios memo useful <id>），它会提高这条以后被召回的概率。',
    kind: 'write',
    argv: ({ cli, id }) => [cli, 'memo', 'useful', id],
  },
  'memo.supersede': {
    label: '这条过时了',
    detail:
      '用一段新事实取代它（aios memo add <text> --supersedes <id>）：旧条目保留但不再被召回，历史可追溯。',
    kind: 'write',
    argv: ({ cli, id, text }) => [cli, 'memo', 'add', text, '--supersedes', id],
  },
});

/** @returns {string[] | null} */
export function buildMemoryArgv(actionId, { cli, id, text } = {}) {
  const spec = MEMORY_ACTIONS[actionId];
  if (!spec) return null;
  if (typeof cli !== 'string' || cli.length === 0) return null;
  if (!isEventId(id)) return null;
  if (actionId === 'memo.supersede') {
    const trimmed = String(text ?? '').trim();
    // 取代是一条事实，不是一次回声：空文本或超长文本都拒绝，不替用户编。
    if (trimmed.length < 8 || trimmed.length > 2000) return null;
    return spec.argv({ cli, id, text: trimmed });
  }
  return spec.argv({ cli, id });
}