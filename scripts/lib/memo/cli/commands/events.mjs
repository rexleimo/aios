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

export async function handleMemoAddCommand({
  secondary,
  rest,
  workspaceRoot,
  activeSpace,
  workspaceMemoEntryMaxChars,
  io,
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
    agent: flags.agent || '',
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
  const legacy = mirrorMemoEventToLegacy(workspaceRoot, { space, text, refs, turnId, record });
  const eventId = record?.eventId || legacy.eventId || '';
  io.log(`Memo added${eventId ? `: ${eventId}` : '.'}`);
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
  let records = await storageApi.searchMemoEvents(workspaceRoot, {
    storage,
    space,
    query,
    limit: flags.limit,
    scope: flags.scope,
    agent: flags.agent,
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
  if (positionals[0] !== 'list') throw usageError('Usage: memo list [--limit N]');
  const rows = await loadMemoRows({ workspaceRoot, activeSpace, limit: flags.limit, scope: flags.scope, agent: flags.agent });
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
    agent: flags.agent,
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

async function loadMemoRows({ workspaceRoot, activeSpace, limit, scope = '', agent = '' }) {
  const storageApi = await loadMemoStorageApi();
  const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
  let rows = await storageApi.listMemoEvents(workspaceRoot, {
    storage,
    space: activeSpace,
    limit,
    scope,
    agent,
  });
  if (!Array.isArray(rows) || rows.length === 0) {
    rows = legacyMemoRows(workspaceRoot, activeSpace, { limit });
  }
  return Array.isArray(rows) ? rows : [];
}

async function searchMemoRows({ workspaceRoot, activeSpace, query, limit, scope = '', agent = '' }) {
  const storageApi = await loadMemoStorageApi();
  const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
  let rows = await storageApi.searchMemoEvents(workspaceRoot, {
    storage,
    space: activeSpace,
    query,
    limit,
    scope,
    agent,
  });
  if (!Array.isArray(rows) || rows.length === 0) {
    rows = legacyMemoRows(workspaceRoot, activeSpace, { query, limit });
  }
  return Array.isArray(rows) ? rows : [];
}
