export const HANDOFF_STATUSES = ['ready', 'blocked', 'needs-input', 'completed'];

import { normalizeText } from '../../../src/shared/normalize.mjs';

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  const text = normalizeText(value);
  return text ? [text] : [];
}

export function normalizeHandoffPayload(raw = {}) {
  return {
    schemaVersion: 1,
    status: HANDOFF_STATUSES.includes(raw.status) ? raw.status : 'ready',
    fromRole: normalizeText(raw.fromRole),
    toRole: normalizeText(raw.toRole),
    taskTitle: normalizeText(raw.taskTitle),
    contextSummary: normalizeText(raw.contextSummary),
    findings: normalizeList(raw.findings),
    filesTouched: normalizeList(raw.filesTouched),
    openQuestions: normalizeList(raw.openQuestions),
    recommendations: normalizeList(raw.recommendations),
  };
}

export function validateHandoffPayload(raw = {}) {
  const payload = normalizeHandoffPayload(raw);
  const errors = [];

  if (!payload.fromRole) errors.push('fromRole is required');
  if (!payload.toRole) errors.push('toRole is required');
  if (!payload.taskTitle) errors.push('taskTitle is required');
  if (!payload.contextSummary) errors.push('contextSummary is required');

  return {
    ok: errors.length === 0,
    errors,
    value: payload,
  };
}

function renderSection(title, items, fallback) {
  if (!items || items.length === 0) {
    return `### ${title}\n${fallback}`;
  }
  return `### ${title}\n${items.map((item) => `- ${item}`).join('\n')}`;
}

export function renderHandoffMarkdown(raw = {}) {
  const result = validateHandoffPayload(raw);
  if (!result.ok) {
    throw new Error(`Invalid handoff payload: ${result.errors.join('; ')}`);
  }

  const payload = result.value;
  return [
    `## HANDOFF: ${payload.fromRole} -> ${payload.toRole}`,
    '',
    `**Status:** ${payload.status}`,
    `**Task:** ${payload.taskTitle}`,
    '',
    '### Context',
    payload.contextSummary,
    '',
    renderSection('Findings', payload.findings, '- None'),
    '',
    renderSection('Files Modified', payload.filesTouched, '- None'),
    '',
    renderSection('Open Questions', payload.openQuestions, '- None'),
    '',
    renderSection('Recommendations', payload.recommendations, '- None'),
    '',
  ].join('\n');
}
