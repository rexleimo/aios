/* 中文注释：Interception audit 回归测试覆盖聚合、时区查询和 CLI 入口。 */
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { normalizeAuditRecord, utcDateHourFromTs, hourKeyFromRecord, AUDIT_RECORD_FIELDS } from '../lib/interception/audit/schema.mjs';
import { runAuditAggregation, auditHourlyPath } from '../lib/interception/audit/aggregate.mjs';
import { runAuditQuery } from '../lib/interception/audit/query.mjs';

/* 中文注释：测试用临时 workspace，模拟 metrics 目录结构。 */
async function makeTempWorkspace() {
  const tmp = await mkdir(path.join(os.tmpdir(), `aios-audit-test-${Date.now()}`), { recursive: true });
  const aiosDir = path.join(tmp, '.aios', 'interception', 'metrics');
  await mkdir(aiosDir, { recursive: true });
  return tmp;
}

/* 中文注释：在临时 workspace 里写一个 session metrics JSONL 文件。 */
async function writeMetricsSession(workspaceRoot, sessionId, records) {
  const metricsDir = path.join(workspaceRoot, '.aios', 'interception', 'metrics');
  await mkdir(metricsDir, { recursive: true });
  const filePath = path.join(metricsDir, `${sessionId}.jsonl`);
  const lines = records.map((r) => JSON.stringify(r));
  await writeFile(filePath, lines.join('\n') + '\n', 'utf8');
}

/* 中文注释：构造一个合理的 metrics 记录。 */
function makeMetricsRecord({ ts, agent_id, raw_bytes, compact_bytes, saved_bytes, saving_ratio }) {
  return {
    ts,
    agent_id: agent_id || 'default',
    raw_bytes: raw_bytes || 5000,
    compact_bytes: compact_bytes || 1000,
    saved_bytes: saved_bytes || 4000,
    saving_ratio: saving_ratio || 0.8,
    raw_tokens_estimate: Math.round((raw_bytes || 5000) / 4),
    compact_tokens_estimate: Math.round((compact_bytes || 1000) / 4),
  };
}

/* --- Schema tests --- */

test('normalizeAuditRecord fills all fields with defaults', () => {
  const rec = normalizeAuditRecord({});
  for (const field of AUDIT_RECORD_FIELDS) {
    assert.ok(rec[field] !== undefined, `field ${field} should not be undefined`);
  }
  assert.equal(rec.agent_id, 'default');
  assert.equal(rec.tool_calls, 0);
  assert.equal(rec.total_raw_bytes, 0);
});

test('normalizeAuditRecord preserves provided values', () => {
  const rec = normalizeAuditRecord({
    date_utc: '2026-06-27',
    hour_utc: '13',
    agent_id: 'codex',
    tool_calls: 15,
    total_raw_bytes: 45000,
    total_compact_bytes: 5000,
    total_saved_bytes: 40000,
    avg_saving_ratio: 0.889,
  });
  assert.equal(rec.date_utc, '2026-06-27');
  assert.equal(rec.hour_utc, '13');
  assert.equal(rec.agent_id, 'codex');
  assert.equal(rec.tool_calls, 15);
  assert.equal(rec.total_raw_bytes, 45000);
  assert.equal(rec.avg_saving_ratio, 0.889);
});

test('utcDateHourFromTs extracts UTC date and hour from ISO timestamp', () => {
  const { date_utc, hour_utc } = utcDateHourFromTs('2026-06-27T13:45:00.000Z');
  assert.equal(date_utc, '2026-06-27');
  assert.equal(hour_utc, '13');
});

test('utcDateHourFromTs handles midnight UTC correctly', () => {
  const { date_utc, hour_utc } = utcDateHourFromTs('2026-06-27T00:15:00.000Z');
  assert.equal(date_utc, '2026-06-27');
  assert.equal(hour_utc, '00');
});

test('hourKeyFromRecord produces deterministic composite key', () => {
  const rec = normalizeAuditRecord({ date_utc: '2026-06-27', hour_utc: '13', agent_id: 'codex' });
  assert.equal(hourKeyFromRecord(rec), '2026-06-27|13|codex');
});

/* --- Aggregation tests --- */

test('runAuditAggregation reads metrics JSONL and writes hourly.jsonl', async () => {
  const workspaceRoot = await makeTempWorkspace();
  try {
    await writeMetricsSession(workspaceRoot, 'session-1', [
      makeMetricsRecord({ ts: '2026-06-27T13:10:00.000Z', agent_id: 'codex', raw_bytes: 8000, compact_bytes: 2000, saved_bytes: 6000, saving_ratio: 0.75 }),
      makeMetricsRecord({ ts: '2026-06-27T13:30:00.000Z', agent_id: 'codex', raw_bytes: 4000, compact_bytes: 1000, saved_bytes: 3000, saving_ratio: 0.75 }),
      makeMetricsRecord({ ts: '2026-06-27T14:05:00.000Z', agent_id: 'default', raw_bytes: 6000, compact_bytes: 1500, saved_bytes: 4500, saving_ratio: 0.75 }),
    ]);

    const result = await runAuditAggregation({ workspaceRoot });
    assert.equal(result.ok, true);
    assert.equal(result.total_buckets, 2); // 13:codex and 14:default

    // Verify hourly.jsonl was written
    const outputPath = auditHourlyPath(workspaceRoot);
    assert.ok(fs.existsSync(outputPath));

    const content = fs.readFileSync(outputPath, 'utf8');
    const records = content.split(/\r?\n/).filter(Boolean).map(JSON.parse);
    assert.equal(records.length, 2);

    // Find the 13:codex bucket
    const codexBucket = records.find((r) => r.hour_utc === '13' && r.agent_id === 'codex');
    assert.ok(codexBucket);
    assert.equal(codexBucket.tool_calls, 2);
    assert.equal(codexBucket.total_raw_bytes, 12000);
    assert.equal(codexBucket.total_compact_bytes, 3000);
    assert.equal(codexBucket.total_saved_bytes, 9000);
    assert.equal(codexBucket.avg_saving_ratio, 0.75);

    // Find the 14:default bucket
    const defaultBucket = records.find((r) => r.hour_utc === '14' && r.agent_id === 'default');
    assert.ok(defaultBucket);
    assert.equal(defaultBucket.tool_calls, 1);
    assert.equal(defaultBucket.total_raw_bytes, 6000);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('runAuditAggregation handles empty metrics directory', async () => {
  const workspaceRoot = await makeTempWorkspace();
  try {
    const result = await runAuditAggregation({ workspaceRoot });
    assert.equal(result.ok, true);
    assert.equal(result.total_buckets, 0);

    const outputPath = auditHourlyPath(workspaceRoot);
    assert.ok(fs.existsSync(outputPath));
    const content = fs.readFileSync(outputPath, 'utf8');
    assert.equal(content, '');
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('runAuditAggregation groups by agent_id correctly', async () => {
  const workspaceRoot = await makeTempWorkspace();
  try {
    await writeMetricsSession(workspaceRoot, 'session-multi', [
      makeMetricsRecord({ ts: '2026-06-27T09:00:00.000Z', agent_id: 'agent-a', raw_bytes: 1000, compact_bytes: 200, saved_bytes: 800, saving_ratio: 0.8 }),
      makeMetricsRecord({ ts: '2026-06-27T09:00:00.000Z', agent_id: 'agent-b', raw_bytes: 2000, compact_bytes: 400, saved_bytes: 1600, saving_ratio: 0.8 }),
      makeMetricsRecord({ ts: '2026-06-27T09:00:00.000Z', agent_id: 'agent-a', raw_bytes: 500, compact_bytes: 100, saved_bytes: 400, saving_ratio: 0.8 }),
    ]);

    const result = await runAuditAggregation({ workspaceRoot });
    assert.equal(result.ok, true);
    assert.equal(result.total_buckets, 2); // agent-a and agent-b at hour 09

    const outputPath = auditHourlyPath(workspaceRoot);
    const records = fs.readFileSync(outputPath, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);

    const agentA = records.find((r) => r.agent_id === 'agent-a');
    assert.ok(agentA);
    assert.equal(agentA.tool_calls, 2);
    assert.equal(agentA.total_raw_bytes, 1500);

    const agentB = records.find((r) => r.agent_id === 'agent-b');
    assert.ok(agentB);
    assert.equal(agentB.tool_calls, 1);
    assert.equal(agentB.total_raw_bytes, 2000);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

/* --- Query / timezone tests --- */

test('runAuditQuery returns UTC buckets by default', async () => {
  const workspaceRoot = await makeTempWorkspace();
  try {
    await writeMetricsSession(workspaceRoot, 'session-q1', [
      makeMetricsRecord({ ts: '2026-06-27T13:00:00.000Z', agent_id: 'codex', raw_bytes: 8000, compact_bytes: 2000, saved_bytes: 6000, saving_ratio: 0.75 }),
    ]);
    await runAuditAggregation({ workspaceRoot });

    const queryResult = runAuditQuery({ workspaceRoot });
    assert.equal(queryResult.ok, true);
    assert.equal(queryResult.timezone, 'UTC');
    assert.equal(queryResult.bucket_count, 1);

    const bucket = queryResult.buckets[0];
    assert.equal(bucket.date_utc, '2026-06-27');
    assert.equal(bucket.hour_utc, '13');
    assert.equal(bucket.agent_id, 'codex');
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('runAuditQuery re-buckets into a different timezone (Asia/Shanghai +8)', async () => {
  const workspaceRoot = await makeTempWorkspace();
  try {
    // 2026-06-27T13:00 UTC = 2026-06-27T21:00 in Asia/Shanghai (+8)
    await writeMetricsSession(workspaceRoot, 'session-sh', [
      makeMetricsRecord({ ts: '2026-06-27T13:00:00.000Z', agent_id: 'codex', raw_bytes: 8000, compact_bytes: 2000, saved_bytes: 6000, saving_ratio: 0.75 }),
    ]);
    await runAuditAggregation({ workspaceRoot });

    const queryResult = runAuditQuery({ workspaceRoot, timezone: 'Asia/Shanghai' });
    assert.equal(queryResult.ok, true);
    assert.equal(queryResult.timezone, 'Asia/Shanghai');
    assert.equal(queryResult.bucket_count, 1);

    const bucket = queryResult.buckets[0];
    // 13:00 UTC + 8h = 21:00 Shanghai
    assert.equal(bucket.hour_utc, '21');
    assert.equal(bucket.date_utc, '2026-06-27');
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('runAuditQuery re-buckets across day boundary (America/New_York -5)', async () => {
  const workspaceRoot = await makeTempWorkspace();
  try {
    // 2026-06-27T03:00 UTC = 2026-06-26T22:00 in America/New_York (-5, EDT -4)
    // Actually EDT is UTC-4, so 03:00 UTC = 23:00 EDT on 2026-06-26
    // Let's use a time that clearly crosses: 02:00 UTC = 22:00 EDT (previous day)
    await writeMetricsSession(workspaceRoot, 'session-ny', [
      makeMetricsRecord({ ts: '2026-06-27T02:00:00.000Z', agent_id: 'default', raw_bytes: 4000, compact_bytes: 1000, saved_bytes: 3000, saving_ratio: 0.75 }),
    ]);
    await runAuditAggregation({ workspaceRoot });

    const queryResult = runAuditQuery({ workspaceRoot, timezone: 'America/New_York' });
    assert.equal(queryResult.ok, true);
    assert.equal(queryResult.bucket_count, 1);

    const bucket = queryResult.buckets[0];
    // In EDT (UTC-4), 02:00 UTC = 22:00 local on June 26
    assert.equal(bucket.date_utc, '2026-06-26');
    assert.equal(bucket.hour_utc, '22');
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('runAuditQuery filters by date', async () => {
  const workspaceRoot = await makeTempWorkspace();
  try {
    await writeMetricsSession(workspaceRoot, 'session-filter', [
      makeMetricsRecord({ ts: '2026-06-27T09:00:00.000Z', agent_id: 'a', raw_bytes: 1000, compact_bytes: 200, saved_bytes: 800, saving_ratio: 0.8 }),
      makeMetricsRecord({ ts: '2026-06-27T10:00:00.000Z', agent_id: 'a', raw_bytes: 2000, compact_bytes: 400, saved_bytes: 1600, saving_ratio: 0.8 }),
      makeMetricsRecord({ ts: '2026-06-28T09:00:00.000Z', agent_id: 'a', raw_bytes: 3000, compact_bytes: 600, saved_bytes: 2400, saving_ratio: 0.8 }),
    ]);
    await runAuditAggregation({ workspaceRoot });

    // Filter to June 27 only
    const queryResult = runAuditQuery({ workspaceRoot, timezone: 'UTC', date: '2026-06-27' });
    assert.equal(queryResult.ok, true);
    assert.equal(queryResult.bucket_count, 2); // 09:a and 10:a
    for (const bucket of queryResult.buckets) {
      assert.equal(bucket.date_utc, '2026-06-27');
    }

    // All dates
    const allResult = runAuditQuery({ workspaceRoot, timezone: 'UTC' });
    assert.equal(allResult.bucket_count, 3);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('runAuditQuery returns empty buckets for non-matching date', async () => {
  const workspaceRoot = await makeTempWorkspace();
  try {
    await writeMetricsSession(workspaceRoot, 'session-nomatch', [
      makeMetricsRecord({ ts: '2026-06-27T09:00:00.000Z', agent_id: 'a', raw_bytes: 1000, compact_bytes: 200, saved_bytes: 800, saving_ratio: 0.8 }),
    ]);
    await runAuditAggregation({ workspaceRoot });

    const queryResult = runAuditQuery({ workspaceRoot, timezone: 'UTC', date: '2025-01-01' });
    assert.equal(queryResult.ok, true);
    assert.equal(queryResult.bucket_count, 0);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('runAuditQuery handles missing hourly.jsonl gracefully', async () => {
  const workspaceRoot = await makeTempWorkspace();
  try {
    // No aggregation run, no hourly.jsonl
    const queryResult = runAuditQuery({ workspaceRoot });
    assert.equal(queryResult.ok, true);
    assert.equal(queryResult.buckets.length, 0);
    assert.ok(queryResult.message);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('runAuditQuery merges multiple UTC hours into one local hour when timezone shifts', async () => {
  const workspaceRoot = await makeTempWorkspace();
  try {
    // In UTC+8: 13:00 UTC = 21:00 local, 14:00 UTC = 22:00 local
    await writeMetricsSession(workspaceRoot, 'session-merge', [
      makeMetricsRecord({ ts: '2026-06-27T13:00:00.000Z', agent_id: 'codex', raw_bytes: 8000, compact_bytes: 2000, saved_bytes: 6000, saving_ratio: 0.75 }),
      makeMetricsRecord({ ts: '2026-06-27T14:00:00.000Z', agent_id: 'codex', raw_bytes: 4000, compact_bytes: 1000, saved_bytes: 3000, saving_ratio: 0.75 }),
    ]);
    await runAuditAggregation({ workspaceRoot });

    const queryResult = runAuditQuery({ workspaceRoot, timezone: 'Asia/Shanghai' });
    assert.equal(queryResult.ok, true);
    assert.equal(queryResult.bucket_count, 2); // Two separate local hours

    // 13:00 UTC → 21:00 Shanghai
    const b21 = queryResult.buckets.find((b) => b.hour_utc === '21');
    assert.ok(b21);
    assert.equal(b21.total_raw_bytes, 8000);

    // 14:00 UTC → 22:00 Shanghai
    const b22 = queryResult.buckets.find((b) => b.hour_utc === '22');
    assert.ok(b22);
    assert.equal(b22.total_raw_bytes, 4000);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('audit aggregation across multiple session files', async () => {
  const workspaceRoot = await makeTempWorkspace();
  try {
    await writeMetricsSession(workspaceRoot, 'session-alpha', [
      makeMetricsRecord({ ts: '2026-06-27T09:00:00.000Z', agent_id: 'agent-x', raw_bytes: 3000, compact_bytes: 600, saved_bytes: 2400, saving_ratio: 0.8 }),
    ]);
    await writeMetricsSession(workspaceRoot, 'session-beta', [
      makeMetricsRecord({ ts: '2026-06-27T09:00:00.000Z', agent_id: 'agent-x', raw_bytes: 5000, compact_bytes: 1000, saved_bytes: 4000, saving_ratio: 0.8 }),
    ]);

    const result = await runAuditAggregation({ workspaceRoot });
    assert.equal(result.ok, true);
    assert.equal(result.total_buckets, 1); // Same hour + same agent → one bucket

    const outputPath = auditHourlyPath(workspaceRoot);
    const records = fs.readFileSync(outputPath, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
    assert.equal(records.length, 1);
    assert.equal(records[0].tool_calls, 2);
    assert.equal(records[0].total_raw_bytes, 8000); // 3000 + 5000
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
