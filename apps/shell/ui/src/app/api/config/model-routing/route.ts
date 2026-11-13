// Reading and writing the model-routing config (providers + clientRoleMatrix) in model-registry.json.
// Single source shared by CLI / gateway / GUI. Guards mirror host-capabilities:
//   - Optimistic concurrency (expectedHash → 409 on drift).
//   - Backup before write (.aios/config-backups/).
//   - Validation rejects plaintext keys / bad env refs / bad baseUrl; post-write re-parse verifies.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { NextRequest } from 'next/server';

import {
  ConfigError,
  applyEdits,
  diffEditable,
  parseDocument,
  toEditable,
  validateDocument,
} from '../../../../lib/config/model-routing.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REGISTRY_REL = path.join('memory', 'specs', 'model-registry.json');
const BUILTIN_REL = path.join('scripts', 'lib', 'tooling', 'specs', 'registry', 'model-registry.json');

function repoRoot(): string {
  return process.env.AIOS_PROJECT_ROOT ?? path.resolve(process.cwd(), '..', '..', '..');
}

function hashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

/** Disk registry is the source; seed from the built-in spec when absent so editing always has a base. */
function readRegistry(root: string): { text: string; file: string; seeded: boolean } {
  const file = path.join(root, REGISTRY_REL);
  try {
    return { text: fs.readFileSync(file, 'utf8'), file, seeded: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { text: fs.readFileSync(path.join(root, BUILTIN_REL), 'utf8'), file, seeded: true };
  }
}

export async function GET(): Promise<Response> {
  const root = repoRoot();
  let text: string;
  try {
    ({ text } = readRegistry(root));
  } catch (error) {
    return json(423, { error: 'config-unreadable', detail: error instanceof Error ? error.message : String(error) });
  }
  let document;
  try {
    document = parseDocument(text);
  } catch (error) {
    return json(422, { error: 'config-invalid', detail: (error as Error).message });
  }
  return json(200, { path: REGISTRY_REL.replace(/\\/g, '/'), hash: hashOf(text), editable: toEditable(document) });
}

export async function PUT(request: NextRequest): Promise<Response> {
  const root = repoRoot();
  let body: { editable?: unknown; expectedHash?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json(400, { error: 'invalid-body' });
  }
  if (typeof body.expectedHash !== 'string' || typeof body.editable !== 'object' || body.editable === null) {
    return json(400, { error: 'invalid-body', detail: 'expectedHash and editable are required' });
  }

  let current: { text: string; file: string; seeded: boolean };
  try {
    current = readRegistry(root);
  } catch (error) {
    return json(423, { error: 'config-unreadable', detail: error instanceof Error ? error.message : String(error) });
  }
  // A seeded (absent) file has no prior hash to match; accept the built-in hash the client read.
  if (!current.seeded && hashOf(current.text) !== body.expectedHash) {
    return json(409, { error: 'stale-hash', detail: 'the registry changed since it was read; reload before saving' });
  }

  const before = toEditable(parseDocument(current.text));
  let nextDocument;
  let changes;
  try {
    nextDocument = applyEdits(parseDocument(current.text), body.editable as never);
    validateDocument(nextDocument);
    changes = diffEditable(before, toEditable(nextDocument));
  } catch (error) {
    const configError = error instanceof ConfigError ? error : null;
    return json(422, { error: 'invalid-document', detail: error instanceof Error ? error.message : String(error), path: configError?.path ?? null });
  }

  if (changes.length === 0) {
    return json(200, { ok: true, changed: [], backup: null });
  }

  const backupDir = path.join(root, '.aios', 'config-backups');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(backupDir, `model-registry-${stamp}.json`);
  fs.mkdirSync(backupDir, { recursive: true });
  if (!current.seeded) fs.copyFileSync(current.file, backup);

  const nextText = `${JSON.stringify(nextDocument, null, 2)}\n`;
  fs.mkdirSync(path.dirname(current.file), { recursive: true });
  const temporary = `${current.file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, nextText);
  fs.renameSync(temporary, current.file);

  // Post-write verification: the registry must still parse and validate, else roll back.
  try {
    validateDocument(parseDocument(fs.readFileSync(current.file, 'utf8')));
  } catch (error) {
    if (!current.seeded) fs.copyFileSync(backup, current.file);
    return json(500, { error: 'verification-failed', detail: error instanceof Error ? error.message : String(error) });
  }

  return json(200, { ok: true, changed: changes, backup: current.seeded ? null : path.relative(root, backup).replace(/\\/g, '/'), hash: hashOf(nextText) });
}