import { t } from '../../../i18n/t.mjs';
import type { AgentInventory, SkillActionReport, SkillInventory, SkillRequest } from './resource-types';

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
const textFields = (value: Record<string, unknown>, fields: string[]) => fields.every(key => typeof value[key] === 'string');
const nullableText = (value: unknown) => value === null || typeof value === 'string';

export class ResourceReadError extends Error {
  constructor(message: string, readonly unsupported = false) { super(message); }
}

// The outer ok means JSON was readable, not that the command's verdict passed.
async function requestManagement(init: RequestInit, resource?: 'skills' | 'agents'): Promise<unknown> {
  const response = await fetch(`/api/manage${resource ? `?resource=${resource}` : ''}`, { cache: 'no-store', ...init });
  let envelope: unknown;
  try { envelope = await response.json(); }
  catch { throw new ResourceReadError(t("管理接口没有返回可读的 JSON。")); }
  if (!record(envelope)) throw new ResourceReadError(t("管理接口返回格式无效。"));
  if (!response.ok || envelope.ok !== true) {
    const detail = typeof envelope.error === 'string' ? envelope.error : `HTTP ${response.status}`;
    throw new ResourceReadError(detail, [404, 405, 501].includes(response.status));
  }
  return envelope.data;
}

export async function readSkills(signal?: AbortSignal): Promise<SkillInventory> {
  const data = await requestManagement({ signal }, 'skills');
  if (record(data) && data.ok === false) throw new ResourceReadError(typeof data.error === 'string' ? data.error : t("Skills 清单读取失败。"));
  if (!record(data) || data.schema !== 'skill.inventory.v1') throw new ResourceReadError(t("当前运行时未返回受支持的 Skills 清单契约。"), true);
  if (data.ok !== true) throw new ResourceReadError(typeof data.error === 'string' ? data.error : t("Skills 清单读取失败。"));
  const clientsValid = Array.isArray(data.clients) && data.clients.every(row => record(row) && textFields(row, ['id', 'command'])
    && strings(row.capabilities) && record(row.roots) && textFields(row.roots, ['global', 'project']));
  const availableValid = Array.isArray(data.available) && data.available.every(row => record(row) && textFields(row, ['name', 'source'])
    && ['builtin', 'external'].includes(String(row.kind)) && strings(row.clients) && strings(row.scopes) && nullableText(row.version));
  const skillsValid = Array.isArray(data.skills) && data.skills.every(row => record(row)
    && textFields(row, ['name', 'client', 'path', 'ownership', 'reason', 'fingerprint']) && ['builtin', 'external'].includes(String(row.kind))
    && ['global', 'project'].includes(String(row.scope)) && nullableText(row.source) && nullableText(row.version)
    && (row.loaded === null || typeof row.loaded === 'boolean') && strings(row.affectedClients));
  if (!clientsValid || !availableValid || !skillsValid || !Array.isArray(data.warnings)
    || !data.warnings.every(row => record(row) && typeof row.reason === 'string')) {
    throw new ResourceReadError(t("Skills 清单字段不完整，不能把读取异常当作空清单。"));
  }
  return data as unknown as SkillInventory;
}

function parseAgents(data: unknown): AgentInventory {
  if (record(data) && data.ok === false) throw new ResourceReadError(typeof data.error === 'string' ? data.error : t("Subagents 目录读取失败。"));
  if (!record(data) || data.kind !== 'aios.agent-catalogue.v1' || data.schemaVersion !== 1) {
    throw new ResourceReadError(t("当前运行时未返回受支持的 Subagents 目录契约。"), true);
  }
  const valid = Array.isArray(data.agents) && data.agents.every(row => record(row)
    && textFields(row, ['agentId', 'role', 'roleFamily', 'name', 'description', 'model', 'lifecycleState'])
    && typeof row.workflowEnabled === 'boolean' && strings(row.tools) && strings(row.clientTargets) && strings(row.blockers)
    && record(row.sourceProvenance) && typeof row.sourceProvenance.canonicalSource === 'string'
    && record(row.verification) && typeof row.verification.status === 'string' && strings(row.verification.required)
    && strings(row.verification.missing) && record(row.verification.refs) && Object.values(row.verification.refs).every(ref => typeof ref === 'string'));
  if (!valid || typeof data.generatedAt !== 'string' || !record(data.strict) || typeof data.strict.blocked !== 'boolean'
    || !strings(data.strict.blockedAgentIds) || typeof data.strict.rule !== 'string') {
    throw new ResourceReadError(t("Subagents 目录字段不完整，不能把读取异常当作空目录。"));
  }
  return data as unknown as AgentInventory;
}

export async function readAgents(signal?: AbortSignal): Promise<AgentInventory> {
  return parseAgents(await requestManagement({ signal }, 'agents'));
}

export async function runAgentDoctor(): Promise<AgentInventory> {
  return parseAgents(await requestManagement({ method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ resource: 'agents', action: 'doctor' }) }));
}

export async function runSkillAction(request: SkillRequest, preview?: SkillActionReport): Promise<SkillActionReport> {
  if (preview && !canApplyPreview(preview)) throw new Error(t("必须先取得可执行的最新预览。"));
  const data = await requestManagement({ method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...request, dryRun: !preview, ...(preview ? { confirm: true, expectedRevision: preview.revision } : {}) }) });
  if (!record(data) || typeof data.ok !== 'boolean') throw new Error(t("技能操作没有返回可验证的结果。"));
  if (data.error !== undefined && typeof data.error !== 'string') throw new Error(t("技能操作错误字段无效。"));
  if (data.results !== undefined && (!Array.isArray(data.results) || !data.results.every(row => record(row)
    && textFields(row, ['client', 'scope', 'name', 'target', 'status', 'reason']) && nullableText(row.backup) && strings(row.affectedClients)))) {
    throw new Error(t("技能操作返回了不完整的落点结果。"));
  }
  if (data.ok && (data.schema !== 'skill.action.v1' || data.dryRun !== !preview || !Array.isArray(data.results) || data.results.length === 0)) {
    throw new Error(t("技能操作结果缺少落点，或与请求的预览 / 写入模式不一致。"));
  }
  return data as unknown as SkillActionReport;
}

export function canApplyPreview(report: SkillActionReport): boolean {
  return report.ok === true && report.schema === 'skill.action.v1' && report.dryRun === true
    && typeof report.revision === 'string' && /^[a-f0-9]{64}$/u.test(report.revision)
    && Array.isArray(report.results) && report.results.length > 0
    && report.results.every(row => ['installed', 'updated', 'removed', 'unchanged', 'absent'].includes(row.status));
}
