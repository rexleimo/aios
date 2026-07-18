import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAgentCatalogue } from '../agents/catalogue.mjs';
import { loadCanonicalAgents } from '../agents/source-tree.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_AIOS_ROOT = path.resolve(MODULE_DIR, '../../..');
const RISK_SELECTED_PROVIDER_IDS = new Set(['rex-specialist-review', 'ecc-specialist']);

// 顺序同时表达多风险命中时的确定性优先级：安全问题优先于框架和语言审查。
const SPECIALIST_BY_RISK = Object.freeze([
  Object.freeze({ ref: 'risk-domain:security', agentId: 'rex-security-reviewer', role: 'security-reviewer' }),
  Object.freeze({ ref: 'risk-domain:react', agentId: 'rex-react-reviewer', role: 'react-reviewer' }),
  Object.freeze({ ref: 'risk-domain:typescript', agentId: 'rex-typescript-reviewer', role: 'typescript-reviewer' }),
]);

function text(value) {
  return String(value || '').trim();
}

function normalizeRefs(values = []) {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))];
}

/**
 * 把 rex 的抽象 Agent Provider 解析为 AIOS 中一个真实、可验证的角色。
 * 这里不重新选择 Capability，只消费 Activation 已保存的触发证据。
 */
export function resolveAiosAgentProvider(provider, triggerEvidenceRefs = []) {
  if (!provider || provider.kind !== 'agent') return provider;
  if (!RISK_SELECTED_PROVIDER_IDS.has(provider.id) || provider.selector !== 'risk-domain') {
    if (!text(provider.id) || !text(provider.role)) {
      throw new Error('concrete Agent Provider requires id and role');
    }
    return Object.freeze({ ...provider });
  }

  const refs = new Set(normalizeRefs(triggerEvidenceRefs));
  const selected = SPECIALIST_BY_RISK.find((candidate) => refs.has(candidate.ref));
  if (!selected) {
    const domains = [...refs].filter((ref) => ref.startsWith('risk-domain:'));
    throw new Error(`unsupported specialist risk domain: ${domains.join(', ') || '(missing)'}`);
  }

  return Object.freeze({
    kind: 'agent',
    id: selected.agentId,
    role: selected.role,
    abstractId: provider.id,
    selector: provider.selector,
    selectedBy: selected.ref,
  });
}

function handoffTemplate(command) {
  return Object.freeze({
    schemaVersion: 1,
    agentId: command.provider.id,
    role: command.provider.role,
    status: 'pass',
    findings: ['具体发现，包含文件路径或命令名'],
    blockers: [],
    evidenceRefs: ['真实存在的 artifact、command 或 evidence 引用'],
    filesReviewed: ['实际审查的文件路径'],
    recommendedNextSteps: ['建议的下一步；不得自行调用下一个 Provider'],
  });
}

/**
 * 在执行前做 Agent 晋级检查，并将真实角色卡与当前 Command 组合为单次执行提示。
 * smoke、双向压缩指标或 provenance 任一缺失时都会 fail-closed。
 */
export async function prepareAiosAgentProviderExecution({
  command,
  aiosRoot = DEFAULT_AIOS_ROOT,
  evidenceRoot = aiosRoot,
  workflowDirective = '',
  userRequest = '',
} = {}) {
  if (command?.provider?.kind !== 'agent') {
    throw new TypeError('prepareAiosAgentProviderExecution requires an Agent Provider Command');
  }

  const provider = resolveAiosAgentProvider(command.provider, command.triggerEvidenceRefs);
  const catalogue = await buildAgentCatalogue({ rootDir: aiosRoot, evidenceRoot });
  const agent = catalogue.agents.find((candidate) => candidate.agentId === provider.id);
  if (!agent) throw new Error(`unknown AIOS Agent Provider: ${provider.id}`);
  if (agent.role !== provider.role) {
    throw new Error(`Agent Provider role mismatch: ${provider.id} is ${agent.role}, command requires ${provider.role}`);
  }
  if (!agent.workflowEnabled) {
    throw new Error(`Agent Provider ${provider.id} is not workflow-enabled: ${agent.blockers.join('; ')}`);
  }

  const source = await loadCanonicalAgents({ rootDir: aiosRoot });
  const roleCard = source.agentsById[provider.id]?.systemPrompt;
  if (!roleCard) throw new Error(`missing canonical Agent role card: ${provider.id}`);

  const resolvedCommand = Object.freeze({
    ...command,
    provider,
  });
  const prompt = [
    '## AIOS AGENT PROVIDER',
    '你只执行下面这一条 rex Command；不得重新路由 Capability，也不得调用下一个 Provider。',
    `current-command: ${JSON.stringify(resolvedCommand)}`,
    `required-handoff: ${JSON.stringify(handoffTemplate(resolvedCommand))}`,
    '',
    '## Canonical role card',
    roleCard,
    workflowDirective ? `\n## Workflow directive\n${workflowDirective.trim()}` : '',
    userRequest ? `\n## User request\n${userRequest.trim()}` : '',
  ].filter(Boolean).join('\n');

  return Object.freeze({
    command: resolvedCommand,
    agent,
    roleCard,
    prompt: `${prompt}\n`,
  });
}
