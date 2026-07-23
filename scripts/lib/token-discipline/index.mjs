import fs from 'node:fs';
import path from 'node:path';

import { PRIMARY_BROWSER_ALIAS } from '../components/browser/constants.mjs';

export const TOKEN_PROFILE_NAMES = Object.freeze(['minimal', 'balanced', 'full']);

const DEFAULT_CONFIG = Object.freeze({
  schemaVersion: 1,
  defaultProfile: 'balanced',
  mcpBudget: {
    maxEnabledServers: 10,
    lowValueServerNames: [],
    noisyServerNames: [],
  },
  compactTriggers: ['after-exploration', 'after-milestone', 'after-debugging', 'before-context-switch'],
  compactAntiTriggers: ['mid-implementation', 'active-debugging', 'active-multi-file-refactor'],
  clientCostRecommendations: {
    claude: {
      model: 'sonnet',
      maxThinkingTokens: 10000,
      subagentModel: 'haiku',
    },
  },
});

function normalizeTokenProfile(raw = DEFAULT_CONFIG.defaultProfile) {
  const value = String(raw || DEFAULT_CONFIG.defaultProfile).trim().toLowerCase();
  if (!TOKEN_PROFILE_NAMES.includes(value)) {
    throw new Error(`--token-profile must be one of: ${TOKEN_PROFILE_NAMES.join(', ')}`);
  }
  return value;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeStringList(value = []) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

export function loadTokenDisciplineConfig(rootDir) {
  const parsed = readJsonIfExists(path.join(rootDir, 'config', 'token-discipline.json')) || {};
  const mcpBudget = parsed.mcpBudget && typeof parsed.mcpBudget === 'object' ? parsed.mcpBudget : {};
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    defaultProfile: normalizeTokenProfile(parsed.defaultProfile || DEFAULT_CONFIG.defaultProfile),
    mcpBudget: {
      ...DEFAULT_CONFIG.mcpBudget,
      ...mcpBudget,
      maxEnabledServers: Number.isFinite(Number(mcpBudget.maxEnabledServers))
        ? Number(mcpBudget.maxEnabledServers)
        : DEFAULT_CONFIG.mcpBudget.maxEnabledServers,
      lowValueServerNames: normalizeStringList(mcpBudget.lowValueServerNames),
      noisyServerNames: normalizeStringList(mcpBudget.noisyServerNames),
    },
    compactTriggers: Array.isArray(parsed.compactTriggers) && parsed.compactTriggers.length > 0
      ? parsed.compactTriggers.map(String)
      : [...DEFAULT_CONFIG.compactTriggers],
    compactAntiTriggers: Array.isArray(parsed.compactAntiTriggers) && parsed.compactAntiTriggers.length > 0
      ? parsed.compactAntiTriggers.map(String)
      : [...DEFAULT_CONFIG.compactAntiTriggers],
    clientCostRecommendations: {
      ...DEFAULT_CONFIG.clientCostRecommendations,
      ...(parsed.clientCostRecommendations && typeof parsed.clientCostRecommendations === 'object'
        ? parsed.clientCostRecommendations
        : {}),
    },
  };
}

function listJsonMcpServers(filePath, namespace) {
  const parsed = readJsonIfExists(filePath);
  if (!parsed || typeof parsed !== 'object') return [];
  const bucket = parsed[namespace];
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return [];
  return Object.entries(bucket).map(([name, spec]) => ({ name, spec }));
}

function isAiosProxySpec(spec = {}) {
  const command = String(spec?.command || '');
  const args = Array.isArray(spec?.args) ? spec.args.map(String) : [];
  return command.includes('aios-mcp-proxy.mjs') || args.some((arg) => arg.includes('aios-mcp-proxy.mjs'));
}

function classifyLowValueMcpServers({ projectRoot, mcpBudget = {} } = {}) {
  if (!projectRoot) return [];
  const lowValue = new Set(normalizeStringList(mcpBudget.lowValueServerNames));
  const noisy = new Set(normalizeStringList(mcpBudget.noisyServerNames));
  const candidates = [
    { file: path.join(projectRoot, '.mcp.json'), namespace: 'mcpServers' },
    { file: path.join(projectRoot, '.gemini', 'settings.json'), namespace: 'mcpServers' },
    { file: path.join(projectRoot, 'opencode.json'), namespace: 'mcp' },
  ];

  const findings = [];
  const seen = new Set();
  for (const candidate of candidates) {
    for (const server of listJsonMcpServers(candidate.file, candidate.namespace)) {
      const key = `${candidate.file}:${server.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let reason = '';
      if (lowValue.has(server.name)) {
        reason = 'configured-low-value';
      } else if (noisy.has(server.name)) {
        reason = 'configured-noisy-output';
      } else if (
        server.name !== PRIMARY_BROWSER_ALIAS
        && /browser|html|crawl|search/iu.test(server.name)
        && !isAiosProxySpec(server.spec)
      ) {
        reason = 'not-routed-through-aios-proxy';
      }
      if (reason) {
        findings.push({
          name: server.name,
          reason,
          source: path.relative(projectRoot, candidate.file).replace(/\\/g, '/'),
        });
      }
    }
  }
  return findings;
}

export function planTokenDiscipline({ profile, config, projectRoot = '' } = {}) {
  const resolvedConfig = config || DEFAULT_CONFIG;
  const resolvedProfile = normalizeTokenProfile(profile || resolvedConfig.defaultProfile);
  return {
    profile: resolvedProfile,
    mcpBudget: { ...resolvedConfig.mcpBudget },
    lowValueMcpServers: classifyLowValueMcpServers({
      projectRoot,
      mcpBudget: resolvedConfig.mcpBudget,
    }),
    compactTriggers: [...resolvedConfig.compactTriggers],
    compactAntiTriggers: [...resolvedConfig.compactAntiTriggers],
    clientCostRecommendations: { ...resolvedConfig.clientCostRecommendations },
    interceptionRuntime: 'preserve-aios-native',
  };
}

export function planClientCostSettings({ client, config, dryRun = true } = {}) {
  const clientId = String(client || '').trim().toLowerCase();
  const resolvedConfig = config || DEFAULT_CONFIG;
  const recommendation = resolvedConfig.clientCostRecommendations?.[clientId] || null;
  const actions = recommendation
    ? [{
      client: clientId,
      model: recommendation.model,
      maxThinkingTokens: recommendation.maxThinkingTokens,
      subagentModel: recommendation.subagentModel,
      action: dryRun ? 'preview-client-cost-settings' : 'apply-client-cost-settings',
    }]
    : [];
  return {
    client: clientId,
    dryRun: Boolean(dryRun),
    actions,
  };
}

function countJsonMcpServers(filePath, namespace) {
  const parsed = readJsonIfExists(filePath);
  if (!parsed || typeof parsed !== 'object') return 0;
  const bucket = parsed[namespace];
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return 0;
  return Object.keys(bucket).length;
}

function countTomlMcpServers(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const text = fs.readFileSync(filePath, 'utf8');
  return (text.match(/^\s*\[mcp_servers\.[^\]]+\]\s*$/gmu) || []).length;
}

export function inspectTokenDiscipline({ rootDir, projectRoot = rootDir, profile = 'balanced' } = {}) {
  const config = loadTokenDisciplineConfig(rootDir);
  const plan = planTokenDiscipline({ profile, config, projectRoot });
  const candidates = [
    { file: path.join(projectRoot, '.mcp.json'), kind: 'json', namespace: 'mcpServers' },
    { file: path.join(projectRoot, '.gemini', 'settings.json'), kind: 'json', namespace: 'mcpServers' },
    { file: path.join(projectRoot, 'opencode.json'), kind: 'json', namespace: 'mcp' },
    { file: path.join(projectRoot, '.codex', 'config.toml'), kind: 'toml' },
  ];

  let enabledMcpServers = 0;
  const sources = [];
  for (const candidate of candidates) {
    const count = candidate.kind === 'toml'
      ? countTomlMcpServers(candidate.file)
      : countJsonMcpServers(candidate.file, candidate.namespace);
    if (count > 0) {
      // Client configuration files are alternative runtime surfaces, not one MCP set.
      enabledMcpServers = Math.max(enabledMcpServers, count);
      sources.push({ path: path.relative(projectRoot, candidate.file).replace(/\\/g, '/'), count });
    }
  }

  const maxEnabledServers = plan.mcpBudget.maxEnabledServers;
  const warnings = [];
  if (enabledMcpServers > maxEnabledServers) {
    warnings.push(`enabledMcpServers=${enabledMcpServers}; maxEnabledServers=${maxEnabledServers}`);
  }
  for (const item of plan.lowValueMcpServers) {
    warnings.push(`lowValueMcpServer=${item.name}; reason=${item.reason}; source=${item.source}`);
  }
  return {
    ...plan,
    enabledMcpServers,
    maxEnabledServers,
    sources,
    warnings,
    effectiveWarnings: warnings.length,
  };
}

export function printTokenDisciplineReport(report, io = console) {
  io.log('Token Discipline Doctor');
  io.log('-----------------------');
  io.log(`Profile: ${report.profile}`);
  io.log(`MCP budget: enabledMcpServers=${report.enabledMcpServers}; maxEnabledServers=${report.maxEnabledServers}`);
  io.log(`Compact triggers: ${report.compactTriggers.join(', ')}`);
  io.log(`Interception runtime: ${report.interceptionRuntime}`);
  for (const source of report.sources) {
    io.log(`[info] mcp-source ${source.path} count=${source.count}`);
  }
  for (const warning of report.warnings) {
    io.log(`[warn] token discipline: ${warning}`);
    io.log('[hint] Use --token-profile minimal or disable low-value MCP servers.');
  }
}

export { normalizeTokenProfile };
