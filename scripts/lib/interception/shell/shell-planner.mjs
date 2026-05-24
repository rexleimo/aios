/* 中文注释：Shell 层在命令输出边界截获 stdout/stderr，保留 ref 后只返回可行动摘要。 */
/* 中文注释：planner 只做轻量规则判断；真正执行和压缩不在这里，避免安全策略和输出策略耦合。 */
export function planShellInterception({ command }) {
  const text = String(command || '').trim();
  if (!text) {
    return { action: 'passthrough', reason: 'empty command', strategy: 'empty' };
  }

  if (isDestructive(text)) {
    return {
      action: 'ask',
      reason: 'destructive command requires human confirmation',
      strategy: 'destructive-safety-gate',
    };
  }

  if (isBroadFileRead(text)) {
    return {
      action: 'rewrite',
      reason: 'broad file read should be bounded before entering model context',
      strategy: 'bounded-file-read',
      rewrittenCommand: rewriteBroadFileRead(text),
    };
  }

  if (/\bgit\s+diff\b/i.test(text) && !/--stat|--name-only|--name-status/i.test(text)) {
    const separator = /\s--\s/.test(text) ? ' --stat' : ' --stat';
    return {
      action: 'rewrite',
      reason: 'large diffs should start with stats before targeted hunks',
      strategy: 'bounded-git-diff',
      rewrittenCommand: `${text}${separator}`,
    };
  }

  return {
    action: 'passthrough',
    reason: 'no rewrite rule matched',
    strategy: 'passthrough-with-output-shrink',
  };
}

/* 中文注释：递归删除类命令必须走人工确认，不能为了自动化节流牺牲安全边界。 */
function isDestructive(command) {
  return /\b(Remove-Item|rm|del|rmdir)\b/i.test(command)
    && /(?:^|\s)(-Recurse|-r|-rf|\/s)(?:\s|$)/i.test(command);
}

/* 中文注释：无边界读文件是最常见的上下文爆炸来源，先改成首尾采样，再保留 raw ref 召回。 */
function isBroadFileRead(command) {
  return /^\s*(Get-Content|cat|type)\b/i.test(command) && !/\b(-TotalCount|-Tail|head|tail|Select-Object\s+-First)\b/i.test(command);
}

/* 中文注释：PowerShell 和 POSIX shell 的采样命令不同，这里按原命令类型生成等价的 bounded read。 */
function rewriteBroadFileRead(command) {
  const match = command.match(/^\s*(Get-Content|cat|type)\s+(.+?)\s*$/i);
  if (!match) return command;
  const executable = match[1].toLowerCase();
  const target = match[2];
  if (executable === 'get-content') {
    return `Get-Content ${target} -TotalCount 120; Get-Content ${target} -Tail 40`;
  }
  return `head -n 120 ${target}; tail -n 40 ${target}`;
}
