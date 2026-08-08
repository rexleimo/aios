import { promises as fs } from 'node:fs';
import path from 'node:path';

import { loadCanonicalAgents } from './source-tree.mjs';
import { validateManagedLiveEvidence } from '../evidence/live-execution.mjs';

const ECC_ROLE_FAMILIES = new Map([
  ['planner', 'core-planning'],
  ['architect', 'core-planning'],
  ['tdd-guide', 'implementation-discipline'],
  ['implementer', 'implementation'],
  ['reviewer', 'review'],
  ['code-reviewer', 'review'],
  ['security-reviewer', 'security'],
  ['build-error-resolver', 'failure-resolution'],
  ['refactor-cleaner', 'maintenance'],
  ['doc-updater', 'documentation'],
  ['e2e-runner', 'verification'],
  ['evidence-auditor', 'governance'],
  ['client-surface-reviewer', 'governance'],
  ['install-governance-reviewer', 'governance'],
  ['interception-reviewer', 'governance'],
  ['typescript-reviewer', 'language-review'],
  ['react-reviewer', 'framework-review'],
]);

const LIVE_VERIFIED_AGENT_IDS = new Set([
  'rex-planner',
  'rex-implementer',
  'rex-reviewer',
  'rex-security-reviewer',
  'rex-smoke-runner',
  'rex-token-steward',
]);

const PROJECTED_AGENT_IDS = new Set([
  'rex-planner',
  'rex-implementer',
  'rex-reviewer',
  'rex-security-reviewer',
]);

const REQUIRED_EVIDENCE_KINDS = Object.freeze(['smoke', 'metrics', 'provenance']);

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return false;
    throw error;
  }
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return null;
    return null;
  }
}

async function findLatestValidJsonl(dirPath, validator) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map(async (entry) => {
        const filePath = path.join(dirPath, entry.name);
        const stat = await fs.stat(filePath);
        return { filePath, mtimeMs: stat.mtimeMs };
      }));
    files.sort((left, right) => right.mtimeMs - left.mtimeMs);
    for (const file of files) {
      if (await validator(file.filePath)) return file.filePath;
    }
    return '';
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return '';
    throw error;
  }
}

async function readMetricsRecords(filePath) {
  let raw = '';
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return [];
    throw error;
  }
  const records = [];
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    records.push(parsed);
  }
  return records;
}

async function readAgentPromotionEvidence(agentId, { rootDir, evidenceRoot }) {
  const roots = [...new Set([evidenceRoot || rootDir].filter(Boolean).map((item) => path.resolve(item)))];
  const refs = {};

  for (const root of roots) {
    const smokePath = path.join(root, '.aios', 'agents', 'smoke', `${agentId}.json`);
    const provenancePath = path.join(root, '.aios', 'agents', 'provenance', `${agentId}.json`);
    if (!await fileExists(smokePath) || !await fileExists(provenancePath)) continue;
    const smoke = await readJsonFile(smokePath);
    const provenance = await readJsonFile(provenancePath);
    const metricsPath = await findLatestValidJsonl(
      path.join(root, '.aios', 'interception', 'metrics'),
      async (filePath) => validateManagedLiveEvidence({
        subject: 'agent',
        clientId: smoke?.clientId,
        agentId,
        smoke,
        provenance,
        metricsRecords: await readMetricsRecords(filePath),
      }).valid,
    );
    if (!metricsPath) continue;
    refs.smoke = path.relative(rootDir, smokePath);
    refs.provenance = path.relative(rootDir, provenancePath);
    refs.metrics = path.relative(rootDir, metricsPath);
    break;
  }

  const missing = REQUIRED_EVIDENCE_KINDS.filter((kind) => !refs[kind]);
  return {
    status: missing.length === 0 ? 'verified' : 'blocked',
    required: [...REQUIRED_EVIDENCE_KINDS],
    refs,
    missing,
  };
}

function lifecycleForAgent(agent, verification) {
  // Managed evidence is the promotion signal. Static allowlists remain a
  // compatibility fallback for projected roles before their first local run.
  if (verification.status === 'verified') return 'projected';
  if (LIVE_VERIFIED_AGENT_IDS.has(agent.id)) return 'projected';
  if (PROJECTED_AGENT_IDS.has(agent.id)) return 'projected';
  return 'candidate';
}

function buildBlockers(agent, lifecycleState, verification) {
  const blockers = [];
  if (lifecycleState === 'candidate') {
    blockers.push(
      'missing smoke evidence; agent is available as an ECC-inspired candidate but is not workflow-enabled for live orchestration',
    );
  }
  if (verification.status !== 'verified') {
    blockers.push(`missing promotion evidence: ${verification.missing.map((kind) => `${kind} evidence`).join(', ')}`);
  }
  return blockers;
}

function summarize(agents) {
  const byLifecycle = {};
  const byFamily = {};
  for (const agent of agents) {
    byLifecycle[agent.lifecycleState] = (byLifecycle[agent.lifecycleState] || 0) + 1;
    byFamily[agent.roleFamily] = (byFamily[agent.roleFamily] || 0) + 1;
  }
  return {
    totalAgents: agents.length,
    byLifecycle,
    byFamily,
  };
}

export async function buildAgentCatalogue({
  rootDir = process.cwd(),
  evidenceRoot = rootDir,
  generatedAt = new Date().toISOString(),
} = {}) {
  const source = await loadCanonicalAgents({ rootDir });
  const agents = await Promise.all(Object.values(source.agentsById).map(async (agent) => {
    const verification = await readAgentPromotionEvidence(agent.id, { rootDir, evidenceRoot });
    const lifecycleState = lifecycleForAgent(agent, verification);
    const blockers = buildBlockers(agent, lifecycleState, verification);
    return {
      agentId: agent.id,
      role: agent.role,
      roleFamily: ECC_ROLE_FAMILIES.get(agent.role) || 'specialized',
      name: agent.name,
      description: agent.description,
      tools: [...agent.tools],
      model: agent.model,
      clientTargets: [...source.manifest.generatedTargets],
      lifecycleState,
      workflowEnabled: lifecycleState !== 'candidate' && verification.status === 'verified' && blockers.length === 0,
      sourceProvenance: {
        canonicalSource: `agent-sources/roles/${agent.id}.md`,
        eccInspired: true,
        borrowedPattern: 'default-agent-catalogue-and-command-workflow',
        promotionStatus: lifecycleState,
      },
      verification,
      outputContract: agent.outputContract,
      handoffTarget: agent.handoffTarget,
      blockers,
    };
  }));
  agents.sort((left, right) => left.agentId.localeCompare(right.agentId));

  const strictBlockedAgents = agents.filter((agent) => !agent.workflowEnabled);
  return {
    schemaVersion: 1,
    kind: 'aios.agent-catalogue.v1',
    generatedAt,
    policy: 'ecc-inspired-agents-require-smoke-before-live-workflow',
    summary: summarize(agents),
    strict: {
      blocked: strictBlockedAgents.length > 0,
      blockedAgentIds: strictBlockedAgents.map((agent) => agent.agentId),
      rule: 'candidate agents cannot participate in live orchestration until smoke evidence is recorded',
    },
    roleMap: source.roleMap,
    agents,
  };
}

export function renderAgentCatalogueText(report) {
  const lines = [
    `AIOS agent catalogue doctor (${report.policy})`,
    `agents=${report.summary.totalAgents} projected=${report.summary.byLifecycle.projected || 0} candidate=${report.summary.byLifecycle.candidate || 0}`,
  ];
  for (const agent of report.agents) {
    lines.push(`- ${agent.agentId} (${agent.role}): ${agent.lifecycleState}${agent.workflowEnabled ? '' : ' blocked-live'}`);
    if (agent.blockers.length > 0) {
      lines.push(`  blockers: ${agent.blockers.join('; ')}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
