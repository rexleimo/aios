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
const DEFAULT_SIGNAL_RULES = Object.freeze([
  { taskType: 'security-review', priority: 100, weight: 8, keywords: { cjk: ['安全', '漏洞', '注入', '权限', '合规'], en: ['secret', 'security', 'vulnerability', 'xss', 'csrf', 'injection', 'permission', 'compliance', 'auth'] }, reason: 'security or auth risk' },
  { taskType: 'code-review', priority: 98, weight: 7, keywords: { cjk: ['代码审查', '审查', '评审', '代码质量'], en: ['code review', 'review', 'pull request', 'pr', 'code quality'] }, reason: 'code review or quality gate' },
  { taskType: 'browser-automation', priority: 95, weight: 8, keywords: { cjk: ['浏览器', '打开', '上传', '填写', '截图', '网页抓取', '发布页面'], en: ['browser', 'upload', 'screenshot', 'scrape', 'crawl', 'automation', 'computer use'] }, reason: 'live browser or desktop workflow' },
  { taskType: 'self-healing', priority: 90, weight: 8, keywords: { cjk: ['线上', '故障', '恢复', '自愈', '事故', '日志'], en: ['incident', 'outage', 'recover', 'self-healing', 'production', 'logs'] }, reason: 'production recovery or incident signal' },
  { taskType: 'architecture', priority: 80, weight: 7, keywords: { cjk: ['架构', '技术选型', '系统设计', '跨模块', '重构方案'], en: ['architecture', 'system design', 'tech stack', 'cross-module', 'refactor plan'] }, reason: 'architecture or system design' },
  { taskType: 'research', priority: 70, weight: 7, keywords: { cjk: ['很长', '长文档', '第三方 api', '调研', '研究', '视频', '图像', '多模态'], en: ['long document', 'research', 'migration strategy', 'video', 'image', 'multimodal'] }, reason: 'long-context or multimodal research' },
  { taskType: 'frontend', priority: 65, weight: 7, keywords: { cjk: ['前端', '组件', '样式', '界面', '落地页'], en: ['frontend', 'front-end', 'ui', 'landing page', 'component', 'css', 'style', 'beautiful'] }, reason: 'frontend UI or visual design' },
  { taskType: 'testing', priority: 50, weight: 4, keywords: { cjk: ['测试', '验证', 'qa'], en: ['test', 'testing', 'verify', 'qa'] }, reason: 'testing or QA' },
  { taskType: 'docs', priority: 45, weight: 5, keywords: { cjk: ['文档', '博客', 'readme', '指南', '说明', 'skill'], en: ['docs', 'blog', 'readme', 'guide', 'manual', 'skill'] }, reason: 'documentation work' },
  { taskType: 'planning', priority: 40, weight: 5, keywords: { cjk: ['设计', '方案', '规划', '拆解', '计划'], en: ['design', 'planning', 'plan', 'blueprint', 'roadmap'] }, reason: 'planning or decomposition' },
  { taskType: 'implementation', priority: 20, weight: 6, keywords: { cjk: ['实现', '写代码', '编写', '开发', '构建'], en: ['implement', 'build', 'coding', 'develop'] }, reason: 'implementation work' },
]);

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

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
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

export function normalizeModelRouterProfile(profile, registry = defaultModelRegistry(), env = process.env) {
  const configured = registry?.routingProfiles && typeof registry.routingProfiles === 'object'
    ? Object.keys(registry.routingProfiles).map(normalizeId)
    : ['balanced', 'premium', 'budget'];
  const allowed = configured.length > 0 ? configured : ['balanced', 'premium', 'budget'];
  const requested = normalizeId(profile) || normalizeId(env?.AIOS_MODEL_ROUTER_PROFILE) || normalizeId(registry?.defaultProfile) || 'balanced';
  return allowed.includes(requested) ? requested : 'balanced';
}

function keywordMatches(text, keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return false;
  if (/[a-z0-9]/i.test(kw)) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s+');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'iu').test(text);
  }
  return text.includes(kw);
}

function getSignalRules(registry) {
  return Array.isArray(registry?.signalRules) && registry.signalRules.length > 0
    ? registry.signalRules
    : DEFAULT_SIGNAL_RULES;
}

function buildWhy({ profile, primaryType, matchedSignals, recommendedPhases }) {
  const primarySignals = matchedSignals.filter((signal) => signal.taskType === primaryType);
  const phrases = uniq(primarySignals.map((signal) => signal.signal)).slice(0, 5);
  const reason = primarySignals[0]?.reason || `${primaryType} signal`;
  const lines = [
    `Detected ${primaryType} signals${phrases.length ? `: ${phrases.join(', ')}` : ''} (${reason})`,
    `${profile} profile selected ${primaryType}`,
  ];
  const otherTypes = uniq(matchedSignals.map((signal) => signal.taskType).filter((type) => type !== primaryType));
  if (otherTypes.length > 0) {
    lines.push(`Also detected lower-priority signals: ${otherTypes.slice(0, 4).join(', ')}`);
  }
  if (recommendedPhases.length > 1) {
    lines.push('Compound task detected; see recommendedPhases for phase-specific routing');
  }
  return lines;
}

function cliUnattendedArgs(command = '') {
  const normalized = normalizeId(command);
  if (normalized === 'codex') return ['--dangerously-bypass-approvals-and-sandbox'];
  if (normalized === 'claude') return ['--dangerously-skip-permissions'];
  if (normalized === 'gemini') return ['--yolo'];
  return [];
}

function injectCliUnattendedArgs(command = '', template = '') {
  const tokens = String(template || '').trim().split(/\s+/u).filter(Boolean);
  const missing = cliUnattendedArgs(command).filter((arg) => !tokens.includes(arg));
  if (missing.length === 0) return tokens.join(' ');

  const promptFlagIndex = tokens.findIndex((token) => token === '-p' || token === '--print' || token === '--prompt');
  if (promptFlagIndex >= 0) {
    tokens.splice(promptFlagIndex, 0, ...missing);
    return tokens.join(' ');
  }

  if (normalizeId(command) === 'codex' && tokens[0] === 'exec') {
    tokens.splice(1, 0, ...missing);
    return tokens.join(' ');
  }

  tokens.push(...missing);
  return tokens.join(' ');
}

export function scoreTaskSignals(taskDescription, registry = defaultModelRegistry(), { profile, env = process.env } = {}) {
  const activeProfile = normalizeModelRouterProfile(profile, registry, env);
  const text = String(taskDescription || '').toLowerCase();
  const matchedSignals = [];
  const scores = new Map();

  for (const rawRule of getSignalRules(registry)) {
    const taskType = normalizeId(rawRule.taskType);
    if (!taskType) continue;
    const keywords = [
      ...(Array.isArray(rawRule.keywords?.cjk) ? rawRule.keywords.cjk : []),
      ...(Array.isArray(rawRule.keywords?.en) ? rawRule.keywords.en : []),
    ];
    for (const keyword of keywords) {
      if (!keywordMatches(text, keyword)) continue;
      const signal = {
        taskType,
        signal: String(keyword).trim(),
        weight: Number(rawRule.weight) || 1,
        priority: Number(rawRule.priority) || 0,
        reason: String(rawRule.reason || '').trim(),
      };
      matchedSignals.push(signal);
      const current = scores.get(taskType) || { taskType, score: 0, priority: signal.priority, count: 0 };
      current.score += signal.weight;
      current.priority = Math.max(current.priority, signal.priority);
      current.count += 1;
      scores.set(taskType, current);
    }
  }

  if (scores.size === 0) {
    const fallback = 'general';
    return {
      profile: activeProfile,
      primaryType: fallback,
      confidence: 0.3,
      matchedSignals: [],
      why: [`No strong routing signal detected; ${activeProfile} profile falls back to general`],
      recommendedPhases: [],
    };
  }

  const ranked = [...scores.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.taskType.localeCompare(b.taskType);
  });
  let primaryType = ranked[0].taskType;
  let confidence = Math.min(0.95, Math.max(0.45, ranked[0].score / Math.max(8, ranked[0].score + (ranked[1]?.score || 0))));

  if (activeProfile === 'premium') {
    const strong = ranked.find((item) => ['architecture', 'security-review', 'browser-automation'].includes(item.taskType));
    if (strong) {
      primaryType = strong.taskType;
      confidence = Math.max(confidence, 0.78);
    } else if (primaryType === 'implementation' && ranked[0].score >= 10) {
      primaryType = 'general';
      confidence = Math.max(confidence, 0.72);
    }
  }

  const recommendedPhases = ranked
    .filter((item) => item.score >= 5)
    .slice(0, 4)
    .map((item) => ({ taskType: item.taskType, score: item.score }));

  if (recommendedPhases.length > 1 && primaryType === 'implementation') {
    const nonImplementation = recommendedPhases.find((item) => item.taskType !== 'implementation');
    if (nonImplementation) primaryType = nonImplementation.taskType;
  }

  return {
    profile: activeProfile,
    primaryType,
    confidence: Number(confidence.toFixed(2)),
    matchedSignals: matchedSignals.sort((a, b) => b.weight - a.weight || b.priority - a.priority),
    why: buildWhy({ profile: activeProfile, primaryType, matchedSignals, recommendedPhases }),
    recommendedPhases,
  };
}

export function getModelConfig(modelId, registry) {
  const id = normalizeId(modelId);
  if (!id || !registry?.models) return null;
  const model = registry.models[id];
  return model ? { id, ...model } : null;
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
  // Discipline agent preferred model: use explicit preferredModel if set in roleDefaults
  const preferredModel = roleDefault?.preferredModel;
  if (preferredModel) {
    const model = getModelConfig(preferredModel, registry);
    if (model) {
      return {
        modelId: preferredModel,
        model,
        rule: getRoutingRule(taskType, registry),
        taskType,
        reason: `discipline agent preferred model for role="${roleKey}"`,
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
    return `claude --dangerously-skip-permissions -p "[${rolePrompt}] ${task}"`;
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
    parts.push(injectCliUnattendedArgs(command, template));
  } else if (!(modelArg && modelValue)) {
    parts.push(...cliUnattendedArgs(command), '-p');
  } else {
    parts.push(...cliUnattendedArgs(command), '-p');
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
  return scoreTaskSignals(taskDescription, registry).primaryType || 'general';
}

export function resolveModelForTaskDescription(taskDescription, registry, env = process.env) {
  const scoring = scoreTaskSignals(taskDescription, registry, { env });
  const matchedType = scoring.primaryType || 'general';
  return {
    ...resolveModelForTask(matchedType, registry, env),
    taskType: matchedType,
    profile: scoring.profile,
    confidence: scoring.confidence,
    matchedSignals: scoring.matchedSignals,
    why: scoring.why,
    recommendedPhases: scoring.recommendedPhases,
  };
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
    profile: normalizeId(raw.profile),
    confidence: Number.isFinite(raw.confidence) ? raw.confidence : null,
    matchedSignals: Array.isArray(raw.matchedSignals) ? raw.matchedSignals.map(clonePlain).filter(Boolean) : [],
    why: Array.isArray(raw.why) ? raw.why.map((item) => String(item || '').trim()).filter(Boolean) : [],
    recommendedPhases: Array.isArray(raw.recommendedPhases) ? raw.recommendedPhases.map(clonePlain).filter(Boolean) : [],
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
  profile = '',
} = {}) {
  const scoring = normalizeId(taskType)
    ? {
        profile: normalizeModelRouterProfile(profile, registry, env),
        primaryType: normalizeId(taskType),
        confidence: 1,
        matchedSignals: [],
        why: [`Explicit task type selected: ${normalizeId(taskType)}`],
        recommendedPhases: [],
      }
    : scoreTaskSignals(taskDescription, registry, { profile, env });
  const resolvedType = normalizeId(taskType) || scoring.primaryType || matchTaskTypeFromDescription(taskDescription, registry) || 'general';
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
    profile: scoring.profile,
    confidence: scoring.confidence,
    matchedSignals: scoring.matchedSignals,
    why: scoring.why,
    recommendedPhases: scoring.recommendedPhases,
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
      const profile = String(rawOptions.profile || '').trim();

      if (!task) {
        io.error('Missing --task or --prompt');
        return { exitCode: 1 };
      }

      const route = resolveModelRoutingForTask({
        taskType,
        taskDescription: task,
        registry,
        env: process.env,
        profile,
      });

      io.log(JSON.stringify({
        task,
        resolvedType: route.taskType,
        modelId: route.modelId,
        model: route.modelLabel,
        provider: route.provider,
        clientId: route.clientId,
        reason: route.reason,
        cliCommand: route.cliCommand,
        fallback: route.fallback,
        profile: route.profile,
        confidence: route.confidence,
        matchedSignals: route.matchedSignals,
        why: route.why,
        recommendedPhases: route.recommendedPhases,
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
