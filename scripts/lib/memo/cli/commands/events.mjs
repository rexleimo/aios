import { assertMaxChars, assertSafeMemoText } from '../capacity.mjs';
import { splitFlags, splitRecallFlags } from '../flags.mjs';
import { legacyMemoRows, mirrorMemoEventToLegacy } from '../legacy.mjs';
import { createMemoTurnId, extractTags } from '../records.mjs';
import {
  memoRecordToRecallRow,
  renderMemoRow,
  renderRecallRow,
} from '../rendering.mjs';
import { usageError } from '../shared.mjs';
import { getActiveMemoStorage, loadMemoStorageApi } from '../storage-api.mjs';
import { findSupersedeCandidates } from '../../storage/temporal.mjs';

// Bounded so a large space cannot make every write pay for a full scan.
const HINT_SCAN_LIMIT = 500;
const HINT_TEXT_PREVIEW = 60;

function hintDisabled(env = process.env) {
  return String(env.AIOS_MEMO_SUPERSEDE_HINT || '').trim() === '0';
}

// Reports likely earlier revisions without writing a link. Agents decide
// whether to act on it; nothing here changes what recall returns.
async function emitSupersedeHint({ storageApi, workspaceRoot, storage, space, text, agent, eventId, io }) {
  // Scanned with the writer's own agent identity so another agent's private
  // memos can never surface in this output.
  const events = await storageApi.listMemoEvents(workspaceRoot, {
    storage,
    space,
    limit: HINT_SCAN_LIMIT,
    agent,
  });
  const candidates = findSupersedeCandidates(events, text, { excludeEventId: eventId });
  if (candidates.length === 0) return;

  io.log(`Hint: ${candidates.length} existing fact(s) look like earlier revisions of this entry:`);
  for (const candidate of candidates) {
    const preview = candidate.text.length > HINT_TEXT_PREVIEW
      ? `${candidate.text.slice(0, HINT_TEXT_PREVIEW - 1)}…`
      : candidate.text;
    io.log(`  ${candidate.eventId} (${candidate.similarity.toFixed(2)}) ${preview}`);
  }
  io.log('  No link was written. Pass --supersedes <ids> to retire them.');
}

/* 中文注释：当 team/harness dispatch 设置了 AIOS_AGENT_ID 时，memo CLI 默认使用该 agent 命名空间，避免每个子 agent 都要显式传 --agent。 */
function resolveMemoAgent(flags) {
  return String(flags?.agent || '').trim() || String(process.env.AIOS_AGENT_ID || '').trim();
}

export async function handleMemoAddCommand({
  secondary,
  rest,
  workspaceRoot,
  activeSpace,
  workspaceMemoEntryMaxChars,
  io,
  runtimeIdentity = null,
}) {
  const { positionals, flags } = splitFlags(['add', secondary, ...rest].filter((part) => part !== undefined));
  const text = positionals.slice(1).join(' ').trim();
  if (!text) throw usageError('memo add requires text');
  assertSafeMemoText(text, 'memo entry');
  assertMaxChars(text, workspaceMemoEntryMaxChars, 'memo entry');

  const space = activeSpace;
  const refs = extractTags(text);
  const turnId = createMemoTurnId(space);
  const storageApi = await loadMemoStorageApi();
  const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
  const record = await storageApi.appendMemoEvent({
    workspaceRoot,
    storage,
    space,
    text,
    refs,
    scope: flags.scope || 'project_shared',
    agent: resolveMemoAgent(flags),
    runtimeIdentity,
    validAt: flags.validAt,
    supersedes: flags.supersedes,
    role: 'user',
    kind: 'memo',
    turn: {
      turnId,
      turnType: 'side',
      environment: 'memo',
      hindsightStatus: 'na',
      outcome: 'success',
    },
  });
  const legacy = record?.claimStatus === 'candidate'
    ? { eventId: record.eventId }
    : mirrorMemoEventToLegacy(workspaceRoot, { space, text, refs, turnId, record });
  const eventId = record?.eventId || legacy.eventId || '';
  io.log(`Memo added${eventId ? `: ${eventId}` : '.'}`);

  // Skipped when the writer already declared what this replaces — there is
  // nothing left to suggest.
  const wantsHint = flags.supersedeHint !== false && flags.supersedes.length === 0 && !hintDisabled();
  if (wantsHint) {
    await emitSupersedeHint({
      storageApi,
      workspaceRoot,
      storage,
      space,
      text,
      agent: resolveMemoAgent(flags),
      eventId,
      io,
    });
  }
  return true;
}

export async function handleMemoRecallCommand({ argv, workspaceRoot, activeSpace, io }) {
  const { positionals, flags } = splitRecallFlags(argv);
  if (positionals[0] !== 'recall') {
    throw usageError('Usage: memo recall [query] [--limit N] [--highlight-limit N]');
  }
  const query = positionals.slice(1).join(' ').trim();
  const space = activeSpace;
  const storageApi = await loadMemoStorageApi();
  const storage = await getActiveMemoStorage(workspaceRoot, storageApi);

  // Parse budget flags — empty string means default (no limit)
  const maxCharsPerMemory = flags.maxCharsPerMemory ? Number.parseInt(flags.maxCharsPerMemory, 10) : Infinity;
  const maxTotalChars = flags.maxTotalChars ? Number.parseInt(flags.maxTotalChars, 10) : Infinity;

  let records = await storageApi.searchMemoEvents(workspaceRoot, {
    storage,
    space,
    query,
    limit: flags.limit,
    scope: flags.scope,
    agent: resolveMemoAgent(flags),
    asOf: flags.asOf,
    includeInvalid: flags.includeInvalid,
    maxCharsPerMemory: Number.isFinite(maxCharsPerMemory) ? maxCharsPerMemory : Infinity,
    maxTotalChars: Number.isFinite(maxTotalChars) ? maxTotalChars : Infinity,
  });
  if (!Array.isArray(records) || records.length === 0) {
    records = legacyMemoRows(workspaceRoot, space, { query, limit: flags.limit });
  }
  const rows = Array.isArray(records)
    ? records.map((row) => memoRecordToRecallRow(row, {
        workspaceRoot,
        space,
        query,
        highlightLimit: flags.highlightLimit,
      }))
    : [];
  if (rows.length === 0) {
    io.log('(none)');
    return true;
  }
  for (let index = 0; index < rows.length; index += 1) {
    io.log(renderRecallRow(rows[index], index));
  }
  return true;
}

export async function handleMemoListCommand({ argv, workspaceRoot, activeSpace, io }) {
  const { positionals, flags } = splitFlags(argv);
  if (positionals[0] !== 'list') throw usageError('Usage: memo list [--limit N] [--as-of ISO] [--include-invalid]');
  const rows = await loadMemoRows({
    workspaceRoot,
    activeSpace,
    limit: flags.limit,
    scope: flags.scope,
    agent: resolveMemoAgent(flags),
    asOf: flags.asOf,
    includeInvalid: flags.includeInvalid,
  });
  if (rows.length === 0) {
    io.log('(none)');
    return true;
  }
  for (const row of rows) {
    io.log(renderMemoRow(row));
  }
  return true;
}

export async function handleMemoSearchCommand({ argv, workspaceRoot, activeSpace, io }) {
  const { positionals, flags } = splitFlags(argv);
  if (positionals[0] !== 'search') throw usageError('Usage: memo search <query> [--limit N] [--semantic]');
  const query = positionals.slice(1).join(' ').trim();
  if (!query) throw usageError('memo search requires query text');

  const rows = await searchMemoRows({
    workspaceRoot,
    activeSpace,
    query,
    limit: flags.limit,
    scope: flags.scope,
    agent: resolveMemoAgent(flags),
    asOf: flags.asOf,
    includeInvalid: flags.includeInvalid,
  });
  if (rows.length === 0) {
    io.log('(none)');
    return true;
  }
  for (const row of rows) {
    io.log(renderMemoRow(row));
  }
  return true;
}

async function loadMemoRows({ workspaceRoot, activeSpace, limit, scope = '', agent = '', asOf = '', includeInvalid = false }) {
  const storageApi = await loadMemoStorageApi();
  const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
  let rows = await storageApi.listMemoEvents(workspaceRoot, {
    storage,
    space: activeSpace,
    limit,
    scope,
    agent,
    asOf,
    includeInvalid,
  });
  if (!Array.isArray(rows) || rows.length === 0) {
    rows = legacyMemoRows(workspaceRoot, activeSpace, { limit });
  }
  return Array.isArray(rows) ? rows : [];
}

async function searchMemoRows({ workspaceRoot, activeSpace, query, limit, scope = '', agent = '', asOf = '', includeInvalid = false }) {
  const storageApi = await loadMemoStorageApi();
  const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
  let rows = await storageApi.searchMemoEvents(workspaceRoot, {
    storage,
    space: activeSpace,
    query,
    limit,
    scope,
    agent,
    asOf,
    includeInvalid,
  });
  if (!Array.isArray(rows) || rows.length === 0) {
    rows = legacyMemoRows(workspaceRoot, activeSpace, { query, limit });
  }
  return Array.isArray(rows) ? rows : [];
}
