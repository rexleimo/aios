import {
  appendEvent,
  buildContextPacket,
  buildTimeline,
  createSession,
  ensureContextDb,
  findLatestSession,
  getEventById,
  recallSessions,
  rebuildContextIndex,
  searchCheckpoints,
  searchEvents,
  searchMemory,
  syncContextIndex,
  writeCheckpoint,
} from '../core.js';
import { buildMemoryGenealogyGraph } from '../genealogy.js';
import { compactContextDb, hygieneStatus, pruneNoise } from '../hygiene.js';
import {
  buildTurnEnvelope,
  getOptionalCsv,
  getOptionalNumber,
  getOptionalVerificationResult,
  getOption,
  getTextOption,
  normalizeProjectFilter,
  type Options,
} from './args.js';
import { appendJsonLineFile, defaultContextDbOutputPath, resolveOutputPath } from './output.js';
import { runGenealogyServeCommand } from './genealogy-server.js';

function normalizeTokenStrategy(value: Options[string]): 'legacy' | 'balanced' | 'aggressive' | undefined {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return raw === 'legacy' || raw === 'balanced' || raw === 'aggressive' ? raw : undefined;
}

async function handleSearch(workspaceRoot: string, options: Options): Promise<void> {
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
}

async function handleCheckpoint(workspaceRoot: string, options: Options): Promise<void> {
  const verificationResult = getOptionalVerificationResult(options, 'verify-result');
  const verificationEvidence = typeof options['verify-evidence'] === 'string' ? options['verify-evidence'] : undefined;
  const checkpoint = await writeCheckpoint({
    workspaceRoot,
    sessionId: getOption(options, 'session'),
    summary: getOption(options, 'summary'),
    status: typeof options.status === 'string' ? (options.status as 'running' | 'blocked' | 'done') : undefined,
    nextActions: getOptionalCsv(options, 'next', '|'),
    artifacts: getOptionalCsv(options, 'artifacts', '|'),
    telemetry: {
      verification: verificationResult || verificationEvidence
        ? { result: verificationResult ?? 'unknown', ...(verificationEvidence ? { evidence: verificationEvidence } : {}) }
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
}

async function handleContextPack(workspaceRoot: string, options: Options): Promise<void> {
  const sessionId = getOption(options, 'session');
  const limit = typeof options.limit === 'string' ? Number(options.limit) : 30;
  const tokenBudget = typeof options['token-budget'] === 'string' ? Number(options['token-budget']) : undefined;
  const out = typeof options.out === 'string'
    ? options.out
    : defaultContextDbOutputPath(workspaceRoot, 'exports', `${sessionId}-context.md`);

  const result = await buildContextPacket({
    workspaceRoot,
    sessionId,
    eventLimit: Number.isFinite(limit) ? limit : 30,
    tokenBudget: tokenBudget !== undefined && Number.isFinite(tokenBudget) ? tokenBudget : undefined,
    tokenStrategy: normalizeTokenStrategy(options['token-strategy']),
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
}

async function handleGenealogy(workspaceRoot: string, options: Options): Promise<void> {
  const limit = typeof options.limit === 'string' ? Number(options.limit) : 40;
  const eventsPerSession = typeof options['events-per-session'] === 'string'
    ? Number(options['events-per-session'])
    : 20;
  const result = await buildMemoryGenealogyGraph({
    workspaceRoot,
    project: normalizeProjectFilter(options.project),
    sessionId: typeof options.session === 'string' ? options.session : undefined,
    limit: Number.isFinite(limit) ? limit : 40,
    includeEvents: options['include-events'] === true,
    eventsPerSession: Number.isFinite(eventsPerSession) ? eventsPerSession : 20,
  });
  console.log(JSON.stringify(result, null, 2));
}

async function handleRecallSessions(workspaceRoot: string, options: Options): Promise<void> {
  const limit = typeof options.limit === 'string' ? Number(options.limit) : 3;
  const highlightLimit = typeof options['highlight-limit'] === 'string' ? Number(options['highlight-limit']) : undefined;
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
}

export async function runContextDbCommand({
  command,
  options,
  workspaceRoot,
  defaultAiosRootDir,
}: {
  command: string;
  options: Options;
  workspaceRoot: string;
  defaultAiosRootDir: string;
}): Promise<void> {
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
      const latest = await findLatestSession(workspaceRoot, getOption(options, 'agent'), typeof options.project === 'string' ? options.project : undefined);
      console.log(JSON.stringify({ session: latest }, null, 2));
      return;
    }
    case 'event:add': {
      const event = await appendEvent({
        workspaceRoot,
        sessionId: getOption(options, 'session'),
        role: getOption(options, 'role') as 'system' | 'user' | 'assistant' | 'tool',
        text: await getTextOption(options),
        kind: typeof options.kind === 'string' ? options.kind : undefined,
        refs: getOptionalCsv(options, 'refs'),
        turn: buildTurnEnvelope(options),
      });
      console.log(JSON.stringify(event, null, 2));
      return;
    }
    case 'checkpoint': await handleCheckpoint(workspaceRoot, options); return;
    case 'context:pack': await handleContextPack(workspaceRoot, options); return;
    case 'search': await handleSearch(workspaceRoot, options); return;
    case 'recall:sessions': await handleRecallSessions(workspaceRoot, options); return;
    case 'genealogy': await handleGenealogy(workspaceRoot, options); return;
    case 'genealogy:serve': await runGenealogyServeCommand({ workspaceRoot, options, defaultAiosRootDir }); return;
    case 'hygiene:status': console.log(JSON.stringify(await hygieneStatus({ workspaceRoot }), null, 2)); return;
    case 'hygiene:prune-noise': console.log(JSON.stringify(await pruneNoise({ workspaceRoot, dryRun: options['dry-run'] === true }), null, 2)); return;
    case 'hygiene:compact': console.log(JSON.stringify(await compactContextDb({ workspaceRoot, dryRun: options['dry-run'] === true }), null, 2)); return;
    case 'timeline': {
      const limit = typeof options.limit === 'string' ? Number(options.limit) : 50;
      console.log(JSON.stringify(await buildTimeline({
        workspaceRoot,
        project: typeof options.project === 'string' ? options.project : undefined,
        sessionId: typeof options.session === 'string' ? options.session : undefined,
        limit: Number.isFinite(limit) ? limit : 50,
      }), null, 2));
      return;
    }
    case 'event:get': console.log(JSON.stringify(await getEventById({ workspaceRoot, eventId: getOption(options, 'id') }), null, 2)); return;
    case 'index:sync': {
      const result = await syncContextIndex(workspaceRoot, { force: options.force === true });
      if (typeof options['jsonl-out'] === 'string') {
        await appendJsonLineFile(resolveOutputPath(workspaceRoot, options['jsonl-out']), {
          command: 'index:sync',
          recordedAt: new Date().toISOString(),
          ...result,
        });
      }
      const payload = options.stats === true ? result : {
        ok: result.ok,
        mode: result.mode,
        workspaceRoot: result.workspaceRoot,
        dbPath: result.dbPath,
        forced: result.forced,
        skippedByThrottle: result.skippedByThrottle,
        tookMs: result.tookMs,
        syncedAt: result.syncedAt,
      };
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    case 'index:rebuild': console.log(JSON.stringify(await rebuildContextIndex(workspaceRoot), null, 2)); return;
    default: throw new Error(`Unknown command: ${command}`);
  }
}
