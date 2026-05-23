import { renderClaudeNativeOutputs } from '../emitters/claude.mjs';
import { renderCodexNativeOutputs } from '../emitters/codex.mjs';
import { renderGeminiNativeOutputs } from '../emitters/gemini.mjs';
import { renderOpencodeNativeOutputs } from '../emitters/opencode.mjs';

export const EMITTERS = Object.freeze({
  codex: renderCodexNativeOutputs,
  claude: renderClaudeNativeOutputs,
  gemini: renderGeminiNativeOutputs,
  opencode: renderOpencodeNativeOutputs,
});
export const SYNC_LOCK_NAME = 'native-skills-sync';
