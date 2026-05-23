import { assertWorkspaceMemoryContentSafe } from '../safety.mjs';

export function assertSafeMemoText(text, target = 'memo content') {
  assertWorkspaceMemoryContentSafe(text, {
    allowEmpty: false,
    target,
  });
}

export function assertMaxChars(text, maxChars, target = 'memo content') {
  const content = String(text ?? '');
  if (content.length <= maxChars) return;
  const error = new Error(`${target} exceeds capacity (${content.length}/${maxChars} chars)`);
  error.code = 'AIOS_MEMO_CAPACITY';
  throw error;
}
