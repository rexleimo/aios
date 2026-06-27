/* 中文注释：audit 聚合记录定义 + normalize 函数，保证每个聚合字段都有合法默认值。 */

export const AUDIT_RECORD_FIELDS = [
  'date_utc',
  'hour_utc',
  'agent_id',
  'tool_calls',
  'total_raw_bytes',
  'total_compact_bytes',
  'total_saved_bytes',
  'avg_saving_ratio',
  'total_raw_tokens_estimate',
  'total_compact_tokens_estimate',
];

export const AUDIT_HOUR_KEY_FIELDS = ['date_utc', 'hour_utc', 'agent_id'];

/* 中文注释：normalize 把部分字段或缺失字段统一为安全默认值，防止下游聚合出现 undefined。 */
export function normalizeAuditRecord(partial = {}) {
  const record = {};
  for (const field of AUDIT_RECORD_FIELDS) {
    switch (field) {
      case 'date_utc':
        record[field] = String(partial[field] || '');
        break;
      case 'hour_utc':
        record[field] = String(partial[field] || '');
        break;
      case 'agent_id':
        record[field] = String(partial[field] || 'default');
        break;
      case 'tool_calls':
        record[field] = Number(partial[field] || 0);
        break;
      case 'total_raw_bytes':
        record[field] = Number(partial[field] || 0);
        break;
      case 'total_compact_bytes':
        record[field] = Number(partial[field] || 0);
        break;
      case 'total_saved_bytes':
        record[field] = Number(partial[field] || 0);
        break;
      case 'avg_saving_ratio':
        record[field] = Number(partial[field] || 0);
        break;
      case 'total_raw_tokens_estimate':
        record[field] = Number(partial[field] || 0);
        break;
      case 'total_compact_tokens_estimate':
        record[field] = Number(partial[field] || 0);
        break;
      default:
        record[field] = partial[field];
    }
  }
  return record;
}

/* 中文注释：hourKey 把三字段拼接成聚合桶键，保证同一条 metrics 记录落入唯一桶。 */
export function hourKeyFromRecord(record) {
  return `${record.date_utc}|${record.hour_utc}|${record.agent_id}`;
}

/* 中文注释：从 metrics 记录的 ISO 时间戳提取 UTC 日期和小时。 */
export function utcDateHourFromTs(ts) {
  const date = new Date(ts);
  const dateUtc = date.getUTCFullYear() + '-' +
    String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(date.getUTCDate()).padStart(2, '0');
  const hourUtc = String(date.getUTCHours()).padStart(2, '0');
  return { date_utc: dateUtc, hour_utc: hourUtc };
}
