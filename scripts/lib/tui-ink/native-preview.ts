import type { Client } from './types';

interface NativePreview {
  tier: string;
  lines: string[];
}

function summarizeClient(client: Exclude<Client, 'all'>): string {
  if (client === 'codex') return 'codex: AGENTS.md + .codex/agents + .codex/skills';
  if (client === 'claude') return 'claude: CLAUDE.md + .claude/settings.local.json + .claude/agents + .claude/skills';
  if (client === 'gemini') return 'gemini: .gemini/AIOS.md + .gemini/skills';
  if (client === 'opencode') return 'opencode: .opencode/AIOS.md + .opencode/skills';
  return 'kiro: .kiro/steering/AIOS.md + .kiro/settings/mcp.json + .kiro/agents + .kiro/skills';
}

export function getNativePreview(client: Client): NativePreview {
  if (client === 'all') {
    return {
      tier: 'deep(codex/claude/kiro) + compatibility(gemini/opencode)',
      lines: [
        summarizeClient('codex'),
        summarizeClient('claude'),
        summarizeClient('gemini'),
        summarizeClient('opencode'),
        summarizeClient('kiro'),
      ],
    };
  }

  const tier = client === 'codex' || client === 'claude' || client === 'kiro' ? 'deep' : 'compatibility';
  return { tier, lines: [summarizeClient(client)] };
}
