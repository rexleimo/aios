import path from 'node:path';
import { promises as fs } from 'node:fs';
import type http from 'node:http';
import { buildMemoryGenealogyGraph } from '../genealogy.js';
import { resolveContextDbRoot } from '../paths.js';
import { normalizeProjectFilter } from './args.js';

// 纯函数：判断目标路径是否仍在允许目录中，集中防止 GUI 文件读取越界。
export function isInsideDirectory(base: string, target: string): boolean {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep);
}

export async function collectReadableGraphFiles({
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
      if (isInsideDirectory(workspaceRoot, resolved)) allowed.add(resolved);
    }
  }
  return allowed;
}

export async function handleGenealogyApi(
  url: URL,
  workspaceRoot: string,
  defaultProject: string,
  res: http.ServerResponse
): Promise<void> {
  const rawProject = url.searchParams.has('project') ? url.searchParams.get('project') : defaultProject;
  const targetProject = normalizeProjectFilter(rawProject);
  const includeEvents = url.searchParams.get('include-events') === 'true';
  const limit = Number(url.searchParams.get('limit')) || 40;
  const eventsPerSession = Number(url.searchParams.get('events-per-session')) || 20;

  let graph = await buildMemoryGenealogyGraph({
    workspaceRoot,
    project: targetProject,
    limit: Number.isFinite(limit) ? limit : 40,
    includeEvents,
    eventsPerSession: Number.isFinite(eventsPerSession) ? eventsPerSession : 20,
  });
  if (targetProject && graph.summary.sessions === 0) {
    graph = await buildMemoryGenealogyGraph({
      workspaceRoot,
      limit: Number.isFinite(limit) ? limit : 40,
      includeEvents,
      eventsPerSession: Number.isFinite(eventsPerSession) ? eventsPerSession : 20,
    });
    graph.warnings.push(`No sessions matched project "${targetProject}"; showing all workspace projects.`);
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(graph));
}

export async function handleSessionsApi(workspaceRoot: string, res: http.ServerResponse): Promise<void> {
  const dbRoot = resolveContextDbRoot(workspaceRoot, { preferLegacyExisting: true });
  const sessionsRoot = path.join(dbRoot, 'sessions');
  const entries: Array<{ sessionId: string; agent: string; project: string; goal: string; status: string; updatedAt: string }> = [];
  try {
    const dirs = await fs.readdir(sessionsRoot, { withFileTypes: true });
    for (const dirent of dirs) {
      if (!dirent.isDirectory()) continue;
      const metaPath = path.join(sessionsRoot, dirent.name, 'meta.json');
      try {
        const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
        if (meta.sessionId) {
          entries.push({
            sessionId: meta.sessionId,
            agent: meta.agent || '',
            project: meta.project || '',
            goal: meta.goal || '',
            status: meta.status || '',
            updatedAt: meta.updatedAt || meta.createdAt || '',
          });
        }
      } catch {
        // 单个 session 元数据损坏时跳过，不影响 GUI 其它数据。
      }
    }
  } catch {
    // 没有 sessions 目录时返回空列表。
  }
  entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(entries));
}

export async function handleFileApi({
  url,
  workspaceRoot,
  defaultProject,
  safeResolve,
  res,
}: {
  url: URL;
  workspaceRoot: string;
  defaultProject: string;
  safeResolve(base: string, target: string): string | null;
  res: http.ServerResponse;
}): Promise<void> {
  const fileRel = url.searchParams.get('file');
  if (!fileRel) { res.writeHead(400); res.end('Missing ?file='); return; }

  const filePath = safeResolve(workspaceRoot, fileRel);
  if (!filePath) { res.writeHead(403); res.end('Path traversal denied'); return; }
  const project = String(url.searchParams.get('project') || defaultProject);
  const readableFiles = await collectReadableGraphFiles({ workspaceRoot, project });
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
}
