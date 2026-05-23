import { workspaceMemorySessionId } from '../workspace-memory.mjs';
import { workspaceProjectName } from './shared.mjs';

export function getStorageAvailability(status, storageName) {
  const available = status?.available && typeof status.available === 'object' ? status.available : {};
  const entry = available[storageName];
  if (!entry || typeof entry !== 'object') return {};
  return entry;
}

function formatCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? ` records=${count}` : '';
}

export function printMemoStorageStatus(io, status = {}) {
  const active = String(status.active || 'file');
  const supported = Array.isArray(status.supported) && status.supported.length > 0
    ? status.supported
    : ['split', 'file'];
  io.log('Memo storage status');
  io.log(`Active: ${active}`);
  io.log(`Supported: ${supported.join(', ')}`);
  for (const name of supported) {
    const availability = getStorageAvailability(status, name);
    const exists = availability.exists === true ? 'exists' : 'missing';
    io.log(`- ${name}: ${exists}${formatCount(availability.records ?? availability.count ?? availability.eventCount)}`);
  }
}

export function printMemoDoctorReport(io, report = {}) {
  const checks = Array.isArray(report.checks) ? report.checks : [];
  io.log(`Memo storage doctor: ${report.ok === false ? 'error' : 'ok'}`);
  if (checks.length === 0) return;
  for (const check of checks) {
    const id = String(check?.id || 'check');
    const status = String(check?.status || (check?.ok === false ? 'error' : 'ok'));
    const message = String(check?.message || check?.summary || check?.detail || '').trim();
    io.log(`- ${id}: ${status}${message ? ` - ${message}` : ''}`);
  }
}

function scoreMemoMatch(row, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (Number.isFinite(row?.matchScore)) return Number(row.matchScore);
  if (!normalizedQuery) return 1;
  const text = String(row?.text || '').toLowerCase();
  if (!text) return 0;
  if (text.includes(normalizedQuery)) return 1;
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 1;
  const hits = tokens.filter((token) => text.includes(token)).length;
  return hits / tokens.length;
}

export function memoRecordToRecallRow(row, { workspaceRoot, space, query, highlightLimit }) {
  const text = String(row?.text || '').replace(/\s+/g, ' ').trim();
  const score = scoreMemoMatch(row, query);
  const highlights = text
    ? [{
        label: 'memo',
        text,
        score,
      }]
    : [];
  const refs = Array.isArray(row?.refs) ? row.refs.filter(Boolean).slice(0, Math.max(0, highlightLimit - highlights.length)) : [];
  for (const ref of refs) {
    highlights.push({ label: 'ref', text: `#${ref}`, score });
  }
  return {
    status: 'running',
    sessionId: workspaceMemorySessionId(space),
    project: workspaceProjectName(workspaceRoot),
    updatedAt: String(row?.ts || row?.timestamp || ''),
    goal: `Workspace memory space "${space}"`,
    summary: text,
    matchScore: score,
    highlights: highlights.slice(0, highlightLimit),
  };
}

function formatRefs(refs = []) {
  if (!Array.isArray(refs) || refs.length === 0) return '';
  const tokens = refs
    .map((ref) => String(ref || '').trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((ref) => `#${ref}`);
  return tokens.length > 0 ? ` ${tokens.join(' ')}` : '';
}

export function renderMemoRow(row) {
  const ts = row?.ts ? String(row.ts) : '';
  const eventId = row?.eventId ? String(row.eventId) : '';
  const text = row?.text ? String(row.text).replace(/\s+/g, ' ').trim() : '';
  const refsLabel = formatRefs(row?.refs || []);
  const idLabel = eventId ? ` (${eventId})` : '';
  return `- [${ts}]${idLabel}${refsLabel}: ${text}`;
}

export function renderRecallRow(row, index) {
  const rank = Number.isFinite(index) ? index + 1 : 1;
  const score = Number.isFinite(row?.matchScore) ? Number(row.matchScore).toFixed(4) : '0.0000';
  const status = String(row?.status || 'running');
  const sessionId = String(row?.sessionId || '');
  const project = String(row?.project || '');
  const updatedAt = String(row?.updatedAt || '');
  const goal = String(row?.goal || '').replace(/\s+/g, ' ').trim();
  const summary = String(row?.summary || '').replace(/\s+/g, ' ').trim();
  const highlights = Array.isArray(row?.highlights) ? row.highlights : [];

  const lines = [
    `${rank}. [${status}] ${sessionId} score=${score}${project ? ` project=${project}` : ''}${updatedAt ? ` updated=${updatedAt}` : ''}`,
  ];
  if (goal) {
    lines.push(`   goal: ${goal}`);
  }
  if (summary) {
    lines.push(`   summary: ${summary}`);
  }
  if (highlights.length > 0) {
    lines.push('   highlights:');
    for (const highlight of highlights) {
      const label = String(highlight?.label || '');
      const text = String(highlight?.text || '').replace(/\s+/g, ' ').trim();
      const itemScore = Number.isFinite(highlight?.score) ? Number(highlight.score).toFixed(4) : '0.0000';
      lines.push(`   - [${label}] (score=${itemScore}) ${text}`);
    }
  }
  return lines.join('\n');
}
