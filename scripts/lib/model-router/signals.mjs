import { defaultModelRegistry } from './registry.mjs';
import { normalizeModelRouterProfile } from './profile.mjs';
import { normalizeId, uniq } from './shared.mjs';

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

const INTENT_RULES = Object.freeze([
  {
    intent: 'plan',
    keywords: { cjk: ['设计', '方案', '规划', '拆解', '计划', '架构', '头脑风暴', 'brainstorm', '路线图'], en: ['design', 'plan', 'planning', 'architect', 'brainstorm', 'roadmap', 'blueprint', 'decompose'] },
    preferredTaskType: 'planning',
    reason: 'planning or design intent detected',
  },
  {
    intent: 'implement',
    keywords: { cjk: ['实现', '写代码', '编写', '开发', '构建', '编码', '修复', '修改'], en: ['implement', 'build', 'coding', 'develop', 'fix', 'write', 'create', 'code'] },
    preferredTaskType: 'implementation',
    reason: 'implementation or coding intent detected',
  },
  {
    intent: 'review',
    keywords: { cjk: ['审查', '评审', '检查', '测试', '验证', '代码质量', '安全审计'], en: ['review', 'check', 'audit', 'verify', 'test', 'security', 'inspect', 'quality'] },
    preferredTaskType: 'code-review',
    reason: 'review or quality check intent detected',
  },
  {
    intent: 'explore',
    keywords: { cjk: ['研究', '调查', '分析', '搜索', '了解', '查看', '文档', '调研'], en: ['research', 'investigate', 'analyze', 'explore', 'search', 'read', 'understand', 'docs', 'documentation'] },
    preferredTaskType: 'research',
    reason: 'research or exploration intent detected',
  },
]);

// 纯函数：中英文关键词匹配；英文按词边界，中文按子串。
export function keywordMatches(text, keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return false;
  if (/[a-z0-9]/i.test(kw)) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\ /g, '\\s+');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'iu').test(text);
  }
  return text.includes(kw);
}

// 纯函数：先用轻量意图规则判断任务倾向，作为 signal scoring 的低置信补偿。
export function classifyTaskIntent(taskDescription) {
  const text = String(taskDescription || '').toLowerCase();
  if (!text.trim()) return { intent: 'implement', confidence: 0.3, matchedKeywords: [], preferredTaskType: 'implementation', reason: 'empty task description, defaulting to implement' };

  const scores = new Map();
  const matchedKeywords = [];

  for (const rule of INTENT_RULES) {
    const allKeywords = [
      ...(Array.isArray(rule.keywords?.cjk) ? rule.keywords.cjk : []),
      ...(Array.isArray(rule.keywords?.en) ? rule.keywords.en : []),
    ];
    let count = 0;
    for (const kw of allKeywords) {
      if (keywordMatches(text, kw)) {
        count += 1;
        matchedKeywords.push({ intent: rule.intent, keyword: kw });
      }
    }
    if (count > 0) {
      scores.set(rule.intent, { intent: rule.intent, count, preferredTaskType: rule.preferredTaskType, reason: rule.reason });
    }
  }

  if (scores.size === 0) {
    return { intent: 'implement', confidence: 0.3, matchedKeywords: [], preferredTaskType: 'implementation', reason: 'no intent signal detected, defaulting to implement' };
  }

  const ranked = [...scores.values()].sort((a, b) => b.count - a.count);
  const top = ranked[0];
  const runnerUp = ranked[1];
  const confidence = Math.min(0.95, Math.max(0.5, top.count / Math.max(1, top.count + (runnerUp?.count || 0))));

  return {
    intent: top.intent,
    confidence: Number(confidence.toFixed(2)),
    matchedKeywords,
    preferredTaskType: top.preferredTaskType,
    reason: top.reason,
  };
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

// 纯函数：把任务描述转换成可解释的任务类型评分，不读取文件或环境副作用。
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

export function matchTaskTypeFromDescription(taskDescription, registry) {
  return scoreTaskSignals(taskDescription, registry).primaryType || 'general';
}
