export type SkillKind = 'builtin' | 'external';
export type SkillScope = 'global' | 'project';
export type SkillAction = 'install' | 'sync' | 'remove';
export interface SkillClient {
  id: string;
  command: string;
  capabilities: string[];
  roots: { global: string; project: string };
}
export interface AvailableSkill {
  name: string;
  kind: SkillKind;
  source: string;
  description?: string;
  clients: string[];
  scopes: string[];
  version: string | null;
  ownership?: string;
}
export interface InstalledSkill {
  name: string;
  client: string;
  scope: SkillScope;
  path: string;
  kind: SkillKind;
  ownership: string;
  reason: string;
  fingerprint: string;
  source: string | null;
  version: string | null;
  loaded: boolean | null;
  affectedClients: string[];
}
export interface SkillInventory {
  ok: true;
  schema: 'skill.inventory.v1';
  clients: SkillClient[];
  available: AvailableSkill[];
  skills: InstalledSkill[];
  warnings: Array<{ kind?: string; path?: string; reason: string }>;
}
export interface SkillRequest {
  resource: 'skills';
  action: SkillAction;
  name: string;
  kind: SkillKind;
  scope: SkillScope;
  clients: string[];
  source?: string;
}
export interface SkillResult {
  client: string;
  scope: string;
  name: string;
  target: string;
  status: string;
  reason: string;
  backup: string | null;
  affectedClients: string[];
}
export interface SkillActionReport {
  ok: boolean;
  schema?: string;
  dryRun?: boolean;
  revision?: string;
  error?: string;
  results?: SkillResult[];
}
export interface AgentRow {
  agentId: string;
  role: string;
  roleFamily: string;
  name: string;
  description: string;
  tools: string[];
  model: string;
  clientTargets: string[];
  lifecycleState: string;
  workflowEnabled: boolean;
  sourceProvenance: { canonicalSource: string };
  verification: { status: string; required: string[]; refs: Record<string, string>; missing: string[] };
  blockers: string[];
}
export interface AgentInventory {
  kind: 'aios.agent-catalogue.v1';
  schemaVersion: 1;
  generatedAt: string;
  agents: AgentRow[];
  strict: { blocked: boolean; blockedAgentIds: string[]; rule: string };
}
