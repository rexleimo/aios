/**
 * A3 — record worker_died death notice on phase failure (best-effort, never throws).
 */

export async function maybeRecordWorkerDeathNotice({
  rootDir,
  plan,
  job,
  failureReason = '',
  exitCode = 1,
  io = null,
} = {}) {
  try {
    const sessionId = String(plan?.sessionId || plan?.session_id || plan?.id || '').trim();
    const agentId = String(job?.jobId || job?.role || job?.id || '').trim();
    if (!rootDir || !sessionId || !agentId) return null;

    const {
      buildDeathNotice,
      writeDeathNotice,
      readDeathNotices,
      hasDuplicateNotice,
    } = await import('../../lifecycle/death-notice.mjs');

    const reasonText = String(failureReason || '');
    const reason = /timed out/i.test(reasonText)
      ? 'timeout'
      : /zombie|stall/i.test(reasonText)
        ? 'zombie'
        : 'crash';

    const notice = buildDeathNotice({
      agentId,
      sessionId,
      reason,
      lastKnownState: {
        jobId: job?.jobId || null,
        role: job?.role || null,
        exitCode,
        failureReason: reasonText.slice(0, 500),
      },
    });

    const existing = await readDeathNotices(rootDir, sessionId);
    if (hasDuplicateNotice(existing, notice)) {
      io?.log?.(`[subagent-runtime] death-notice duplicate skipped for ${agentId}`);
      return null;
    }
    const filePath = await writeDeathNotice(rootDir, notice);
    io?.log?.(`[subagent-runtime] death-notice written ${agentId} reason=${reason} -> ${filePath}`);
    return filePath;
  } catch (error) {
    io?.log?.(`[subagent-runtime] death-notice skipped: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
