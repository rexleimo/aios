#!/usr/bin/env node
/**
 * UserPromptSubmit hook runner for Claude / Codex / Grok.
 * Usage: node scripts/lib/planning/hook-user-prompt.mjs
 * Reads hook JSON from stdin, writes JSON additionalContext to stdout.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { detectHookClient, runUserPromptSubmitHook } from './user-prompt-submit.mjs';

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const stdinText = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');

  const here = path.dirname(fileURLToPath(import.meta.url));
  const defaultRoot = process.env.CLAUDE_PROJECT_DIR
    || process.env.AIOS_ROOT
    || path.resolve(here, '../../..');

  let cwd = defaultRoot;
  let payload = {};
  try {
    payload = JSON.parse(stdinText || '{}');
    if (payload.cwd && path.isAbsolute(payload.cwd)) cwd = payload.cwd;
    else if (payload.workspaceRoot && path.isAbsolute(payload.workspaceRoot)) cwd = payload.workspaceRoot;
  } catch {
    payload = {};
  }

  const { exitCode, output } = await runUserPromptSubmitHook({
    rootDir: cwd,
    stdinText,
    client: detectHookClient(payload),
  });
  process.stdout.write(`${JSON.stringify(output)}\n`);
  process.exitCode = exitCode;
}

main().catch((error) => {
  process.stderr.write(`[aios-plan-hook] ${error.message}\n`);
  process.stdout.write(`${JSON.stringify({
    additionalContext: '',
    decision: { disposition: 'direct', persistence: 'none', reason: 'hook-error' },
  })}\n`);
  process.exitCode = 0;
});
