import { ALL_CLIENTS } from '../../clients/registry.mjs';
import { renderClaudeNativeOutputs } from '../emitters/claude.mjs';
import { renderCodexNativeOutputs } from '../emitters/codex.mjs';
import { renderGeminiNativeOutputs } from '../emitters/gemini.mjs';
import { renderOpencodeNativeOutputs } from '../emitters/opencode.mjs';

const EMITTER_IMPLS = Object.freeze({
  codex: renderCodexNativeOutputs,
  claude: renderClaudeNativeOutputs,
  gemini: renderGeminiNativeOutputs,
  opencode: renderOpencodeNativeOutputs,
});

// Auto-derived from ALL_CLIENTS registry: ensures every client has an emitter.
// Adding a new client to registry will fail fast at import time until an emitter is wired.
export const EMITTERS = Object.freeze(
  Object.fromEntries(ALL_CLIENTS.map((c) => {
    if (!EMITTER_IMPLS[c]) throw new Error(`Missing native emitter for client: ${c}`);
    return [c, EMITTER_IMPLS[c]];
  })),
);
export const SYNC_LOCK_NAME = 'native-skills-sync';
