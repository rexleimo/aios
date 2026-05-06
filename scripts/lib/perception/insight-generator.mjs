import { runContextDbCli } from '../contextdb-cli.mjs';
import {
  ensureWorkspaceMemorySession,
  normalizeWorkspaceMemorySpace,
  workspaceMemorySessionId,
} from '../memo/workspace-memory.mjs';

const MIN_SAMPLE_DEFAULT = 3;

const DIMENSIONS = ['topic', 'format', 'publishHour', 'publishDayOfWeek', 'contentType', 'coverStyle'];

function parseJsonSafe(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

function confidence(sampleSize) {
  if (sampleSize >= 8) return 'high';
  if (sampleSize >= 5) return 'medium';
  if (sampleSize >= 3) return 'low';
  return 'insufficient';
}

function groupOutcomesByDimension(outcomes) {
  const groups = new Map();
  for (const outcome of outcomes) {
    for (const dim of DIMENSIONS) {
      const value = outcome.context?.[dim];
      if (value === undefined || value === null || value === '') continue;
      const key = `${dim}:${String(value)}`;
      if (!groups.has(key)) {
        groups.set(key, { dimension: dim, value: String(value), outcomes: [] });
      }
      groups.get(key).outcomes.push(outcome);
    }
  }
  return groups;
}

function computeMetricStats(outcomes, metricField) {
  const values = outcomes
    .map(o => o.metrics?.[metricField])
    .filter(v => typeof v === 'number' && Number.isFinite(v));
  return {
    count: values.length,
    mean: Math.round(mean(values) * 100) / 100,
    median: Math.round(median(values) * 100) / 100,
    stdDev: Math.round(stdDev(values) * 100) / 100,
    min: values.length > 0 ? Math.min(...values) : 0,
    max: values.length > 0 ? Math.max(...values) : 0,
  };
}

function buildInsightMemoText({ dimension, value, stats, sampleSize, timeRange }) {
  const conf = confidence(sampleSize);
  const parts = [
    `[insight] ${dimension}=${value}`,
    `avgLikes=${stats.likes.mean}`,
    `avgSaves=${stats.saves.mean}`,
    `avgComments=${stats.comments.mean}`,
    `confidence=${conf}`,
    `sampleSize=${sampleSize}`,
  ];
  if (timeRange) parts.push(`period=${timeRange}`);
  parts.push('#insight', `#dim:${dimension}`, `#confidence:${conf}`);
  return parts.join(' ');
}

function loadOutcomes(workspaceRoot, sessionId) {
  const result = runContextDbCli([
    'search',
    '--workspace', workspaceRoot,
    '--session', sessionId,
    '--kinds', 'outcome.snapshot',
    '--query', 'outcome',
    '--limit', '200',
  ]);
  const rows = Array.isArray(result?.results) ? result.results : [];
  return rows
    .map(row => parseJsonSafe(row.text))
    .filter(o => o && o.kind === 'outcome.snapshot');
}

function computeTimeRange(outcomes) {
  const times = outcomes
    .map(o => o.snapshotTime || o.publishTime)
    .filter(Boolean)
    .sort();
  if (times.length < 2) return '';
  const first = new Date(times[0]);
  const last = new Date(times[times.length - 1]);
  const days = Math.ceil((last - first) / (1000 * 60 * 60 * 24));
  return `${days}d`;
}

function storeInsightMemo(workspaceRoot, sessionId, insightText, space) {
  const turnId = `insight:${space}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const refs = [];
  let match;
  const re = /#([\p{L}\p{N}_:-]+)/gu;
  while ((match = re.exec(insightText)) !== null) {
    refs.push(match[1]);
  }

  const args = [
    'event:add',
    '--workspace', workspaceRoot,
    '--session', sessionId,
    '--role', 'user',
    '--kind', 'memo',
    '--text', insightText,
    '--turn-id', turnId,
    '--turn-type', 'side',
    '--environment', 'perception',
    '--hindsight-status', 'na',
    '--outcome', 'success',
  ];
  if (refs.length > 0) {
    args.push('--refs', refs.join(','));
  }
  return runContextDbCli(args);
}

export function generateInsights(rawOptions = {}, { rootDir } = {}) {
  const workspaceRoot = rootDir || process.cwd();
  const space = normalizeWorkspaceMemorySpace(rawOptions.space || 'default');
  const minSample = Number(rawOptions.minSample || rawOptions['min-sample'] || MIN_SAMPLE_DEFAULT);
  const dryRun = rawOptions.dryRun || rawOptions['dry-run'] || false;
  const { sessionId } = ensureWorkspaceMemorySession(workspaceRoot, space);

  const outcomes = loadOutcomes(workspaceRoot, sessionId);
  if (outcomes.length === 0) {
    console.log('No outcome snapshots found. Record outcomes first with: aios perception record');
    return { insights: [], totalOutcomes: 0 };
  }

  const groups = groupOutcomesByDimension(outcomes);
  const timeRange = computeTimeRange(outcomes);
  const insights = [];

  for (const [key, group] of groups) {
    if (group.outcomes.length < minSample) continue;

    const stats = {
      likes: computeMetricStats(group.outcomes, 'likes'),
      saves: computeMetricStats(group.outcomes, 'saves'),
      comments: computeMetricStats(group.outcomes, 'comments'),
      views: computeMetricStats(group.outcomes, 'views'),
    };

    const insightText = buildInsightMemoText({
      dimension: group.dimension,
      value: group.value,
      stats,
      sampleSize: group.outcomes.length,
      timeRange,
    });

    insights.push({ key, dimension: group.dimension, value: group.value, text: insightText, sampleSize: group.outcomes.length, stats });

    if (!dryRun) {
      storeInsightMemo(workspaceRoot, sessionId, insightText, space);
    }
  }

  // Sync index so search can find the new insight memos
  if (!dryRun && insights.length > 0) {
    try {
      runContextDbCli(['index:sync', '--workspace', workspaceRoot]);
    } catch {
      // Non-fatal
    }
  }

  if (dryRun) {
    console.log(`[dry-run] Would generate ${insights.length} insights from ${outcomes.length} outcomes:`);
  } else {
    console.log(`Generated ${insights.length} insights from ${outcomes.length} outcomes.`);
  }

  for (const ins of insights) {
    console.log(`  ${ins.text}`);
  }

  return { insights, totalOutcomes: outcomes.length };
}
