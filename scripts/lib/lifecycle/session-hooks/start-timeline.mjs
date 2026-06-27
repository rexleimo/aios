import { listMemoEvents } from '../../memo/storage/query.mjs';

const KIND_ICONS = {
  memo: '📝',
  pin: '📌',
  checkpoint: '🔒',
  task: '🎯',
  default: '📋',
};

function truncateText(text, maxChars = 80) {
  const trimmed = String(text || '').trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars - 1) + '…';
}

function formatRelativeTime(ts) {
  const now = Date.now();
  const then = new Date(ts).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function kindIcon(kind) {
  const normalized = String(kind || '').trim().toLowerCase();
  return KIND_ICONS[normalized] || KIND_ICONS.default;
}

/**
 * Render an activity timeline from recent memo events.
 *
 * Calls listMemoEvents to get recent events and renders each with:
 *  - type icon (memo/pin/etc)
 *  - relative time (e.g. "5m ago")
 *  - truncated text (first 80 chars)
 *
 * Returns an array of rendered strings.
 */
export async function renderActivityTimeline({ rootDir, limit = 10 }) {
  const events = await listMemoEvents(rootDir, { limit });

  return events.map((event) => {
    const icon = kindIcon(event.kind);
    const time = formatRelativeTime(event.ts);
    const text = truncateText(event.text);
    return `${icon} ${time} ${text}`;
  });
}

/**
 * CLI runner for session start (activity timeline) subcommand.
 * Renders recent events and prints to stdout.
 */
export async function runSessionStartTimeline(options, { rootDir = process.cwd(), stdout = process.stdout } = {}) {
  const limit = options.limit || 10;
  const lines = await renderActivityTimeline({ rootDir, limit });

  if (options.json || options.format === 'json') {
    stdout.write(`${JSON.stringify(lines, null, 2)}\n`);
  } else {
    if (lines.length === 0) {
      stdout.write('No recent activity.\n');
    } else {
      for (const line of lines) {
        stdout.write(`${line}\n`);
      }
    }
  }

  return { exitCode: 0, lines };
}
