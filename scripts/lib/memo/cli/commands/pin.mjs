import fs from 'node:fs';
import { workspaceMemorySessionId } from '../../workspace-memory.mjs';
import { assertMaxChars, assertSafeMemoText } from '../capacity.mjs';
import { mirrorPinnedMemoToLegacy } from '../legacy.mjs';
import { safePrintText, usageError } from '../shared.mjs';
import { getActiveMemoStorage, loadMemoStorageApi } from '../storage-api.mjs';
import { pinnedPath, readPinned } from '../workspace-state.mjs';

export async function handleMemoPinCommand({
  secondary,
  rest,
  workspaceRoot,
  activeSpace,
  workspacePinnedMaxChars,
  io,
}) {
  const action = String(secondary || '').toLowerCase();
  if (!action) throw usageError('Usage: memo pin <show|set|add> ...');

  const space = activeSpace;
  const sessionId = workspaceMemorySessionId(space);

  if (action === 'show') {
    const storageApi = await loadMemoStorageApi();
    const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
    let content = await storageApi.readPinnedMemo(workspaceRoot, { storage, space });
    if (!String(content || '').trim() && fs.existsSync(pinnedPath(workspaceRoot, sessionId))) {
      content = readPinned(workspaceRoot, sessionId);
    }
    if (!String(content || '').trim()) {
      io.log('(none)');
      return true;
    }
    safePrintText(io, content);
    return true;
  }

  const text = rest.join(' ').trim();
  if (!text) throw usageError('pin set/add requires text');
  assertSafeMemoText(text, 'pinned workspace memory');
  const storageApi = await loadMemoStorageApi();
  const storage = await getActiveMemoStorage(workspaceRoot, storageApi);

  if (action === 'set') {
    assertMaxChars(text, workspacePinnedMaxChars, 'pinned workspace memory');
    await storageApi.writePinnedMemo(workspaceRoot, { storage, space, content: text });
    mirrorPinnedMemoToLegacy(workspaceRoot, { space, content: text });
    io.log('Pinned memory updated.');
    return true;
  }
  if (action === 'add') {
    const existing = String(await storageApi.readPinnedMemo(workspaceRoot, { storage, space }) || '').trimEnd();
    const next = existing ? `${existing}\n\n${text}` : text;
    assertMaxChars(next, workspacePinnedMaxChars, 'pinned workspace memory');
    await storageApi.writePinnedMemo(workspaceRoot, { storage, space, content: next });
    mirrorPinnedMemoToLegacy(workspaceRoot, { space, content: next });
    io.log('Pinned memory appended.');
    return true;
  }
  throw usageError(`Unknown pin action: ${secondary}`);
}
