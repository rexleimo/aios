/* 中文注释：CLI rewrite 子命令服务 host-native hooks；默认 fail-open，避免 hook 故障阻断用户命令。 */
import { buildClaudePreToolUseRewriteResponse, rewriteShellCommand } from './shell/command-rewrite.mjs';

export function runInterceptionRewrite(options = {}, { io = console } = {}) {
  const hook = String(options.hook || '').trim().toLowerCase();
  const asJson = Boolean(options.json);
  let result;

  if (hook === 'claude') {
    result = buildClaudePreToolUseRewriteResponse(parseHookInput(options.input), options);
  } else {
    result = { ok: true, decision: rewriteShellCommand(options.commandText || options.command || '', options) };
  }

  if (hook) {
    io.log(JSON.stringify(result.response || {}, null, 2));
  } else if (asJson) {
    io.log(JSON.stringify(result, null, 2));
  } else if (result.decision?.action === 'rewrite') {
    io.log(result.decision.rewrittenCommand);
  } else {
    io.log(options.commandText || options.command || '');
  }

  return { exitCode: 0, ...result };
}

function parseHookInput(input) {
  if (!input) return {};
  if (typeof input === 'object') return input;
  try {
    return JSON.parse(String(input));
  } catch {
    return {};
  }
}
