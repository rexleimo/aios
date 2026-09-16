// scripts/lib/components/zcode/agents-plugin.mjs — AIOS ZCode agents plugin.
// ZCode has no project-scope subagent-definition surface (no .zcode/agents
// discovery upstream); executable custom agents are contributed by plugins via
// their agents/ directory (verified against the official document-skills
// plugin). AIOS therefore ships its rex role cards as a local inline plugin
// materialized under ~/.aios/zcode-plugin and registered through the
// user-level `plugins.dirs` config — no GUI or marketplace step required.
// All paths are baked from the AIOS install root (never repo-relative).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ZCODE_AGENTS_PLUGIN_NAME = 'aios-agents';

export function resolveZcodeAgentsPluginDir(env = process.env, homeDir = os.homedir()) {
  const override = String(env.AIOS_ZCODE_PLUGIN_DIR || '').trim();
  if (override && path.isAbsolute(override)) {
    return path.normalize(override);
  }
  return path.join(homeDir, '.aios', 'zcode-plugin');
}

export function resolveZcodeUserConfigPath(zcodeHome) {
  return path.join(zcodeHome, 'cli', 'config.json');
}

// AIOS role cards carry orchestration-only fields (schemaVersion/id/role/model
// variants/activationHints) that have no ZCode agent meaning; the converter
// keeps the executable trio (name/description/tools) plus the system prompt.
const ROLE_FRONTMATTER_DROP_KEYS = new Set([
  'schemaVersion', 'id', 'role', 'model', 'recommendedModel', 'fallbackModel',
  'tokenProfile', 'activationHints',
]);

function splitFrontmatter(markdown) {
  const normalized = String(markdown || '').replace(/^\uFEFF/u, '');
  if (!normalized.startsWith('---')) {
    return { fields: {}, body: normalized };
  }
  const end = normalized.indexOf('\n---', 3);
  if (end === -1) {
    return { fields: {}, body: normalized };
  }
  const frontmatterBlock = normalized.slice(4, end);
  const body = normalized.slice(normalized.indexOf('\n', end + 1) + 1);
  const fields = {};
  for (const line of frontmatterBlock.split('\n')) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/u.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        value = JSON.parse(value);
      } catch {
        // keep the raw string when the array literal is not strict JSON
      }
    } else if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }
  return { fields, body };
}

export function convertAiosRoleCardToZcodeAgent(sourceMarkdown) {
  const { fields, body } = splitFrontmatter(sourceMarkdown);
  const name = String(fields.name || '').trim();
  if (!name) {
    throw new Error('role card is missing a name field');
  }
  const lines = ['---', `name: ${name}`];
  if (fields.description) {
    lines.push(`description: ${JSON.stringify(String(fields.description))}`);
  }
  if (Array.isArray(fields.tools) && fields.tools.length > 0) {
    lines.push(`tools: ${JSON.stringify(fields.tools)}`);
  }
  lines.push('---');
  return {
    name,
    content: `${lines.join('\n')}\n${String(body || '').trimStart()}`,
  };
}

export function buildAiosAgentsPluginContents({ aiosRoot }) {
  const rolesDir = path.join(aiosRoot, 'agent-sources', 'roles');
  const roleFiles = fs.readdirSync(rolesDir)
    .filter((fileName) => fileName.endsWith('.md'))
    .sort();
  const version = fs.readFileSync(path.join(aiosRoot, 'VERSION'), 'utf8').trim();
  const agents = roleFiles.map((fileName) => {
    const sourceMarkdown = fs.readFileSync(path.join(rolesDir, fileName), 'utf8');
    return convertAiosRoleCardToZcodeAgent(sourceMarkdown);
  });
  return {
    manifest: {
      name: ZCODE_AGENTS_PLUGIN_NAME,
      version: version || '0.0.0',
      description: 'AIOS rex orchestration agents: AIOS role cards installed as executable ZCode subagents.',
      agents: 'agents',
    },
    agents,
  };
}

function writeFileIdempotent(filePath, nextContent, changedPaths) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (existing === nextContent) {
    return false;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, nextContent, 'utf8');
  changedPaths.push(filePath);
  return true;
}

function ensurePluginDirRegistered(configPath, pluginDir, { dryRun, changedPaths }) {
  let parsed = {};
  const exists = fs.existsSync(configPath);
  if (exists) {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      parsed = {};
    }
  }
  if (!parsed.plugins || typeof parsed.plugins !== 'object' || Array.isArray(parsed.plugins)) {
    parsed.plugins = {};
  }
  if (!Array.isArray(parsed.plugins.dirs)) {
    parsed.plugins.dirs = [];
  }
  if (parsed.plugins.dirs.includes(pluginDir)) {
    return exists ? 'unchanged' : 'created';
  }
  parsed.plugins.dirs.push(pluginDir);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    changedPaths.push(configPath);
  }
  return exists ? 'updated' : 'created';
}

export function installAiosZcodeAgentsPlugin({
  aiosRoot,
  pluginDir = resolveZcodeAgentsPluginDir(),
  zcodeHome,
  dryRun = false,
  io = console,
} = {}) {
  const { manifest, agents } = buildAiosAgentsPluginContents({ aiosRoot });
  const changedPaths = [];
  let status = 'unchanged';

  if (!dryRun) {
    const manifestPath = path.join(pluginDir, '.zcode-plugin', 'plugin.json');
    const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
    if (writeFileIdempotent(manifestPath, manifestContent, changedPaths)) {
      status = fs.existsSync(path.join(pluginDir, 'agents')) ? 'updated' : 'created';
    }
    for (const agent of agents) {
      const agentPath = path.join(pluginDir, 'agents', `${agent.name}.md`);
      if (writeFileIdempotent(agentPath, agent.content, changedPaths)) {
        status = status === 'created' ? 'created' : 'updated';
      }
    }
  }

  let configAction = 'unchanged';
  if (zcodeHome) {
    configAction = ensurePluginDirRegistered(
      resolveZcodeUserConfigPath(zcodeHome),
      pluginDir,
      { dryRun, changedPaths },
    );
    if (configAction !== 'unchanged') {
      status = dryRun ? 'planned' : status;
    }
  }

  if (dryRun) {
    status = 'planned';
  }

  for (const changedPath of changedPaths) {
    io.log(`  [zcode-agents] wrote: ${changedPath}`);
  }

  return {
    status,
    agentsCount: agents.length,
    agentNames: agents.map((agent) => agent.name),
    pluginDir,
    configAction,
    changedPaths,
  };
}
