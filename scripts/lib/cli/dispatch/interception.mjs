/* 中文注释：interception 分发独立成命令处理器，避免顶层 dispatch 继续承载业务细节。 */
import { runInterceptionDoctor } from '../../interception/doctor.mjs';
import { runInterceptionProof } from '../../interception/proof.mjs';
import { runInterceptionRewrite } from '../../interception/rewrite.mjs';
import { runInterceptionTail } from '../../interception/tail.mjs';

/* 中文注释：proof 只验证链路；doctor/mcp-migrate 复用同一修复实现，防止修复逻辑分叉。 */
export async function runInterceptionCommand(parsed, { rootDir, workspaceRoot }) {
  if (parsed.options.subcommand === 'proof') {
    return runInterceptionProof(parsed.options, { rootDir: workspaceRoot });
  }
  if (parsed.options.subcommand === 'tail') {
    return runInterceptionTail(parsed.options, { rootDir: workspaceRoot });
  }
  if (parsed.options.subcommand === 'rewrite') {
    return runInterceptionRewrite({ ...parsed.options, rootDir });
  }
  if (parsed.options.subcommand === 'audit') {
    const { runAuditAggregation } = await import('../../interception/audit/aggregate.mjs');
    const { runAuditQuery } = await import('../../interception/audit/query.mjs');

    /* 中文注释：audit 子命令先聚合再查询；聚合是从原始 metrics JSONL 生成 hourly.jsonl。 */
    const aggResult = await runAuditAggregation({ workspaceRoot });
    const queryResult = runAuditQuery({
      workspaceRoot,
      timezone: parsed.options.timezone,
      date: parsed.options.date,
      json: parsed.options.json,
    });

    const result = {
      ok: true,
      aggregation: aggResult,
      query: queryResult,
    };

    if (parsed.options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      /* 中文注释：文本输出格式：逐桶打印，方便运维快速扫描。 */
      console.log('AIOS Interception Audit');
      console.log('------------------------');
      console.log(`timezone=${queryResult.timezone}  date=${queryResult.date}  buckets=${queryResult.bucket_count}`);
      for (const bucket of queryResult.buckets) {
        console.log(`  ${bucket.date_utc} ${bucket.hour_utc}:00  agent=${bucket.agent_id}  calls=${bucket.tool_calls}  raw=${bucket.total_raw_bytes}  compact=${bucket.total_compact_bytes}  saved=${bucket.total_saved_bytes}  ratio=${bucket.avg_saving_ratio}  raw_tokens=${bucket.total_raw_tokens_estimate}  compact_tokens=${bucket.total_compact_tokens_estimate}`);
      }
      if (queryResult.buckets.length === 0) {
        console.log(queryResult.message || 'No audit data for the selected date/timezone.');
      }
    }

    return result;
  }

  if (parsed.options.subcommand === 'doctor' || parsed.options.subcommand === 'mcp-migrate') {
    return runInterceptionDoctor({
      ...parsed.options,
      fix: parsed.options.subcommand === 'mcp-migrate' ? true : parsed.options.fix,
    }, {
      rootDir,
      projectRoot: workspaceRoot,
    });
  }

  return { exitCode: 1 };
}
