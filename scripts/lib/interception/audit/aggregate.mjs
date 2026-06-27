/* 中文注释：读取所有 metrics JSONL 文件，按 (date_utc, hour_utc, agent_id) 聚合，
   输出到 .aios/interception/audit/hourly.jsonl。纯 JS + JSONL，无外部依赖。 */

import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';

import { resolveAiosStateRoot } from '../../aios/state-root.mjs';
import { metricsSessionPath } from '../metrics/metrics-sink.mjs';
import {
  normalizeAuditRecord,
  utcDateHourFromTs,
  hourKeyFromRecord,
} from './schema.mjs';

/* 中文注释：audit 聚合文件路径。 */
export function auditHourlyPath(workspaceRoot) {
  return path.join(resolveAiosStateRoot(workspaceRoot), 'interception', 'audit', 'hourly.jsonl');
}

/* 中文注释：扫描 metrics 目录，找出所有 .jsonl 文件。 */
function findMetricsSessionFiles(metricsDir) {
  if (!fs.existsSync(metricsDir)) return [];
  return fs.readdirSync(metricsDir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => path.join(metricsDir, name));
}

/* 中文注释：读取一个 JSONL 文件，返回解析后的记录数组。 */
function readJsonlLines(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/* 中文注释：主聚合函数——遍历所有 metrics JSONL，按 UTC 小时桶汇总，写 hourly.jsonl。 */
export async function runAuditAggregation({ workspaceRoot } = {}) {
  const metricsDir = path.dirname(metricsSessionPath(workspaceRoot, 'dummy'));
  const sessionFiles = findMetricsSessionFiles(metricsDir);

  // Bucket by hourKey
  const buckets = new Map();

  for (const filePath of sessionFiles) {
    const records = readJsonlLines(filePath);
    for (const rec of records) {
      // Extract agent_id — fallback through several possible field names
      const agentId = rec.agent_id || rec.agentId || 'default';

      const { date_utc, hour_utc } = utcDateHourFromTs(rec.ts || rec.timestamp || new Date().toISOString());
      const key = `${date_utc}|${hour_utc}|${agentId}`;

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          date_utc,
          hour_utc,
          agent_id: agentId,
          tool_calls: 0,
          total_raw_bytes: 0,
          total_compact_bytes: 0,
          total_saved_bytes: 0,
          total_raw_tokens_estimate: 0,
          total_compact_tokens_estimate: 0,
          ratios: [],
        };
        buckets.set(key, bucket);
      }

      bucket.tool_calls += 1;
      bucket.total_raw_bytes += Number(rec.raw_bytes || rec.rawBytes || rec.raw_tokens_estimate || 0);
      bucket.total_compact_bytes += Number(rec.compact_bytes || rec.compactBytes || rec.compact_tokens_estimate || 0);
      bucket.total_saved_bytes += Number(rec.saved_bytes || rec.savedBytes || 0);
      bucket.total_raw_tokens_estimate += Number(rec.raw_tokens_estimate || rec.raw_tokens || 0);
      bucket.total_compact_tokens_estimate += Number(rec.compact_tokens_estimate || rec.compact_tokens || 0);

      const ratio = Number(rec.saving_ratio || rec.savingRatio || 0);
      if (ratio > 0) bucket.ratios.push(ratio);
    }
  }

  // Write aggregate records
  const outputPath = auditHourlyPath(workspaceRoot);
  await mkdir(path.dirname(outputPath), { recursive: true });

  // Sort by date_utc, hour_utc, agent_id for deterministic output
  const sortedKeys = [...buckets.keys()].sort();
  const lines = [];

  for (const key of sortedKeys) {
    const bucket = buckets.get(key);
    const avgRatio = bucket.ratios.length > 0
      ? Number((bucket.ratios.reduce((a, b) => a + b, 0) / bucket.ratios.length).toFixed(4))
      : 0;

    const record = normalizeAuditRecord({
      date_utc: bucket.date_utc,
      hour_utc: bucket.hour_utc,
      agent_id: bucket.agent_id,
      tool_calls: bucket.tool_calls,
      total_raw_bytes: bucket.total_raw_bytes,
      total_compact_bytes: bucket.total_compact_bytes,
      total_saved_bytes: bucket.total_saved_bytes,
      avg_saving_ratio: avgRatio,
      total_raw_tokens_estimate: bucket.total_raw_tokens_estimate,
      total_compact_tokens_estimate: bucket.total_compact_tokens_estimate,
    });
    lines.push(JSON.stringify(record));
  }

  if (lines.length > 0) {
    await writeFile(outputPath, lines.join('\n') + '\n', 'utf8');
  } else {
    // Write empty file so it exists
    await writeFile(outputPath, '', 'utf8');
  }

  return {
    ok: true,
    total_buckets: buckets.size,
    output_file: outputPath,
  };
}

/* 中文注释：快捷追加单条聚合记录（供实时写入场景用，暂未使用）。 */
export async function appendAuditRecord(record, { workspaceRoot } = {}) {
  const outputPath = auditHourlyPath(workspaceRoot);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const normalized = normalizeAuditRecord(record);
  await appendFile(outputPath, JSON.stringify(normalized) + '\n', 'utf8');
}
