// apps/shell/ui/src/lib/data/memo-store.mjs — 项目记忆（memo）的结构化只读视图。
//
// 为什么自己读文件而不是跑 `aios memo search`：实测 `memo search` **没有 JSON 输出**
// （`--json` 被忽略，打出来的还是 `- [时间戳] (id): 正文` 这种给人看的行），
// 界面拿到的是一段需要反解析的文字。`events.jsonl` 本身就是这份记忆的唯一写者
// （`aios memo add` 往里追加），所以这里读它的原始结构，不解析展示文字。
//
// 只有读，没有写：写路径属于 P0-4（需要所有者对「产品可以写用户文件」单独授权）。
import fs from 'node:fs';
import path from 'node:path';

export const MEMO_SCHEMA_VERSION = 1;
/** 单条正文的显示上限：一条 memo 可以上千字，首屏不需要整份。 */
export const MEMO_EXCERPT_CHARS = 220;
/** 一次最多读这么多条，防止记忆无限增长把首屏拖慢。 */
export const MEMO_MAX_ROWS = 200;

export function memoEventsPath(rootDir) {
  return path.join(rootDir, '.aios', 'memo', 'file', 'events.jsonl');
}

export function memoPinnedPath(rootDir) {
  return path.join(rootDir, '.aios', 'memo', 'file', 'pinned', 'default.md');
}

function excerpt(text) {
  const flat = String(text ?? '').replace(/\s+/gu, ' ').trim();
  return flat.length > MEMO_EXCERPT_CHARS ? `${flat.slice(0, MEMO_EXCERPT_CHARS)}…` : flat;
}

/**
 * 一条 memo 记录的可显示投影。**只投影 JSONL 里真实存在的字段**：
 * 没有的字段是 `null`/空数组，不是编一个默认值——界面据此区分「没有来源」和「来源为空」。
 */
function toRow(parsed, index) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.schemaVersion !== MEMO_SCHEMA_VERSION) return null;
  const provenance = parsed.provenance && typeof parsed.provenance === 'object' ? parsed.provenance : null;
  return {
    id: String(parsed.eventId ?? `memo-row-${index}`),
    text: String(parsed.text ?? ''),
    excerpt: excerpt(parsed.text),
    ts: String(parsed.ts ?? ''),
    validAt: String(parsed.validAt ?? parsed.ts ?? ''),
    kind: String(parsed.kind ?? 'memo'),
    role: String(parsed.role ?? ''),
    space: String(parsed.space ?? 'default'),
    scope: typeof parsed.scope === 'string' ? parsed.scope : null,
    agent: typeof parsed.agent === 'string' && parsed.agent ? parsed.agent : null,
    claimStatus: typeof parsed.claimStatus === 'string' ? parsed.claimStatus : null,
    checkpoint: /^\[checkpoint\]/u.test(String(parsed.text ?? '')),
    sourceRef: provenance?.sourceRef ? String(provenance.sourceRef) : null,
    provenanceTrust: provenance?.trust ? String(provenance.trust) : null,
    refs: Array.isArray(parsed.refs) ? parsed.refs.map((ref) => String(ref)) : [],
    supersededBy: Array.isArray(parsed.supersededBy) ? parsed.supersededBy.map((id) => String(id)) : [],
  };
}

/**
 * 读最近的 memo 记录（新的在前）。
 *
 * 失败如实返回，不返回空数组冒充「用户没有记忆」——「读不到」和「没有记忆」是两条不同的事实，
 * 这正是路线图 P1-4 要分开的东西。
 *
 * @returns {{ ok: true, rows: Array<Record<string, unknown>>, totalEvents: number, truncated: boolean, file: string }
 *          | { ok: false, error: string, file: string, reason: string }}
 */
export function readMemoEvents({ rootDir, limit = MEMO_MAX_ROWS } = {}) {
  const file = memoEventsPath(rootDir);
  if (!fs.existsSync(file)) {
    return { ok: false, reason: 'no-memo-file', error: `记忆文件不存在：${file}`, file };
  }
  let raw = '';
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return { ok: false, reason: 'read-failed', error: `记忆文件读失败：${error instanceof Error ? error.message : String(error)}`, file };
  }
  const lines = raw.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  const rows = [];
  let malformed = 0;
  // 从后往前：只需要最近 `limit` 条，但总数要说实话。
  for (let i = lines.length - 1; i >= 0 && rows.length < limit; i -= 1) {
    let parsed;
    try {
      parsed = JSON.parse(lines[i]);
    } catch {
      malformed += 1;
      continue;
    }
    const row = toRow(parsed, i);
    if (row) rows.push(row);
    else malformed += 1;
  }
  return {
    ok: true,
    rows,
    totalEvents: lines.length,
    truncated: lines.length > rows.length + malformed,
    malformed,
    file,
  };
}

/** pinned 记忆是一整篇 Markdown，界面按段落取前几条展示；读不到就说读不到。 */
export function readPinnedMemo({ rootDir } = {}) {
  const file = memoPinnedPath(rootDir);
  if (!fs.existsSync(file)) return { ok: false, reason: 'no-pinned-file', chars: 0, entries: [], file };
  let raw = '';
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return { ok: false, reason: 'read-failed', chars: 0, entries: [], error: String(error instanceof Error ? error.message : error), file };
  }
  const entries = raw
    .split(/\n{2,}/u)
    .map((block) => block.replace(/\s+/gu, ' ').trim())
    .filter((block) => block.length > 0);
  return { ok: true, chars: raw.length, entries, file };
}
