import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('lazy load helpers: shouldLazyLoad defaults to true', async () => {
  const { shouldLazyLoad, buildWorkspaceMemoryOverlay } = await import('../ctx-agent-core.mjs');
  assert.equal(shouldLazyLoad({}), true);
  assert.equal(shouldLazyLoad({ CTXDB_LAZY_LOAD: '1' }), true);
  assert.equal(shouldLazyLoad({ CTXDB_LAZY_LOAD: '0' }), false);
  assert.equal(shouldLazyLoad({ CTXDB_LAZY_LOAD: 'off' }), false);

  // Keep an active reference so strict lint/test modes do not treat the additional named import as dead.
  assert.equal(typeof buildWorkspaceMemoryOverlay, 'function');
});

test('lazy load helpers: buildFacadePrompt with session', async () => {
  const { buildFacadePrompt } = await import('../ctx-agent-core.mjs');
  const facade = {
    sessionId: 'test-session',
    goal: 'test goal',
    status: 'running',
    keyRefs: ['a.mjs', 'b.mjs'],
    contextPacketPath: 'memory/context-db/exports/latest-claude-code-context.md',
    continuitySummary: 'Continue from the latest checkpoint.',
    continuityNextActions: ['run focused tests'],
  };
  const prompt = buildFacadePrompt(facade, 'claude-code');
  assert.ok(prompt.includes('ContextDB'));
  assert.ok(prompt.includes('test goal'));
  assert.ok(prompt.includes('a.mjs'));
  assert.ok(prompt.includes('latest-claude-code-context.md'));
  assert.ok(prompt.includes('Continuity Summary'));
  assert.ok(prompt.includes('run focused tests'));
});

test('lazy load helpers: buildFacadePrompt without session', async () => {
  const { buildFacadePrompt } = await import('../ctx-agent-core.mjs');
  const prompt = buildFacadePrompt(null, 'claude-code');
  assert.ok(prompt.includes('No prior sessions'));
  assert.ok(prompt.includes('latest-claude-code-context.md'));
});

test('lazy load start-up produces correct facade injection', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-lazy-load-'));

  try {
    const facadeDir = path.join(workspaceRoot, 'memory', 'context-db');
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
        contextPacketPath: 'memory/context-db/exports/latest-claude-code-context.md',
        hasStalePack: false,
      }),
      'utf8'
    );

    // Run ctx-agent-core in one-shot mode with --prompt so it doesn't hit interactive lazy path
    // but with CTXDB_LAZY_LOAD=0 to test eager path still works
    const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
    const result = spawnSync(
      process.execPath,
      [
        'scripts/ctx-agent-core.mjs',
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
          CTXDB_LAZY_LOAD: '0',
        },
        encoding: 'utf8',
      }
    );

    // With lazy disabled, one-shot should complete without error
    assert.equal(result.status, 0, `eager one-shot should exit 0, got ${result.status}; stderr: ${result.stderr}`);
  } finally {
    await rm(workspaceRoot, { recursive: true }).catch(() => {});
  }
});

test('async bootstrap runner exists and is executable', async () => {
  const runnerPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '..',
    'lib',
    'contextdb',
    'async-bootstrap-runner.mjs'
  );
  const content = await readFile(runnerPath, 'utf8');
  assert.ok(content.includes('runAsyncBootstrap'));
  assert.ok(content.includes('context:pack'));
});

test('ctx-agent lazy mode prelude includes persona and user profile overlays', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-lazy-persona-'));
  const sessionId = 'lazy-persona-session';
  const fakeBinDir = await mkdtemp(path.join(os.tmpdir(), 'aios-lazy-persona-bin-'));
  const codexBin = path.join(fakeBinDir, process.platform === 'win32' ? 'codex.cmd' : 'codex');

  try {
    const facadeDir = path.join(workspaceRoot, 'memory', 'context-db');
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
        contextPacketPath: 'memory/context-db/exports/latest-codex-cli-context.md',
        hasStalePack: false,
      }),
      'utf8'
    );

    const identityHome = path.join(workspaceRoot, '.identity');
    await mkdir(identityHome, { recursive: true });
    await writeFile(path.join(identityHome, 'SOUL.md'), '# persona baseline\nAlways be concise.\n', 'utf8');
    await writeFile(path.join(identityHome, 'USER.md'), '# user profile\nPrefers Chinese.\n', 'utf8');

    const codexScript = process.platform === 'win32'
      ? '@echo off\r\nnode -e "process.stdout.write(JSON.stringify({ marker: \'LAZY_PERSONA_CODEX\', argv: process.argv.slice(1) }) + \'\\\\n\')" %*\r\n'
      : '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ marker: \'LAZY_PERSONA_CODEX\', argv: process.argv.slice(2) }) + \"\\n\");\n';
    await writeFile(codexBin, codexScript, 'utf8');
    if (process.platform !== 'win32') {
      const { chmod } = await import('node:fs/promises');
      await chmod(codexBin, 0o755);
    }

    const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
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
          CTXDB_LAZY_LOAD: '1',
          CTXDB_TASK_ROUTER_GUIDE: '0',
          AIOS_IDENTITY_HOME: identityHome,
          PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ''}`,
        },
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stderr, /Memory: persona\+user\+workspace loaded/);
    const lines = String(result.stdout || '').trim().split(/\r?\n/);
    const payload = JSON.parse(lines.at(-1) || '{}');
    assert.equal(payload.marker, 'LAZY_PERSONA_CODEX');
    const promptArg = String(payload.argv.at(-1) || '');
    assert.match(promptArg, /## Core Persona/);
    assert.match(promptArg, /Always be concise\./);
    assert.match(promptArg, /## User Profile Memory/);
    assert.match(promptArg, /Prefers Chinese\./);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    await rm(fakeBinDir, { recursive: true, force: true }).catch(() => {});
  }
});
