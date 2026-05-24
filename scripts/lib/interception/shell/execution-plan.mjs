/* 中文注释：执行计划把 planner 的决策转成 runner 可执行形态，避免 wrapper 自己拼 if/else。 */
export function buildShellExecutionPlan({ command, args = [], decision }) {
  const originalCommand = String(command || '').trim();
  const originalArgs = Array.isArray(args) ? args.map(String) : [];
  const originalText = originalArgs.length > 0 ? `${originalCommand} ${originalArgs.join(' ')}` : originalCommand;

  if (decision?.action !== 'rewrite') {
    return {
      command: originalCommand,
      args: originalArgs,
      shell: originalArgs.length === 0,
      commandText: originalText,
      originalCommandText: originalText,
      rewritten: false,
    };
  }

  const rewrittenCommand = String(decision.rewrittenCommand || originalText).trim();
  return {
    command: rewrittenCommand,
    args: [],
    shell: true,
    commandText: rewrittenCommand,
    originalCommandText: originalText,
    rewritten: rewrittenCommand !== originalText,
  };
}
