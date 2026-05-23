import { joinMarkdownSections, readClientMarkdownSource, readSharedMarkdownParts } from './shared.mjs';

export function renderCodexNativeOutputs({ rootDir }) {
  return {
    operations: [
      {
        kind: 'markdown-block',
        targetPath: 'AGENTS.md',
        content: joinMarkdownSections([
          ...readSharedMarkdownParts(rootDir),
          readClientMarkdownSource(rootDir, 'codex', 'AGENTS.md'),
          readClientMarkdownSource(rootDir, 'opencode', 'AIOS.md'),
        ]),
      },
    ],
    managedTargets: ['AGENTS.md', '.codex/agents', '.codex/skills'],
  };
}
