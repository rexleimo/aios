import { defaultCodexProvider } from './codex.mjs';
import { defaultClaudeProvider } from './claude.mjs';
import { defaultGeminiProvider } from './gemini.mjs';
import { defaultOpencodeProvider } from './opencode.mjs';

export function defaultProviders() {
  return {
    codex: defaultCodexProvider(),
    claude: defaultClaudeProvider(),
    gemini: defaultGeminiProvider(),
    opencode: defaultOpencodeProvider(),
  };
}

