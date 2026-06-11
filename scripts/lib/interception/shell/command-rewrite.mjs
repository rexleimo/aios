/* 中文注释：命令级 rewrite 是高触发率入口；hook 只调用这里，具体规则保持单一事实源。 */
import path from 'node:path';

import { encodeEnvelope } from '../core/envelope.mjs';

const REWRITE_HEADS = new Set([
  'cat',
  'find',
  'git',
  'grep',
  'ls',
  'npm',
  'pnpm',
  'pytest',
  'rg',
  'yarn',
]);

const REWRITE_PREFIXES = [
  /^cargo\s+(?:test|build|clippy)\b/u,
  /^go\s+test\b/u,
  /^node\s+--test\b/u,
  /^npm\s+(?:test|run|exec|install|ci)\b/u,
  /^pnpm\s+(?:test|run|exec|install)\b/u,
  /^python3?\s+-m\s+pytest\b/u,
];

export function rewriteShellCommand(command, options = {}) {
  const original = String(command || '').trim();
  if (!original) {
    return { action: 'passthrough', reason: 'empty command', strategy: 'empty', originalCommand: original };
  }
  if (hasUnsupportedShellConstruct(original)) {
    return {
      action: 'passthrough',
      reason: 'unsupported shell construct',
      strategy: 'shell-construct-guard',
      originalCommand: original,
    };
  }
  if (requiresHostPermissionReview(original)) {
    return {
      action: 'passthrough',
      reason: 'sensitive command requires host permission review',
      strategy: 'host-permission-review',
      originalCommand: original,
    };
  }

  const rewritten = rewriteCompoundCommand(original, options);
  if (rewritten === original) {
    if (startsWithAiosIntercept(original)) {
      return {
        action: 'passthrough',
        reason: 'already routed through AIOS interception',
        strategy: 'already-aios-intercepted',
        originalCommand: original,
      };
    }
    return {
      action: 'passthrough',
      reason: 'no command rewrite rule matched',
      strategy: 'no-match',
      originalCommand: original,
    };
  }
  return {
    action: 'rewrite',
    reason: 'command matches AIOS shell interception registry',
    strategy: 'aios-shell-command-wrapper',
    originalCommand: original,
    rewrittenCommand: rewritten,
  };
}

export function buildClaudePreToolUseRewriteResponse(input = {}, options = {}) {
  const toolName = String(input?.tool_name || input?.toolName || '').trim();
  const toolInput = input?.tool_input || input?.toolInput || {};
  const command = String(toolInput?.command || '').trim();

  if (!isShellTool(toolName) || !command) {
    return {
      ok: true,
      response: {},
      decision: { action: 'passthrough', reason: 'not a shell command tool', strategy: 'not-shell-tool' },
    };
  }

  const decision = rewriteShellCommand(command, { ...options, envelope: true });
  if (decision.action !== 'rewrite') {
    return { ok: true, response: {}, decision };
  }

  return {
    ok: true,
    decision,
    response: {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: {
          ...toolInput,
          command: decision.rewrittenCommand,
        },
      },
    },
  };
}

export function buildShellEnvelopeCommand(command, options = {}) {
  const envelope = {
    command,
    cwd: options.cwd || process.cwd(),
    workspaceRoot: options.workspaceRoot || options.cwd || process.cwd(),
    sessionId: options.sessionId || process.env.AIOS_SESSION_ID || 'default',
    host: options.host || process.env.AIOS_HOST || 'aios-hook',
  };
  return `${buildAiosInterceptPrefix(options)} --envelope ${encodeEnvelope(envelope)}`;
}

function rewriteCompoundCommand(command, options) {
  return splitShellCommandPreservingSeparators(command)
    .map((part) => {
      if (!part || part.type === 'separator') return part.text;
      const text = part.text.trim();
      if (!text) return part.text;
      return shouldRewriteSimpleCommand(text) ? buildWrappedCommand(text, options) : part.text;
    })
    .join('');
}

function splitShellCommandPreservingSeparators(command) {
  const parts = [];
  let quote = '';
  let escaped = false;
  let start = 0;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    const next = command[index + 1] || '';

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    const separatorLength = char === ';' ? 1 : ((char === '&' && next === '&') || (char === '|' && next === '|') ? 2 : 0);
    if (separatorLength === 0) continue;

    let separatorStart = index;
    while (separatorStart > start && /\s/u.test(command[separatorStart - 1])) separatorStart -= 1;
    let separatorEnd = index + separatorLength;
    while (separatorEnd < command.length && /\s/u.test(command[separatorEnd])) separatorEnd += 1;

    parts.push({ type: 'command', text: command.slice(start, separatorStart) });
    parts.push({ type: 'separator', text: command.slice(separatorStart, separatorEnd) });
    start = separatorEnd;
    index = separatorEnd - 1;
  }

  parts.push({ type: 'command', text: command.slice(start) });
  return parts;
}

function buildWrappedCommand(command, options) {
  if (options.envelope === true) return buildShellEnvelopeCommand(command, options);
  return `${buildAiosInterceptPrefix(options)} -- ${command}`;
}

function buildAiosInterceptPrefix(options = {}) {
  const rootDir = String(options.rootDir || options.aiosRootDir || '').trim();
  const scriptPath = rootDir ? path.join(rootDir, 'scripts', 'aios-intercept.mjs') : 'scripts/aios-intercept.mjs';
  return `node ${formatShellArg(scriptPath)} shell`;
}

function formatShellArg(value = '') {
  const text = String(value ?? '');
  if (/^[A-Za-z0-9_./:@=-]+$/u.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function isAlreadyAiosIntercept(command) {
  return /\baios-intercept\.mjs\s+shell\b/u.test(command);
}

function startsWithAiosIntercept(command) {
  const stripped = stripEnvPrefix(stripShellPrefix(String(command || '').trim()));
  return /^node\s+(?:"[^"]*aios-intercept\.mjs"|'[^']*aios-intercept\.mjs'|[^\s]*aios-intercept\.mjs)\s+shell\b/u.test(stripped);
}

function hasUnsupportedShellConstruct(command) {
  let quote = '';
  let escaped = false;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    const next = command[index + 1] || '';

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (quote === '"' && char === '$' && next === '(') return true;
      if (quote === '"' && char === '`') return true;
      if (char === quote) quote = '';
      continue;
    }
    if (char === '\n' || char === '\r') return true;
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '`' || char === '<' || char === '>') return true;
    if (char === '&') {
      if (next === '&') {
        index += 1;
        continue;
      }
      return true;
    }
    if (char === '|') {
      if (next === '|') {
        index += 1;
        continue;
      }
      return true;
    }
    if (char === '$' && next === '(') return true;
  }
  return false;
}

function requiresHostPermissionReview(command) {
  return splitShellCommandPreservingSeparators(command).some((part) => {
    if (!part || part.type === 'separator') return false;
    const stripped = stripEnvPrefix(stripShellPrefix(part.text.trim()));
    return /^git\s+push\b/u.test(stripped)
      || /^(?:npm|pnpm|yarn)\s+publish\b/u.test(stripped);
  });
}

function isShellTool(toolName) {
  return /^(Bash|bash|Shell|shell|run_shell_command)$/u.test(toolName);
}

function shouldRewriteSimpleCommand(command) {
  const stripped = stripEnvPrefix(stripShellPrefix(command));
  if (isAlreadyAiosIntercept(stripped)) return false;
  if (REWRITE_PREFIXES.some((pattern) => pattern.test(stripped))) return true;
  const head = stripped.split(/\s+/u)[0] || '';
  return REWRITE_HEADS.has(head);
}

function stripShellPrefix(command) {
  return command.replace(/^(?:noglob|command|builtin|exec|nocorrect)\s+/u, '');
}

function stripEnvPrefix(command) {
  let rest = command.trim();
  while (/^[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+/u.test(rest)) {
    rest = rest.replace(/^[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+/u, '');
  }
  return rest;
}
