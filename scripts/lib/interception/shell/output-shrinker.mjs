/* 中文注释：Shell 层在命令输出边界截获 stdout/stderr，保留 ref 后只返回可行动摘要。 */
/* 中文注释：压缩策略优先保留错误、路径、首尾关键线索；这比简单 head/tail 更接近 Caveman 的“只留可行动信息”。 */
export function shrinkToolOutput(raw, { exitCode = 0, thresholds = {} } = {}) {
  const text = String(raw ?? '');
  if (!text) {
    return {
      summary: '',
      keyLines: [],
      errors: [],
      compactText: '',
      strategy: 'empty',
    };
  }

  const lines = text.split(/\r?\n/);
  const errorLines = selectErrorLines(lines, thresholds.maxErrorLines ?? 8);
  const keyLines = selectKeyLines(lines, thresholds.maxKeyLines ?? 12, errorLines);
  const summary = buildSummary(lines, errorLines, exitCode, thresholds.maxSummaryLines ?? 8);
  const compactText = [summary, ...errorLines, ...keyLines].filter(Boolean).join('\n');

  return {
    summary,
    keyLines,
    errors: errorLines,
    compactText,
    strategy: lines.length > 12 ? 'head-tail-error-paths' : 'small-output',
  };
}

/* 中文注释：错误行是最高价值信号，先独立抽取，防止被普通日志行挤掉。 */
function selectErrorLines(lines, limit) {
  const matches = [];
  for (const line of lines) {
    if (/\b(error|failed|failure|exception|traceback|panic|fatal)\b/i.test(line)) {
      matches.push(trimLine(line));
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

/* 中文注释：关键行优先找文件路径、行号、exit/status；如果找不到，再退回首尾采样。 */
function selectKeyLines(lines, limit, errorLines) {
  const seen = new Set(errorLines);
  const matches = [];
  for (const line of lines) {
    const trimmed = trimLine(line);
    if (!trimmed || seen.has(trimmed)) continue;
    if (/[A-Za-z]:\\|\.m?[jt]s:\d+|\.tsx?:\d+|\.py:\d+|\.rs:\d+|\.go:\d+|exit code|status/i.test(trimmed)) {
      matches.push(trimmed);
      seen.add(trimmed);
      if (matches.length >= limit) break;
    }
  }
  if (matches.length > 0) return matches;
  for (const line of [...lines.slice(0, 3), ...lines.slice(-3)]) {
    const trimmed = trimLine(line);
    if (!trimmed || seen.has(trimmed)) continue;
    if (isLowSignalLongLine(trimmed)) {
      matches.push(`[long low-signal line omitted: ${trimmed.length} chars]`);
      continue;
    }
    matches.push(trimmed);
    seen.add(trimmed);
    if (matches.length >= limit) break;
  }
  return matches;
}

/* 中文注释：summary 是 packet 第一眼信息；失败时直接用第一条错误，成功时用短首屏摘要。 */
function buildSummary(lines, errorLines, exitCode, maxLines) {
  if (errorLines.length > 0) return errorLines[0];
  const compact = lines
    .map(trimLine)
    .filter(Boolean)
    .map(line => isLowSignalLongLine(line) ? `[long low-signal line omitted: ${line.length} chars]` : line)
    .slice(0, maxLines)
    .join(' | ');
  if (compact) return compact;
  return exitCode === 0 ? 'command completed with no output' : `command exited with code ${exitCode}`;
}

/* 中文注释：单行截断保护模型上下文，完整内容仍可通过 raw ref 召回。 */
function trimLine(line) {
  const text = String(line ?? '').trim();
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

/* 中文注释：超长低信号行通常是 HTML/base64/打包日志，保留长度提示即可，不直接塞回 packet。 */
function isLowSignalLongLine(line) {
  if (line.length < 160) return false;
  return !/\b(error|failed|failure|exception|traceback|panic|fatal)\b|[A-Za-z]:\\|\.[cm]?[jt]sx?:\d+|\.\w+:\d+/i.test(line);
}
