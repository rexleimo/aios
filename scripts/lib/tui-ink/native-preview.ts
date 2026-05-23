import type { Client } from './types';

interface NativePreview {
  tier: string;
  lines: string[];
}

function summarizeClient(client: Exclude<Client, 'all'>): string {
  if (client === 'codex') return 'codex: AGENTS.md + .codex/agents + .codex/skills';
  if (client === 'claude') return 'claude: CLAUDE.md + .claude/settings.local.json + .claude/agents + .claude/skills';
  if (client === 'gemini') return 'gemini: GEMINI.md + .gemini/skills';
  return 'opencode: AGENTS.md + .opencode/skills';
}

export function getNativePreview(client: Client): NativePreview {
  if (client === 'all') {
    return {
      tier: 'deep(codex/claude) + compatibility(gemini/opencode)',
      lines: [
        summarizeClient('codex'),
        summarizeClient('claude'),
        summarizeClient('gemini'),
        summarizeClient('opencode'),
      ],
    };
  }

  const tier = client === 'codex' || client === 'claude' ? 'deep' : 'compatibility';
  return { tier, lines: [summarizeClient(client)] };
}
