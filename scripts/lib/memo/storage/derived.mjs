import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getActiveMemoStorage } from './config.mjs';
import { collectEvents } from './events-read.mjs';
import {
  atomicWriteText,
  collectRecursiveFiles,
  hashParts,
  pathExists,
  readTextIfExists,
  writeText,
} from './fs-io.mjs';
import {
  normalizeMemoStorageName,
  sortEventsAscending,
} from './normalizers.mjs';
import {
  derivedDir,
  derivedDocsPath,
  derivedManifestPath,
  fileEventsPath,
  memoRoot,
} from './paths.mjs';

async function canonicalSourceFiles(workspaceRoot, storage) {
  const resolvedStorage = normalizeMemoStorageName(storage);
  const root = memoRoot(workspaceRoot);
  if (resolvedStorage === 'file') {
    const files = [];
    if (await pathExists(fileEventsPath(workspaceRoot))) {
      files.push(fileEventsPath(workspaceRoot));
    }
    files.push(...await collectRecursiveFiles(path.join(root, 'file', 'pinned'), (filePath) => filePath.endsWith('.md')));
    return files;
  }

  const files = [
    ...await collectRecursiveFiles(path.join(root, 'split', 'events'), (filePath) => filePath.endsWith('.json')),
    ...await collectRecursiveFiles(path.join(root, 'split', 'pinned'), (filePath) => filePath.endsWith('.md')),
  ];
  return files.sort((a, b) => a.localeCompare(b));
}

export async function sourceDigest(workspaceRoot, storage) {
  const root = memoRoot(workspaceRoot);
  const files = await canonicalSourceFiles(workspaceRoot, storage);
  const parts = [];
  let bytes = 0;
  for (const filePath of files) {
    const content = await fs.readFile(filePath);
    bytes += content.length;
    parts.push({
      relativePath: path.relative(root, filePath).split(path.sep).join('/'),
      content,
    });
  }
  return {
    digest: hashParts(parts),
    files: parts.map((part) => part.relativePath),
    bytes,
  };
}

function eventToDerivedDoc(event) {
  return {
    id: event.eventId,
    eventId: event.eventId,
    storage: event.storage,
    space: event.space,
    spaceKey: event.spaceKey,
    ts: event.ts,
    text: event.text,
    refs: event.refs || [],
  };
}

export async function rebuildMemoStorage(workspaceRoot, { storage } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const { events } = await collectEvents(workspaceRoot, { storage: resolvedStorage });
  const source = await sourceDigest(workspaceRoot, resolvedStorage);
  const docs = sortEventsAscending(events).map(eventToDerivedDoc);
  const docsText = docs.map((doc) => JSON.stringify(doc)).join('\n');
  const manifest = {
    schemaVersion: 1,
    storage: resolvedStorage,
    builtAt: new Date().toISOString(),
    source,
    records: docs.length,
    docs: 'docs.jsonl',
  };

  await fs.rm(derivedDir(workspaceRoot, resolvedStorage), { recursive: true, force: true });
  await writeText(derivedDocsPath(workspaceRoot, resolvedStorage), docsText ? `${docsText}\n` : '');
  await atomicWriteText(derivedManifestPath(workspaceRoot, resolvedStorage), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function readDerivedManifest(workspaceRoot, storage) {
  const manifestPath = derivedManifestPath(workspaceRoot, storage);
  const raw = await readTextIfExists(manifestPath);
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}
