import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildIndex, renderRegistryInjection } from '../contextdb/context-registry.mjs';
import { contextDbRelativePath } from '../aios/state-root.mjs';
import { SCRIPTS_DIR, parseBoolEnv } from './common.mjs';

export function buildSlimInjection({ sessionId = '', status = 'running', agent = '', workspaceRoot = '' } = {}) {
  const index = buildIndex({ sessionId, status, agent, workspaceRoot });
  return renderRegistryInjection(index);
}

export function buildPersistenceInstructions() {
  return [
    '## Memory Persistence (AIOS)',
    '',
    'Before finishing a work session or completing a multi-step task, save your progress:',
    '',
    '- Quick note: `aios memo add "描述当前进展和下一步"`',
    '- Pin important facts: `aios memo pin add "需要跨会话记住的关键信息"`',
    '',
    'Save when:',
    '- You complete a significant task or subtask',
    '- You encounter a blocker you cannot resolve',
    '- You are about to end the session',
    '- You discover something non-obvious that future sessions need to know',
    '',
    'Do NOT save routine progress or trivial updates.',
  ].join('\n');
}

export function formatMemoryPreludeStatus(memoryPrelude = '') {
  return String(memoryPrelude || '').trim() ? 'Memory prelude: enabled' : 'Memory prelude: disabled';
}

export function shouldStrictContextPack(env = process.env) {
  return parseBoolEnv(env.CTXDB_PACK_STRICT, false);
}

export function shouldLazyLoad(env = process.env) {
  return parseBoolEnv(env?.CTXDB_LAZY_LOAD, true);
}

export function buildFacadePrompt(facade, agent) {
  if (!facade || !facade.sessionId) {
    return `This project uses ContextDB for session memory. No prior sessions found. Full history will be available at .aios/context-db/exports/latest-${agent}-context.md.`;
  }
  const refs = facade.keyRefs?.length ? `refs: ${facade.keyRefs.join(', ')}` : '';
  const lines = [
    'This project uses ContextDB for session memory.',
    `Latest session: ${facade.goal} (status: ${facade.status}${refs ? ', ' + refs : ''}).`,
    `Full history at: ${facade.contextPacketPath}.`,
    'Load it when you need prior context.',
  ];
  const continuitySummary = String(facade.continuitySummary || '').trim();
  if (continuitySummary) {
    const nextActions = Array.isArray(facade.continuityNextActions) && facade.continuityNextActions.length > 0
      ? ` Next actions: ${facade.continuityNextActions.join('; ')}.`
      : '';
    lines.push(`Continuity Summary: ${continuitySummary}.${nextActions}`);
  }
  return lines.join(' ');
}

function normalizeFacadePathForCompare(value = '') {
  return String(value || '').replace(/\\/g, '/');
}

export function shouldScheduleAsyncBootstrap(facadeResult, agent, workspaceRoot = process.cwd()) {
  if (!facadeResult?.ok || !facadeResult.facade) return true;
  if (facadeResult.facade.hasStalePack === true) return true;
  const expectedPath = normalizeFacadePathForCompare(contextDbRelativePath(workspaceRoot, 'exports', `latest-${agent}-context.md`));
  return normalizeFacadePathForCompare(facadeResult.facade.contextPacketPath) !== expectedPath;
}

export function forkAsyncBootstrap(workspaceRoot, opts) {
  const scriptPath = path.join(SCRIPTS_DIR, 'lib', 'contextdb', 'async-bootstrap-runner.mjs');
  const child = spawn(process.execPath, [scriptPath, '--workspace', workspaceRoot, '--agent', opts.agent, '--project', opts.project], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
  return child;
}

export function getAutoPrompt(env = process.env) {
  const value = String(env.CTXDB_AUTO_PROMPT || '').trim();
  return value || '';
}

export function extractHandoffPrompt(contextText) {
  const text = String(contextText || '');
  if (!text) return '';
  const match = /(^|\n)## Handoff Prompt\s*\n([\s\S]*?)(\n## |\n?$)/u.exec(text);
  if (!match || !match[2]) return '';
  return String(match[2]).trim();
}

export async function writeLatestInjectedContext({ workspaceRoot, agent, sessionId, contextText }) {
  const text = String(contextText || '').trimEnd();
  if (!text) return { ok: false, relPath: '', absPath: '' };

  const relPath = contextDbRelativePath(workspaceRoot, 'exports', `latest-${agent}-context.md`);
  const absPath = path.join(workspaceRoot, relPath);
  const generatedAt = new Date().toISOString();
  const header = `<!-- AIOS: latest injected context for ${agent}; session=${sessionId}; generated=${generatedAt} -->\n`;
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, `${header}${text}\n`, 'utf8');
  return { ok: true, relPath, absPath };
}
