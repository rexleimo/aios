import { CONTINUATION_PATTERNS, RECALL_PATTERNS } from '../../planning/resume-phrases.mjs';

const REFERENCE_PATTERNS = [
  /那个文件/,
  /\bthe\s+file\s+we\s+edited\b/i,
  /\bthe\s+plan\s+from\s+yesterday\b/i,
  /\bthe\s+code\s+we\s+wrote\b/i,
];

const META_PATTERNS = [
  /\bcontext\b/i,
  /\bmemory\b/i,
  /\bsession\b/i,
  /\bhistory\b/i,
  /\bcheckpoint\b/i,
];

const NEGATIVE_PATTERNS = [
  /\bnew\s+session\b/i,
  /\bignore\s+history\b/i,
  /\bignore\s+context\b/i,
  /从零开始/,
  /重新开始/,
];

function matchesAny(text, patterns) {
  return patterns.some((p) => p.test(text));
}

export function detectIntent(userInput) {
  const text = String(userInput || '');

  if (matchesAny(text, NEGATIVE_PATTERNS)) {
    return { shouldLoad: false, reason: 'intent:negative' };
  }
  if (matchesAny(text, RECALL_PATTERNS)) {
    return { shouldLoad: true, reason: 'intent:recall' };
  }
  if (matchesAny(text, CONTINUATION_PATTERNS)) {
    return { shouldLoad: true, reason: 'intent:continuation' };
  }
  if (matchesAny(text, REFERENCE_PATTERNS)) {
    return { shouldLoad: true, reason: 'intent:reference' };
  }
  if (matchesAny(text, META_PATTERNS)) {
    return { shouldLoad: true, reason: 'intent:meta' };
  }
  return { shouldLoad: false, reason: 'intent:none' };
}
