import { runContextDbCli } from '../contextdb-cli.mjs';
import {
  ensureWorkspaceMemorySession,
  normalizeWorkspaceMemorySpace,
  workspaceMemorySessionId,
} from '../memo/workspace-memory.mjs';

const HASHTAG_RE = /#([\p{L}\p{N}_-]+)/gu;

function extractTags(text) {
  const tags = [];
  let match;
  while ((match = HASHTAG_RE.exec(text)) !== null) {
    tags.push(match[1]);
  }
  return [...new Set(tags)];
}

function parseJsonSafe(raw, fallback = {}) {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function isNonNegativeNumber(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function normalizeOutcomeMetrics(raw) {
  const input = typeof raw === 'string' ? parseJsonSafe(raw) : (raw || {});
  const fields = [
    'likes', 'comments', 'shares', 'saves', 'views',
    'impressions', 'clickThroughRate', 'watchTime', 'followerGain',
  ];
  const out = {};
  for (const key of fields) {
    if (isNonNegativeNumber(input[key])) {
      out[key] = input[key];
    }
  }
  return out;
}

function normalizeOutcomeContext(raw) {
  const input = typeof raw === 'string' ? parseJsonSafe(raw) : (raw || {});
  const out = {};
  if (typeof input.topic === 'string' && input.topic.trim()) out.topic = input.topic.trim();
  if (typeof input.format === 'string' && input.format.trim()) out.format = input.format.trim();
  if (typeof input.coverStyle === 'string' && input.coverStyle.trim()) out.coverStyle = input.coverStyle.trim();
  if (isNonNegativeNumber(input.publishHour)) out.publishHour = input.publishHour;
  if (typeof input.publishDayOfWeek === 'string' && input.publishDayOfWeek.trim()) out.publishDayOfWeek = input.publishDayOfWeek.trim();
  if (Array.isArray(input.hashtags)) out.hashtags = input.hashtags.filter(h => typeof h === 'string');
  if (typeof input.collaboration === 'string') out.collaboration = input.collaboration;
  if (typeof input.campaign === 'string') out.campaign = input.campaign;
  return out;
}

function buildOutcomePayload(opts) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    kind: 'outcome.snapshot',
    contentId: opts.contentId,
    platform: opts.platform,
    contentType: opts.contentType,
    title: opts.title || '',
    publishTime: opts.publishTime || now,
    snapshotTime: now,
    snapshotWindow: opts.snapshotWindow || 'immediate',
    metrics: normalizeOutcomeMetrics(opts.metrics),
    context: normalizeOutcomeContext(opts.context),
  };
}

function buildOutcomeEventText(payload) {
  const m = payload.metrics;
  const metricStr = Object.entries(m).map(([k, v]) => `${k}=${v}`).join(' ');
  const title = payload.title ? ` "${payload.title.slice(0, 60)}"` : '';
  return `[outcome] ${payload.platform}/${payload.contentType}${title} id=${payload.contentId} ${metricStr}`.slice(0, 500);
}

function extractOutcomeRefs(payload) {
  const refs = [payload.platform, payload.contentType];
  if (payload.contentId) refs.push(payload.contentId);
  if (payload.context?.topic) refs.push(payload.context.topic);
  if (payload.title) {
    refs.push(...extractTags(payload.title));
  }
  return [...new Set(refs)];
}

export function recordOutcomeSnapshot(rawOptions = {}, { rootDir } = {}) {
  const workspaceRoot = rootDir || process.cwd();
  const space = normalizeWorkspaceMemorySpace(rawOptions.space || 'default');
  const { sessionId } = ensureWorkspaceMemorySession(workspaceRoot, space);

  const contentId = String(rawOptions.contentId || rawOptions['content-id'] || '').trim();
  const platform = String(rawOptions.platform || '').trim();
  const contentType = String(rawOptions.contentType || rawOptions['content-type'] || '').trim();

  if (!contentId) throw new Error('--content-id is required');
  if (!platform) throw new Error('--platform is required');
  if (!contentType) throw new Error('--content-type is required');

  const payload = buildOutcomePayload({
    contentId,
    platform,
    contentType,
    title: String(rawOptions.title || '').trim(),
    publishTime: String(rawOptions.publishTime || rawOptions['publish-time'] || '').trim(),
    snapshotWindow: String(rawOptions.snapshotWindow || rawOptions['snapshot-window'] || 'immediate').trim(),
    metrics: rawOptions.metrics,
    context: rawOptions.context,
  });

  const eventText = JSON.stringify(payload);
  const humanText = buildOutcomeEventText(payload);
  const refs = extractOutcomeRefs(payload);
  const turnId = `perception:${space}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const args = [
    'event:add',
    '--workspace', workspaceRoot,
    '--session', sessionId,
    '--role', 'user',
    '--kind', 'outcome.snapshot',
    '--text', eventText,
    '--turn-id', turnId,
    '--turn-type', 'side',
    '--environment', 'perception',
    '--hindsight-status', 'evaluated',
    '--outcome', 'success',
  ];
  if (refs.length > 0) {
    args.push('--refs', refs.join(','));
  }

  const event = runContextDbCli(args);
  const eventId = event?.seq ? `${sessionId}#${event.seq}` : '';

  // Sync index so search can find the new event
  try {
    runContextDbCli(['index:sync', '--workspace', workspaceRoot]);
  } catch {
    // Non-fatal: index sync is best-effort
  }

  if (rawOptions.json) {
    console.log(JSON.stringify({ ok: true, eventId, payload }, null, 2));
  } else {
    console.log(`Outcome recorded${eventId ? `: ${eventId}` : '.'}`);
    console.log(`  ${humanText}`);
  }

  return { ok: true, eventId, payload };
}
