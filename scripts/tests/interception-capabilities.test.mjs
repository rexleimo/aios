/* 中文注释：Interception 回归测试覆盖压缩、召回、指标和客户端配置，防止链路退化成 prompt-only。 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const capabilities = JSON.parse((await readFile(new URL('../../config/host-capabilities.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));

test('host capability matrix is honest about Codex raw shell limitation', () => {
  assert.equal(capabilities.clients.codex.targetLevel, 'L2');
  assert.match(capabilities.clients.codex.limits.join('\n'), /Do not claim raw host shell L3/);
});

test('AIOS harness is the controlled L3 runtime target', () => {
  assert.equal(capabilities.clients['aios-harness'].targetLevel, 'L3');
  assert.equal(capabilities.clients['aios-harness'].capabilities.includes('controlledShellRunner'), true);
  assert.equal(capabilities.clients['aios-harness'].capabilities.includes('compactPacket'), true);
});

test('Claude stays L2 until pre-tool rewrite hook adapter is installed', () => {
  assert.equal(capabilities.clients.claude.targetLevel, 'L2');
  assert.equal(capabilities.clients.claude.capabilities.includes('preToolRewrite'), false);
  assert.match(capabilities.clients.claude.limits.join('\n'), /pre-tool rewrite hook/);
});

test('Cursor remains advisory until a real hook surface exists', () => {
  assert.equal(capabilities.clients.cursor.targetLevel, 'L1');
  assert.match(capabilities.clients.cursor.limits.join('\n'), /verified extension\/hook surface/);
});
