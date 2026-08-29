import { runClaudeUserPromptSubmitHook } from './auto-gate.mjs';
import { collectTurnRecall } from './turn-recall.mjs';

export function detectHookClient(payload = {}, env = process.env) {
  const explicit = String(payload.client || payload.clientId || env.AIOS_HOOK_CLIENT || '').trim().toLowerCase();
  if (explicit) return explicit;
  if (env.CLAUDE_PROJECT_DIR) return 'claude';
  if (env.CODEX_HOME || env.CODEX_THREAD_ID) return 'codex';
  if (env.GROK_HOME) return 'grok';
  if (env.WORKBUDDY_HOME) return 'workbuddy';
  return 'claude';
}

export async function runUserPromptSubmitHook({
  rootDir,
  stdinText = '',
  client = '',
  env = process.env,
} = {}) {
  let payload = {};
  try {
    payload = JSON.parse(stdinText || '{}');
  } catch {
    payload = {};
  }
  const resolvedClient = client && client !== 'all'
    ? String(client).trim().toLowerCase()
    : detectHookClient(payload, env);
  const { exitCode, output } = await runClaudeUserPromptSubmitHook({
    rootDir,
    stdinText,
    client: resolvedClient,
  });
  const recall = await collectTurnRecall({
    rootDir,
    message: payload.prompt || payload.message || '',
    decision: output.decision,
  });
  if (recall) {
    output.additionalContext = `${output.additionalContext || ''}${output.additionalContext ? '\n' : ''}${recall}`;
    if (output.hookSpecificOutput) {
      output.hookSpecificOutput.additionalContext = output.additionalContext;
    }
  }
  return { exitCode, output, client: resolvedClient };
}
