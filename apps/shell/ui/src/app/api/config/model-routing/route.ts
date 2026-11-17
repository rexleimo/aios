// Reading and writing the model-routing config (providers + clientRoleMatrix) in model-registry.json.
// Single source shared by CLI / gateway / GUI. Guards mirror host-capabilities:
//   - Optimistic concurrency (expectedHash → 409 on drift).
//   - Backup before write (.aios/config-backups/).
//   - Validation rejects plaintext keys / bad env refs / bad baseUrl; post-write re-parse verifies.
import path from 'node:path';

import type { NextRequest } from 'next/server';
import { toPolicyContext } from '../../../../lib/config/routing-policy.mjs';

import {
  ConfigError,
  applyEdits,
  diffEditable,
  parseDocument,
  toAutoPreview,
  toEditable,
  toModelBindings,
  toModelCatalog,
  validateDocument,
} from '../../../../lib/config/model-routing.mjs';
import {
  assertRegistryHash,
  commitRegistrySnapshot,
  readRegistrySnapshot,
  withRegistryWriteLock,
} from '../../../../lib/config/model-registry-store.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REGISTRY_REL = path.join('memory', 'specs', 'model-registry.json');
const BUILTIN_REL = path.join('scripts', 'lib', 'tooling', 'specs', 'registry', 'model-registry.json');

function repoRoot(): string {
  return process.env.AIOS_PROJECT_ROOT ?? path.resolve(process.cwd(), '..', '..', '..');
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

/** Disk registry is the source; seed from the built-in spec when absent so editing always has a base. */
function readRegistry(root: string) {
  return readRegistrySnapshot(path.join(root, REGISTRY_REL), path.join(root, BUILTIN_REL));
}

export async function GET(): Promise<Response> {
  const root = repoRoot();
  let current: Awaited<ReturnType<typeof readRegistry>>;
  try {
    current = await readRegistry(root);
  } catch (error) {
    return json(423, { error: 'config-unreadable', detail: error instanceof Error ? error.message : String(error) });
  }
  try {
    const document = parseDocument(current.text);
    const models = toModelCatalog(document);
    return json(200, {
      path: REGISTRY_REL.replace(/\\/g, '/'),
      hash: current.hash,
      editable: toEditable(document),
      policyContext: toPolicyContext(document),
      auto: toAutoPreview(document),
      models,
      modelBindings: toModelBindings(document),
      configuredModelCount: models.length,
      configuredReady: models.length > 0,
      generationVerified: false,
    });
  } catch (error) {
    return json(422, { error: 'config-invalid', detail: error instanceof Error ? error.message : String(error) });
  }
}

export async function PUT(request: NextRequest): Promise<Response> {
  const root = repoRoot();
  let body: { editable?: unknown; expectedHash?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json(400, { error: 'invalid-body' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.expectedHash !== 'string'
    || typeof body.editable !== 'object' || body.editable === null || Array.isArray(body.editable)) {
    return json(400, { error: 'invalid-body', detail: 'expectedHash and editable are required' });
  }

  try {
    return await withRegistryWriteLock(path.join(root, REGISTRY_REL), () => saveUnderLock(root, body as { editable: object; expectedHash: string }));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const kind = code === 'REGISTRY_LOCKED' ? 'config-locked'
      : code === 'REGISTRY_STALE' ? 'stale-hash'
      : code === 'REGISTRY_VERIFICATION_FAILED' ? 'verification-failed' : 'config-write-failed';
    return json(code === 'REGISTRY_LOCKED' ? 423 : code === 'REGISTRY_STALE' ? 409 : 500, { error: kind, detail: error instanceof Error ? error.message : String(error) });
  }
}

async function saveUnderLock(root: string, body: { editable: object; expectedHash: string }): Promise<Response> {
  let current: Awaited<ReturnType<typeof readRegistry>>;
  try {
    current = await readRegistry(root);
  } catch (error) {
    return json(423, { error: 'config-unreadable', detail: error instanceof Error ? error.message : String(error) });
  }
  // The built-in fallback can drift too; compare the same source bytes GET hashed.
  try {
    assertRegistryHash(current, body.expectedHash);
  } catch (error) {
    return json(409, { error: 'stale-hash', detail: error instanceof Error ? error.message : String(error) });
  }

  let document;
  let before;
  try {
    document = parseDocument(current.text);
    before = toEditable(document);
  } catch (error) {
    return json(422, { error: 'config-invalid', detail: error instanceof Error ? error.message : String(error) });
  }
  let nextDocument;
  let changes;
  try {
    nextDocument = applyEdits(document, body.editable as never);
    validateDocument(nextDocument, { previousDocument: document });
    changes = diffEditable(before, toEditable(nextDocument));
  } catch (error) {
    const configError = error instanceof ConfigError ? error : null;
    return json(422, { error: 'invalid-document', detail: error instanceof Error ? error.message : String(error), path: configError?.path ?? null });
  }

  if (changes.length === 0) {
    return json(200, { ok: true, changed: [], backup: null });
  }

  const backupDir = path.join(root, '.aios', 'config-backups');
  const nextText = `${JSON.stringify(nextDocument, null, 2)}\n`;
  const { backup, hash } = await commitRegistrySnapshot(current, nextText, {
    backupDir,
    validateText: (text: string) => validateDocument(parseDocument(text), { previousDocument: document }),
  });
  return json(200, { ok: true, changed: changes, backup: backup ? path.relative(root, backup).replace(/\\/g, '/') : null, hash });
}
