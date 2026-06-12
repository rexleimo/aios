import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

test('ctx-agent one-shot ignores legacy lazy-load env and does not inject facade context', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-lazy-load-'));

  try {
    const facadeDir = path.join(workspaceRoot, '.aios', 'context-db');
    await mkdir(facadeDir, { recursive: true });
    await writeFile(
      path.join(facadeDir, '.facade.json'),
      JSON.stringify({
        version: 1,
        generatedAt: new Date().toISOString(),
        ttlSeconds: 3600,
        sessionId: 'claude-code-20260419T000000-test',
        goal: 'test session',
        status: 'running',
        lastCheckpointSummary: 'test summary',
        keyRefs: ['a.mjs'],
        handoffPath: '.aios/context-db/sessions/claude-code-20260419T000000-test/handoff.json',
      }),
      'utf8'
    );

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent', 'claude-code',
        '--workspace', workspaceRoot,
        '--project', 'test-proj',
        '--prompt', 'hello',
        '--dry-run',
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
        },
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0, `eager one-shot should exit 0, got ${result.status}; stderr: ${result.stderr}`);
    assert.match(result.stderr, /Context: none \(no prompt injection\)/);
    assert.match(result.stdout, /\[dry-run\]/);
    assert.doesNotMatch(result.stdout, /test session/);
    assert.doesNotMatch(result.stdout, /test summary/);
  } finally {
    await rm(workspaceRoot, { recursive: true }).catch(() => {});
  }
});

test('ctx-agent default interactive startup summarizes pending task without prompt injection', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-startup-summary-'));
  const fakeBinDir = await mkdtemp(path.join(os.tmpdir(), 'aios-startup-summary-bin-'));
  const codexBin = path.join(fakeBinDir, process.platform === 'win32' ? 'codex.cmd' : 'codex');

  try {
    const tasksDir = path.join(workspaceRoot, '.aios', 'tasks');
    const taskId = 'task_20260612T000000_follow_up';
    const taskRelPath = path.posix.join('pending', taskId, 'task.json');
    const taskDir = path.join(tasksDir, 'pending', taskId);
    await mkdir(taskDir, { recursive: true });
    await writeFile(path.join(tasksDir, '.current-task'), `${taskRelPath}\n`, 'utf8');
    await writeFile(
      path.join(taskDir, 'task.json'),
      `${JSON.stringify({
        id: taskId,
        title: 'Finish startup UX refactor',
        description: 'Replace implicit prompt injection with an explicit resume summary',
        type: 'implementation',
        status: 'pending',
        params: { checklist: ['Update startup summary', 'Run focused tests'] },
        created_at: '2026-06-12T00:00:00.000Z',
      }, null, 2)}\n`,
      'utf8'
    );

    const codexImpl = path.join(fakeBinDir, 'codex-fake.mjs');
    await writeFile(codexImpl, 'process.stdout.write(JSON.stringify({ marker: "STARTUP_SUMMARY_CODEX", argv: process.argv.slice(2) }) + "\\n");\n', 'utf8');
    const codexScript = process.platform === 'win32'
      ? `@echo off\r\n"${process.execPath}" "${codexImpl}" %*\r\n`
      : `#!/usr/bin/env sh\nexec "${process.execPath}" "${codexImpl}" "$@"\n`;
    await writeFile(codexBin, codexScript, 'utf8');
    if (process.platform !== 'win32') {
      const { chmod } = await import('node:fs/promises');
      await chmod(codexBin, 0o755);
    }

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent', 'codex-cli',
        '--workspace', workspaceRoot,
        '--project', 'test-proj',
        '--session', 'startup-summary-session',
        '--no-bootstrap',
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ''}`,
        },
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stderr, /AIOS: unfinished tasks/i);
    assert.match(result.stderr, /Finish startup UX refactor/);
    assert.match(result.stderr, /pending\/task_20260612T000000_follow_up\/task\.json/);
    assert.doesNotMatch(result.stdout, /Auto prompt: enabled/u);
    const payload = JSON.parse(String(result.stdout || '').trim().split(/\r?\n/).at(-1) || '{}');
    assert.equal(payload.marker, 'STARTUP_SUMMARY_CODEX');
    const argv = Array.isArray(payload.argv) ? payload.argv : [];
    assert.equal(argv.some((arg) => String(arg).includes('Finish startup UX refactor')), false);
    assert.equal(argv.some((arg) => String(arg).includes('ContextDB')), false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    await rm(fakeBinDir, { recursive: true, force: true }).catch(() => {});
  }
});


test('ctx-agent rejects the removed startup-mode option', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-startup-mode-removed-'));

  try {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent', 'codex-cli',
        '--workspace', workspaceRoot,
        '--project', 'test-proj',
        '--startup-mode', 'off',
        '--no-bootstrap',
      ],
      {
        cwd: repoRoot,
        env: process.env,
        encoding: 'utf8',
      }
    );

    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}\n${result.stdout}`, /--startup-mode has been removed/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test('ctx-agent interactive startup ignores removed startup env concepts and still avoids prompt injection', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-startup-env-ignored-'));
  const fakeBinDir = await mkdtemp(path.join(os.tmpdir(), 'aios-startup-env-bin-'));
  const codexBin = path.join(fakeBinDir, process.platform === 'win32' ? 'codex.cmd' : 'codex');

  try {
    const tasksDir = path.join(workspaceRoot, '.aios', 'tasks');
    const taskId = 'task_20260612T000001_env_ignored';
    const taskRelPath = path.posix.join('pending', taskId, 'task.json');
    const taskDir = path.join(tasksDir, 'pending', taskId);
    await mkdir(taskDir, { recursive: true });
    await writeFile(path.join(tasksDir, '.current-task'), `${taskRelPath}\n`, 'utf8');
    await writeFile(
      path.join(taskDir, 'task.json'),
      `${JSON.stringify({
        id: taskId,
        title: 'Legacy env should not control startup',
        status: 'pending',
      }, null, 2)}\n`,
      'utf8'
    );

    const codexImpl = path.join(fakeBinDir, 'codex-fake.mjs');
    await writeFile(codexImpl, 'process.stdout.write(JSON.stringify({ marker: "STARTUP_ENV_IGNORED_CODEX", argv: process.argv.slice(2) }) + "\\n");\n', 'utf8');
    const codexScript = process.platform === 'win32'
      ? `@echo off\r\n"${process.execPath}" "${codexImpl}" %*\r\n`
      : `#!/usr/bin/env sh\nexec "${process.execPath}" "${codexImpl}" "$@"\n`;
    await writeFile(codexBin, codexScript, 'utf8');
    if (process.platform !== 'win32') {
      const { chmod } = await import('node:fs/promises');
      await chmod(codexBin, 0o755);
    }

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent', 'codex-cli',
        '--workspace', workspaceRoot,
        '--project', 'test-proj',
        '--no-bootstrap',
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          CTXDB_INTERACTIVE_STARTUP: 'inject',
          PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ''}`,
        },
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stderr, /AIOS: unfinished tasks/i);
    assert.match(result.stderr, /Legacy env should not control startup/);
    const payload = JSON.parse(String(result.stdout || '').trim().split(/\r?\n/).at(-1) || '{}');
    assert.equal(payload.marker, 'STARTUP_ENV_IGNORED_CODEX');
    const argv = Array.isArray(payload.argv) ? payload.argv : [];
    assert.equal(argv.some((arg) => String(arg).includes('Legacy env should not control startup')), false);
    assert.equal(argv.some((arg) => String(arg).includes('ContextDB')), false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    await rm(fakeBinDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('ctx-agent interactive startup does not initialize memory layers', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-startup-no-memory-init-'));
  const fakeBinDir = await mkdtemp(path.join(os.tmpdir(), 'aios-startup-no-memory-bin-'));
  const codexBin = path.join(fakeBinDir, process.platform === 'win32' ? 'codex.cmd' : 'codex');
  const identityHome = path.join(workspaceRoot, '.identity');

  try {
    const codexImpl = path.join(fakeBinDir, 'codex-fake.mjs');
    await writeFile(codexImpl, 'process.stdout.write(JSON.stringify({ marker: "NO_MEMORY_INIT_CODEX", argv: process.argv.slice(2) }) + "\\n");\n', 'utf8');
    const codexScript = process.platform === 'win32'
      ? `@echo off\r\n"${process.execPath}" "${codexImpl}" %*\r\n`
      : `#!/usr/bin/env sh\nexec "${process.execPath}" "${codexImpl}" "$@"\n`;
    await writeFile(codexBin, codexScript, 'utf8');
    if (process.platform !== 'win32') {
      const { chmod } = await import('node:fs/promises');
      await chmod(codexBin, 0o755);
    }

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent', 'codex-cli',
        '--workspace', workspaceRoot,
        '--project', 'test-proj',
        '--no-bootstrap',
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          AIOS_IDENTITY_HOME: identityHome,
          PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ''}`,
        },
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stderr, /AIOS: no unfinished tasks\. Starting fresh\./);
    const payload = JSON.parse(String(result.stdout || '').trim().split(/\r?\n/).at(-1) || '{}');
    assert.equal(payload.marker, 'NO_MEMORY_INIT_CODEX');
    assert.equal(await pathExists(path.join(identityHome, 'SOUL.md')), false);
    assert.equal(await pathExists(path.join(identityHome, 'USER.md')), false);
    assert.equal(await pathExists(path.join(workspaceRoot, '.aios', 'context-db', 'sessions', 'workspace-memory--default', 'meta.json')), false);
    assert.equal(await pathExists(path.join(workspaceRoot, '.aios', 'context-db', '.facade.json')), false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    await rm(fakeBinDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('ctx-agent interactive startup does not inject persona and user profile overlays', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-lazy-persona-'));
  const sessionId = 'lazy-persona-session';
  const fakeBinDir = await mkdtemp(path.join(os.tmpdir(), 'aios-lazy-persona-bin-'));
  const codexBin = path.join(fakeBinDir, process.platform === 'win32' ? 'codex.cmd' : 'codex');

  try {
    const facadeDir = path.join(workspaceRoot, '.aios', 'context-db');
    await mkdir(facadeDir, { recursive: true });
    await writeFile(
      path.join(facadeDir, '.facade.json'),
      JSON.stringify({
        version: 1,
        generatedAt: new Date().toISOString(),
        ttlSeconds: 3600,
        sessionId,
        goal: 'lazy persona test',
        status: 'running',
        lastCheckpointSummary: 'ok',
        keyRefs: ['scripts/ctx-agent-core.mjs'],
        handoffPath: '.aios/context-db/sessions/lazy-persona-session/handoff.json',
      }),
      'utf8'
    );

    const identityHome = path.join(workspaceRoot, '.identity');
    await mkdir(identityHome, { recursive: true });
    await writeFile(path.join(identityHome, 'SOUL.md'), '# persona baseline\nAlways be concise.\n', 'utf8');
    await writeFile(path.join(identityHome, 'USER.md'), '# user profile\nPrefers Chinese.\n', 'utf8');

    const codexImpl = path.join(fakeBinDir, 'codex-fake.mjs');
    const codexImplScript = 'process.stdout.write(JSON.stringify({ marker: "LAZY_PERSONA_CODEX", argv: process.argv.slice(2) }) + "\\n");\n';
    await writeFile(codexImpl, codexImplScript, 'utf8');
    const codexScript = process.platform === 'win32'
      ? `@echo off\r\n"${process.execPath}" "${codexImpl}" %*\r\n`
      : `#!/usr/bin/env sh\nexec "${process.execPath}" "${codexImpl}" "$@"\n`;
    await writeFile(codexBin, codexScript, 'utf8');
    if (process.platform !== 'win32') {
      const { chmod } = await import('node:fs/promises');
      await chmod(codexBin, 0o755);
    }

    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent.mjs',
        '--agent', 'codex-cli',
        '--workspace', workspaceRoot,
        '--project', 'test-proj',
        '--session', sessionId,
        '--no-bootstrap',
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          AIOS_IDENTITY_HOME: identityHome,
          PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ''}`,
        },
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stderr, /AIOS: no unfinished tasks\. Starting fresh\./);
    const lines = String(result.stdout || '').trim().split(/\r?\n/);
    const payload = JSON.parse(lines.at(-1) || '{}');
    assert.equal(payload.marker, 'LAZY_PERSONA_CODEX');
    const argv = Array.isArray(payload.argv) ? payload.argv : [];
    assert.equal(argv.some((arg) => String(arg).includes('## Core Persona')), false);
    assert.equal(argv.some((arg) => String(arg).includes('Always be concise.')), false);
    assert.equal(argv.some((arg) => String(arg).includes('Prefers Chinese.')), false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    await rm(fakeBinDir, { recursive: true, force: true }).catch(() => {});
  }
});
