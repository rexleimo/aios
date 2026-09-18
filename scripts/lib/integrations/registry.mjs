// scripts/lib/integrations/registry.mjs — 第三方厂商集成注册表（声明式）。
// 设计约束（对齐 config/ 下的其他配置）：新增一个厂商只改 JSON，不改安装器逻辑；
// 注册表在读取时做硬校验，未钉住 commit + hash 的技能一律拒绝，
// 避免"让 agent 去网页上照抄安装步骤"这类不可验证的供应链路径。
import fs from 'node:fs';
import path from 'node:path';

export const INTEGRATION_REGISTRY_PATH = path.join('config', 'integrations.json');
export const INTEGRATION_SCHEMA_VERSION = 1;

const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/u;
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u;

export class IntegrationRegistryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IntegrationRegistryError';
  }
}

export function resolveIntegrationRegistryPath(rootDir) {
  return path.join(rootDir, INTEGRATION_REGISTRY_PATH);
}

function requireString(value, field) {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new IntegrationRegistryError(`integration registry: ${field} is required`);
  }
  return text;
}

function requireHttpsUrl(value, field) {
  const text = requireString(value, field);
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new IntegrationRegistryError(`integration registry: ${field} must be an absolute URL (got ${text})`);
  }
  if (parsed.protocol !== 'https:') {
    throw new IntegrationRegistryError(`integration registry: ${field} must be https (got ${text})`);
  }
  return text;
}

// 纯函数：校验并归一化技能钉扎信息；缺 commit/hash 直接失败，不做"尽力而为"降级。
function normalizeSkill(raw, field) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new IntegrationRegistryError(`integration registry: ${field} must define a pinned skill object`);
  }
  const repo = requireString(raw.repo, `${field}.repo`);
  if (!REPO_PATTERN.test(repo)) {
    throw new IntegrationRegistryError(`integration registry: ${field}.repo must look like owner/name (got ${repo})`);
  }
  const commit = requireString(raw.commit, `${field}.commit`).toLowerCase();
  if (!COMMIT_PATTERN.test(commit)) {
    throw new IntegrationRegistryError(`integration registry: ${field}.commit must be a 40-char commit sha (got ${commit})`);
  }
  const sha256 = requireString(raw.sha256, `${field}.sha256`).toLowerCase();
  if (!SHA256_PATTERN.test(sha256)) {
    throw new IntegrationRegistryError(`integration registry: ${field}.sha256 must be a sha256 hex digest (got ${sha256})`);
  }
  return {
    repo,
    commit,
    skillPath: requireString(raw.skillPath, `${field}.skillPath`).replace(/\/+$/u, ''),
    entryFile: String(raw.entryFile || 'SKILL.md').trim() || 'SKILL.md',
    sha256,
    installName: requireString(raw.installName, `${field}.installName`),
    license: String(raw.license || '').trim(),
  };
}

function normalizeMcp(raw, field) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new IntegrationRegistryError(`integration registry: ${field} must define an mcp object`);
  }
  const transport = requireString(raw.transport, `${field}.transport`);
  if (transport !== 'http') {
    throw new IntegrationRegistryError(`integration registry: ${field}.transport must be "http" (got ${transport})`);
  }
  const tools = Array.isArray(raw.tools) ? raw.tools.map((item) => String(item).trim()).filter(Boolean) : [];
  return {
    serverName: requireString(raw.serverName, `${field}.serverName`),
    url: requireHttpsUrl(raw.url, `${field}.url`),
    transport,
    tools,
    resources: Array.isArray(raw.resources) ? raw.resources.map((item) => String(item).trim()).filter(Boolean) : [],
    purpose: String(raw.purpose || '').trim(),
  };
}

function normalizeEnv(raw, field) {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, index) => {
    const entryField = `${field}.env[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new IntegrationRegistryError(`integration registry: ${entryField} must be an object`);
    }
    const name = requireString(entry.name, `${entryField}.name`);
    if (!ENV_NAME_PATTERN.test(name)) {
      throw new IntegrationRegistryError(`integration registry: ${entryField}.name must be an env var name (got ${name})`);
    }
    return {
      name,
      required: entry.required === true,
      purpose: String(entry.purpose || '').trim(),
      issueUrl: entry.issueUrl ? requireHttpsUrl(entry.issueUrl, `${entryField}.issueUrl`) : '',
    };
  });
}

export function normalizeIntegrationEntry(id, raw) {
  const field = `integrations.${id}`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new IntegrationRegistryError(`integration registry: ${field} must be an object`);
  }
  return Object.freeze({
    id: String(id),
    displayName: requireString(raw.displayName, `${field}.displayName`),
    vendor: requireString(raw.vendor, `${field}.vendor`),
    homepage: requireHttpsUrl(raw.homepage, `${field}.homepage`),
    docsIndex: raw.docsIndex ? requireHttpsUrl(raw.docsIndex, `${field}.docsIndex`) : '',
    summary: String(raw.summary || '').trim(),
    env: Object.freeze(normalizeEnv(raw.env, field)),
    skill: Object.freeze(normalizeSkill(raw.skill, field)),
    mcp: Object.freeze(normalizeMcp(raw.mcp, field)),
  });
}

export function normalizeIntegrationRegistry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new IntegrationRegistryError('integration registry: root must be an object');
  }
  if (raw.schemaVersion !== INTEGRATION_SCHEMA_VERSION) {
    throw new IntegrationRegistryError(
      `integration registry: unsupported schemaVersion ${JSON.stringify(raw.schemaVersion)} (expected ${INTEGRATION_SCHEMA_VERSION})`,
    );
  }
  const source = raw.integrations;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new IntegrationRegistryError('integration registry: integrations must be an object');
  }
  const integrations = {};
  for (const [id, entry] of Object.entries(source)) {
    const normalized = normalizeIntegrationEntry(id, entry);
    if (Object.values(integrations).some((existing) => existing.mcp.serverName === normalized.mcp.serverName)) {
      throw new IntegrationRegistryError(
        `integration registry: duplicate mcp.serverName ${normalized.mcp.serverName}`,
      );
    }
    integrations[id] = normalized;
  }
  return Object.freeze({
    schemaVersion: INTEGRATION_SCHEMA_VERSION,
    integrations: Object.freeze(integrations),
  });
}

export function loadIntegrationRegistry({ rootDir, readFileImpl = fs.readFileSync } = {}) {
  const filePath = resolveIntegrationRegistryPath(rootDir);
  let raw;
  try {
    raw = String(readFileImpl(filePath, 'utf8')).replace(/^\uFEFF/u, '');
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) {
      return normalizeIntegrationRegistry({ schemaVersion: INTEGRATION_SCHEMA_VERSION, integrations: {} });
    }
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new IntegrationRegistryError(
      `integration registry: ${filePath} is not valid JSON (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  return normalizeIntegrationRegistry(parsed);
}

export function listIntegrations({ rootDir } = {}) {
  return Object.values(loadIntegrationRegistry({ rootDir }).integrations);
}

export function resolveIntegration({ rootDir, id } = {}) {
  const key = String(id || '').trim().toLowerCase();
  if (!key) {
    throw new IntegrationRegistryError('integration id is required');
  }
  const registry = loadIntegrationRegistry({ rootDir });
  const entry = registry.integrations[key];
  if (!entry) {
    const known = Object.keys(registry.integrations);
    throw new IntegrationRegistryError(
      known.length > 0
        ? `unknown integration "${id}". Known: ${known.join(', ')}`
        : `unknown integration "${id}"; no integrations are registered`,
    );
  }
  return entry;
}
