#!/usr/bin/env node
/* 中文注释：CLI 网关把普通命令包成 envelope，统一进入 interception shell 链路。 */
import { decodeEnvelope } from './lib/interception/core/envelope.mjs';
import { runShellEnvelope } from './lib/interception/shell/shell-wrapper.mjs';

const args = process.argv.slice(2);
const mode = args[0];

try {
  /* 中文注释：当前入口只暴露 shell 模式，避免外部绕过 envelope 直接传任意参数进执行层。 */
  if (mode !== 'shell') {
    throw new Error('usage: node scripts/aios-intercept.mjs shell --envelope <base64url-json>');
  }
  const envelopeArgIndex = args.indexOf('--envelope');
  if (envelopeArgIndex < 0 || !args[envelopeArgIndex + 1]) {
    throw new Error('missing --envelope');
  }
  /* 中文注释：envelope 里包含 command/cwd/session/host 等上下文，解码后交给统一 shell wrapper。 */
  const envelope = decodeEnvelope(args[envelopeArgIndex + 1]);
  const packet = await runShellEnvelope({
    envelope,
    workspaceRoot: envelope.workspaceRoot || envelope.cwd || process.cwd(),
    sessionId: envelope.sessionId || process.env.AIOS_SESSION_ID || 'default',
    host: envelope.host || process.env.AIOS_HOST || 'aios-harness',
    metrics: { enabled: process.env.AIOS_INTERCEPTION_METRICS !== '0' },
  });
  /* 中文注释：stdout 只输出 compact packet；如果需要原文，用户通过 packet.recall 的 ref 命令读取。 */
  process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
  process.exitCode = packet.safety?.requires_human ? 2 : 0;
} catch (error) {
  process.stderr.write(`[aios-intercept] ${error.message}\n`);
  process.exitCode = 1;
}
