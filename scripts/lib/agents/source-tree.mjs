import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveClientAgentTargets } from '../clients/registry.mjs';

const ROOT_DIR_NAME = 'agent-sources';
const ROLES_DIR_NAME = 'roles';
const MANIFEST_FILE_NAME = 'manifest.json';
const REQUIRED_ROLE_IDS = ['planner', 'implementer', 'reviewer', 'security-reviewer'];
const OPTIONAL_ROLE_IDS = ['token-steward', 'smoke-runner'];
const ALLOWED_ROLE_IDS = [...REQUIRED_ROLE_IDS, ...OPTIONAL_ROLE_IDS];
const ALLOWED_MANIFEST_KEYS = new Set(['schemaVersion', 'generatedTargets']);
const ALLOWED_AGENT_KEYS = new Set([
  'schemaVersion',
  'id',
  'role',
  'name',
  'description',
  'tools',
  'model',
  'recommendedModel',
  'fallbackModel',
  'tokenProfile',
  'activationHints',
  'workflowSteps',
  'promptDefense',
  'outputContract',
  'handoffTarget',
  'systemPrompt',
]);
const ALLOWED_HANDOFF_TARGETS = new Set(['next-phase', 'merge-gate']);
const MANAGED_MARKER_PATTERN = /AIOS-GENERATED|END AIOS-GENERATED/;
const KEBAB_CASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GENERATED_AGENT_TARGETS = resolveClientAgentTargets('all');

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJsonFile(filePath) {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text);
}

function assertNoUnknownKeys(raw, allowedKeys, label) {
  for (const key of Object.keys(raw || {})) {
    assertCondition(allowedKeys.has(key), `${label} has unknown key: ${key}`);
  }
}

function normalizeStringField(raw, key) {
  const value = String(raw?.[key] ?? '');
  assertCondition(value.trim().length > 0, `${key} must be non-empty`);
  assertCondition(!MANAGED_MARKER_PATTERN.test(value), `${key} must not contain managed marker text`);
  return value.trim();
}

function normalizeSingleLineField(raw, key) {
  const value = normalizeStringField(raw, key);
  assertCondition(!value.includes('\n') && !value.includes('\r'), `${key} must be single-line`);
  return value;
}

function normalizeOptionalSingleLineField(raw, key) {
  if (raw?.[key] === undefined || raw?.[key] === null) return '';
  if (String(raw[key]).trim().length === 0) return '';
  return normalizeSingleLineField(raw, key);
}

function normalizeStringListField(raw, key) {
  if (raw?.[key] === undefined || raw?.[key] === null) return [];
  assertCondition(Array.isArray(raw[key]), `${key} must be an array of strings`);
  return raw[key].map((value) => {
    assertCondition(typeof value === 'string', `${key} must be an array of strings`);
    const item = value.trim();
    assertCondition(item.length > 0, `${key} items must be non-empty`);
    assertCondition(!item.includes('\n') && !item.includes('\r'), `${key} items must be single-line`);
    assertCondition(!MANAGED_MARKER_PATTERN.test(item), `${key} items must not contain managed marker text`);
    return item;
  });
}

export function validateManifest(raw = {}) {
  assertCondition(raw && typeof raw === 'object' && !Array.isArray(raw), 'manifest must be an object');
  assertNoUnknownKeys(raw, ALLOWED_MANIFEST_KEYS, 'manifest');
  assertCondition(raw.schemaVersion === 1, 'manifest schemaVersion must be 1');
  assertCondition(Array.isArray(raw.generatedTargets), 'manifest generatedTargets must be an array');
  assertCondition(
    JSON.stringify(raw.generatedTargets) === JSON.stringify(GENERATED_AGENT_TARGETS),
    `manifest generatedTargets must equal ${JSON.stringify(GENERATED_AGENT_TARGETS)}`
  );

  return {
    schemaVersion: 1,
    generatedTargets: [...GENERATED_AGENT_TARGETS],
  };
}

export function validateCanonicalAgent(raw = {}) {
  assertCondition(raw && typeof raw === 'object' && !Array.isArray(raw), 'agent must be an object');
  assertNoUnknownKeys(raw, ALLOWED_AGENT_KEYS, 'agent');
  assertCondition(raw.schemaVersion === 1, 'agent schemaVersion must be 1');

  const id = normalizeSingleLineField(raw, 'id');
  const role = normalizeSingleLineField(raw, 'role');
  const name = normalizeSingleLineField(raw, 'name');
  const description = normalizeSingleLineField(raw, 'description');
  const model = normalizeSingleLineField(raw, 'model');
  const handoffTarget = normalizeStringField(raw, 'handoffTarget');
  const systemPrompt = normalizeStringField(raw, 'systemPrompt');

  assertCondition(KEBAB_CASE_PATTERN.test(id), 'id must be kebab-case');
  assertCondition(ALLOWED_ROLE_IDS.includes(role), `role must be one of ${ALLOWED_ROLE_IDS.join('|')}`);
  assertCondition(ALLOWED_HANDOFF_TARGETS.has(handoffTarget), 'handoffTarget must be one of next-phase|merge-gate');
  assertCondition(Array.isArray(raw.tools), 'tools must be an array of strings');

  const tools = raw.tools.map((value) => {
    assertCondition(typeof value === 'string', 'tools must be an array of strings');
    const tool = value.trim();
    assertCondition(tool.length > 0, 'tools items must be non-empty');
    assertCondition(!tool.includes('\n') && !tool.includes('\r'), 'tools items must be single-line');
    assertCondition(!MANAGED_MARKER_PATTERN.test(tool), 'tools items must not contain managed marker text');
    return tool;
  });

  return {
    schemaVersion: 1,
    id,
    role,
    name,
    description,
    tools,
    model,
    recommendedModel: normalizeOptionalSingleLineField(raw, 'recommendedModel'),
    fallbackModel: normalizeOptionalSingleLineField(raw, 'fallbackModel'),
    tokenProfile: normalizeOptionalSingleLineField(raw, 'tokenProfile'),
    activationHints: normalizeStringListField(raw, 'activationHints'),
    workflowSteps: normalizeStringListField(raw, 'workflowSteps'),
    promptDefense: normalizeOptionalSingleLineField(raw, 'promptDefense'),
    outputContract: normalizeStringField({ outputContract: raw.outputContract || 'JSON handoff object' }, 'outputContract'),
    handoffTarget,
    systemPrompt,
  };
}

export function buildRoleMap(agentsById = {}) {
  const roleMap = {};
  for (const [agentId, agent] of Object.entries(agentsById)) {
    assertCondition(!roleMap[agent.role], `duplicate role: ${agent.role}`);
    roleMap[agent.role] = agentId;
  }

  for (const roleId of REQUIRED_ROLE_IDS) {
    assertCondition(roleMap[roleId], `missing required role: ${roleId}`);
  }

  return roleMap;
}

export async function loadCanonicalAgents({ rootDir }) {
  const canonicalRoot = path.join(rootDir, ROOT_DIR_NAME);
  const rolesDir = path.join(canonicalRoot, ROLES_DIR_NAME);

  const rootEntries = await readdir(canonicalRoot, { withFileTypes: true });
  const allowedRootEntries = new Set([MANIFEST_FILE_NAME, ROLES_DIR_NAME]);
  for (const entry of rootEntries) {
    assertCondition(allowedRootEntries.has(entry.name), `unexpected file in ${ROOT_DIR_NAME}: ${entry.name}`);
    if (entry.name === ROLES_DIR_NAME) {
      assertCondition(entry.isDirectory(), `${ROOT_DIR_NAME}/${ROLES_DIR_NAME} must be a directory`);
    } else {
      assertCondition(entry.isFile(), `${ROOT_DIR_NAME}/${MANIFEST_FILE_NAME} must be a file`);
    }
  }

  const manifest = validateManifest(await readJsonFile(path.join(canonicalRoot, MANIFEST_FILE_NAME)));
  const roleEntries = await readdir(rolesDir, { withFileTypes: true });

  const agentsById = {};
  for (const entry of roleEntries) {
    assertCondition(entry.isFile(), `unexpected file in ${ROOT_DIR_NAME}/${ROLES_DIR_NAME}: ${entry.name}`);
    assertCondition(entry.name.endsWith('.json'), `unexpected file in ${ROOT_DIR_NAME}/${ROLES_DIR_NAME}: ${entry.name}`);

    const agent = validateCanonicalAgent(await readJsonFile(path.join(rolesDir, entry.name)));
    assertCondition(!agentsById[agent.id], `duplicate id: ${agent.id}`);
    assertCondition(entry.name === `${agent.id}.json`, `filename mismatch for agent ${agent.id}`);
    agentsById[agent.id] = agent;
  }

  const sortedAgentsById = {};
  for (const agentId of Object.keys(agentsById).sort()) {
    sortedAgentsById[agentId] = agentsById[agentId];
  }

  return {
    manifest,
    agentsById: sortedAgentsById,
    roleMap: buildRoleMap(sortedAgentsById),
  };
}
