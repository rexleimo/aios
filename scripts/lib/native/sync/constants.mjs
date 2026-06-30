import { ALL_CLIENTS } from '../../clients/registry.mjs';
import { renderAntigravityNativeOutputs } from '../emitters/antigravity.mjs';
import { renderClaudeNativeOutputs } from '../emitters/claude.mjs';
import { renderCodexNativeOutputs } from '../emitters/codex.mjs';
import { renderCrushNativeOutputs } from '../emitters/crush.mjs';
import { renderGeminiNativeOutputs } from '../emitters/gemini.mjs';
import { renderHermesNativeOutputs } from '../emitters/hermes.mjs';
import { renderOpencodeNativeOutputs } from '../emitters/opencode.mjs';

/* 中文注释：每个客户端的 native 指令生成器。Hermes 在这里只输出 AGENTS.md（没有 settings.local.json）。 */
const EMITTER_REGISTRY = Object.freeze({
  codex: renderCodexNativeOutputs,
  claude: renderClaudeNativeOutputs,
  gemini: renderGeminiNativeOutputs,
  opencode: renderOpencodeNativeOutputs,
  antigravity: renderAntigravityNativeOutputs,
  crush: renderCrushNativeOutputs,
  hermes: renderHermesNativeOutputs,
});

// Auto-derived from ALL_CLIENTS registry: ensures every client has an emitter.
// Adding a new client to registry will fail fast at import time until an emitter is wired.
export const EMITTERS = Object.freeze(
  Object.fromEntries(ALL_CLIENTS.map((c) => {
    if (!EMITTER_REGISTRY[c]) throw new Error(`Missing native emitter for client: ${c}`);
    return [c, EMITTER_REGISTRY[c]];
  })),
);
export const SYNC_LOCK_NAME = 'native-skills-sync';
