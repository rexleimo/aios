let memoStorageApiPromise;

function memoStorageUnavailableError(cause) {
  const error = new Error(
    'Memo storage module is not available. Expected scripts/lib/memo/storage.mjs exports from the memo-storage workstream.',
  );
  error.code = 'AIOS_MEMO_STORAGE_UNAVAILABLE';
  error.cause = cause;
  return error;
}

export async function loadMemoStorageApi() {
  if (!memoStorageApiPromise) {
    memoStorageApiPromise = import('../storage.mjs').catch((error) => {
      memoStorageApiPromise = undefined;
      throw memoStorageUnavailableError(error);
    });
  }
  return memoStorageApiPromise;
}

export async function getActiveMemoStorage(workspaceRoot, storageApi) {
  const status = await storageApi.getMemoStorageStatus(workspaceRoot);
  const active = String(status?.active || 'file').trim().toLowerCase();
  return active || 'file';
}
