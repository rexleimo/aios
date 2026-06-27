/* 中文注释：读取 hourly.jsonl，按查看者时区重新分桶，支持 --timezone Asia/Shanghai 和 --date 筛选。
   纯 JS + JSONL，使用 Intl.DateTimeFormat 做时区转换。 */

import fs from 'node:fs';

import { auditHourlyPath } from './aggregate.mjs';
import { normalizeAuditRecord, utcDateHourFromTs } from './schema.mjs';

/* 中文注释：读取 hourly.jsonl，返回聚合记录数组。 */
function readHourlyRecords(workspaceRoot) {
  const filePath = auditHourlyPath(workspaceRoot);
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/* 中文注释：用 Intl.DateTimeFormat 把 UTC 日期+小时转成目标时区的 local date+hour。 */
function convertUtcToTimezone(dateUtc, hourUtc, timezone) {
  // Construct an ISO-ish timestamp: "2026-06-27T13:00:00Z"
  const iso = `${dateUtc}T${hourUtc}:00:00Z`;
  const date = new Date(iso);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  // en-CA format: "2026-06-27, 21:00" or similar
  const parts = formatter.formatToParts(date);
  let year = '', month = '', day = '', hour = '';
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
    if (part.type === 'hour') hour = part.value;
  }
  return {
    local_date: `${year}-${month}-${day}`,
    local_hour: hour.padStart(2, '0'),
  };
}

/* 中文注释：主查询函数。timezone 默认 UTC。date 可选，格式 YYYY-MM-DD（按 local date 过滤）。 */
export function runAuditQuery({ workspaceRoot = process.cwd(), timezone = 'UTC', date = '', json = false } = {}) {
  const records = readHourlyRecords(workspaceRoot);
  if (records.length === 0) {
    return { ok: true, buckets: [], timezone, date, message: 'No audit data yet. Run aggregation first.' };
  }

  // Re-bucket by viewer timezone
  const tzBuckets = new Map();

  for (const rec of records) {
    const { local_date, local_hour } = convertUtcToTimezone(rec.date_utc, rec.hour_utc, timezone);
    const key = `${local_date}|${local_hour}|${rec.agent_id}`;

    let bucket = tzBuckets.get(key);
    if (!bucket) {
      bucket = {
        local_date,
        local_hour,
        agent_id: rec.agent_id,
        tool_calls: 0,
        total_raw_bytes: 0,
        total_compact_bytes: 0,
        total_saved_bytes: 0,
        total_raw_tokens_estimate: 0,
        total_compact_tokens_estimate: 0,
        ratios: [],
      };
      tzBuckets.set(key, bucket);
    }

    bucket.tool_calls += rec.tool_calls;
    bucket.total_raw_bytes += rec.total_raw_bytes;
    bucket.total_compact_bytes += rec.total_compact_bytes;
    bucket.total_saved_bytes += rec.total_saved_bytes;
    bucket.total_raw_tokens_estimate += rec.total_raw_tokens_estimate;
    bucket.total_compact_tokens_estimate += rec.total_compact_tokens_estimate;
    if (rec.avg_saving_ratio > 0) bucket.ratios.push(rec.avg_saving_ratio);
  }

  // Build result list
  let buckets = [...tzBuckets.values()].map((bucket) => {
    const avgRatio = bucket.ratios.length > 0
      ? Number((bucket.ratios.reduce((a, b) => a + b, 0) / bucket.ratios.length).toFixed(4))
      : 0;

    return normalizeAuditRecord({
      date_utc: bucket.local_date,
      hour_utc: bucket.local_hour,
      agent_id: bucket.agent_id,
      tool_calls: bucket.tool_calls,
      total_raw_bytes: bucket.total_raw_bytes,
      total_compact_bytes: bucket.total_compact_bytes,
      total_saved_bytes: bucket.total_saved_bytes,
      avg_saving_ratio: avgRatio,
      total_raw_tokens_estimate: bucket.total_raw_tokens_estimate,
      total_compact_tokens_estimate: bucket.total_compact_tokens_estimate,
    });
  });

  // Sort by local_date, local_hour, agent_id
  buckets.sort((a, b) => {
    const da = `${a.date_utc}|${a.hour_utc}|${a.agent_id}`;
    const db = `${b.date_utc}|${b.hour_utc}|${b.agent_id}`;
    return da < db ? -1 : da > db ? 1 : 0;
  });

  // Filter by local date if provided
  if (date) {
    buckets = buckets.filter((b) => b.date_utc === date);
  }

  return {
    ok: true,
    timezone,
    date: date || 'all',
    bucket_count: buckets.length,
    buckets,
  };
}
