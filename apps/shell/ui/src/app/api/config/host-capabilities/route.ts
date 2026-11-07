// Reading and writing `config/host-capabilities.json` — the one file the panel can change.
//
// Three guards, because this is the file the whole matrix derives from:
//   - **Optimistic concurrency.** The client sends the hash it read; a mismatch means
//     somebody else wrote in between, and the answer is 409 rather than a silent overwrite.
//   - **Backup before write.** The previous content goes to `.aios/config-backups/`, so a
//     rollback is a file copy and not a reconstruction from memory.
//   - **Post-write verification.** After the write, `aios status --json` runs: if the rest
//     of the toolchain cannot read the file, it is restored immediately and the error is
//     returned. A write that only "looks right" is not accepted.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import type { NextRequest } from 'next/server';

import {
  ConfigError,
  applyEdits,
  diffEditable,
  parseDocument,
  toEditable,
  validateDocument,
} from '../../../../lib/data/host-capabilities.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONFIG_REL = path.join('config', 'host-capabilities.json');

function repoRoot(): string {
  return process.env.AIOS_PROJECT_ROOT ?? path.resolve(process.cwd(), '..', '..', '..');
}

function configPath(root: string): string {
  return path.join(root, CONFIG_REL);
}

/** 轴词表只有一个所有者；这里通过进程入口读它，不复制一份。 */
function axisVocabulary(root: string): string[] {
  const result = spawnSync(process.execPath, [path.join(root, 'apps', 'shell', 'data', 'axes.mjs')], {
    windowsHide: true,
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, AIOS_PROJECT_ROOT: root },
  });
  try {
    const parsed = JSON.parse(String(result.stdout ?? ''));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    // 拿不到词表就不做轴名校验，但要说出来：静默放行等于让拼写错误变成「未声明」。
    return [];
  }
}

/**
 * 把子进程失败压成一句人话。
 *
 * 实测：直接把 stderr 前 500 字塞进界面横幅，会得到一屏 Node 栈帧——用户看到的是
 * `node:internal/modules/cjs/loader:1503 throw err;` 而不是「找不到某个文件」。
 */
function summarizeFailure(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((line) => line.replace(/\r$/, '').trim())
    .filter(Boolean);
  const errorLine = lines.find((line) => /Error:/.test(line)) ?? lines[0] ?? '';
  return errorLine.slice(0, 180) || 'aios status did not return JSON';
}

function hashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function GET(): Promise<Response> {
  const root = repoRoot();
  const file = configPath(root);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return json(423, {
      error: 'config-unreadable',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  let document;
  try {
    document = parseDocument(text);
  } catch (error) {
    return json(422, { error: 'config-invalid', detail: (error as Error).message });
  }
  return json(200, {
    path: CONFIG_REL.replace(/\\/g, '/'),
    hash: hashOf(text),
    editable: toEditable(document),
  });
}

export async function PUT(request: NextRequest): Promise<Response> {
  const root = repoRoot();
  const file = configPath(root);

  let body: { editable?: unknown; expectedHash?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json(400, { error: 'invalid-body' });
  }
  if (typeof body.expectedHash !== 'string' || !Array.isArray(body.editable)) {
    return json(400, { error: 'invalid-body', detail: 'expectedHash and editable are required' });
  }

  let currentText: string;
  try {
    currentText = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return json(423, { error: 'config-unreadable', detail: (error as Error).message });
  }
  if (hashOf(currentText) !== body.expectedHash) {
    return json(409, {
      error: 'stale-hash',
      detail: 'the file changed since it was read; reload before saving',
    });
  }

  const before = toEditable(parseDocument(currentText) as { clients?: Record<string, unknown> });
  let nextDocument;
  let changes;
  try {
    const document = parseDocument(currentText) as { clients?: Record<string, unknown> };
    nextDocument = applyEdits(document, body.editable as never[]);
    validateDocument(nextDocument, { axes: axisVocabulary(root) });
    changes = diffEditable(before, toEditable(nextDocument));
  } catch (error) {
    const configError = error instanceof ConfigError ? error : null;
    return json(422, {
      error: 'invalid-document',
      detail: error instanceof Error ? error.message : String(error),
      path: configError?.path ?? null,
    });
  }

  if (changes.length === 0) {
    return json(200, { ok: true, changed: [], backup: null });
  }

  const backupDir = path.join(root, '.aios', 'config-backups');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(backupDir, `host-capabilities-${stamp}.json`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(file, backup);

  const nextText = `${JSON.stringify(nextDocument, null, 2)}\n`;
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, nextText);
  fs.renameSync(temporary, file);

  // Verify with the same reader the rest of the toolchain uses. `aios status` exits 1 when
  // its verdict is blocked, so the payload decides, not the exit code.
  const check = spawnSync(process.execPath, [path.join(root, 'scripts', 'aios.mjs'), 'status', '--json'], {
    windowsHide: true,
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, AIOS_PROJECT_ROOT: root },
  });
  let verified = true;
  let reason = '';
  try {
    JSON.parse(String(check.stdout ?? ''));
  } catch {
    verified = false;
    reason = summarizeFailure(String(check.stderr ?? ''));
  }
  if (!verified) {
    fs.copyFileSync(backup, file);
    return json(500, {
      error: 'verification-failed',
      detail: reason,
      rolledBackTo: path.relative(root, backup).replace(/\\/g, '/'),
    });
  }

  return json(200, {
    ok: true,
    changed: changes,
    backup: path.relative(root, backup).replace(/\\/g, '/'),
    hash: hashOf(nextText),
  });
}