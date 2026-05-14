#!/usr/bin/env node
import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  appendEvent,
  buildTimeline,
  buildContextPacket,
  createSession,
  ensureContextDb,
  findLatestSession,
  getEventById,
  recallSessions,
  rebuildContextIndex,
  resolveWorkspaceRoot,
  searchCheckpoints,
  searchMemory,
  searchEvents,
  syncContextIndex,
  type EventTurnEnvelope,
  writeCheckpoint,
} from './core.js';
import { buildMemoryGenealogyGraph } from './genealogy.js';
import { compactContextDb, hygieneStatus, pruneNoise } from './hygiene.js';

type Options = Record<string, string | boolean>;

function usage(): string {
  return [
    'Filesystem Context DB CLI',
    '',
    'Usage:',
    '  contextdb init [--workspace <path>]',
    '  contextdb session:new --agent <name> --project <name> --goal <text> [--tags a,b]',
    '  contextdb session:latest --agent <name> [--project <name>]',
    '  contextdb event:add --session <id> --role <user|assistant|tool|system> --text <text> [--kind <kind>] [--refs a,b] [--turn-id <id>] [--parent-turn-id <id>] [--turn-type main|side|system-maintenance|verification] [--environment <label>] [--work-item-refs a,b] [--next-state-refs a,b] [--hindsight-status pending|evaluated|na|failed] [--outcome success|correction|retry-needed|ambiguous|unknown]',
    '  contextdb checkpoint --session <id> --summary <text> [--status running|blocked|done] [--next a|b] [--artifacts a|b] [--verify-result unknown|passed|failed|partial] [--retry-count n] [--failure-category <label>] [--elapsed-ms n] [--cost-usd n]',
    '  contextdb context:pack --session <id> [--limit 30] [--token-budget 1200] [--token-strategy legacy|balanced|aggressive] [--recall smart|tail] [--kinds prompt,response,error] [--refs a,b] [--no-dedupe] [--out memory/context-db/exports/<id>.md] [--stdout]',
    '  contextdb search [--query <text>] [--project <name>] [--session <id>] [--scope events|checkpoints|all] [--role <role>] [--kinds a,b] [--refs a,b] [--statuses running,blocked,done] [--limit 20] [--semantic] [--explain]',
    '  contextdb recall:sessions [--query <text>] [--project <name>] [--session <id>] [--exclude-session <id>] [--limit 3] [--highlight-limit 3] [--explain-score]',
    '  contextdb genealogy [--project <name>] [--session <id>] [--limit 40] [--include-events] [--events-per-session 20] [--json]',
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

function parseArgs(argv: string[]): { command: string; options: Options } {
  const [command = 'help', ...rest] = argv;
  const options: Options = {};

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('--')) {
      continue;
    }

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

function getOption(options: Options, key: string, fallback?: string): string {
  const value = options[key];
  if (typeof value === 'string') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required option --${key}`);
}

function getOptionalCsv(options: Options, key: string, separator: string = ','): string[] {
  const value = options[key];
  if (typeof value !== 'string') return [];
  return value
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
function getOptionalNumber(options: Options, key: string): number | undefined {
  const value = options[key];
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
const VERIFICATION_RESULTS = new Set(['unknown', 'passed', 'failed', 'partial']);

function getOptionalVerificationResult(options: Options, key: string): 'unknown' | 'passed' | 'failed' | 'partial' | undefined {
  const value = options[key];
  if (typeof value !== 'string' || !VERIFICATION_RESULTS.has(value)) return undefined;
  return value as 'unknown' | 'passed' | 'failed' | 'partial';
}

function getWorkspace(options: Options): string {
  const value = options.workspace;
  if (typeof value === 'string') {
    return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
  }
  return resolveWorkspaceRoot(process.cwd());
}

function resolveOutputPath(workspaceRoot: string, outputPath: string): string {
  return path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(workspaceRoot, outputPath);
}

async function appendJsonLineFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(usage());
    return;
  }

  const workspaceRoot = getWorkspace(options);

  switch (command) {
    case 'init': {
      const dbRoot = await ensureContextDb(workspaceRoot);
      console.log(JSON.stringify({ ok: true, workspaceRoot, dbRoot }, null, 2));
      return;
    }

    case 'session:new': {
      const session = await createSession({
        workspaceRoot,
        agent: getOption(options, 'agent'),
        project: getOption(options, 'project'),
        goal: getOption(options, 'goal'),
        tags: getOptionalCsv(options, 'tags'),
        sessionId: typeof options['session-id'] === 'string' ? options['session-id'] : undefined,
      });
      console.log(JSON.stringify(session, null, 2));
      return;
    }

    case 'session:latest': {
      const latest = await findLatestSession(
        workspaceRoot,
        getOption(options, 'agent'),
        typeof options.project === 'string' ? options.project : undefined
      );
      console.log(JSON.stringify({ session: latest }, null, 2));
      return;
    }

    case 'event:add': {
      const turn: EventTurnEnvelope = {
        ...(typeof options['turn-id'] === 'string' ? { turnId: options['turn-id'] } : {}),
        ...(typeof options['parent-turn-id'] === 'string' ? { parentTurnId: options['parent-turn-id'] } : {}),
        ...(typeof options['turn-type'] === 'string' ? { turnType: options['turn-type'] as EventTurnEnvelope['turnType'] } : {}),
        ...(typeof options.environment === 'string' ? { environment: options.environment } : {}),
        ...(typeof options['hindsight-status'] === 'string' ? { hindsightStatus: options['hindsight-status'] as EventTurnEnvelope['hindsightStatus'] } : {}),
        ...(typeof options.outcome === 'string' ? { outcome: options.outcome as EventTurnEnvelope['outcome'] } : {}),
        ...(typeof options['work-item-refs'] === 'string' ? { workItemRefs: getOptionalCsv(options, 'work-item-refs') } : {}),
        ...(typeof options['next-state-refs'] === 'string' ? { nextStateRefs: getOptionalCsv(options, 'next-state-refs') } : {}),
      };
      const event = await appendEvent({
        workspaceRoot,
        sessionId: getOption(options, 'session'),
        role: getOption(options, 'role') as 'system' | 'user' | 'assistant' | 'tool',
        text: getOption(options, 'text'),
        kind: typeof options.kind === 'string' ? options.kind : undefined,
        refs: getOptionalCsv(options, 'refs'),
        turn,
      });
      console.log(JSON.stringify(event, null, 2));
      return;
    }

    case 'checkpoint': {
      const checkpoint = await writeCheckpoint({
        workspaceRoot,
        sessionId: getOption(options, 'session'),
        summary: getOption(options, 'summary'),
        status: typeof options.status === 'string' ? (options.status as 'running' | 'blocked' | 'done') : undefined,
        nextActions: getOptionalCsv(options, 'next', '|'),
        artifacts: getOptionalCsv(options, 'artifacts', '|'),
        telemetry: {
          verification: getOptionalVerificationResult(options, 'verify-result') || typeof options['verify-evidence'] === "string"
            ? {
              result: getOptionalVerificationResult(options, 'verify-result') ?? 'unknown',
              ...(typeof options['verify-evidence'] === "string" ? { evidence: options['verify-evidence'] } : {}),
            }
            : undefined,
          retryCount: getOptionalNumber(options, 'retry-count'),
          failureCategory: typeof options['failure-category'] === 'string' ? options['failure-category'] : undefined,
          elapsedMs: getOptionalNumber(options, 'elapsed-ms'),
          cost: {
            inputTokens: getOptionalNumber(options, 'cost-input-tokens'),
            outputTokens: getOptionalNumber(options, 'cost-output-tokens'),
            totalTokens: getOptionalNumber(options, 'cost-total-tokens'),
            usd: getOptionalNumber(options, 'cost-usd'),
          },
        },
      });
      console.log(JSON.stringify(checkpoint, null, 2));
      return;
    }

    case 'context:pack': {
      const sessionId = getOption(options, 'session');
      const limit = typeof options.limit === 'string' ? Number(options.limit) : 30;
      const tokenBudget = typeof options['token-budget'] === 'string' ? Number(options['token-budget']) : undefined;
      const tokenStrategyRaw = typeof options['token-strategy'] === 'string'
        ? options['token-strategy'].trim().toLowerCase()
        : '';
      const tokenStrategy: 'legacy' | 'balanced' | 'aggressive' | undefined =
        tokenStrategyRaw === 'legacy' || tokenStrategyRaw === 'balanced' || tokenStrategyRaw === 'aggressive'
          ? tokenStrategyRaw
          : undefined;
      const out = typeof options.out === 'string'
        ? options.out
        : path.join('memory', 'context-db', 'exports', `${sessionId}-context.md`);

      const result = await buildContextPacket({
        workspaceRoot,
        sessionId,
        eventLimit: Number.isFinite(limit) ? limit : 30,
        tokenBudget: tokenBudget !== undefined && Number.isFinite(tokenBudget) ? tokenBudget : undefined,
        tokenStrategy,
        recallStrategy: typeof options.recall === 'string' && options.recall.trim() === 'tail' ? 'tail' : 'smart',
        kinds: getOptionalCsv(options, 'kinds'),
        refs: getOptionalCsv(options, 'refs'),
        dedupeEvents: options['no-dedupe'] === true ? false : true,
        outputPath: out,
      });

      if (options.stdout === true) {
        process.stdout.write(result.markdown);
      } else {
        console.log(JSON.stringify({ outputPath: result.outputPath, sessionId }, null, 2));
      }
      return;
    }

    case 'search': {
      const limit = typeof options.limit === 'string' ? Number(options.limit) : 20;
      const scope = typeof options.scope === 'string' ? options.scope.trim().toLowerCase() : 'events';
      const resolvedLimit = Number.isFinite(limit) ? limit : 20;
      const query = typeof options.query === 'string' ? options.query : undefined;
      const project = typeof options.project === 'string' ? options.project : undefined;
      const sessionId = typeof options.session === 'string' ? options.session : undefined;
      const semantic = options.semantic === true;
      const explain = options.explain === true;

      const result = scope === 'checkpoints'
        ? await searchCheckpoints({
          workspaceRoot,
          query,
          project,
          sessionId,
          statuses: getOptionalCsv(options, 'statuses') as Array<'running' | 'blocked' | 'done'>,
          limit: resolvedLimit,
          semantic,
          explain,
        })
        : scope === 'all'
          ? await searchMemory({
            workspaceRoot,
            query,
            project,
            sessionId,
            role: typeof options.role === 'string' ? (options.role as 'system' | 'user' | 'assistant' | 'tool') : undefined,
            kinds: getOptionalCsv(options, 'kinds'),
            refs: getOptionalCsv(options, 'refs'),
            statuses: getOptionalCsv(options, 'statuses') as Array<'running' | 'blocked' | 'done'>,
            limit: resolvedLimit,
            semantic,
            explain,
            scope: 'all',
          })
          : await searchEvents({
            workspaceRoot,
            query,
            project,
            sessionId,
            role: typeof options.role === 'string' ? (options.role as 'system' | 'user' | 'assistant' | 'tool') : undefined,
            kinds: getOptionalCsv(options, 'kinds'),
            refs: getOptionalCsv(options, 'refs'),
            limit: resolvedLimit,
            semantic,
            explain,
          });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    case 'recall:sessions': {
      const limit = typeof options.limit === 'string' ? Number(options.limit) : 3;
      const highlightLimit = typeof options['highlight-limit'] === 'string'
        ? Number(options['highlight-limit'])
        : undefined;
      const result = await recallSessions({
        workspaceRoot,
        query: typeof options.query === 'string' ? options.query : undefined,
        project: typeof options.project === 'string' ? options.project : undefined,
        sessionId: typeof options.session === 'string' ? options.session : undefined,
        excludeSessionId: typeof options['exclude-session'] === 'string' ? options['exclude-session'] : undefined,
        limit: Number.isFinite(limit) ? limit : 3,
        highlightLimit: Number.isFinite(highlightLimit as number) ? (highlightLimit as number) : undefined,
        explainScore: options['explain-score'] === true,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    case 'genealogy': {
      const limit = typeof options.limit === 'string' ? Number(options.limit) : 40;
      const eventsPerSession = typeof options['events-per-session'] === 'string'
        ? Number(options['events-per-session'])
        : 20;
      const result = await buildMemoryGenealogyGraph({
        workspaceRoot,
        project: typeof options.project === 'string' ? options.project : undefined,
        sessionId: typeof options.session === 'string' ? options.session : undefined,
        limit: Number.isFinite(limit) ? limit : 40,
        includeEvents: options['include-events'] === true,
        eventsPerSession: Number.isFinite(eventsPerSession) ? eventsPerSession : 20,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    case 'hygiene:status': {
      const result = await hygieneStatus({ workspaceRoot });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    case 'hygiene:prune-noise': {
      const result = await pruneNoise({ workspaceRoot, dryRun: options['dry-run'] === true });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    case 'hygiene:compact': {
      const result = await compactContextDb({ workspaceRoot, dryRun: options['dry-run'] === true });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    case 'timeline': {
      const limit = typeof options.limit === 'string' ? Number(options.limit) : 50;
      const result = await buildTimeline({
        workspaceRoot,
        project: typeof options.project === 'string' ? options.project : undefined,
        sessionId: typeof options.session === 'string' ? options.session : undefined,
        limit: Number.isFinite(limit) ? limit : 50,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    case 'event:get': {
      const result = await getEventById({
        workspaceRoot,
        eventId: getOption(options, 'id'),
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    case 'index:sync': {
      const result = await syncContextIndex(workspaceRoot, {
        force: options.force === true,
      });
      if (typeof options['jsonl-out'] === 'string') {
        const filePath = resolveOutputPath(workspaceRoot, options['jsonl-out']);
        await appendJsonLineFile(filePath, {
          command: 'index:sync',
          recordedAt: new Date().toISOString(),
          ...result,
        });
      }
      if (options.stats === true) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(JSON.stringify({
          ok: result.ok,
          mode: result.mode,
          workspaceRoot: result.workspaceRoot,
          dbPath: result.dbPath,
          forced: result.forced,
          skippedByThrottle: result.skippedByThrottle,
          tookMs: result.tookMs,
          syncedAt: result.syncedAt,
        }, null, 2));
      }
      return;
    }

    case 'index:rebuild': {
      const result = await rebuildContextIndex(workspaceRoot);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    default:
      throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
