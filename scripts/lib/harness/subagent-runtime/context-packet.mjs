import { promises as fs } from 'node:fs';
import path from 'node:path';

import { contextDbRelativePath } from '../../aios/state-root.mjs';
import { runContextDbCli } from '../../contextdb-cli.mjs';
import {
  SUBAGENT_CONTEXT_LIMIT_ENV,
  SUBAGENT_CONTEXT_TOKEN_BUDGET_ENV,
  SUBAGENT_CONTEXT_TOKEN_STRATEGY_ENV,
} from './constants.mjs';
import { parsePositiveInt, normalizeText } from './text.mjs';
import { parseNonNegativeInt } from './telemetry.mjs';

export function detectSessionIdFromPlan(plan) {
  const overlay = plan?.learnEvalOverlay;
  const sessionId = normalizeText(overlay?.sourceSessionId || overlay?.sessionId || '');
  return sessionId || null;
}

export async function loadContextPacket({ rootDir, sessionId, env, io }) {
  if (!sessionId) return { ok: false, contextText: '', contextPath: null, error: 'missing sessionId' };

  const limit = parsePositiveInt(env?.[SUBAGENT_CONTEXT_LIMIT_ENV], 30);
  const tokenBudgetRaw = String(env?.[SUBAGENT_CONTEXT_TOKEN_BUDGET_ENV] ?? '').trim();
  const tokenBudget = tokenBudgetRaw ? parseNonNegativeInt(tokenBudgetRaw, 0) : null;
  const tokenStrategyRaw = String(env?.[SUBAGENT_CONTEXT_TOKEN_STRATEGY_ENV] ?? '').trim().toLowerCase();
  const tokenStrategy = tokenStrategyRaw === 'legacy' || tokenStrategyRaw === 'balanced' || tokenStrategyRaw === 'aggressive'
    ? tokenStrategyRaw
    : '';
  const outRel = contextDbRelativePath(rootDir, 'exports', `${sessionId}-context.md`);

  try {
    const args = [
      'context:pack',
      '--workspace',
      rootDir,
      '--session',
      sessionId,
      '--limit',
      String(limit),
      '--out',
      outRel,
    ];
    if (tokenBudget && tokenBudget > 0) {
      args.push('--token-budget', String(tokenBudget));
    }
    if (tokenStrategy) {
      args.push('--token-strategy', tokenStrategy);
    }
    runContextDbCli(args, { cwd: rootDir });
    const absPath = path.join(rootDir, outRel);
    const contextText = await fs.readFile(absPath, 'utf8');
    return { ok: true, contextText: String(contextText || ''), contextPath: absPath, error: '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io?.log?.(`[subagent-runtime] context pack failed: ${message}`);
    return { ok: false, contextText: '', contextPath: null, error: message };
  }
}
