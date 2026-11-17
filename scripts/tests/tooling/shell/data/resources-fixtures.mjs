export const revision = 'a'.repeat(64);
export const skillInventory = {
  ok: true, schema: 'skill.inventory.v1',
  clients: ['claude', 'pi'].map(id => ({ id, command: id, capabilities: ['skills'], roots: { global: `/fixture/${id}/skills`, project: `/fixture/project/.${id}/skills` } })),
  available: [{ name: 'hello', kind: 'builtin', source: 'skill-sources/hello', description: 'Offline test skill', clients: ['claude', 'pi'], scopes: ['global', 'project'], version: null }],
  skills: [
    { name: 'hello', client: 'claude', kind: 'builtin', ownership: 'owned', reason: '' },
    { name: 'manual', client: 'pi', kind: 'external', ownership: 'external', reason: 'not an AIOS-owned installed skill' },
    { name: 'edited', client: 'claude', kind: 'external', ownership: 'conflict', reason: 'content changed after installation' },
  ].map(row => ({ scope: 'global', path: `/fixture/${row.client}/skills/${row.name}`, fingerprint: 'f'.repeat(64), source: row.name === 'hello' ? 'skill-sources/hello' : null,
    version: null, loaded: null, affectedClients: ['claude', 'pi'], ...row })),
  warnings: [],
};
export const agentInventory = {
  kind: 'aios.agent-catalogue.v1', schemaVersion: 1, generatedAt: '2026-11-16T00:00:00.000Z',
  strict: { blocked: true, blockedAgentIds: ['candidate'], rule: 'requires evidence before live orchestration' },
  agents: [
    { agentId: 'candidate', name: '候选角色', lifecycleState: 'candidate', workflowEnabled: false, blockers: ['missing smoke evidence'],
      verification: { status: 'blocked', required: ['smoke'], refs: {}, missing: ['smoke'] } },
    { agentId: 'projected', name: '已投影角色', lifecycleState: 'projected', workflowEnabled: true, blockers: [],
      verification: { status: 'verified', required: ['smoke'], refs: { smoke: '.aios/agents/smoke/projected.json' }, missing: [] } },
  ].map(row => ({ role: 'implementer', roleFamily: 'engineering', description: 'Offline role fixture', model: 'inherit', tools: ['Read'], clientTargets: ['claude'],
    sourceProvenance: { canonicalSource: `agent-sources/roles/${row.agentId}.md` }, ...row })),
};
export function skillReport(request, dryRun = true) {
  return { ok: true, schema: 'skill.action.v1', dryRun, revision, results: request.clients.map(client => ({ client, scope: request.scope,
    name: request.name, target: `/fixture/${client}/skills/${request.name}`, status: request.action === 'remove' ? 'removed' : request.action === 'sync' ? 'updated' : 'installed',
    reason: '', backup: dryRun ? null : '/fixture/backups/hello', affectedClients: ['claude', 'pi'] })) };
}
