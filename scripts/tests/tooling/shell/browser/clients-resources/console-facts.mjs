export function isolatedConsoleFacts(rootDir) {
  return {
    kind: 'aios.console-facts.v1', rootDir, generatedAt: '2026-11-16T00:00:00.000Z', totalMs: 0,
    timings: [], degraded: [], sources: [{ field: 'clients', origin: 'credential-free browser fixture' }],
    declaredClientCount: 3, declaredOnlyReason: null,
    clients: ['claude', 'codex', 'pi'].map(clientId => ({ clientId, services: 0, installed: true, declaredOnly: false,
      scopes: [{ scope: 'user', format: 'mcpServers', file: `/fixture/${clientId}/config.json`, writable: true, registered: true, services: 0, status: 'landing-unverified' }],
      landingTokens: [{ scope: 'user', token: 'landing-unverified', reason: 'isolated fixture' }], configFiles: [`/fixture/${clientId}/config.json`], unreadable: [] })),
    services: { rows: [], summary: { landings: 3, writableLandings: 3 }, loaded: true, error: null },
    issues: [], projects: [], workspaces: [], workspacesScanRoots: [], sessionsAudit: null, sessions: [], memories: [],
    pinned: { ok: true, chars: 0, entries: [] }, memoryTotals: null, memorySpaces: [], memoryPinnedBudget: null,
  };
}
