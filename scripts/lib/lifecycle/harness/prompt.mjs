import { normalizeText } from './shared.mjs';

function extractJsonFence(text = '') {
  const fenced = /```json\s*([\s\S]*?)```/iu.exec(String(text || ''));
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const trimmed = String(text || '').trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return '';
}

function formatOffloadCanvasPromptBlock(offloadCanvas = null) {
  if (!offloadCanvas?.mermaid) {
    return 'Offload Canvas：暂无。';
  }
  const lines = [
    'Offload Canvas：',
    `- Path: ${offloadCanvas.relativePath || offloadCanvas.path || '(unknown)'}`,
    '- Recall: 先看图定位 node_id；需要原始证据时只用 `aios refs grep/read` 读取对应节点，不要回放完整 l2-events/tool logs。',
    '```mermaid',
    String(offloadCanvas.mermaid).trimEnd(),
    '```',
  ];
  if (offloadCanvas.truncated) {
    lines.splice(3, 0, '- Truncated: yes');
  }
  return lines.join('\n');
}

export function buildIterationPrompt({
  objective = '',
  iteration = 1,
  continuity = null,
  summary = null,
  offloadCanvas = null,
} = {}) {
  const continuityText = continuity?.summary
    ? `上一轮连续性总结：${continuity.summary}`
    : '上一轮连续性总结：暂无。';
  const lastOutcome = normalizeText(summary?.lastOutcome) || 'none';
  const lastFailure = normalizeText(summary?.lastFailureClass) || 'none';

  return [
    `你正在执行 AIOS solo harness 的第 ${iteration} 轮。`,
    `当前目标：${normalizeText(objective) || '(empty)'}`,
    continuityText,
    formatOffloadCanvasPromptBlock(offloadCanvas),
    `上一轮 outcome：${lastOutcome}`,
    `上一轮 failureClass：${lastFailure}`,
    '',
    '请完成一轮工作后只返回一个 JSON 对象，不要输出解释文字，不要输出 Markdown。',
    'JSON 必须包含这些字段：',
    '- outcome: success|noop|blocked|infra-retry|human-gate|stopped|failed',
    '- stage: research|requirements|planning|development|validation|handoff',
    '- summary: 简短中文总结',
    '- evidence: string[]，列出本轮真实证据（文件、命令、截图、checkpoint 或阻塞原因）',
    '- keyChanges: string[]',
    '- keyLearnings: string[]',
    '- nextAction: string',
    '- shouldStop: boolean',
    '- failureClass: none|no-progress|tool-error|runtime-error|workspace-mutation|ownership-gate|safety-gate|stop-requested',
    '',
    '规则：',
    '- 如果已完成目标或本轮不应继续，shouldStop=true。',
    '- 如果需要人工介入，outcome=human-gate。',
    '- 如果只是 CLI/网络/超时等基础设施问题，outcome=infra-retry。',
    '- 如果没有安全的下一步推进但可以之后继续，outcome=blocked, failureClass=no-progress。',
  ].join('\n');
}

export function parseHarnessJsonOutput(rawOutput = '') {
  const jsonText = extractJsonFence(rawOutput);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}
