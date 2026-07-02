#!/usr/bin/env node
/**
 * @deprecated AIOS 原生拦截运行时已废弃。Token 压缩改由社区工具 RTK + Caveman 处理。
 * 本文件保留供参考，不再积极维护。请通过 `aios init` 安装 RTK + Caveman。
 * 迁移指南见 .claude/skills/aios-interception-runtime/SKILL.md
 */
/* 中文注释：CLI 网关把普通命令包成 envelope，统一进入 interception shell 链路。 */
import { decodeEnvelope } from './lib/interception/core/envelope.mjs';
import { runShellEnvelope } from './lib/interception/shell/shell-wrapper.mjs';

const args = process.argv.slice(2);
const mode = args[0];

try {
  /* 中文注释：当前入口只暴露 shell 模式，避免外部绕过 envelope 直接传任意参数进执行层。 */
  if (mode !== 'shell') {
    throw new Error('usage: node scripts/aios-intercept.mjs shell (--envelope <base64url-json> | -- <command...>)');
  }
  const envelopeArgIndex = args.indexOf('--envelope');
  const separatorIndex = args.indexOf('--');
  let envelope;
  if (envelopeArgIndex >= 0 && args[envelopeArgIndex + 1]) {
    /* 中文注释：envelope 里包含 command/cwd/session/host 等上下文，解码后交给统一 shell wrapper。 */
    envelope = decodeEnvelope(args[envelopeArgIndex + 1]);
  } else if (separatorIndex >= 0 && args.length > separatorIndex + 1) {
    /* 中文注释：hook rewrite 走短命令形态，便于 updatedInput 直接替换原 Bash command。 */
    const commandParts = args.slice(separatorIndex + 1);
    envelope = {
      command: commandParts[0],
      args: commandParts.slice(1),
      cwd: process.cwd(),
      workspaceRoot: process.cwd(),
      sessionId: process.env.AIOS_SESSION_ID || 'default',
      host: process.env.AIOS_HOST || 'aios-hook',
    };
  } else {
    throw new Error('missing --envelope or -- <command...>');
  }
  const packet = await runShellEnvelope({
    envelope,
    workspaceRoot: envelope.workspaceRoot || envelope.cwd || process.cwd(),
    sessionId: envelope.sessionId || process.env.AIOS_SESSION_ID || 'default',
    host: envelope.host || process.env.AIOS_HOST || 'aios-harness',
    metrics: { enabled: process.env.AIOS_INTERCEPTION_METRICS !== '0' },
  });
  /* 中文注释：stdout 只输出 compact packet；如果需要原文，用户通过 packet.recall 的 ref 命令读取。 */
  process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
  process.exitCode = Number.isInteger(packet.exit_code) ? packet.exit_code : (packet.safety?.requires_human ? 2 : 0);
} catch (error) {
  process.stderr.write(`[aios-intercept] ${error.message}\n`);
  process.exitCode = 1;
}
