#!/usr/bin/env node
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

const AIOS_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

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

function resolvePathOption(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(process.cwd(), value);
}

function resolveGenealogyGuiPaths(options: Options): { assetsRoot: string; guiDir: string; guiHtml: string } {
  const assetsRoot = resolvePathOption(options['assets-root'], process.env.AIOS_ROOT_DIR || AIOS_ROOT_DIR);
  const guiDir = path.join(assetsRoot, 'scripts', 'lib', 'genealogy-gui');
  return {
    assetsRoot,
    guiDir,
    guiHtml: path.join(guiDir, 'index.html'),
  };
}

function isInsideDirectory(base: string, target: string): boolean {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep);
}

function injectGuiConfig(html: string, config: Record<string, unknown>): string {
  const script = `<script>window.__MEMORY_GALAXY_CONFIG__=${JSON.stringify(config).replace(/</g, '\\u003c')};</script>`;
  return html.includes('</head>') ? html.replace('</head>', `${script}\n</head>`) : `${script}\n${html}`;
}

function openBrowserUrl(url: string): void {
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.unref();
  } catch {
    // Opening the browser is best-effort; the server URL is still printed.
  }
}

function normalizeProjectFilter(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '__all' || trimmed.toLowerCase() === 'all') return undefined;
  return trimmed;
}

function requestOriginAllowed(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !origin.trim()) return true;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = String(req.headers.host || '').toLowerCase();
    const originPort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    const originHost = `${parsed.hostname.toLowerCase()}:${originPort}`;
    return host === originHost;
  } catch {
    return false;
  }
}

async function collectReadableGraphFiles({
  workspaceRoot,
  project,
}: {
  workspaceRoot: string;
  project: string;
}): Promise<Set<string>> {
  let graph = await buildMemoryGenealogyGraph({
    workspaceRoot,
    project: normalizeProjectFilter(project),
    limit: 500,
    includeEvents: true,
    eventsPerSession: 200,
  });
  if (normalizeProjectFilter(project) && graph.summary.sessions === 0) {
    graph = await buildMemoryGenealogyGraph({
      workspaceRoot,
      limit: 500,
      includeEvents: true,
      eventsPerSession: 200,
    });
  }
  const allowed = new Set<string>();
  for (const node of graph.nodes) {
    for (const candidate of [node.sourcePath, ...(node.refs || [])]) {
      if (typeof candidate !== 'string' || !candidate.trim()) continue;
      if (path.isAbsolute(candidate)) continue;
      const resolved = path.resolve(workspaceRoot, candidate);
      if (isInsideDirectory(workspaceRoot, resolved)) {
        allowed.add(resolved);
      }
    }
  }
  return allowed;
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
        project: normalizeProjectFilter(options.project),
        sessionId: typeof options.session === 'string' ? options.session : undefined,
        limit: Number.isFinite(limit) ? limit : 40,
        includeEvents: options['include-events'] === true,
        eventsPerSession: Number.isFinite(eventsPerSession) ? eventsPerSession : 20,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    case 'genealogy:serve': {
      const { assetsRoot, guiDir, guiHtml } = resolveGenealogyGuiPaths(options);
      if (!await fs.stat(guiHtml).then(() => true).catch(() => false)) {
        throw new Error(`GUI not found at ${guiHtml}. Pass --assets-root <aios-root> or set AIOS_ROOT_DIR.`);
      }
      const port = typeof options.port === 'string' ? Number(options.port) : 3210;
      const servePort = Number.isFinite(port) ? port : 3210;
      const defaultProject = typeof options.project === 'string' ? options.project : path.basename(workspaceRoot);
      const allowedWorkspaces = new Set([workspaceRoot]);

      function safeResolve(base: string, target: string): string | null {
        const resolved = path.resolve(base, target);
        if (!isInsideDirectory(base, resolved)) return null;
        return resolved;
      }

      function targetWorkspaceFromUrl(url: URL): string | null {
        const wsParam = url.searchParams.get('workspace');
        const targetWorkspace = wsParam ? path.resolve(wsParam) : workspaceRoot;
        return allowedWorkspaces.has(targetWorkspace) ? targetWorkspace : null;
      }

      function setCors(req: http.IncomingMessage, res: http.ServerResponse) {
        const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
        if (requestOriginAllowed(req) && origin) {
          res.setHeader('Access-Control-Allow-Origin', origin);
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      }

      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${servePort}`);
        setCors(req, res);
        if (!requestOriginAllowed(req)) { res.writeHead(403); res.end('Forbidden origin'); return; }
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

        try {
          // Main page & static files from gui dir
          if (url.pathname === '/' || url.pathname === '/index.html') {
            const html = injectGuiConfig(await fs.readFile(guiHtml, 'utf8'), {
              workspaceRoot,
              project: defaultProject,
              assetsRoot,
            });
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
          }
          // Serve other static files from gui dir
          if (url.pathname.startsWith('/') && !url.pathname.startsWith('/api/')) {
            const safePath = path.resolve(guiDir, '.' + url.pathname);
            if (!isInsideDirectory(guiDir, safePath)) { res.writeHead(403); res.end('Forbidden'); return; }
            try {
              const content = await fs.readFile(safePath);
              const ext = path.extname(safePath);
              const mime = ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : ext === '.svg' ? 'image/svg+xml' : 'text/plain';
              res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` });
              res.end(content);
              return;
            } catch (err) {
              res.writeHead(404); res.end('Not found'); return;
            }
          }

          // Genealogy graph — supports ?workspace=&project=&include-events=&limit=
          if (url.pathname === '/api/genealogy') {
            const targetWorkspace = targetWorkspaceFromUrl(url);
            if (!targetWorkspace) { res.writeHead(403); res.end('Workspace not allowed'); return; }
            const rawProject = url.searchParams.has('project')
              ? url.searchParams.get('project')
              : defaultProject;
            const targetProject = normalizeProjectFilter(rawProject);
            const includeEvents = url.searchParams.get('include-events') === 'true';
            const limit = Number(url.searchParams.get('limit')) || 40;
            const eventsPerSession = Number(url.searchParams.get('events-per-session')) || 20;

            let graph = await buildMemoryGenealogyGraph({
              workspaceRoot: targetWorkspace,
              project: targetProject,
              limit: Number.isFinite(limit) ? limit : 40,
              includeEvents,
              eventsPerSession: Number.isFinite(eventsPerSession) ? eventsPerSession : 20,
            });
            if (targetProject && graph.summary.sessions === 0) {
              graph = await buildMemoryGenealogyGraph({
                workspaceRoot: targetWorkspace,
                limit: Number.isFinite(limit) ? limit : 40,
                includeEvents,
                eventsPerSession: Number.isFinite(eventsPerSession) ? eventsPerSession : 20,
              });
              graph.warnings.push(`No sessions matched project "${targetProject}"; showing all workspace projects.`);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(graph));
            return;
          }

          // List sessions in a workspace — ?workspace=<path>&project=<name>
          if (url.pathname === '/api/sessions') {
            const targetWorkspace = targetWorkspaceFromUrl(url);
            if (!targetWorkspace) { res.writeHead(403); res.end('Workspace not allowed'); return; }
            const dbRoot = path.join(targetWorkspace, 'memory', 'context-db');
            const sessionsRoot = path.join(dbRoot, 'sessions');
            let entries: { sessionId: string; agent: string; project: string; goal: string; status: string; updatedAt: string }[] = [];
            try {
              const dirs = await fs.readdir(sessionsRoot, { withFileTypes: true });
              for (const d of dirs) {
                if (!d.isDirectory()) continue;
                const metaPath = path.join(sessionsRoot, d.name, 'meta.json');
                try {
                  const raw = await fs.readFile(metaPath, 'utf8');
                  const m = JSON.parse(raw);
                  if (m.sessionId) {
                    entries.push({
                      sessionId: m.sessionId,
                      agent: m.agent || '',
                      project: m.project || '',
                      goal: m.goal || '',
                      status: m.status || '',
                      updatedAt: m.updatedAt || m.createdAt || '',
                    });
                  }
                } catch {}
              }
            } catch {}
            entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(entries));
            return;
          }

          // Read a file within a workspace — ?workspace=<path>&file=<relative-path>
          if (url.pathname === '/api/file') {
            const targetWorkspace = targetWorkspaceFromUrl(url);
            if (!targetWorkspace) { res.writeHead(403); res.end('Workspace not allowed'); return; }
            const fileRel = url.searchParams.get('file');
            if (!fileRel) { res.writeHead(400); res.end('Missing ?file='); return; }

            const filePath = safeResolve(targetWorkspace, fileRel);
            if (!filePath) { res.writeHead(403); res.end('Path traversal denied'); return; }
            const project = String(url.searchParams.get('project') || defaultProject);
            const readableFiles = await collectReadableGraphFiles({ workspaceRoot: targetWorkspace, project });
            if (!readableFiles.has(filePath)) { res.writeHead(403); res.end('File is not referenced by the graph'); return; }

            try {
              const content = await fs.readFile(filePath, 'utf8');
              res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end(content);
            } catch (err) {
              const code = (err as NodeJS.ErrnoException).code;
              res.writeHead(code === 'ENOENT' ? 404 : 500);
              res.end(code === 'ENOENT' ? 'File not found' : String(err));
            }
            return;
          }

          res.writeHead(404);
          res.end('Not found');
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(err instanceof Error ? err.message : String(err));
        }
      });

      if (options.smoke === true) {
        const [html, graph] = await Promise.all([
          fs.readFile(guiHtml, 'utf8'),
          buildMemoryGenealogyGraph({
            workspaceRoot,
            project: defaultProject,
            limit: 40,
            includeEvents: false,
          }),
        ]);
        console.log(JSON.stringify({
          ok: true,
          workspaceRoot,
          assetsRoot,
          project: defaultProject,
          guiHtml,
          htmlBytes: Buffer.byteLength(html, 'utf8'),
          graph,
        }, null, 2));
        return;
      }

      server.listen(servePort, () => {
        const address = server.address();
        const actualPort = typeof address === 'object' && address ? address.port : servePort;
        const url = `http://localhost:${actualPort}`;
        console.log(`Memory Galaxy GUI → ${url}`);
        console.log(`  Workspace: ${workspaceRoot}`);
        console.log(`  Project: ${defaultProject}`);
        console.log(`  Assets: ${assetsRoot}`);
        console.log(`  API: /api/genealogy?workspace=<path>&project=<name>`);
        console.log(`  Sessions: /api/sessions?workspace=<path>`);
        console.log(`  File: /api/file?workspace=<path>&file=<rel-path>`);
        console.log('Press Ctrl+C to stop.');
        if (options['no-open'] !== true) {
          openBrowserUrl(url);
        }
      });
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
