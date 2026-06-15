import path from 'node:path';

import {
  AIOS_NATIVE_JSON_KEY,
  hasManagedMarkdownBlock,
  parseJsonObject,
  wrapManagedMarkdown,
} from '../emitters/shared.mjs';
import {
  buildIssue,
  formatOperationTarget,
  readOptional,
  withIssueTarget,
} from './shared.mjs';

export async function inspectOperation({ targetRootDir, client, operation, fixCommand, issues }) {
  const targetPath = path.join(targetRootDir, operation.targetPath);
  const current = await readOptional(targetPath);
  const operationTarget = formatOperationTarget(operation);

  if (operation.kind === 'markdown-block') {
    if (!current) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[missing] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
      return;
    }
    try {
      if (!hasManagedMarkdownBlock(current)) {
        issues.push(withIssueTarget(buildIssue({ client, message: `[unmanaged conflict] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
        return;
      }
    } catch {
      issues.push(withIssueTarget(buildIssue({ client, status: 'error', message: `[malformed] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
      return;
    }
    const expectedBlock = wrapManagedMarkdown(operation.content);
    if (!current.includes(expectedBlock)) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[drift] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
    }
    return;
  }

  if (operation.kind === 'managed-file') {
    if (!current) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[missing] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
      return;
    }
    try {
      if (!hasManagedMarkdownBlock(current)) {
        issues.push(withIssueTarget(buildIssue({ client, message: `[unmanaged conflict] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
        return;
      }
    } catch {
      issues.push(withIssueTarget(buildIssue({ client, status: 'error', message: `[malformed] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
      return;
    }
    if (current !== wrapManagedMarkdown(operation.content)) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[drift] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
    }
    return;
  }

  if (operation.kind === 'managed-exact-file') {
    if (!current) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[missing] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
      return;
    }
    try {
      if (!hasManagedMarkdownBlock(current)) {
        issues.push(withIssueTarget(buildIssue({ client, message: `[unmanaged conflict] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
        return;
      }
    } catch {
      issues.push(withIssueTarget(buildIssue({ client, status: 'error', message: `[malformed] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
      return;
    }
    if (current !== `${String(operation.content || '').replace(/\r\n/g, '\n').trimEnd()}\n`) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[drift] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
    }
    return;
  }

  if (operation.kind === 'json-top-level-merge') {
    if (!current) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[missing] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
      return;
    }
    let parsed;
    try {
      parsed = parseJsonObject(current, targetPath);
    } catch {
      issues.push(withIssueTarget(buildIssue({ client, status: 'error', message: `[invalid json] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
      return;
    }
    for (const [key, expected] of Object.entries(operation.content || {})) {
      if (JSON.stringify(parsed[key]) !== JSON.stringify(expected)) {
        issues.push(withIssueTarget(buildIssue({ client, message: `[drift] ${operation.targetPath}#${key}`, fix: fixCommand }), operationTarget));
        return;
      }
    }
    return;
  }

  if (!current) {
    issues.push(withIssueTarget(buildIssue({ client, message: `[missing] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
    return;
  }

  let parsed;
  try {
    parsed = parseJsonObject(current, targetPath);
  } catch {
    issues.push(withIssueTarget(buildIssue({ client, status: 'error', message: `[invalid json] ${operation.targetPath}`, fix: fixCommand }), operationTarget));
    return;
  }
  if (!(AIOS_NATIVE_JSON_KEY in parsed)) {
    issues.push(withIssueTarget(buildIssue({ client, message: `[missing] ${operation.targetPath}#${AIOS_NATIVE_JSON_KEY}`, fix: fixCommand }), operationTarget));
    return;
  }
  if (JSON.stringify(parsed[AIOS_NATIVE_JSON_KEY]) !== JSON.stringify(operation.content)) {
    issues.push(withIssueTarget(buildIssue({ client, message: `[drift] ${operation.targetPath}#${AIOS_NATIVE_JSON_KEY}`, fix: fixCommand }), operationTarget));
  }
}
