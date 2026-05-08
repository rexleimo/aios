import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runContextDbCli } from './contextdb-cli.mjs';
import defaultRegistry from '../../memory/specs/model-registry.json' with { type: 'json' };
import {
  ensureWorkspaceMemorySession,
  normalizeWorkspaceMemorySpace,
  workspaceMemorySessionId,
} from './memo/workspace-memory.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const REGISTRY_PATH = path.join(ROOT_DIR, 'memory', 'specs', 'model-registry.json');

const COST_ORDER = Object.freeze(['lowest', 'low', 'medium', 'high', 'highest']);
const PROVIDER_CLIENT_MAP = Object.freeze({
  codex: 'codex-cli',
  claude: 'claude-code',
  gemini: 'gemini-cli',
});

let _registryCache = null;
let _registryCacheMtime = 0;

async function loadRegistry() {
  try {
    const stat = await fs.stat(REGISTRY_PATH);
    if (_registryCache && stat.mtimeMs === _registryCacheMtime) {
      return _registryCache;
    }
    const raw = await fs.readFile(REGISTRY_PATH, 'utf8');
    _registryCache = JSON.parse(raw);
    _registryCacheMtime = stat.mtimeMs;
    return _registryCache;
  } catch (error) {
    if (_registryCache) return _registryCache;
    throw error;
  }
}

function normalizeId(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEnvKey(value) {
  return String(value || '').trim().toUpperCase().replace(/-/g, '_');
}

function clonePlain(value) {
  if (!value || typeof value !== 'object') return value || null;
  return JSON.parse(JSON.stringify(value));
}

function defaultModelRegistry() {
  return clonePlain(defaultRegistry);
}

function isDisabledEnvValue(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return text === '0' || text === 'false' || text === 'off' || text === 'no';
}

export function isModelRouterEnabled(env = process.env) {
  if (env?.AIOS_MODEL_ROUTER === undefined && env?.AIOS_SUBAGENT_CLIENT && !env?.AIOS_MODEL_ROUTER_FORCE) return false;
  if (isDisabledEnvValue(env?.AIOS_MODEL_ROUTER)) return false;
  const disabled = String(env?.AIOS_DISABLE_MODEL_ROUTER ?? '').trim().toLowerCase();
  return !(disabled === '1' || disabled === 'true' || disabled === 'yes' || disabled === 'on');
}

function getActiveModel(registry) {
  return normalizeId(registry?.activeModel) || '';
}

export function getModelConfig(modelId, registry) {
  const id = normalizeId(modelId);
  if (!id || !registry?.models) return null;
  return registry.models[id] || null;
}

export function getRoutingRule(taskType, registry) {
  const type = normalizeId(taskType);
  if (!type || !registry?.routingRules) return null;
  return registry.routingRules.find((r) => normalizeId(r.taskType) === type) || null;
}

export function resolveModelForRole(role, registry = defaultModelRegistry(), env = process.env) {
  const roleKey = normalizeId(role);
  const roleDefault = registry?.roleDefaults?.[roleKey];
  const taskType = normalizeId(roleDefault?.taskType) || roleKey || 'general';
  const roleOverride = env?.[`AIOS_MODEL_${normalizeEnvKey(roleKey)}`];
  if (roleOverride) {
    const modelId = normalizeId(roleOverride);
    const model = getModelConfig(modelId, registry);
    if (model) {
      return {
        modelId,
        model,
        rule: getRoutingRule(taskType, registry),
        taskType,
        reason: `env override AIOS_MODEL_${normalizeEnvKey(roleKey)} for role="${roleKey}"`,
      };
    }
  }
  if (roleDefault) {
    const decision = resolveModelForTask(taskType, registry, env);
    return { ...decision, taskType };
  }
  return {
    modelId: getActiveModel(registry) || 'claude-sonnet',
    model: getModelConfig(getActiveModel(registry) || 'claude-sonnet', registry),
    rule: null,
    taskType: 'general',
    reason: 'no role default, using active model',
  };
}

export function resolveModelForTask(taskType, registry, env = process.env) {
  const rule = getRoutingRule(taskType, registry);
  if (!rule) {
    const fallback = getActiveModel(registry) || 'claude-sonnet';
    return {
      modelId: fallback,
      model: getModelConfig(fallback, registry),
      rule: null,
      reason: `no routing rule for taskType="${taskType}", using active model`,
    };
  }

  const envOverride = env?.[`AIOS_MODEL_${String(taskType).toUpperCase().replace(/-/g, '_')}`];
  const modelId = (envOverride ? normalizeId(envOverride) : '') || rule.primary;

  const model = getModelConfig(modelId, registry);
  if (model) {
    return {
      modelId,
      model,
      rule,
      reason: envOverride
        ? `env override AIOS_MODEL_* for taskType="${taskType}"`
        : `primary match for taskType="${taskType}"`,
    };
  }

  return resolveFallback(taskType, registry, env);
}

function resolveFallback(taskType, registry, env) {
  const rule = getRoutingRule(taskType, registry);
  if (!rule?.fallback || !Array.isArray(rule.fallback)) {
    return {
      modelId: getActiveModel(registry) || 'claude-sonnet',
      model: getModelConfig(getActiveModel(registry) || 'claude-sonnet', registry),
      rule,
      reason: 'no fallback available, using active model',
    };
  }

  for (const fbId of rule.fallback) {
    const model = getModelConfig(fbId, registry);
    if (model) {
      return {
        modelId: fbId,
        model,
        rule,
        reason: `fallback for taskType="${taskType}" (primary unavailable)`,
      };
    }
  }

  return {
    modelId: getActiveModel(registry) || 'claude-sonnet',
    model: getModelConfig(getActiveModel(registry) || 'claude-sonnet', registry),
    rule,
    reason: 'all fallbacks unavailable, using active model',
  };
}

export function getFallbackChain(taskType, registry) {
  const rule = getRoutingRule(taskType, registry);
  if (!rule?.fallback || !Array.isArray(rule.fallback)) {
    return [];
  }
  return rule.fallback
    .map((id) => getModelConfig(id, registry))
    .filter(Boolean)
    .sort((a, b) => COST_ORDER.indexOf(a.cost) - COST_ORDER.indexOf(b.cost));
}

export function buildCLICommand(modelConfig, rolePrompt, task) {
  if (!modelConfig?.cli) {
    return `claude -p "[${rolePrompt}] ${task}"`;
  }

  const { command, argsTemplate, modelArg, modelValue } = modelConfig.cli;
  const fullPrompt = `"[${rolePrompt}] ${task}"`;
  const parts = [command];
  const template = String(argsTemplate || '').trim();
  const templateAlreadyIncludesModel = modelArg && modelValue
    ? template.includes(modelArg) || template.includes(modelValue)
    : false;

  if (modelArg && modelValue && !templateAlreadyIncludesModel) {
    parts.push(modelArg, modelValue);
  }
  if (template) {
    parts.push(template);
  } else if (!(modelArg && modelValue)) {
    parts.push('-p');
  } else {
    parts.push('-p');
  }
  parts.push(fullPrompt);
  return parts.join(' ');
}

export function buildModelSummaryTable(registry) {
  if (!registry?.models) return '';
  const lines = ['| 模型 | 定位 | 最擅长 | 成本 | 速度 |', '|------|------|--------|------|------|'];
  for (const [id, model] of Object.entries(registry.models)) {
    const strengths = (model.strengths || []).slice(0, 2).join(', ');
    lines.push(`| ${model.label} | ${model.description.slice(0, 20)} | ${strengths} | ${model.cost} | ${model.speed} |`);
  }
  return lines.join('\n');
}

export function buildRoutingTableMarkdown(registry) {
  if (!registry?.routingRules) return '';
  const lines = [
    '| 任务类型 | 首选模型 | 降级链 |',
    '|----------|----------|--------|',
  ];
  for (const rule of registry.routingRules) {
    const primary = getModelConfig(rule.primary, registry);
    const fallbacks = (rule.fallback || []).map((id) => getModelConfig(id, registry)).filter(Boolean);
    const primaryLabel = primary ? primary.label : rule.primary;
    const fallbackLabels = fallbacks.map((m) => m.label).join(' → ');
    lines.push(`| ${rule.description || rule.taskType} | **${primaryLabel}** | ${fallbackLabels || '-'} |`);
  }
  return lines.join('\n');
}

function matchTaskTypeFromDescription(taskDescription, registry) {
  const text = String(taskDescription || '').toLowerCase();
  // CJK: match without word boundaries; Latin: match with word boundaries
  function hasCJK(str) { return /[一-鿿㐀-䶿]/.test(str); }

  const patterns = [
    { type: 'security-review', cjk: ['安全', '漏洞', '注入', '权限'], en: /\b(secret|security|vulnerability|xss|csrf|injection|auth|compliance|permission)\b/i },
    { type: 'code-review', cjk: ['审查', '审计', '代码质量'], en: /\b(review|audit|code.?quality)\b/i },
    { type: 'architecture', cjk: ['架构', '技术选型', '系统设计'], en: /\b(architecture|system.?design|tech.?stack)\b/i },
    { type: 'implementation', cjk: ['写', '实现', '编程', '构建', '重构', '开发', '编写'], en: /\b(implement|coding|build|refactor|develop)\b/i },
    { type: 'browser-automation', cjk: ['浏览器', '抓取', '爬虫', '截图', '自动化操作'], en: /\b(browser|scrape|crawl|screenshot|automation|computer.?use)\b/i },
    { type: 'research', cjk: ['调研', '研究', '分析', '调查', '文档'], en: /\b(research|analysis|investigate|document)\b/i },
    { type: 'planning', cjk: ['规划', '方案', '路线', '拆解'], en: /\b(planning|design|blueprint|roadmap)\b/i },
    { type: 'testing', cjk: ['测试', '验证', '质量'], en: /\b(test|testing|verify|qa|quality)\b/i },
    { type: 'docs', cjk: ['写文档', '说明', '指南'], en: /\b(doc|readme|guide|manual)\b/i },
    { type: 'frontend', cjk: ['前端', '页面', '组件', '样式', '界面'], en: /\b(frontend|front.?end|ui|component|css|style)\b/i },
  ];

  for (const { type, cjk, en } of patterns) {
    if (Array.isArray(cjk) && cjk.some((kw) => text.includes(kw.toLowerCase()))) return type;
    if (en && en.test(text)) return type;
  }
  return 'general';
}

export function resolveModelForTaskDescription(taskDescription, registry, env = process.env) {
  const matchedType = matchTaskTypeFromDescription(taskDescription, registry);
  return resolveModelForTask(matchedType, registry, env);
}


export function providerToClientId(provider) {
  const key = normalizeId(provider);
  return PROVIDER_CLIENT_MAP[key] || '';
}

export function normalizeModelRouting(raw = null) {
  if (!raw || typeof raw !== 'object') return null;
  const modelId = normalizeId(raw.modelId);
  const role = normalizeId(raw.role);
  const taskType = normalizeId(raw.taskType || raw.resolvedType);
  if (!modelId || !taskType) return null;
  const provider = normalizeId(raw.provider);
  return {
    role,
    taskType,
    modelId,
    modelLabel: String(raw.modelLabel || raw.model || '').trim(),
    provider,
    clientId: String(raw.clientId || providerToClientId(provider)).trim(),
    reason: String(raw.reason || '').trim(),
    cost: normalizeId(raw.cost) || 'unknown',
    speed: normalizeId(raw.speed) || 'unknown',
    contextWindow: String(raw.contextWindow || '').trim(),
    cliCommand: String(raw.cliCommand || '').trim(),
    fallback: Array.isArray(raw.fallback) ? raw.fallback.map((item) => normalizeId(item)).filter(Boolean) : [],
  };
}

export function resolveModelRoutingForRole({
  role = '',
  taskDescription = '',
  registry = defaultModelRegistry(),
  env = process.env,
} = {}) {
  const roleKey = normalizeId(role);
  const roleDefault = registry?.roleDefaults?.[roleKey];
  const taskType = normalizeId(roleDefault?.taskType)
    || matchTaskTypeFromDescription(taskDescription, registry)
    || 'general';
  const decision = roleKey
    ? resolveModelForRole(roleKey, registry, env)
    : resolveModelForTask(taskType, registry, env);
  const resolvedType = normalizeId(decision.taskType || taskType);
  const fallback = getFallbackChain(resolvedType, registry).map((model) => normalizeId(model?.id || model?.modelId || ''));
  const model = decision.model || getModelConfig(decision.modelId, registry) || null;
  const provider = normalizeId(model?.provider);
  return normalizeModelRouting({
    role: roleKey,
    taskType: resolvedType,
    modelId: decision.modelId,
    modelLabel: model?.label || decision.modelId,
    provider,
    clientId: providerToClientId(provider),
    reason: decision.reason,
    cost: model?.cost || 'unknown',
    speed: model?.speed || 'unknown',
    contextWindow: model?.contextWindow || '',
    cliCommand: buildCLICommand(model, resolvedType, taskDescription || roleKey || resolvedType),
    fallback,
  });
}

export function resolveModelRoutingForTask({
  taskType = '',
  taskDescription = '',
  registry = defaultModelRegistry(),
  env = process.env,
} = {}) {
  const resolvedType = normalizeId(taskType) || matchTaskTypeFromDescription(taskDescription, registry) || 'general';
  const decision = resolveModelForTask(resolvedType, registry, env);
  const model = decision.model || getModelConfig(decision.modelId, registry) || null;
  const provider = normalizeId(model?.provider);
  return normalizeModelRouting({
    role: '',
    taskType: resolvedType,
    modelId: decision.modelId,
    modelLabel: model?.label || decision.modelId,
    provider,
    clientId: providerToClientId(provider),
    reason: decision.reason,
    cost: model?.cost || 'unknown',
    speed: model?.speed || 'unknown',
    contextWindow: model?.contextWindow || '',
    cliCommand: buildCLICommand(model, resolvedType, taskDescription || resolvedType),
    fallback: getFallbackChain(resolvedType, registry).map((item) => normalizeId(item?.id || item?.modelId || '')),
  });
}

export function buildModelRouterPromptSection(modelRouting = null) {
  const route = normalizeModelRouting(modelRouting);
  if (!route) return '';
  return [
    '## Model Router',
    `- role=${route.role || 'unknown'}`,
    `- taskType=${route.taskType}`,
    `- modelId=${route.modelId}`,
    `- provider=${route.provider || 'unknown'}`,
    `- clientId=${route.clientId || 'unknown'}`,
    route.reason ? `- reason=${route.reason}` : '',
    route.cliCommand ? `- cliCommand=${route.cliCommand}` : '',
  ].filter(Boolean).join('\n');
}

export function buildClientModelArgs(clientId = '', modelRouting = null) {
  const route = normalizeModelRouting(modelRouting);
  if (!route) return [];
  const modelConfig = getModelConfig(route.modelId, defaultRegistry) || null;
  const modelValue = modelConfig?.cli?.modelValue || route.modelId;
  const client = String(clientId || route.clientId || '').trim().toLowerCase();
  if (client === 'codex-cli') return ['-m', modelValue];
  if (client === 'claude-code') return ['--model', modelValue];
  if (client === 'gemini-cli') return ['-m', modelValue];
  return [];
}

function dispatchOutcomeSessionId(workspaceRoot, space = 'default') {
  const ws = normalizeWorkspaceMemorySpace(space);
  const { sessionId } = ensureWorkspaceMemorySession(workspaceRoot, ws);
  return sessionId;
}

export function recordModelDispatch({
  workspaceRoot,
  modelId,
  taskType,
  role,
  success,
  latencyMs,
  costEstimate,
  description,
} = {}) {
  try {
    const sessionId = dispatchOutcomeSessionId(workspaceRoot);
    const turnId = `model-dispatch:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = JSON.stringify({
      kind: 'model.dispatch',
      schemaVersion: 1,
      modelId: normalizeId(modelId),
      taskType: normalizeId(taskType),
      role: normalizeId(role),
      success: success === true,
      latencyMs: Number.isFinite(latencyMs) ? latencyMs : 0,
      costEstimate: normalizeId(costEstimate) || 'unknown',
      description: String(description || '').slice(0, 200),
      timestamp: new Date().toISOString(),
    });

    const text = `[model-dispatch] model=${modelId} task=${taskType} role=${role} success=${success} latency=${latencyMs}ms cost=${costEstimate}`;
    const refs = ['model-dispatch', modelId, taskType, role].filter(Boolean);

    const args = [
      'event:add',
      '--workspace', workspaceRoot,
      '--session', sessionId,
      '--role', 'user',
      '--kind', 'model.dispatch',
      '--text', payload,
      '--turn-id', turnId,
      '--turn-type', 'side',
      '--environment', 'model-router',
      '--hindsight-status', 'evaluated',
      '--outcome', success ? 'success' : 'failure',
    ];
    if (refs.length > 0) {
      args.push('--refs', refs.join(','));
    }

    runContextDbCli(args);

    try {
      runContextDbCli(['index:sync', '--workspace', workspaceRoot]);
    } catch {
      // best-effort
    }

    return { ok: true, sessionId, text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function loadModelDispatchHistory({ workspaceRoot, limit = 50 } = {}) {
  try {
    const sessionId = dispatchOutcomeSessionId(workspaceRoot);
    const result = runContextDbCli([
      'search',
      '--workspace', workspaceRoot,
      '--session', sessionId,
      '--kinds', 'model.dispatch',
      '--query', 'model-dispatch',
      '--limit', String(limit),
    ]);
    const rows = Array.isArray(result?.results) ? result.results : [];
    return rows
      .map((row) => {
        try { return JSON.parse(row.text); } catch { return null; }
      })
      .filter((r) => r && r.kind === 'model.dispatch');
  } catch {
    return [];
  }
}

export function computeModelStats(history) {
  if (!Array.isArray(history) || history.length === 0) {
    return { total: 0, byModel: {}, byTaskType: {} };
  }

  const byModel = {};
  const byTaskType = {};

  for (const entry of history) {
    const modelId = normalizeId(entry.modelId) || 'unknown';
    const taskType = normalizeId(entry.taskType) || 'unknown';

    if (!byModel[modelId]) {
      byModel[modelId] = { total: 0, success: 0, totalLatency: 0 };
    }
    byModel[modelId].total += 1;
    if (entry.success) byModel[modelId].success += 1;
    byModel[modelId].totalLatency += entry.latencyMs || 0;

    if (!byTaskType[taskType]) {
      byTaskType[taskType] = { total: 0, success: 0 };
    }
    byTaskType[taskType].total += 1;
    if (entry.success) byTaskType[taskType].success += 1;
  }

  for (const key of Object.keys(byModel)) {
    const stat = byModel[key];
    stat.successRate = stat.total > 0 ? (stat.success / stat.total * 100).toFixed(1) : '0';
    stat.avgLatency = stat.total > 0 ? Math.round(stat.totalLatency / stat.total) : 0;
  }

  for (const key of Object.keys(byTaskType)) {
    const stat = byTaskType[key];
    stat.successRate = stat.total > 0 ? (stat.success / stat.total * 100).toFixed(1) : '0';
  }

  return { total: history.length, byModel, byTaskType };
}

export function buildModelStatsReport(stats) {
  if (!stats || stats.total === 0) {
    return 'No model dispatch history yet.';
  }

  const lines = [
    `## Model Dispatch Stats (${stats.total} dispatches)`,
    '',
    '### By Model',
    '| Model | Total | Success Rate | Avg Latency |',
    '|-------|-------|-------------|-------------|',
  ];

  const modelEntries = Object.entries(stats.byModel)
    .sort(([, a], [, b]) => b.total - a.total);

  for (const [modelId, s] of modelEntries) {
    lines.push(`| ${modelId} | ${s.total} | ${s.successRate}% | ${s.avgLatency}ms |`);
  }

  lines.push('');
  lines.push('### By Task Type');
  lines.push('| Task Type | Total | Success Rate |');
  lines.push('|-----------|-------|-------------|');

  const taskEntries = Object.entries(stats.byTaskType)
    .sort(([, a], [, b]) => b.total - a.total);

  for (const [taskType, s] of taskEntries) {
    lines.push(`| ${taskType} | ${s.total} | ${s.successRate}% |`);
  }

  return lines.join('\n');
}

export async function runModelRouterCommand(rawOptions = {}, { rootDir, io = console } = {}) {
  const workspaceRoot = rootDir || process.cwd();
  const subcommand = String(rawOptions.subcommand || rawOptions._?.[0] || 'list').trim();

  let registry;
  try {
    registry = await loadRegistry();
  } catch (error) {
    io.error(`Failed to load model registry: ${error instanceof Error ? error.message : error}`);
    return { exitCode: 1 };
  }

  switch (subcommand) {
    case 'list': {
      const table = buildModelSummaryTable(registry);
      io.log('# Model Registry\n');
      io.log(table);
      io.log('\n## Routing Rules\n');
      io.log(buildRoutingTableMarkdown(registry));
      return { exitCode: 0 };
    }

    case 'route': {
      const task = String(rawOptions.task || rawOptions.prompt || '').trim();
      const taskType = String(rawOptions['task-type'] || rawOptions.taskType || '').trim();

      if (!task) {
        io.error('Missing --task or --prompt');
        return { exitCode: 1 };
      }

      const resolvedType = taskType || (matchTaskTypeFromDescription(task, registry) || 'implementation');
      const decision = resolveModelForTask(resolvedType, registry, process.env);
      const cliCommand = buildCLICommand(decision.model, resolvedType, task);

      io.log(JSON.stringify({
        task,
        resolvedType,
        modelId: decision.modelId,
        model: decision.model?.label,
        provider: decision.model?.provider,
        clientId: providerToClientId(decision.model?.provider),
        reason: decision.reason,
        cliCommand,
      }, null, 2));

      return { exitCode: 0 };
    }

    case 'stats': {
      const history = loadModelDispatchHistory({ workspaceRoot, limit: 200 });
      const stats = computeModelStats(history);
      io.log(buildModelStatsReport(stats));
      return { exitCode: 0, stats };
    }

    default:
      io.error(`Unknown subcommand: ${subcommand}. Use: list | route | stats`);
      return { exitCode: 1 };
  }
}

export { loadRegistry, matchTaskTypeFromDescription, defaultModelRegistry };
