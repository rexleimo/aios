export const RECALL_PATTERNS = [
  /\bremember\b/i,
  /\brecall\b/i,
  /之前/,
  /上次/,
  /上次说/,
  /刚才说/,
  /我们讨论过/,
  /上次那个/,
  /\bprevious\b/i,
  /\blast\s+time\b/i,
];

export const CONTINUATION_PATTERNS = [
  /继续/,
  /接着/,
  /往下做/,
  /接着做/,
  /接着改/,
  /下一步/,
  /\bresume\b/i,
  /\bkeep\s+going\b/i,
  /\bgo\s+on\b/i,
  /\bnext\s+step\b/i,
  /\bpick\s+up\s+where\b/i,
  /\bwhere\s+did\s+we\s+leave\s+off\b/i,
];

export const RESUME_PREFIX = /^(?:(?:please\s+)?(?:resume|continue|pick\s+up|carry\s+on|keep\s+going|go\s+on|next\s+step)|\u7ee7\u7eed|\u63a5\u7740|\u6062\u590d|\u7eed\u4e0a|\u5f80\u4e0b\u505a|\u63a5\u7740\u505a|\u63a5\u7740\u6539|\u4e0b\u4e00\u6b65)[\s,;:!?\u3002\u3001\uff0c\uff01\uff1f-]*/iu;
