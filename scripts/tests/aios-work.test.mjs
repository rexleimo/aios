// scripts/tests/aios-work.test.mjs — aios work 命令契约测试
// 覆盖：选项归一化、runtime env 构建、CLI 解析、runWorkCommand 翻译与 dry-run 集成。

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeWorkOptions, buildWorkRuntimeEnv } from '../lib/lifecycle/work/options.mjs';
import { runWorkCommand } from '../lib/lifecycle/work.mjs';
import { parseArgs } from '../lib/cli/parse-args.mjs';

const TEST_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EMPTY_ENV = {};

test('normalizeWorkOptions: work 默认 live 并发调度', () => {
  const opts = normalizeWorkOptions({ taskTitle: 'Ship X' }, EMPTY_ENV);
  assert.equal(opts.taskTitle, 'Ship X');
  assert.equal(opts.executionMode, 'live');
  assert.equal(opts.dispatchMode, 'local');
  assert.equal(opts.clientId, 'codex-cli');
  assert.equal(opts.concurrency, 3);
  assert.equal(opts.blueprint, 'feature');
  assert.equal(opts.format, 'text');
  assert.equal(opts.preflightMode, 'none');
  assert.equal(opts.retryBlocked, false);
  assert.equal(opts.force, false);
});

test('normalizeWorkOptions: --session 默认 auto preflight', () => {
  const opts = normalizeWorkOptions({ taskTitle: 'Ship X', sessionId: 's1' }, EMPTY_ENV);
  assert.equal(opts.preflightMode, 'auto');
});

test('normalizeWorkOptions: --dry-run 显式降级为 dry-run', () => {
  const opts = normalizeWorkOptions({ taskTitle: 'Ship X', dryRun: true }, EMPTY_ENV);
  assert.equal(opts.executionMode, 'dry-run');
});

test('normalizeWorkOptions: --serial 强制并发度 1 且保持 live', () => {
  const opts = normalizeWorkOptions({ taskTitle: 'Ship X', serial: true }, EMPTY_ENV);
  assert.equal(opts.concurrency, 1);
  assert.equal(opts.executionMode, 'live');
});

test('normalizeWorkOptions: --json 映射为 format json', () => {
  const opts = normalizeWorkOptions({ taskTitle: 'Ship X', json: true }, EMPTY_ENV);
  assert.equal(opts.format, 'json');
});

test('normalizeWorkOptions: 客户端来自 env 或 --client', () => {
  assert.equal(normalizeWorkOptions({ taskTitle: 'X', clientId: 'gemini' }, EMPTY_ENV).clientId, 'gemini');
  assert.equal(normalizeWorkOptions({ taskTitle: 'X' }, { AIOS_SUBAGENT_CLIENT: 'claude' }).clientId, 'claude');
});

test('normalizeWorkOptions: 缺任务且无 resume 时拒绝', () => {
  assert.throws(() => normalizeWorkOptions({}, EMPTY_ENV), /task/i);
  assert.throws(() => normalizeWorkOptions({ taskTitle: '  ' }, EMPTY_ENV), /task/i);
});

test('normalizeWorkOptions: --resume 允许无 task（session goal 兜底）', () => {
  const opts = normalizeWorkOptions({ resumeSessionId: 's1' }, EMPTY_ENV);
  assert.equal(opts.resumeSessionId, 's1');
  assert.equal(opts.executionMode, 'live');
});

test('buildWorkRuntimeEnv: live 放行并发环境', () => {
  const opts = normalizeWorkOptions({ taskTitle: 'Ship X' }, EMPTY_ENV);
  const env = buildWorkRuntimeEnv(opts, EMPTY_ENV);
  assert.equal(env.AIOS_EXECUTE_LIVE, '1');
  assert.equal(env.AIOS_MODEL_ROUTER, '1');
  assert.equal(env.AIOS_SUBAGENT_CONCURRENCY, '3');
  assert.equal(env.AIOS_SUBAGENT_CLIENT, 'codex-cli');
});

test('buildWorkRuntimeEnv: dry-run 不放行 live', () => {
  const opts = normalizeWorkOptions({ taskTitle: 'Ship X', dryRun: true }, EMPTY_ENV);
  const env = buildWorkRuntimeEnv(opts, EMPTY_ENV);
  assert.equal(env.AIOS_EXECUTE_LIVE, undefined);
});

test('buildWorkRuntimeEnv: --serial 并发度 1；保留 base env', () => {
  const opts = normalizeWorkOptions({ taskTitle: 'Ship X', serial: true }, EMPTY_ENV);
  const env = buildWorkRuntimeEnv(opts, { MY_BASE: 'keep' });
  assert.equal(env.AIOS_SUBAGENT_CONCURRENCY, '1');
  assert.equal(env.MY_BASE, 'keep');
});

test('parseArgs: work 命令可解析且默认 live', () => {
  const parsed = parseArgs(['work', '--task', 'Ship X']);
  assert.equal(parsed.command, 'work');
  assert.equal(parsed.options.taskTitle, 'Ship X');
  assert.equal(parsed.options.executionMode, 'live');
  assert.equal(parsed.options.dispatchMode, 'local');
});

test('parseArgs: work 选项映射', () => {
  const parsed = parseArgs([
    'work', '--task', 'Ship X', '--client', 'gemini', '--concurrency', '5',
    '--serial', '--dry-run', '--json', '--session', 's1',
  ]);
  assert.equal(parsed.options.clientId, 'gemini');
  assert.equal(parsed.options.concurrency, 1); // --serial 优先
  assert.equal(parsed.options.executionMode, 'dry-run');
  assert.equal(parsed.options.format, 'json');
  assert.equal(parsed.options.sessionId, 's1');
});

test('parseArgs: work 位置参数作为任务标题（team 同款 UX）', () => {
  const parsed = parseArgs(['work', '修复认证 bug']);
  assert.equal(parsed.options.taskTitle, '修复认证 bug');
});

test('parseArgs: work --help 返回 help 模式', () => {
  const parsed = parseArgs(['work', '--help']);
  assert.equal(parsed.mode, 'help');
  assert.equal(parsed.command, 'work');
});

test('runWorkCommand: 把 work 选项翻译给 orchestrate 并注入 live env', async () => {
  let called = null;
  const result = await runWorkCommand({ taskTitle: 'Ship X' }, {
    rootDir: TEST_ROOT,
    env: EMPTY_ENV,
    orchestrateRunner: async (args, ctx) => {
      called = { args, ctx };
      return { exitCode: 0 };
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(called.args.taskTitle, 'Ship X');
  assert.equal(called.args.dispatchMode, 'local');
  assert.equal(called.args.executionMode, 'live');
  assert.equal(called.args.preflightMode, 'none');
  assert.equal(called.ctx.env.AIOS_EXECUTE_LIVE, '1');
  assert.equal(called.ctx.env.AIOS_SUBAGENT_CONCURRENCY, '3');
});

test('runWorkCommand: dry-run 翻译为 dry-run 且不放行 live', async () => {
  let called = null;
  await runWorkCommand({ taskTitle: 'Ship X', dryRun: true }, {
    rootDir: TEST_ROOT,
    env: EMPTY_ENV,
    orchestrateRunner: async (args, ctx) => {
      called = { args, ctx };
      return { exitCode: 0 };
    },
  });
  assert.equal(called.args.executionMode, 'dry-run');
  assert.equal(called.ctx.env.AIOS_EXECUTE_LIVE, undefined);
});

test('runWorkCommand: 真实 dry-run 集成（零成本预览）', async () => {
  const result = await runWorkCommand({ taskTitle: 'Ship X', dryRun: true }, {
    rootDir: TEST_ROOT,
    env: { ...process.env },
  });
  assert.equal(result.exitCode, 0);
  const report = result.report;
  assert.ok(report, 'dry-run 必须产出 orchestration report');
  assert.equal(report.taskTitle, 'Ship X');
  assert.equal(report.dispatchRun?.mode, 'dry-run');
  assert.ok(Array.isArray(report.dispatchPlan?.jobs) || Array.isArray(report.workItems));
});
