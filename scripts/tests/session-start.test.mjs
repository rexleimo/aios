/* 中文注释：session start 会话注册（批次 1）行为测试。
 * 覆盖：sessionId 生成规则、幂等重入、contextdb CLI 调用参数、registry index 写入。
 * contextdb CLI 通过注入 impl 模拟，不依赖真实 CLI。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildSessionId, ensureContextDbSession, sessionMetaPath } from '../lib/lifecycle/session-hooks/start-session.mjs';
import { runSessionStartTimeline } from '../lib/lifecycle/session-hooks/start-timeline.mjs';
import { parseSessionArgs } from '../lib/cli/parse-args/session.mjs';

function recordingCliImpl() {
  const calls = [];
  const impl = (args) => {
    calls.push(args);
    return { status: 0 };
  };
  return { calls, impl };
}

test('buildSessionId: clientId-stamp 风格且合法字符', () => {
  const id = buildSessionId({ agent: 'OpenCode CLI', now: new Date('2026-09-02T05:00:00.000Z') });
  assert.match(id, /^opencode-cli-\d{8}T\d{6}Z$/);
});

test('ensureContextDbSession: 首次调用建会话并写 index', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-session-start-'));
  const { calls, impl } = recordingCliImpl();
  const result = await ensureContextDbSession({
    rootDir: root, sessionId: '', agent: 'opencode-cli', client: 'opencode', runContextDbCliImpl: impl,
  });
  assert.equal(result.created, true);
  assert.equal(result.errors.length, 0);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ['init', '--workspace', root]);
  assert.equal(calls[1][0], 'session:new');
  assert.ok(calls[1].includes('--session-id'));
  const index = JSON.parse(await readFile(path.join(root, '.aios', 'context-db', 'index.json'), 'utf8'));
  assert.equal(index.session, result.sessionId);
  assert.equal(index.status, 'running');
  assert.equal(index.agent, 'opencode-cli');
});

test('ensureContextDbSession: 同 id 重入幂等，不重复调用 CLI', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-session-start-'));
  const { calls, impl } = recordingCliImpl();
  const first = await ensureContextDbSession({ rootDir: root, sessionId: 's-fixed', agent: 'codex', runContextDbCliImpl: impl });
  // 模拟真实 CLI 落盘 meta.json（impl 只记录调用不写文件）
  const metaDir = sessionMetaPath(root, first.sessionId);
  await mkdir(path.dirname(metaDir), { recursive: true });
  await writeFile(metaDir, '{}', 'utf8');
  const second = await ensureContextDbSession({ rootDir: root, sessionId: first.sessionId, agent: 'codex', runContextDbCliImpl: impl });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(calls.length, 2); // 只有首次 init + session:new
});

test('ensureContextDbSession: 显式 sessionId 且 meta 已存在则跳过建会话', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-session-start-'));
  const metaDir = sessionMetaPath(root, 's-existing');
  await mkdir(path.dirname(metaDir), { recursive: true });
  await writeFile(metaDir, '{}', 'utf8');
  const { calls, impl } = recordingCliImpl();
  const result = await ensureContextDbSession({ rootDir: root, sessionId: 's-existing', agent: 'claude', runContextDbCliImpl: impl });
  assert.equal(result.created, false);
  assert.equal(calls.length, 0);
});

test('ensureContextDbSession: CLI 失败不抛出，错误进 errors 且 index 仍写入', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-session-start-'));
  const failing = () => { throw new Error('cli boom'); };
  const result = await ensureContextDbSession({ rootDir: root, sessionId: 's-fail', agent: 'gemini', runContextDbCliImpl: failing });
  assert.equal(result.created, true);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /cli boom/);
  const index = JSON.parse(await readFile(path.join(root, '.aios', 'context-db', 'index.json'), 'utf8'));
  assert.equal(index.session, 's-fail');
});

test('parseSessionArgs: --session-id/--agent/--client 映射到 options', () => {
  const parsed = parseSessionArgs(['session', 'start', '--json', '--session-id', 's1', '--agent', 'opencode-cli', '--client', 'opencode']);
  assert.equal(parsed.mode, 'command');
  assert.equal(parsed.options.subcommand, 'start');
  assert.equal(parsed.options.sessionId, 's1');
  assert.equal(parsed.options.agent, 'opencode-cli');
  assert.equal(parsed.options.client, 'opencode');
  assert.equal(parsed.options.json, true);
});

test('runSessionStartTimeline: --json 输出 { registration, lines } 契约（register=false 不触 CLI）', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-session-start-json-'));
  let out = '';
  const stdout = { write: (chunk) => { out += String(chunk); } };
  const result = await runSessionStartTimeline({ register: false, json: true, limit: 5 }, { rootDir: root, stdout });
  assert.equal(result.exitCode, 0);
  assert.equal(result.registration, null);
  const payload = JSON.parse(out);
  assert.equal(payload.registration, null);
  assert.ok(Array.isArray(payload.lines));
});
