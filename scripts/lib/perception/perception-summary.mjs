import { runContextDbCli } from '../contextdb-cli.mjs';
import {
  ensureWorkspaceMemorySession,
  normalizeWorkspaceMemorySpace,
  workspaceMemorySessionId,
} from '../memo/workspace-memory.mjs';

function parseJsonSafe(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function totalEngagement(metrics) {
  return (metrics.likes || 0) + (metrics.saves || 0) + (metrics.comments || 0) + (metrics.shares || 0);
}

function loadRecentOutcomes(workspaceRoot, sessionId, limit) {
  try {
    const result = runContextDbCli([
      'search',
      '--workspace', workspaceRoot,
      '--session', sessionId,
      '--kinds', 'outcome.snapshot',
      '--query', 'outcome',
      '--limit', String(limit),
    ]);
    const rows = Array.isArray(result?.results) ? result.results : [];
    return rows
      .map(row => parseJsonSafe(row.text))
      .filter(o => o && o.kind === 'outcome.snapshot')
      .sort((a, b) => (b.snapshotTime || '').localeCompare(a.snapshotTime || ''));
  } catch {
    return [];
  }
}

function loadActiveInsights(workspaceRoot, sessionId, limit) {
  try {
    const result = runContextDbCli([
      'search',
      '--workspace', workspaceRoot,
      '--session', sessionId,
      '--kinds', 'memo',
      '--query', 'insight',
      '--limit', String(limit),
    ]);
    const rows = Array.isArray(result?.results) ? result.results : [];
    return rows
      .map(row => ({ text: row.text, ts: row.ts, refs: row.refs || [] }))
      .filter(r => r.refs.includes('insight') || r.text.includes('[insight]'));
  } catch {
    return [];
  }
}

function computeQuickStats(outcomes) {
  if (outcomes.length === 0) {
    return { totalPublished: 0, avgEngagement: 0, bestContent: null, trend: 'unknown', trendDelta: 0 };
  }

  const engagements = outcomes.map(o => totalEngagement(o.metrics || {}));
  const avgEngagement = Math.round(engagements.reduce((s, v) => s + v, 0) / engagements.length);

  let bestIdx = 0;
  for (let i = 1; i < engagements.length; i++) {
    if (engagements[i] > engagements[bestIdx]) bestIdx = i;
  }
  const best = outcomes[bestIdx];

  let trend = 'stable';
  let trendDelta = 0;
  if (outcomes.length >= 4) {
    const half = Math.floor(outcomes.length / 2);
    const recent = engagements.slice(0, half);
    const older = engagements.slice(half);
    const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
    const olderAvg = older.reduce((s, v) => s + v, 0) / older.length;
    if (olderAvg > 0) {
      trendDelta = Math.round(((recentAvg - olderAvg) / olderAvg) * 100);
      trend = trendDelta > 10 ? 'improving' : trendDelta < -10 ? 'declining' : 'stable';
    }
  }

  return {
    totalPublished: outcomes.length,
    avgEngagement,
    bestContent: best ? { title: best.title, engagement: engagements[bestIdx] } : null,
    trend,
    trendDelta,
  };
}

function buildStrategyRecommendations(stats, insights) {
  const recs = [];
  const topicInsights = insights.filter(i => i.refs?.includes('dim:topic'));
  const formatInsights = insights.filter(i => i.refs?.includes('dim:format'));
  const timeInsights = insights.filter(i => i.refs?.includes('dim:publishHour'));

  if (topicInsights.length > 0) {
    const best = topicInsights[0];
    const match = /topic=(\S+)/.exec(best.text || '');
    if (match) recs.push(`Focus on topic "${match[1]}" (highest engagement)`);
  }
  if (formatInsights.length > 0) {
    const best = formatInsights[0];
    const match = /format=(\S+)/.exec(best.text || '');
    if (match) recs.push(`Prefer format "${match[1]}" (highest save rate)`);
  }
  if (timeInsights.length > 0) {
    const best = timeInsights[0];
    const match = /publishHour=(\S+)/.exec(best.text || '');
    if (match) recs.push(`Publish around ${match[1]}:00 (best time slot)`);
  }
  if (stats.trend === 'declining') {
    recs.push('Engagement declining - consider changing content strategy');
  }
  return recs;
}

function renderPerceptionMarkdown({ quickStats, recentOutcomes, activeInsights, maxChars }) {
  const lines = ['## Perception Layer'];

  lines.push('### Performance Summary');
  lines.push(`- Content Published: ${quickStats.totalPublished}`);
  lines.push(`- Avg Engagement: ${quickStats.avgEngagement}`);
  const trendSign = quickStats.trendDelta > 0 ? '+' : '';
  lines.push(`- Trend: ${quickStats.trend} (${trendSign}${quickStats.trendDelta}%)`);
  if (quickStats.bestContent) {
    lines.push(`- Best Recent: "${quickStats.bestContent.title}" (engagement=${quickStats.bestContent.engagement})`);
  }

  if (recentOutcomes.length > 0) {
    lines.push('');
    lines.push('### Recent Outcomes');
    for (const o of recentOutcomes.slice(0, 5)) {
      const m = o.metrics || {};
      const title = o.title ? `"${o.title.slice(0, 40)}"` : o.contentId;
      lines.push(`- [${o.snapshotWindow || '?'}] ${title} likes=${m.likes || 0} saves=${m.saves || 0} comments=${m.comments || 0}`);
    }
  }

  if (activeInsights.length > 0) {
    lines.push('');
    lines.push('### Active Insights');
    for (const ins of activeInsights.slice(0, 8)) {
      const text = ins.text.replace(/\s*#\w+[\w:-]*/g, '').trim();
      lines.push(`- ${text}`);
    }
  }

  const recs = buildStrategyRecommendations(quickStats, activeInsights);
  if (recs.length > 0) {
    lines.push('');
    lines.push('### Strategy Recommendations');
    for (const rec of recs) {
      lines.push(`- ${rec}`);
    }
  }

  const result = `${lines.join('\n')}\n`;
  if (maxChars && result.length > maxChars) {
    return result.slice(0, maxChars).trimEnd() + '\n';
  }
  return result;
}

export function buildPerceptionSummary({ workspaceRoot, space = 'default', maxChars = 3000, outcomesLimit = 20, insightsLimit = 10 } = {}) {
  const ws = normalizeWorkspaceMemorySpace(space);
  const sessionId = workspaceMemorySessionId(ws);
  const { sessionId: ensuredId } = ensureWorkspaceMemorySession(workspaceRoot, ws);

  const recentOutcomes = loadRecentOutcomes(workspaceRoot, ensuredId, outcomesLimit);
  const activeInsights = loadActiveInsights(workspaceRoot, ensuredId, insightsLimit);

  if (recentOutcomes.length === 0 && activeInsights.length === 0) {
    return '';
  }

  const quickStats = computeQuickStats(recentOutcomes);

  return renderPerceptionMarkdown({ quickStats, recentOutcomes, activeInsights, maxChars });
}

export function runPerceptionSummary(rawOptions = {}, { rootDir } = {}) {
  const workspaceRoot = rootDir || process.cwd();
  const space = normalizeWorkspaceMemorySpace(rawOptions.space || 'default');
  const format = String(rawOptions.format || 'text').trim();

  const summary = buildPerceptionSummary({
    workspaceRoot,
    space,
    maxChars: Number(rawOptions.maxChars || 10000),
  });

  if (!summary) {
    if (format === 'json') {
      console.log(JSON.stringify({ ok: true, empty: true, message: 'No perception data found.' }));
    } else {
      console.log('No perception data found. Record outcomes first with: aios perception record');
    }
    return { ok: true, empty: true };
  }

  if (format === 'json') {
    const outcomes = loadRecentOutcomes(workspaceRoot, workspaceMemorySessionId(space), 20);
    const insights = loadActiveInsights(workspaceRoot, workspaceMemorySessionId(space), 10);
    const stats = computeQuickStats(outcomes);
    console.log(JSON.stringify({ ok: true, stats, outcomeCount: outcomes.length, insightCount: insights.length, markdown: summary }, null, 2));
  } else {
    console.log(summary);
  }
  return { ok: true, markdown: summary };
}
