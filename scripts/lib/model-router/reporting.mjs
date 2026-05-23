import { getModelConfig } from './selection.mjs';
import { normalizeId } from './shared.mjs';

export function buildModelSummaryTable(registry) {
  if (!registry?.models) return '';
  const lines = ['| 模型 | 定位 | 最擅长 | 成本 | 速度 |', '|------|------|--------|------|------|'];
  for (const [, model] of Object.entries(registry.models)) {
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
    const fallbackLabels = fallbacks.map((model) => model.label).join(' → ');
    lines.push(`| ${rule.description || rule.taskType} | **${primaryLabel}** | ${fallbackLabels || '-'} |`);
  }
  return lines.join('\n');
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

  for (const [modelId, stat] of modelEntries) {
    lines.push(`| ${modelId} | ${stat.total} | ${stat.successRate}% | ${stat.avgLatency}ms |`);
  }

  lines.push('');
  lines.push('### By Task Type');
  lines.push('| Task Type | Total | Success Rate |');
  lines.push('|-----------|-------|-------------|');

  const taskEntries = Object.entries(stats.byTaskType)
    .sort(([, a], [, b]) => b.total - a.total);

  for (const [taskType, stat] of taskEntries) {
    lines.push(`| ${taskType} | ${stat.total} | ${stat.successRate}% |`);
  }

  return lines.join('\n');
}
