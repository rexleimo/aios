import fsSync from 'node:fs';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveAiosStateRoot } from '../aios/state-root.mjs';
import { writeFileAtomic } from '../fs/atomic-write.mjs';

const OFFLOAD_DIRNAME = 'offload';
const REFS_DIRNAME = 'refs';
const CANVAS_DIRNAME = 'canvas';
const SPLIT_DIRNAME = 'split';

export const OFFLOAD_STORAGES = Object.freeze(['file', 'split']);

// ── path helpers ──

export function offloadRoot(workspaceRoot) {
  return path.join(resolveAiosStateRoot(workspaceRoot), OFFLOAD_DIRNAME);
}

export function refsRoot(workspaceRoot, storage) {
  const root = offloadRoot(workspaceRoot);
  return storage === 'split'
    ? path.join(root, SPLIT_DIRNAME, REFS_DIRNAME)
    : path.join(root, REFS_DIRNAME);
}

export function canvasRoot(workspaceRoot, storage) {
  const root = offloadRoot(workspaceRoot);
  return storage === 'split'
    ? path.join(root, SPLIT_DIRNAME, CANVAS_DIRNAME)
    : path.join(root, CANVAS_DIRNAME);
}

function refSessionDir(workspaceRoot, sessionId, storage) {
  return path.join(refsRoot(workspaceRoot, storage), sanitizeSessionId(sessionId));
}

function canvasSessionDir(workspaceRoot, sessionId, storage) {
  return path.join(canvasRoot(workspaceRoot, storage), sanitizeSessionId(sessionId));
}

function splitMonthDir(workspaceRoot, sessionId) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return path.join(refsRoot(workspaceRoot, 'split'), sanitizeSessionId(sessionId), month);
}

function sanitizeSessionId(id) {
  return String(id || 'default').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128) || 'default';
}

export function refFilePath(workspaceRoot, sessionId, nodeId, storage) {
  return storage === 'split'
    ? path.join(splitMonthDir(workspaceRoot, sessionId), `${nodeId}.json`)
    : path.join(refSessionDir(workspaceRoot, sessionId, storage), `${nodeId}.md`);
}

export function canvasJsonPath(workspaceRoot, sessionId, storage) {
  const dir = canvasSessionDir(workspaceRoot, sessionId, storage);
  return path.join(dir, 'task-canvas.json');
}

export function canvasMmdPath(workspaceRoot, sessionId, storage) {
  const dir = canvasSessionDir(workspaceRoot, sessionId, storage);
  return path.join(dir, 'task-canvas.mmd');
}

export function canvasJsonlPath(workspaceRoot, sessionId) {
  return path.join(canvasSessionDir(workspaceRoot, sessionId, 'split'), 'nodes.jsonl');
}

// ── read/write refs ──

export async function writeRef(workspaceRoot, sessionId, nodeId, data, storage) {
  const filePath = refFilePath(workspaceRoot, sessionId, nodeId, storage);
  await mkdir(path.dirname(filePath), { recursive: true });

  if (storage === 'split') {
    await writeFileAtomic(filePath, JSON.stringify(data, null, 2), 'utf8');
  } else {
    const frontmatter = [
      `---`,
      `node_id: ${data.node_id}`,
      `session: ${data.session}`,
      `ts: ${data.ts}`,
      `tool: ${data.tool}`,
      `input_summary: "${String(data.input_summary || '').replace(/"/g, '\\"')}"`,
      `exit: ${data.exit ?? ''}`,
      `duration_ms: ${data.duration_ms ?? ''}`,
      `size_bytes: ${data.size_bytes ?? ''}`,
      `class: ${data.class ?? 'ok'}`,
      `---`,
      '',
      '',
    ].join('\n');
    const body = String(data.output || '').trimEnd();
    const content = frontmatter + body + '\n';
    await writeFileAtomic(filePath, content, 'utf8');
  }
}

export async function readRef(workspaceRoot, nodeId, storage) {
  const root = refsRoot(workspaceRoot, storage);
  if (!fsSync.existsSync(root)) return null;

  const sessions = await readdir(root, { withFileTypes: true });
  for (const entry of sessions) {
    if (!entry.isDirectory()) continue;
    const sessionDir = path.join(root, entry.name);

    if (storage === 'split') {
      for (const monthEntry of await readdir(sessionDir, { withFileTypes: true })) {
        if (!monthEntry.isDirectory()) continue;
        const filePath = path.join(sessionDir, monthEntry.name, `${nodeId}.json`);
        if (fsSync.existsSync(filePath)) return JSON.parse(await readFile(filePath, 'utf8'));
      }
    } else {
      const filePath = path.join(sessionDir, `${nodeId}.md`);
      if (fsSync.existsSync(filePath)) return await readFile(filePath, 'utf8');
    }
  }
  return null;
}

// ── grep ──

export async function grepRefs(workspaceRoot, pattern, { sessionId, storage, limit = 20 } = {}) {
  const results = [];
  const re = toRegex(pattern);
  const root = refsRoot(workspaceRoot, storage);
  if (!fsSync.existsSync(root)) return results;

  const sessionDirs = sessionId
    ? [{ name: sanitizeSessionId(sessionId) }]
    : await readdir(root, { withFileTypes: true }).then(e => e.filter(d => d.isDirectory()));

  for (const sess of sessionDirs) {
    if (results.length >= limit) break;
    const sessDir = path.join(root, sess.name);
    if (!fsSync.existsSync(sessDir)) continue;

    if (storage === 'split') {
      if (!fsSync.statSync(sessDir).isDirectory()) continue;
      for (const monthEntry of await readdir(sessDir, { withFileTypes: true })) {
        if (results.length >= limit) break;
        if (!monthEntry.isDirectory()) continue;
        const monthDir = path.join(sessDir, monthEntry.name);
        for (const file of await readdir(monthDir)) {
          if (results.length >= limit) break;
          if (!file.endsWith('.json')) continue;
          const content = await readFile(path.join(monthDir, file), 'utf8');
          if (re.test(content)) {
            const data = JSON.parse(content);
            results.push({ node_id: data.node_id, tool: data.tool, ts: data.ts, session: sess.name, path: path.join(monthDir, file) });
          }
        }
      }
    } else {
      for (const file of await readdir(sessDir)) {
        if (results.length >= limit) break;
        if (!file.endsWith('.md')) continue;
        const content = await readFile(path.join(sessDir, file), 'utf8');
        if (re.test(content)) {
          const firstLine = content.split('\n').find(l => l.startsWith('node_id: '))?.replace('node_id: ', '') || file;
          results.push({ node_id: firstLine, tool: '', ts: '', session: sess.name, path: path.join(sessDir, file) });
        }
      }
    }
  }
  return results;
}

// ── list / prune ──

export async function listRefs(workspaceRoot, { sessionId, storage, limit = 20 } = {}) {
  const results = [];
  const root = refsRoot(workspaceRoot, storage);
  if (!fsSync.existsSync(root)) return results;

  const sessionDirs = sessionId
    ? [{ name: sanitizeSessionId(sessionId) }]
    : await readdir(root, { withFileTypes: true }).then(e => e.filter(d => d.isDirectory()));

  for (const sess of sessionDirs) {
    if (results.length >= limit) break;
    const sessDir = path.join(root, sess.name);
    if (!fsSync.existsSync(sessDir)) continue;

    if (storage === 'split') {
      if (!fsSync.statSync(sessDir).isDirectory()) continue;
      for (const monthEntry of await readdir(sessDir, { withFileTypes: true })) {
        if (results.length >= limit) break;
        if (!monthEntry.isDirectory()) continue;
        const monthDir = path.join(sessDir, monthEntry.name);
        for (const file of await readdir(monthDir)) {
          if (results.length >= limit) break;
          if (!file.endsWith('.json')) continue;
          const data = JSON.parse(await readFile(path.join(monthDir, file), 'utf8'));
          results.push({ node_id: data.node_id, tool: data.tool, ts: data.ts, session: sess.name });
        }
      }
    } else {
      for (const file of await readdir(sessDir)) {
        if (results.length >= limit) break;
        if (!file.endsWith('.md')) continue;
        const raw = await readFile(path.join(sessDir, file), 'utf8');
        const nodeIdMatch = raw.match(/node_id:\s+(\S+)/);
        results.push({ node_id: nodeIdMatch?.[1] || file, session: sess.name, path: path.join(sessDir, file) });
      }
    }
  }
  return results;
}

export async function pruneRefs(workspaceRoot, { storage, keepDays = 30 } = {}) {
  const cutoff = Date.now() - keepDays * 86400_000;
  const root = refsRoot(workspaceRoot, storage);
  if (!fsSync.existsSync(root)) return { pruned: 0, bytesFreed: 0 };

  let pruned = 0;
  let bytesFreed = 0;

  for (const sess of await readdir(root, { withFileTypes: true })) {
    if (!sess.isDirectory()) continue;
    const sessDir = path.join(root, sess.name);

    if (storage === 'split') {
      for (const monthEntry of await readdir(sessDir, { withFileTypes: true })) {
        if (!monthEntry.isDirectory()) continue;
        const monthDir = path.join(sessDir, monthEntry.name);
        for (const file of await readdir(monthDir)) {
          const filePath = path.join(monthDir, file);
          const st = await stat(filePath);
          if (st.mtimeMs < cutoff) { bytesFreed += st.size; await unlink(filePath); pruned++; }
        }
      }
    } else {
      for (const file of await readdir(sessDir)) {
        const filePath = path.join(sessDir, file);
        const st = await stat(filePath);
        if (st.mtimeMs < cutoff) { bytesFreed += st.size; await unlink(filePath); pruned++; }
      }
    }
  }
  return { pruned, bytesFreed };
}

// ── helpers ──

function toRegex(pattern) {
  try { return new RegExp(pattern, 'i'); }
  catch { return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
}
