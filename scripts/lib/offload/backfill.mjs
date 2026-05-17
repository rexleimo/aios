import { readFile } from 'node:fs/promises';

import { capture, normalizeCapturePayload } from './tool-offload.mjs';

export function normalizeBackfillRecord(record, { client = '', sessionId = '' } = {}) {
  return normalizeCapturePayload(record, { client, sessionId });
}

export async function backfillFromJsonl({ workspaceRoot, sessionId = 'default', client = '', inputPath, storage = 'file', config = {} } = {}) {
  if (!inputPath) {
    throw new Error('backfillFromJsonl requires inputPath');
  }

  const raw = await readFile(inputPath, 'utf8');
  const result = {
    scanned: 0,
    offloaded: 0,
    skipped: 0,
    errors: 0,
  };

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    result.scanned += 1;

    let record;
    try {
      record = JSON.parse(trimmed);
    } catch {
      result.errors += 1;
      continue;
    }

    const payload = normalizeBackfillRecord(record, { client, sessionId });
    if (!payload) {
      result.skipped += 1;
      continue;
    }

    const captureResult = await capture(payload, { workspaceRoot, storage, config });
    if (captureResult) result.offloaded += 1;
    else result.skipped += 1;
  }

  return result;
}
