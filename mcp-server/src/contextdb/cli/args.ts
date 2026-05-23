import path from 'node:path';
import { promises as fs } from 'node:fs';
import { resolveWorkspaceRoot, type EventTurnEnvelope } from '../core.js';

export type Options = Record<string, string | boolean>;
export type VerificationResultOption = 'unknown' | 'passed' | 'failed' | 'partial';

const VERIFICATION_RESULTS = new Set(['unknown', 'passed', 'failed', 'partial']);

export function usage(): string {
  return [
    'Filesystem Context DB CLI',
    '',
    'Usage:',
    '  contextdb init [--workspace <path>]',
    '  contextdb session:new --agent <name> --project <name> --goal <text> [--tags a,b]',
    '  contextdb session:latest --agent <name> [--project <name>]',
    '  contextdb event:add --session <id> --role <user|assistant|tool|system> (--text <text> | --text-file <path>) [--kind <kind>] [--refs a,b] [--turn-id <id>] [--parent-turn-id <id>] [--turn-type main|side|system-maintenance|verification] [--environment <label>] [--work-item-refs a,b] [--next-state-refs a,b] [--hindsight-status pending|evaluated|na|failed] [--outcome success|correction|retry-needed|ambiguous|unknown]',
    '  contextdb checkpoint --session <id> --summary <text> [--status running|blocked|done] [--next a|b] [--artifacts a|b] [--verify-result unknown|passed|failed|partial] [--retry-count n] [--failure-category <label>] [--elapsed-ms n] [--cost-usd n]',
    '  contextdb context:pack --session <id> [--limit 30] [--token-budget 1200] [--token-strategy legacy|balanced|aggressive] [--recall smart|tail] [--kinds prompt,response,error] [--refs a,b] [--no-dedupe] [--out .aios/context-db/exports/<id>.md] [--stdout]',
    '  contextdb search [--query <text>] [--project <name>] [--session <id>] [--scope events|checkpoints|all] [--role <role>] [--kinds a,b] [--refs a,b] [--statuses running,blocked,done] [--limit 20] [--semantic] [--explain]',
    '  contextdb recall:sessions [--query <text>] [--project <name>] [--session <id>] [--exclude-session <id>] [--limit 3] [--highlight-limit 3] [--explain-score]',
    '  contextdb genealogy [--project <name>] [--session <id>] [--limit 40] [--include-events] [--events-per-session 20] [--json]',
    '  contextdb genealogy:serve [--project <name>] [--workspace <path>] [--assets-root <path>] [--port 3210] [--no-open] [--smoke]',
    '  contextdb hygiene:status [--workspace <path>]',
    '  contextdb hygiene:prune-noise [--workspace <path>] [--dry-run]',
    '  contextdb hygiene:compact [--workspace <path>] [--dry-run]',
    '  contextdb timeline [--project <name> | --session <id>] [--limit 50]',
    '  contextdb event:get --id <sessionId>#<seq>',
    '  contextdb index:sync [--workspace <path>] [--force] [--stats] [--jsonl-out <path>]',
    '  contextdb index:rebuild [--workspace <path>]',
    '',
  ].join('\n');
}

// 纯函数：把 argv 转成命令和选项，CLI 入口无需关心逐项扫描细节。
export function parseArgs(argv: string[]): { command: string; options: Options } {
  const [command = 'help', ...rest] = argv;
  const options: Options = {};

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    const next = rest[i + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    i += 1;
  }

  return { command, options };
}

export function getOption(options: Options, key: string, fallback?: string): string {
  const value = options[key];
  if (typeof value === 'string') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required option --${key}`);
}

export async function getTextOption(options: Options): Promise<string> {
  if (typeof options.text === 'string') return options.text;
  if (typeof options['text-file'] === 'string') {
    return await fs.readFile(path.resolve(options['text-file']), 'utf8');
  }
  throw new Error('Missing required option --text or --text-file');
}

// 纯函数：统一解析逗号/自定义分隔符列表，命令处理器只接收干净数组。
export function getOptionalCsv(options: Options, key: string, separator: string = ','): string[] {
  const value = options[key];
  if (typeof value !== 'string') return [];
  return value
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

// 纯函数：把可选数字参数归一成 number，非法值交给业务默认值处理。
export function getOptionalNumber(options: Options, key: string): number | undefined {
  const value = options[key];
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// 纯函数：限制 checkpoint 验证结果枚举，避免下游写入脏值。
export function getOptionalVerificationResult(
  options: Options,
  key: string
): VerificationResultOption | undefined {
  const value = options[key];
  if (typeof value !== 'string' || !VERIFICATION_RESULTS.has(value)) return undefined;
  return value as VerificationResultOption;
}

export function getWorkspace(options: Options): string {
  const value = options.workspace;
  if (typeof value === 'string') {
    return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
  }
  return resolveWorkspaceRoot(process.cwd());
}

// 纯函数：把 GUI 和搜索接口里的 all/__all 统一视为不过滤项目。
export function normalizeProjectFilter(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '__all' || trimmed.toLowerCase() === 'all') return undefined;
  return trimmed;
}

export function buildTurnEnvelope(options: Options): EventTurnEnvelope {
  return {
    ...(typeof options['turn-id'] === 'string' ? { turnId: options['turn-id'] } : {}),
    ...(typeof options['parent-turn-id'] === 'string' ? { parentTurnId: options['parent-turn-id'] } : {}),
    ...(typeof options['turn-type'] === 'string' ? { turnType: options['turn-type'] as EventTurnEnvelope['turnType'] } : {}),
    ...(typeof options.environment === 'string' ? { environment: options.environment } : {}),
    ...(typeof options['hindsight-status'] === 'string' ? { hindsightStatus: options['hindsight-status'] as EventTurnEnvelope['hindsightStatus'] } : {}),
    ...(typeof options.outcome === 'string' ? { outcome: options.outcome as EventTurnEnvelope['outcome'] } : {}),
    ...(typeof options['work-item-refs'] === 'string' ? { workItemRefs: getOptionalCsv(options, 'work-item-refs') } : {}),
    ...(typeof options['next-state-refs'] === 'string' ? { nextStateRefs: getOptionalCsv(options, 'next-state-refs') } : {}),
  };
}
