import { readdir, readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';

import { resolveAiosStateRoot } from '../aios/state-root.mjs';
import { metricsSessionPath } from './metrics/metrics-sink.mjs';

function metricsRoot(workspaceRoot) {
  return path.join(resolveAiosStateRoot(workspaceRoot), 'interception', 'metrics');
}

async function listMetricFiles(workspaceRoot) {
  const dir = metricsRoot(workspaceRoot);
  if (!fs.existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => {
      const filePath = path.join(dir, entry.name);
      return {
        path: filePath,
        sessionId: entry.name.replace(/\.jsonl$/u, ''),
        mtimeMs: fs.statSync(filePath).mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export async function resolveMetricsFile(workspaceRoot, { session = '', latest = false } = {}) {
  const requested = String(session || '').trim();
  if (requested) {
    const filePath = metricsSessionPath(workspaceRoot, requested);
    return fs.existsSync(filePath) ? { path: filePath, sessionId: requested } : null;
  }
  const files = await listMetricFiles(workspaceRoot);
  if (latest && files.length > 0) return files[0];
  if (files.length > 0) return files[0];
  return null;
}

function summarize(records, limit = 10) {
  const recent = records.slice(-limit);
  const counts = {};
  for (const record of records) {
    const key = String(record.event_kind || 'unknown');
    counts[key] = (counts[key] || 0) + 1;
  }
  return {
    total_records: records.length,
    latest_ts: records.length > 0 ? records[records.length - 1].ts : '',
    counts,
    recent,
  };
}

function formatRecordLine(record) {
  const ratio = Number.isFinite(record.saving_ratio) ? Number(record.saving_ratio).toFixed(4) : '0.0000';
  return [
    record.event_kind || 'unknown',
    `client=${record.client_id || record.host || 'unknown'}`,
    `host=${record.host_level || '-'}`,
    `strategy=${record.strategy || 'unknown'}`,
    `raw=${record.raw_bytes ?? 0}`,
    `compact=${record.compact_bytes ?? 0}`,
    `saved=${record.saved_bytes ?? 0}`,
    `ratio=${ratio}`,
    `ref=${record.ref_id || 'inline'}`,
  ].join(' ');
}

export async function runInterceptionTail(options = {}, { rootDir = process.cwd(), io = console } = {}) {
  const workspaceRoot = options.workspaceRoot || rootDir;
  const file = await resolveMetricsFile(workspaceRoot, { session: options.session, latest: options.latest });
  if (!file) {
    const result = { ok: false, exitCode: 1, error: 'No interception metrics session found' };
    if (options.json) {
      io.log(JSON.stringify(result, null, 2));
    } else {
      io.log(result.error);
    }
    return result;
  }

  const text = await readFile(file.path, 'utf8');
  const records = text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  const summary = summarize(records, options.limit || 10);
  const result = {
    ok: true,
    exitCode: 0,
    session_id: file.sessionId,
    file_path: file.path,
    ...summary,
  };

  if (options.json) {
    io.log(JSON.stringify(result, null, 2));
  } else {
    io.log(`AIOS Interception Tail`);
    io.log(`session=${result.session_id}`);
    io.log(`file=${result.file_path}`);
    io.log(`records=${result.total_records}`);
    io.log(`latest_ts=${result.latest_ts}`);
    io.log(`counts=${JSON.stringify(result.counts)}`);
    for (const record of result.recent) {
      io.log(formatRecordLine(record));
    }
  }

  return result;
}
