import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { buildMemoryGenealogyGraph } from '../genealogy.js';
import type { Options } from './args.js';
import { handleFileApi, handleGenealogyApi, handleSessionsApi, isInsideDirectory } from './genealogy-api.js';

export function resolvePathOption(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(process.cwd(), value);
}

export function resolveGenealogyGuiPaths(
  options: Options,
  defaultAiosRootDir: string
): { assetsRoot: string; guiDir: string; guiHtml: string } {
  const assetsRoot = resolvePathOption(options['assets-root'], process.env.AIOS_ROOT_DIR || defaultAiosRootDir);
  const guiDir = path.join(assetsRoot, 'scripts', 'lib', 'genealogy-gui');
  return { assetsRoot, guiDir, guiHtml: path.join(guiDir, 'index.html') };
}

export function injectGuiConfig(html: string, config: Record<string, unknown>): string {
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
    // 打开浏览器只是辅助动作；服务地址仍会打印出来。
  }
}

function requestOriginAllowed(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !origin.trim()) return true;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = String(req.headers.host || '').toLowerCase();
    const originPort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    return host === `${parsed.hostname.toLowerCase()}:${originPort}`;
  } catch {
    return false;
  }
}

function createRequestHelpers(workspaceRoot: string) {
  const allowedWorkspaces = new Set([workspaceRoot]);
  return {
    safeResolve(base: string, target: string): string | null {
      const resolved = path.resolve(base, target);
      return isInsideDirectory(base, resolved) ? resolved : null;
    },
    targetWorkspaceFromUrl(url: URL): string | null {
      const wsParam = url.searchParams.get('workspace');
      const targetWorkspace = wsParam ? path.resolve(wsParam) : workspaceRoot;
      return allowedWorkspaces.has(targetWorkspace) ? targetWorkspace : null;
    },
    setCors(req: http.IncomingMessage, res: http.ServerResponse) {
      const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
      if (requestOriginAllowed(req) && origin) res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    },
  };
}

async function sendStaticFile(guiDir: string, reqPath: string, res: http.ServerResponse): Promise<boolean> {
  if (!reqPath.startsWith('/')) return false;
  const safePath = path.resolve(guiDir, `.${reqPath}`);
  if (!isInsideDirectory(guiDir, safePath)) { res.writeHead(403); res.end('Forbidden'); return true; }
  try {
    const content = await fs.readFile(safePath);
    const ext = path.extname(safePath);
    const mime = ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : ext === '.svg' ? 'image/svg+xml' : 'text/plain';
    res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
  return true;
}

export async function runGenealogyServeCommand({
  workspaceRoot,
  options,
  defaultAiosRootDir,
}: {
  workspaceRoot: string;
  options: Options;
  defaultAiosRootDir: string;
}): Promise<void> {
  const { assetsRoot, guiDir, guiHtml } = resolveGenealogyGuiPaths(options, defaultAiosRootDir);
  if (!await fs.stat(guiHtml).then(() => true).catch(() => false)) {
    throw new Error(`GUI not found at ${guiHtml}. Pass --assets-root <aios-root> or set AIOS_ROOT_DIR.`);
  }
  const port = typeof options.port === 'string' ? Number(options.port) : 3210;
  const servePort = Number.isFinite(port) ? port : 3210;
  const defaultProject = typeof options.project === 'string' ? options.project : path.basename(workspaceRoot);

  if (options.smoke === true) {
    const [html, graph] = await Promise.all([
      fs.readFile(guiHtml, 'utf8'),
      buildMemoryGenealogyGraph({ workspaceRoot, project: defaultProject, limit: 40, includeEvents: false }),
    ]);
    console.log(JSON.stringify({ ok: true, workspaceRoot, assetsRoot, project: defaultProject, guiHtml, htmlBytes: Buffer.byteLength(html, 'utf8'), graph }, null, 2));
    return;
  }

  const helpers = createRequestHelpers(workspaceRoot);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${servePort}`);
    helpers.setCors(req, res);
    if (!requestOriginAllowed(req)) { res.writeHead(403); res.end('Forbidden origin'); return; }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    try {
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const html = injectGuiConfig(await fs.readFile(guiHtml, 'utf8'), { workspaceRoot, project: defaultProject, assetsRoot });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
      if (url.pathname.startsWith('/') && !url.pathname.startsWith('/api/')) {
        if (await sendStaticFile(guiDir, url.pathname, res)) return;
      }

      const targetWorkspace = helpers.targetWorkspaceFromUrl(url);
      if (url.pathname === '/api/genealogy') {
        if (!targetWorkspace) { res.writeHead(403); res.end('Workspace not allowed'); return; }
        await handleGenealogyApi(url, targetWorkspace, defaultProject, res);
        return;
      }
      if (url.pathname === '/api/sessions') {
        if (!targetWorkspace) { res.writeHead(403); res.end('Workspace not allowed'); return; }
        await handleSessionsApi(targetWorkspace, res);
        return;
      }
      if (url.pathname === '/api/file') {
        if (!targetWorkspace) { res.writeHead(403); res.end('Workspace not allowed'); return; }
        await handleFileApi({ url, workspaceRoot: targetWorkspace, defaultProject, safeResolve: helpers.safeResolve, res });
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(err instanceof Error ? err.message : String(err));
    }
  });

  server.listen(servePort, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : servePort;
    const url = `http://localhost:${actualPort}`;
    console.log(`Memory Galaxy GUI -> ${url}`);
    console.log(`  Workspace: ${workspaceRoot}`);
    console.log(`  Project: ${defaultProject}`);
    console.log(`  Assets: ${assetsRoot}`);
    console.log('  API: /api/genealogy?workspace=<path>&project=<name>');
    console.log('  Sessions: /api/sessions?workspace=<path>');
    console.log('  File: /api/file?workspace=<path>&file=<rel-path>');
    console.log('Press Ctrl+C to stop.');
    if (options['no-open'] !== true) openBrowserUrl(url);
  });
}
