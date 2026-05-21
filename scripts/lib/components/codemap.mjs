import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { commandExists, captureCommand, runCommand } from '../platform/process.mjs';
import { getClientHomes } from '../platform/paths.mjs';
import { syncGeneratedSkills } from '../skills/sync.mjs';

const CRG_MCP_ALIAS = 'code-review-graph';
const STATE_FILE_NAME = 'codemap.json';
const STATE_DIR = '.aios';
const CRG_DATA_DIR = '.code-review-graph';
const ALL_CODEMAP_CLIENTS = ['codex', 'claude', 'gemini', 'opencode'];
const AGENTS_MD_MARKERS = {
  begin: '<!-- AIOS CODEMAP BEGIN -->',
  end: '<!-- AIOS CODEMAP END -->',
};
const CLIENT_INSTRUCTION_FILES = [
  { clientKeys: ['codex', 'opencode'], fileName: 'AGENTS.md' },
  { clientKeys: ['claude'], fileName: 'CLAUDE.md' },
  { clientKeys: ['gemini'], fileName: 'GEMINI.md' },
];

function backupFilePath(filePath) {
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `${filePath}.bak-${ts}`;
}

function resolveUserPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw === '~') return os.homedir();
  if (raw.startsWith('~/') || raw.startsWith('~\\')) {
    return path.join(os.homedir(), raw.slice(2));
  }
  return path.resolve(raw);
}

function stateFilePath(projectRoot) {
  return path.join(projectRoot, STATE_DIR, STATE_FILE_NAME);
}

function readState(projectRoot) {
  const filePath = stateFilePath(projectRoot);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeState(projectRoot, state) {
  const filePath = stateFilePath(projectRoot);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function removeState(projectRoot) {
  const filePath = stateFilePath(projectRoot);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore
  }
}

function runCrgCommand(args, { cwd, dryRun = false, io = console } = {}) {
  if (!commandExists('uvx')) {
    throw new Error('Missing required command: uvx. Install uv first: https://docs.astral.sh/uv/getting-started/installation/');
  }
  io.log(`+ uvx ${CRG_MCP_ALIAS} ${args.join(' ')}`);
  if (dryRun) {
    io.log(`[dry-run] skipped: uvx ${CRG_MCP_ALIAS} ${args.join(' ')}`);
    return null;
  }
  return runCommand('uvx', [CRG_MCP_ALIAS, ...args], { cwd });
}

export function captureCrgCommand(args, { cwd } = {}) {
  try {
    if (!commandExists('uvx')) return null;
    const result = captureCommand('uvx', [CRG_MCP_ALIAS, ...args], { cwd });
    if (result.status !== 0) return null;
    return result;
  } catch {
    return null;
  }
}

function buildCrgMcpServerEntry(clientKey) {
  const entry = {
    command: 'uvx',
    args: ['code-review-graph', 'serve'],
    type: 'stdio',
  };
  if (clientKey === 'opencode') {
    entry.env = [];
  }
  return entry;
}

function buildCrgMcpServerEntryForProject(clientKey, projectRoot) {
  const entry = buildCrgMcpServerEntry(clientKey);
  entry.cwd = projectRoot;
  return entry;
}

function escapeTomlString(value) {
  return String(value || '').replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
}

function parseTomlArrayStrings(raw = '') {
  const values = [];
  const regex = /"((?:\\.|[^"\\])*)"/gu;
  for (const match of String(raw || '').matchAll(regex)) {
    values.push(match[1].replace(/\\"/gu, '"').replace(/\\\\/gu, '\\'));
  }
  return values;
}

function parseCodexMcpServersToml(raw = '') {
  const servers = {};
  let currentName = '';

  for (const line of String(raw || '').split(/\r?\n/u)) {
    const sectionMatch = /^\s*\[mcp_servers\.([^\]]+)\]\s*$/u.exec(line);
    if (sectionMatch) {
      currentName = sectionMatch[1].trim().replace(/^"(.+)"$/u, '$1');
      if (currentName) {
        servers[currentName] = {};
      }
      continue;
    }

    if (!currentName) continue;
    const commandMatch = /^\s*command\s*=\s*"((?:\\.|[^"\\])*)"\s*$/u.exec(line);
    if (commandMatch) {
      servers[currentName].command = commandMatch[1].replace(/\\"/gu, '"').replace(/\\\\/gu, '\\');
      continue;
    }
    const cwdMatch = /^\s*cwd\s*=\s*"((?:\\.|[^"\\])*)"\s*$/u.exec(line);
    if (cwdMatch) {
      servers[currentName].cwd = cwdMatch[1].replace(/\\"/gu, '"').replace(/\\\\/gu, '\\');
      continue;
    }
    const typeMatch = /^\s*type\s*=\s*"((?:\\.|[^"\\])*)"\s*$/u.exec(line);
    if (typeMatch) {
      servers[currentName].type = typeMatch[1].replace(/\\"/gu, '"').replace(/\\\\/gu, '\\');
      continue;
    }
    const argsMatch = /^\s*args\s*=\s*(\[[^\]]*\])\s*$/u.exec(line);
    if (argsMatch) {
      servers[currentName].args = parseTomlArrayStrings(argsMatch[1]);
    }
  }

  return servers;
}

function formatCodexMcpServerToml(clientKey, projectRoot) {
  const desired = buildCrgMcpServerEntry(clientKey);
  const args = desired.args.map((arg) => `"${escapeTomlString(arg)}"`).join(', ');
  const lines = [
    `[mcp_servers.${CRG_MCP_ALIAS}]`,
    `command = "${escapeTomlString(desired.command)}"`,
    `args = [${args}]`,
  ];
  if (projectRoot) {
    lines.push(`cwd = "${escapeTomlString(projectRoot)}"`);
  }
  lines.push(`type = "${escapeTomlString(desired.type)}"`);
  return lines.join('\n');
}

function upsertCodexMcpToml(filePath, projectRoot, { dryRun = false } = {}) {
  const exists = fs.existsSync(filePath);
  const raw = exists ? fs.readFileSync(filePath, 'utf8') : '';
  const sectionPattern = new RegExp(
    `(^|\\n)\\[mcp_servers\\.${CRG_MCP_ALIAS.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\][\\s\\S]*?(?=\\n\\[|$)`,
    'u'
  );
  const desiredSection = formatCodexMcpServerToml('codex', projectRoot);
  const nextRaw = sectionPattern.test(raw)
    ? raw.replace(sectionPattern, (match, prefix) => `${prefix}${desiredSection}`)
    : `${raw.replace(/\s*$/u, '')}${raw.trim() ? '\n\n' : ''}${desiredSection}\n`;

  const normalizedNextRaw = nextRaw.endsWith('\n') ? nextRaw : `${nextRaw}\n`;
  if (exists && raw === normalizedNextRaw) {
    return { status: 'unchanged' };
  }
  if (dryRun) {
    return { status: 'planned' };
  }
  if (exists) {
    fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, normalizedNextRaw, 'utf8');
  return { status: exists ? 'updated' : 'created' };
}

function injectCrgIntoMcpJson(filePath, clientKey, projectRoot, { dryRun = false, io = console } = {}) {
  const exists = fs.existsSync(filePath);
  const raw = exists ? fs.readFileSync(filePath, 'utf8') : '';

  let parsed = {};
  if (exists && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      if (!dryRun) {
        fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
      }
      return {
        status: 'error',
        reason: `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    parsed = {};
  }

  if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object' || Array.isArray(parsed.mcpServers)) {
    parsed.mcpServers = {};
  }

  const desired = buildCrgMcpServerEntryForProject(clientKey, projectRoot);
  const existing = parsed.mcpServers[CRG_MCP_ALIAS];
  const nextEntry = { ...desired };
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    Object.assign(nextEntry, existing, desired);
  }
  parsed.mcpServers[CRG_MCP_ALIAS] = nextEntry;

  const nextRaw = `${JSON.stringify(parsed, null, 2)}\n`;
  if (exists && raw === nextRaw) {
    return { status: 'unchanged' };
  }

  if (dryRun) {
    return { status: 'planned' };
  }

  if (exists) {
    fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, nextRaw, 'utf8');

  return { status: exists ? 'updated' : 'created' };
}

function injectCrgIntoOpencodeJson(filePath, { dryRun = false } = {}) {
  const exists = fs.existsSync(filePath);
  const raw = exists ? fs.readFileSync(filePath, 'utf8') : '';

  let parsed = {};
  if (exists && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      if (!dryRun) {
        fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
      }
      return {
        status: 'error',
        reason: `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    parsed = {};
  }
  if (!parsed.mcp || typeof parsed.mcp !== 'object' || Array.isArray(parsed.mcp)) {
    parsed.mcp = {};
  }

  const desired = {
    type: 'local',
    command: ['uvx', 'code-review-graph', 'serve'],
    enabled: true,
  };
  const existing = parsed.mcp[CRG_MCP_ALIAS];
  const nextEntry = { ...desired };
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    Object.assign(nextEntry, existing, desired);
  }
  parsed.mcp[CRG_MCP_ALIAS] = nextEntry;

  const nextRaw = `${JSON.stringify(parsed, null, 2)}\n`;
  if (exists && raw === nextRaw) {
    return { status: 'unchanged' };
  }
  if (dryRun) {
    return { status: 'planned' };
  }
  if (exists) {
    fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, nextRaw, 'utf8');
  return { status: exists ? 'updated' : 'created' };
}

function injectCrgIntoClientTarget(target, projectRoot, { dryRun = false, io = console } = {}) {
  if (target.format === 'codex-toml') {
    return upsertCodexMcpToml(target.path, projectRoot, { dryRun, io });
  }
  if (target.format === 'opencode-json') {
    return injectCrgIntoOpencodeJson(target.path, { dryRun, io });
  }
  return injectCrgIntoMcpJson(target.path, target.clientKey, projectRoot, { dryRun, io });
}

function removeCrgFromMcpJson(filePath, { io = console } = {}) {
  if (!fs.existsSync(filePath)) return;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed?.mcpServers || typeof parsed.mcpServers !== 'object') return;
    if (!(CRG_MCP_ALIAS in parsed.mcpServers)) return;

    delete parsed.mcpServers[CRG_MCP_ALIAS];
    fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
    fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    io.log(`OK   codemap removed ${CRG_MCP_ALIAS} from ${filePath}`);
  } catch (error) {
    io.log(`ERR  codemap failed to clean ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function removeCrgFromCodexToml(filePath, { io = console } = {}) {
  if (!fs.existsSync(filePath)) return;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const sectionPattern = new RegExp(
      `(^|\\n)\\[mcp_servers\\.${CRG_MCP_ALIAS.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\][\\s\\S]*?(?=\\n\\[|$)`,
      'u'
    );
    if (!sectionPattern.test(raw)) return;
    let nextRaw = raw.replace(sectionPattern, '$1');
    nextRaw = nextRaw.replace(/\n{3,}/gu, '\n\n').replace(/\s+$/u, '\n');
    fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
    fs.writeFileSync(filePath, nextRaw, 'utf8');
    io.log(`OK   codemap removed ${CRG_MCP_ALIAS} from ${filePath}`);
  } catch (error) {
    io.log(`ERR  codemap failed to clean ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function removeCrgFromOpencodeJson(filePath, { io = console } = {}) {
  if (!fs.existsSync(filePath)) return;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed?.mcp || typeof parsed.mcp !== 'object') return;
    if (!(CRG_MCP_ALIAS in parsed.mcp)) return;

    delete parsed.mcp[CRG_MCP_ALIAS];
    fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
    fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    io.log(`OK   codemap removed ${CRG_MCP_ALIAS} from ${filePath}`);
  } catch (error) {
    io.log(`ERR  codemap failed to clean ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function removeCrgFromClientTarget(target, { io = console } = {}) {
  if (target.format === 'codex-toml') {
    removeCrgFromCodexToml(target.path, { io });
    return;
  }
  if (target.format === 'opencode-json') {
    removeCrgFromOpencodeJson(target.path, { io });
    return;
  }
  removeCrgFromMcpJson(target.path, { io });
}

const AGENTS_MD_CRG_SECTION = `## MCP Tools: code-review-graph

This project has a structural knowledge graph. **Use it at each decision point in your workflow.**

### Decision checkpoints (mandatory)

| When | Call | Why |
|------|------|-----|
| Before doing anything | \`get_minimal_context(task="...")\` | Project context + suggested next steps |
| Before modifying code | \`get_impact_radius(detail_level="minimal")\` | Check blast radius; if risk=high, re-evaluate plan |
| Before modifying code | \`query_graph(pattern="tests_for", target="...")\` | Confirm tests exist; if not, write tests first |
| After modifying code | \`detect_changes(detail_level="minimal")\` | Verify actual impact matches expected |
| Before submitting | \`get_affected_flows()\` + \`get_suggested_questions()\` | Final safety net |

### Search rules

- Finding code: \`semantic_search_nodes\` before grep
- Understanding relationships: \`query_graph\` (callers_of/callees_of/tests_for) before reading files
- Code review: \`detect_changes\` → \`get_review_context\` before reading entire files

### Parameters

- Always use \`detail_level="minimal"\`; escalate to "standard" only when insufficient
- Follow \`next_tool_suggestions\` from each response for the next tool to call`;

function injectCrgIntoInstructionFile(projectRoot, fileName, { dryRun = false, io = console } = {}) {
  const docPath = path.join(projectRoot, fileName);
  if (!fs.existsSync(docPath)) {
    if (dryRun) {
      io.log(`PLAN codemap would create ${docPath} with CRG section`);
      return;
    }
    const content = `${AGENTS_MD_MARKERS.begin}\n${AGENTS_MD_CRG_SECTION}\n${AGENTS_MD_MARKERS.end}\n`;
    fs.writeFileSync(docPath, content, 'utf8');
    io.log(`OK   codemap created ${docPath} with CRG section`);
    return;
  }

  const raw = fs.readFileSync(docPath, 'utf8');
  const beginIndex = raw.indexOf(AGENTS_MD_MARKERS.begin);
  const endIndex = raw.indexOf(AGENTS_MD_MARKERS.end);

  if (beginIndex !== -1 && endIndex !== -1) {
    const before = raw.slice(0, beginIndex);
    const after = raw.slice(endIndex + AGENTS_MD_MARKERS.end.length);
    const newSection = `${AGENTS_MD_MARKERS.begin}\n${AGENTS_MD_CRG_SECTION}\n${AGENTS_MD_MARKERS.end}`;
    const nextRaw = `${before}${newSection}${after}`;
    if (nextRaw === raw) {
      io.log(`OK   codemap ${fileName} CRG section unchanged`);
      return;
    }
    if (dryRun) {
      io.log(`PLAN codemap would update ${fileName} CRG section`);
      return;
    }
    fs.writeFileSync(docPath, nextRaw, 'utf8');
    io.log(`OK   codemap updated ${fileName} CRG section`);
    return;
  }

  const nextRaw = `${raw.replace(/\n*$/u, '')}\n\n${AGENTS_MD_MARKERS.begin}\n${AGENTS_MD_CRG_SECTION}\n${AGENTS_MD_MARKERS.end}\n`;
  if (dryRun) {
    io.log(`PLAN codemap would append CRG section to ${fileName}`);
    return;
  }
  fs.writeFileSync(docPath, nextRaw, 'utf8');
  io.log(`OK   codemap appended CRG section to ${fileName}`);
}

function injectCrgIntoInstructionFiles(projectRoot, { dryRun = false, io = console, client = 'all' } = {}) {
  for (const target of collectCodemapInstructionFiles(client)) {
    injectCrgIntoInstructionFile(projectRoot, target.fileName, { dryRun, io });
  }
}

function removeCrgFromInstructionFile(projectRoot, fileName, { io = console } = {}) {
  const docPath = path.join(projectRoot, fileName);
  if (!fs.existsSync(docPath)) return;

  const raw = fs.readFileSync(docPath, 'utf8');
  const beginIndex = raw.indexOf(AGENTS_MD_MARKERS.begin);
  const endIndex = raw.indexOf(AGENTS_MD_MARKERS.end);
  if (beginIndex === -1 || endIndex === -1) return;

  const before = raw.slice(0, beginIndex);
  const after = raw.slice(endIndex + AGENTS_MD_MARKERS.end.length);
  let nextRaw = `${before}${after}`;
  nextRaw = nextRaw.replace(/\n{3,}/gu, '\n\n').replace(/^\s*\n/u, '').replace(/\n\s*$/u, '\n');
  fs.writeFileSync(docPath, nextRaw, 'utf8');
  io.log(`OK   codemap removed CRG section from ${fileName}`);
}

function removeCrgFromInstructionFiles(projectRoot, { io = console, client = 'all' } = {}) {
  for (const target of collectCodemapInstructionFiles(client)) {
    removeCrgFromInstructionFile(projectRoot, target.fileName, { io });
  }
}

const OPENCODE_CRG_PLUGIN = `import type { Plugin } from "@opencode-ai/plugin"

/**
 * AIOS code-review-graph plugin for OpenCode.
 * Keeps the graph fresh without blocking normal coding sessions.
 */
export default (_app: any) => {
  const app = _app

  app.on("file.edited", async ({ $ }: { $: any }) => {
    try {
      await $\`uvx code-review-graph update --skip-flows\`.quiet()
    } catch {
      // Graph updates are best-effort and must never block edits.
    }
  })

  app.on("session.created", async ({ $ }: { $: any }) => {
    try {
      const result = await $\`uvx code-review-graph status\`.quiet()
      const output = result.stdout?.toString().trim()
      if (output) console.log("[code-review-graph]", output)
    } catch {
      // Some projects may not have a graph yet.
    }
  })

  app.on("tool.execute.before", async (ctx: any) => {
    try {
      const input = ctx?.input ?? ctx?.params ?? {}
      const cmd = input.command ?? input.cmd ?? input.content ?? ""
      if (typeof cmd === "string" && /^git\\s+commit/i.test(cmd)) {
        const result = await ctx.$\`uvx code-review-graph detect-changes --brief\`.quiet()
        const output = result.stdout?.toString().trim()
        if (output) console.log("[code-review-graph] Pre-commit analysis:\\n" + output)
      }
    } catch {
      // Never block commits.
    }
  })
}
`;

function ensureOpencodePlugin(opencodeHome, { dryRun = false, io = console } = {}) {
  const home = resolveUserPath(opencodeHome);
  if (!home) return { status: 'skipped' };
  const pluginPath = path.join(home, 'plugins', 'crg-plugin.ts');
  const exists = fs.existsSync(pluginPath);
  const raw = exists ? fs.readFileSync(pluginPath, 'utf8') : '';
  if (raw === OPENCODE_CRG_PLUGIN) return { status: 'unchanged', path: pluginPath };
  if (exists && !/code-review-graph/iu.test(raw)) {
    io.log(`[warn] opencode plugin exists and is not CRG-managed, skipping: ${pluginPath}`);
    return { status: 'skipped', path: pluginPath };
  }
  if (dryRun) return { status: 'planned', path: pluginPath };
  if (exists) {
    fs.writeFileSync(backupFilePath(pluginPath), raw, 'utf8');
  }
  fs.mkdirSync(path.dirname(pluginPath), { recursive: true });
  fs.writeFileSync(pluginPath, OPENCODE_CRG_PLUGIN, 'utf8');
  return { status: exists ? 'updated' : 'created', path: pluginPath };
}

function removeOpencodePlugin(opencodeHome, { dryRun = false, io = console } = {}) {
  const home = resolveUserPath(opencodeHome);
  if (!home) return { status: 'skipped' };
  const pluginPath = path.join(home, 'plugins', 'crg-plugin.ts');
  if (!fs.existsSync(pluginPath)) return { status: 'missing', path: pluginPath };
  const raw = fs.readFileSync(pluginPath, 'utf8');
  if (!/code-review-graph/iu.test(raw)) {
    io.log(`[warn] opencode plugin is not CRG-managed, skipping: ${pluginPath}`);
    return { status: 'skipped', path: pluginPath };
  }
  if (dryRun) return { status: 'planned', path: pluginPath };
  fs.writeFileSync(backupFilePath(pluginPath), raw, 'utf8');
  fs.unlinkSync(pluginPath);
  return { status: 'removed', path: pluginPath };
}

function normalizeClientList(client = 'all') {
  const raw = String(client || 'all').trim().toLowerCase();
  if (!raw || raw === 'all') return ALL_CODEMAP_CLIENTS;
  if (!ALL_CODEMAP_CLIENTS.includes(raw)) {
    throw new Error(`Unsupported codemap client: ${client}`);
  }
  return [raw];
}

function collectCodemapInstructionFiles(client = 'all') {
  const enabled = new Set(normalizeClientList(client));
  const seen = new Set();
  const targets = [];
  for (const target of CLIENT_INSTRUCTION_FILES) {
    if (!target.clientKeys.some((clientKey) => enabled.has(clientKey))) continue;
    if (seen.has(target.fileName)) continue;
    seen.add(target.fileName);
    targets.push(target);
  }
  return targets;
}

function collectCodemapMcpTargets(projectRoot, clientHomes = {}, client = 'all') {
  const targets = [];
  const seen = new Set();
  const enabled = new Set(normalizeClientList(client));

  const addUnique = (absPath, clientKey, createIfMissing, format = 'mcp-json') => {
    if (!enabled.has(clientKey)) return;
    if (!absPath || seen.has(absPath)) return;
    seen.add(absPath);
    targets.push({ path: absPath, clientKey, createIfMissing, format });
  };

  const codexHome = resolveUserPath(clientHomes.codex);
  if (codexHome) {
    addUnique(path.join(codexHome, 'config.toml'), 'codex', true, 'codex-toml');
  }

  addUnique(path.join(projectRoot, '.mcp.json'), 'claude', true, 'mcp-json');
  addUnique(path.join(projectRoot, '.gemini', 'settings.json'), 'gemini', true, 'mcp-json');
  const opencodeHome = resolveUserPath(clientHomes.opencode);
  if (opencodeHome) {
    addUnique(path.join(opencodeHome, 'opencode.json'), 'opencode', true, 'opencode-json');
  }

  return targets;
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCrgServeEntry(entry) {
  if (!isObjectRecord(entry)) return false;
  if (entry.enabled === false) return false;

  if (Array.isArray(entry.command)) {
    const command = entry.command.map((part) => String(part || ''));
    return command[0] === 'uvx' && command[1] === CRG_MCP_ALIAS && command.includes('serve');
  }

  const command = String(entry.command || '');
  const args = Array.isArray(entry.args) ? entry.args.map((part) => String(part || '')) : [];
  return command === 'uvx' && args[0] === CRG_MCP_ALIAS && args.includes('serve');
}

function inspectCodemapMcpTarget(target) {
  if (!fs.existsSync(target.path)) {
    return { exists: false, hasCrg: false, valid: false, reason: 'missing' };
  }

  try {
    const raw = fs.readFileSync(target.path, 'utf8');
    if (target.format === 'codex-toml') {
      const servers = parseCodexMcpServersToml(raw);
      const entry = servers[CRG_MCP_ALIAS];
      return {
        exists: true,
        hasCrg: Boolean(entry),
        valid: isCrgServeEntry(entry),
        reason: entry ? 'invalid' : 'missing',
      };
    }

    const parsed = raw.trim() ? JSON.parse(raw) : {};
    const namespace = target.format === 'opencode-json' ? parsed?.mcp : parsed?.mcpServers;
    const entry = isObjectRecord(namespace) ? namespace[CRG_MCP_ALIAS] : null;
    return {
      exists: true,
      hasCrg: Boolean(entry),
      valid: isCrgServeEntry(entry),
      reason: entry ? 'invalid' : 'missing',
    };
  } catch (error) {
    return {
      exists: true,
      hasCrg: false,
      valid: false,
      reason: `parse failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function installCodemap({
  rootDir,
  projectRoot,
  dryRun = false,
  io = console,
  clientHomes = null,
  client = 'all',
  skipCrgChecks = false,
  skipOpencodePluginInstall = false,
  crgVersion = '',
} = {}) {
  const homes = clientHomes && typeof clientHomes === 'object' ? clientHomes : getClientHomes(process.env, os.homedir());
  const projectRootPath = path.resolve(projectRoot || process.cwd());

  io.log('[1/8] Checking uv in PATH');
  if (!skipCrgChecks && !commandExists('uv')) {
    throw new Error(
      'Missing required command: uv. Install uv first:\n' +
      '  curl -LsSf https://astral.sh/uv/install.sh | sh\n' +
      '  or: brew install uv'
    );
  }
  io.log(skipCrgChecks ? 'SKIP uv check (test override)' : 'OK   uv found');

  io.log('[2/8] Verifying code-review-graph via uvx');
  let resolvedCrgVersion = crgVersion;
  if (!skipCrgChecks) {
    const versionResult = captureCrgCommand(['--version'], { cwd: projectRootPath });
    if (!versionResult) {
      throw new Error(
        'code-review-graph is not available via uvx. Verify your uv/uvx installation and network access.'
      );
    }
    resolvedCrgVersion = versionResult.stdout.trim();
  }
  io.log(`OK   code-review-graph version: ${resolvedCrgVersion || 'available'}`);

  io.log('[3/8] Building graph');
  const crgDataDir = path.join(projectRootPath, CRG_DATA_DIR);
  const graphExists = fs.existsSync(crgDataDir);
  if (graphExists) {
    io.log('OK   graph data directory exists, skipping build');
  } else {
    io.log(`+ uvx ${CRG_MCP_ALIAS} build`);
    if (dryRun) {
      io.log(`[dry-run] skipped: uvx ${CRG_MCP_ALIAS} build`);
    } else {
      runCrgCommand(['build'], { cwd: projectRootPath, io });
    }
  }

  io.log('[4/8] Injecting MCP config into clients');
  const targets = collectCodemapMcpTargets(projectRootPath, homes, client);
  const filtered = targets.filter((t) => t.createIfMissing || fs.existsSync(t.path));
  const injectedClients = [];
  for (const target of filtered) {
    const result = injectCrgIntoClientTarget(target, projectRootPath, { dryRun, io });
    if (result.status === 'error') {
      io.log(`ERR  codemap MCP inject failed for ${target.path}: ${result.reason}`);
    } else if (result.status === 'unchanged') {
      io.log(`OK   codemap MCP unchanged: ${target.path} (${target.clientKey})`);
    } else {
      io.log(`OK   codemap MCP ${result.status}: ${target.path} (${target.clientKey})`);
    }
    if (!injectedClients.includes(target.clientKey)) {
      injectedClients.push(target.clientKey);
    }
  }

  io.log('[5/8] Installing opencode plugin');
  const opencodeSelected = injectedClients.includes('opencode');
  const opencodeInstalled = opencodeSelected && (
    dryRun ||
    commandExists('opencode') ||
    fs.existsSync(resolveUserPath(homes.opencode))
  );
  if (skipOpencodePluginInstall || skipCrgChecks) {
    io.log('SKIP opencode plugin install (disabled)');
  } else if (opencodeInstalled) {
    const pluginResult = ensureOpencodePlugin(homes.opencode, { dryRun, io });
    io.log(`OK   opencode plugin ${pluginResult.status}: ${pluginResult.path || homes.opencode}`);
  } else {
    io.log('SKIP opencode not detected, skipping plugin install');
  }

  io.log('[6/8] Writing state file');
  const state = {
    version: 1,
    installedAt: new Date().toISOString(),
    runtime: 'uvx',
    crgVersion: resolvedCrgVersion || 'unknown',
    graphBuilt: !graphExists || fs.existsSync(crgDataDir),
    clients: injectedClients,
  };
  if (dryRun) {
    io.log(`PLAN codemap would write state to ${stateFilePath(projectRootPath)}`);
  } else {
    writeState(projectRootPath, state);
    io.log(`OK   codemap state written to ${stateFilePath(projectRootPath)}`);
  }

  io.log('[7/8] Updating client instruction files');
  injectCrgIntoInstructionFiles(projectRootPath, { dryRun, io, client });

  io.log('[8/8] Syncing skills from skill-sources to client dirs');
  const skillsSourceDir = path.join(rootDir, 'skill-sources');
  if (fs.existsSync(skillsSourceDir)) {
    if (dryRun) {
      io.log(`[dry-run] skipped: syncGeneratedSkills({ rootDir })`);
    } else {
      try {
        const syncResult = await syncGeneratedSkills({ rootDir, io });
        const totals = syncResult.results.reduce((acc, r) => {
          acc.installed += r.installed;
          acc.updated += r.updated;
          acc.reused += r.reused;
          acc.removed += r.removed;
          return acc;
        }, { installed: 0, updated: 0, reused: 0, removed: 0 });
        io.log(`OK   skills synced: installed=${totals.installed} updated=${totals.updated} reused=${totals.reused} removed=${totals.removed}`);
      } catch (syncError) {
        io.log(`[warn] skill sync failed: ${syncError instanceof Error ? syncError.message : String(syncError)}`);
      }
    }
  } else {
    io.log('SKIP skill-sources/ not found, skipping skill sync');
  }

  io.log('Codemap install complete.');
  return { state, injectedClients, dryRun };
}

export async function uninstallCodemap({ rootDir, projectRoot, dryRun = false, io = console, clientHomes = null, client = 'all' } = {}) {
  const homes = clientHomes && typeof clientHomes === 'object' ? clientHomes : getClientHomes(process.env, os.homedir());
  const projectRootPath = path.resolve(projectRoot || process.cwd());

  io.log('[1/5] Removing MCP config from clients');
  const targets = collectCodemapMcpTargets(projectRootPath, homes, client);
  for (const target of targets) {
    if (dryRun) {
      if (fs.existsSync(target.path)) {
        io.log(`PLAN codemap would remove ${CRG_MCP_ALIAS} from ${target.path}`);
      }
    } else if (fs.existsSync(target.path)) {
      removeCrgFromClientTarget(target, { io });
    }
  }

  io.log('[2/5] Removing opencode plugin');
  if (normalizeClientList(client).includes('opencode')) {
    const pluginResult = removeOpencodePlugin(homes.opencode, { dryRun, io });
    io.log(`OK   opencode plugin ${pluginResult.status}: ${pluginResult.path || homes.opencode}`);
  } else {
    io.log('SKIP opencode client not selected');
  }

  io.log('[3/5] Removing CRG instruction sections');
  if (dryRun) {
    io.log('PLAN codemap would remove CRG sections from client instruction files');
  } else {
    removeCrgFromInstructionFiles(projectRootPath, { io, client });
  }

  io.log('[4/5] Removing state file');
  if (dryRun) {
    io.log(`PLAN codemap would remove state file ${stateFilePath(projectRootPath)}`);
  } else {
    removeState(projectRootPath);
    io.log(`OK   codemap state removed`);
  }

  io.log('[5/5] Preserving graph data');
  const crgDataDir = path.join(projectRootPath, CRG_DATA_DIR);
  if (fs.existsSync(crgDataDir)) {
    io.log(`OK   ${dryRun ? 'would preserve' : 'preserved'} ${crgDataDir} (user data)`);
  } else {
    io.log('OK   graph data directory not present');
  }

  io.log('Codemap uninstall complete.');
  return { removed: true, dryRun };
}

export async function doctorCodemap({
  rootDir,
  projectRoot,
  fix = false,
  dryRun = false,
  io = console,
  clientHomes = null,
  client = 'all',
  skipCrgChecks = false,
  skipOpencodePluginInstall = false,
  statusText = '',
  crgVersion = '',
} = {}) {
  const homes = clientHomes && typeof clientHomes === 'object' ? clientHomes : getClientHomes(process.env, os.homedir());
  const projectRootPath = path.resolve(projectRoot || process.cwd());

  let effectiveWarnings = 0;
  let errors = 0;

  const ok = (msg) => io.log(`OK   ${msg}`);
  const warn = (msg) => {
    effectiveWarnings += 1;
    io.log(`WARN ${msg}`);
  };
  const err = (msg) => {
    errors += 1;
    io.log(`ERR  ${msg}`);
  };

  io.log('Codemap Doctor');
  io.log(`Project: ${projectRootPath}`);
  io.log('');

  io.log('[1/7] Checking uv in PATH');
  if (skipCrgChecks) {
    ok('uv check skipped (test override)');
  } else if (commandExists('uv')) {
    ok('uv found');
  } else {
    err('uv not found in PATH');
  }

  io.log('[2/7] Checking code-review-graph via uvx');
  if (skipCrgChecks) {
    ok(`code-review-graph check skipped${crgVersion ? `: ${crgVersion}` : ''}`);
  } else if (commandExists('uvx')) {
    const versionResult = captureCrgCommand(['--version'], { cwd: projectRootPath });
    if (versionResult) {
      ok(`code-review-graph available: ${versionResult.stdout.trim()}`);
    } else {
      err('code-review-graph --version failed');
    }
  } else {
    err('uvx not found in PATH');
  }

  io.log('[3/7] Checking graph data directory');
  const crgDataDir = path.join(projectRootPath, CRG_DATA_DIR);
  if (fs.existsSync(crgDataDir)) {
    ok(`graph data directory exists: ${crgDataDir}`);
  } else {
    warn(`graph data directory missing: ${crgDataDir}`);
  }

  io.log('[4/7] Checking graph has nodes');
  if (statusText) {
    ok(`graph status: ${String(statusText).trim().split('\n')[0]}`);
  } else if (skipCrgChecks) {
    ok('graph status check skipped (test override)');
  } else {
    const statusResult = captureCrgCommand(['status'], { cwd: projectRootPath });
    if (statusResult && statusResult.stdout.trim()) {
      ok(`graph status: ${statusResult.stdout.trim().split('\n')[0]}`);
    } else {
      warn('graph status unavailable or empty');
    }
  }

  io.log('[5/7] Checking MCP config in clients');
  const targets = collectCodemapMcpTargets(projectRootPath, homes, client);
  for (const target of targets) {
    const inspection = inspectCodemapMcpTarget(target);
    if (inspection.valid) {
      ok(`${CRG_MCP_ALIAS} found in ${target.path} (${target.clientKey})`);
    } else if (!inspection.exists) {
      warn(`${CRG_MCP_ALIAS} missing in ${target.path} (${target.clientKey})`);
    } else if (inspection.hasCrg) {
      warn(`${CRG_MCP_ALIAS} invalid in ${target.path} (${target.clientKey})`);
    } else if (String(inspection.reason || '').startsWith('parse failed:')) {
      warn(`${CRG_MCP_ALIAS} missing in ${target.path} (${target.clientKey}) — ${inspection.reason}`);
    } else {
      warn(`${CRG_MCP_ALIAS} missing in ${target.path} (${target.clientKey})`);
    }
  }

  io.log('[6/7] Checking state file');
  const state = readState(projectRootPath);
  if (state && state.version === 1) {
    ok(`state file valid: ${stateFilePath(projectRootPath)}`);
  } else {
    warn('state file missing or invalid');
  }

  io.log('[7/7] Checking client instruction files');
  for (const target of collectCodemapInstructionFiles(client)) {
    const instructionPath = path.join(projectRootPath, target.fileName);
    if (fs.existsSync(instructionPath)) {
      const raw = fs.readFileSync(instructionPath, 'utf8');
      if (raw.includes(AGENTS_MD_MARKERS.begin) && raw.includes(AGENTS_MD_MARKERS.end)) {
        ok(`${target.fileName} CRG section present`);
      } else {
        warn(`${target.fileName} CRG section missing`);
      }
    } else {
      warn(`${target.fileName} not found`);
    }
  }

  if (fix && (errors > 0 || effectiveWarnings > 0)) {
    io.log('');
    io.log('[fix] Re-running installCodemap to heal issues...');
    try {
      await installCodemap({
        rootDir,
        projectRoot: projectRootPath,
        dryRun,
        io,
        clientHomes: homes,
        client,
        skipCrgChecks,
        skipOpencodePluginInstall,
        crgVersion,
      });
      io.log('[fix] Install complete. Re-run doctor to verify.');
    } catch (error) {
      err(`fix failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  io.log('');
  io.log('Note: counts reflect pre-fix state. Re-run doctor to get fresh results.');
  if (errors > 0) io.log(`Result: FAILED (${errors} errors, ${effectiveWarnings} warnings)`);
  else io.log(`Result: OK (${effectiveWarnings} warnings)`);

  return { effectiveWarnings, errors };
}

export async function buildCodemap({ projectRoot, io = console } = {}) {
  const result = runCrgCommand(['build'], { cwd: projectRoot, io });
  const state = readState(projectRoot);
  if (state) {
    state.graphBuilt = true;
    writeState(projectRoot, state);
  }
  return result;
}

export async function updateCodemap({ projectRoot, io = console } = {}) {
  return runCrgCommand(['update'], { cwd: projectRoot, io });
}

export async function statusCodemap({ projectRoot, io = console } = {}) {
  const result = captureCrgCommand(['status'], { cwd: projectRoot });
  if (result) {
    io.log(result.stdout.trim());
  } else {
    io.log('ERR  code-review-graph status failed');
  }
  return result;
}
