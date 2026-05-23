function attachAttemptMeta(result, payload) {
  const attempts = Number.isFinite(result?.attempts) ? Math.max(1, Math.floor(result.attempts)) : 0;
  if (attempts > 0) {
    return { ...payload, attempts };
  }
  return payload;
}

export function normalizeSpawnResult(result, timeoutMs) {
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  const exitCode = Number.isFinite(result.status) ? result.status : 1;

  if (result.error) {
    return attachAttemptMeta(result, {
      exitCode,
      stdout,
      stderr,
      error: result.error.message || String(result.error),
    });
  }
  if (result.timedOut) {
    return attachAttemptMeta(result, {
      exitCode: exitCode || 124,
      stdout,
      stderr,
      error: `Timed out after ${timeoutMs} ms`,
    });
  }
  return attachAttemptMeta(result, { exitCode, stdout, stderr, error: '' });
}
