// AIOS Pi extension entry. Loaded by Pi via jiti (TypeScript without a
// build step). All decisions live in ./lib (plain .mjs, unit-tested); this
// file only wires Pi events to them. Written in strippable TypeScript (type
// imports only) so plain node can import it in tests.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AIOS_SYSTEM_PROMPT_ADDITION, buildBeforeAgentStartMessage, decideToolCall } from '../lib/gates.mjs';
import { resolveAiosRoot, runAios, runAiosJson } from '../lib/aios-cli.mjs';
import { buildToolDefs } from '../lib/tools.mjs';

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

async function defaultLoadTypeBox() {
  return import('typebox');
}

export default async function aiosExtension(pi: ExtensionAPI, deps = {}) {
  const loadTypeBox = deps.loadTypeBox || defaultLoadTypeBox;
  const aiosRoot = deps.aiosRoot !== undefined
    ? deps.aiosRoot
    : resolveAiosRoot({
      env: deps.env || process.env,
      startDir: path.dirname(fileURLToPath(import.meta.url)),
      existsSync: deps.existsSync || (await import('node:fs')).existsSync,
    });
  const runImpl = deps.runAios || (async ({ argv, json }) => {
    const text = json
      ? JSON.stringify(await runAiosJson({ aiosRoot, argv }))
      : await runAios({ aiosRoot, argv });
    return { text };
  });

  const { Type } = await loadTypeBox();
  for (const tool of buildToolDefs({ Type, run: runImpl })) {
    pi.registerTool(tool);
  }

  pi.on('tool_call', async (event) => {
    return decideToolCall({ toolName: event?.toolName, input: event?.input });
  });

  pi.on('before_agent_start', async () => {
    let memoryDigest = '';
    try {
      const { text } = await runImpl({ argv: ['memo', 'search', 'session continuity', '--limit', '3'] });
      memoryDigest = String(text || '').slice(0, 2000);
    } catch {
      memoryDigest = '';
    }
    return {
      message: buildBeforeAgentStartMessage({ memoryDigest }),
    };
  });

  pi.on('session_start', async (_event, ctx) => {
    if (ctx?.ui?.setStatus) {
      try {
        ctx.ui.setStatus('aios', aiosRoot ? `AIOS: ${aiosRoot}` : 'AIOS: root unresolved');
      } catch {
        // status line is best-effort; never break session startup.
      }
    }
  });

  pi.registerCommand('aios-root', {
    description: 'Show the AIOS install root this extension drives',
    handler: async (_args, ctx) => {
      ctx?.ui?.notify?.(aiosRoot ? `AIOS root: ${aiosRoot}` : 'AIOS root unresolved (export AIOS_ROOT_DIR)', 'info');
    },
  });

  pi.registerCommand('aios-policy', {
    description: 'Show the AIOS workflow policy injected into this session',
    handler: async (_args, ctx) => {
      ctx?.ui?.notify?.(AIOS_SYSTEM_PROMPT_ADDITION, 'info');
    },
  });

  return { aiosRoot };
}
