export function normalizeGroupChatConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    maxRounds: Math.max(1, Math.min(50, Number.isFinite(source.maxRounds) ? Math.floor(source.maxRounds) : 10)),
    concurrency: Math.max(1, Math.min(20, Number.isFinite(source.concurrency) ? Math.floor(source.concurrency) : 3)),
    speakerStrategy: ['blueprint-phases', 'round-robin', 'handoff-target'].includes(source.speakerStrategy)
      ? source.speakerStrategy
      : 'blueprint-phases',
    terminationCheck: ['consensus', 'max-rounds', 'reviewer-ok'].includes(source.terminationCheck)
      ? source.terminationCheck
      : 'consensus',
    timeoutMs: Number.isFinite(source.timeoutMs) && source.timeoutMs > 0
      ? Math.floor(source.timeoutMs)
      : 10 * 60 * 1000,
    sessionId: String(source.sessionId || 'groupchat').trim() || 'groupchat',
  };
}
